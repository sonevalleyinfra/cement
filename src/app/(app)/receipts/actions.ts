"use server";

import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { receiptAllocations, receipts, retailers, user, walletMovements } from "@/db/schema";
import { findAccessibleFirm, getAccessibleFirms } from "@/lib/firm-access";
import { isUuid } from "@/lib/ids";
import { postEntry } from "@/lib/ledger";
import { notifyMoney } from "@/lib/notify";
import { rolesFor } from "@/lib/permissions";
import { planReceipt } from "@/lib/receipt-plan";
import { planReversal } from "@/lib/receipt-reversal";
import { PAYMENT_MODES } from "@/lib/receipt-rules";
import { getFirmDues, getReceiptLines } from "@/lib/receipts";
import { requireRole, writeBlock } from "@/lib/session";
import { collectedMovements, walletBalance } from "@/lib/wallet-rules";

export type DueItemRow = { kind: string; dueSince: string; duePaise: number };
export type FirmDueRow = { firmId: string; duePaise: number; items: DueItemRow[] };
export type DuesResult = { ok: true; firms: FirmDueRow[] } | { ok: false; error: string };
export type SaveReceiptResult = { ok: true; id: string } | { ok: false; error: string };
export type ReverseResult = { ok: true } | { ok: false; error: string };

/** What one retailer owes each firm this user may work on (from the ledger, oldest first). */
export async function loadDues(retailerId: string): Promise<DuesResult> {
  const session = await requireRole(...rolesFor("recordReceipt"));
  if (!isUuid(retailerId)) return { ok: false, error: "Retailer not found." };
  const firms = await getAccessibleFirms(session.user.id, session.user.role);
  const dues = await getFirmDues(retailerId, firms.map((f) => f.id));
  return {
    ok: true,
    firms: dues
      .filter((f) => f.duePaise > 0)
      .map((f) => ({
        firmId: f.firmId,
        duePaise: f.duePaise,
        items: f.items.map((i) => ({ kind: i.kind, dueSince: i.dueSince.toISOString(), duePaise: i.duePaise })),
      })),
  };
}

const isWholePaise = (n: unknown): n is number => typeof n === "number" && Number.isSafeInteger(n);

/**
 * Saves one receipt: receipt + one allocation row per firm (+ advance row) + ledger credit
 * per firm + cash wallet rows, in one transaction. The server works out the dues again
 * from the ledger (after locking the retailer) and re-checks every number.
 */
export async function saveReceipt(input: {
  retailerId: string;
  mode: string;
  totalPaise: number;
  utr?: string;
  receivedFirmId?: string;
  chequeNumber?: string;
  chequeDate?: string;
  bankName?: string;
  allocations: { firmId: string; amountPaise: number }[];
  advance: { firmId: string; amountPaise: number } | null;
}): Promise<SaveReceiptResult> {
  const session = await requireRole(...rolesFor("recordReceipt"));
  const blocked = await writeBlock();
  if (blocked) return { ok: false, error: blocked };
  if (!isUuid(input.retailerId)) return { ok: false, error: "Retailer not found." };
  if (!Array.isArray(input.allocations)) return { ok: false, error: "Refresh the page and try again." };
  if (!(PAYMENT_MODES as readonly string[]).includes(input.mode)) return { ok: false, error: "Pick a payment mode." };
  if (!isWholePaise(input.totalPaise)) return { ok: false, error: "Enter the amount received." };
  const allocations = input.allocations.map((a) => ({ firmId: String(a?.firmId ?? ""), amountPaise: a?.amountPaise }));
  if (allocations.some((a) => !isWholePaise(a.amountPaise))) return { ok: false, error: "Amounts must be whole paise." };
  const advance = input.advance
    ? { firmId: String(input.advance.firmId ?? ""), amountPaise: input.advance.amountPaise }
    : null;
  if (advance && !isWholePaise(advance.amountPaise)) return { ok: false, error: "Amounts must be whole paise." };

  const firms = await getAccessibleFirms(session.user.id, session.user.role);
  const allowed = new Set(firms.map((f) => f.id));
  const touched = [
    ...allocations.filter((a) => (a.amountPaise as number) > 0).map((a) => a.firmId),
    ...(advance && advance.amountPaise > 0 ? [advance.firmId] : []),
    ...(input.mode !== "cash" && input.receivedFirmId ? [input.receivedFirmId] : []),
  ];
  if (touched.some((id) => !allowed.has(id))) return { ok: false, error: "You cannot work on one of these firms." };
  const firmName = new Map(firms.map((f) => [f.id, f.name]));

  const res = await db.transaction(async (tx): Promise<SaveReceiptResult> => {
    // Lock the retailer so two receipts (or a reversal) cannot both use the same dues.
    const [retailer] = await tx
      .select({ id: retailers.id, name: retailers.name })
      .from(retailers)
      .where(eq(retailers.id, input.retailerId))
      .for("update");
    if (!retailer) return { ok: false, error: "Retailer not found." };
    const dues = await getFirmDues(input.retailerId, [...allowed], tx);
    const plan = planReceipt(
      {
        retailerId: input.retailerId,
        mode: input.mode,
        totalPaise: input.totalPaise,
        details: {
          utr: input.utr,
          receivedFirmId: input.receivedFirmId,
          chequeNumber: input.chequeNumber,
          chequeDate: input.chequeDate,
          bankName: input.bankName,
        },
        allocations: allocations as { firmId: string; amountPaise: number }[],
        advance,
      },
      dues,
    );
    if (!plan.ok) return plan;

    const cash = input.mode === "cash";
    const [receipt] = await tx
      .insert(receipts)
      .values({
        retailerId: input.retailerId,
        mode: input.mode,
        totalPaise: input.totalPaise,
        receivedFirmId: cash ? null : (input.receivedFirmId ?? null),
        utr: input.mode === "online" ? (input.utr?.trim() ?? null) : null,
        chequeNumber: input.mode === "cheque" ? (input.chequeNumber?.trim() ?? null) : null,
        chequeDate: input.mode === "cheque" ? (input.chequeDate?.trim() ?? null) : null,
        bankName: input.mode === "cheque" ? (input.bankName?.trim() ?? null) : null,
        status: plan.status,
        receivedBy: session.user.id,
      })
      .returning({ id: receipts.id, receiptNo: receipts.receiptNo });
    await tx.insert(receiptAllocations).values(plan.rows.map((r) => ({ ...r, receiptId: receipt.id })));
    for (const entry of plan.ledger) {
      await postEntry(tx, entry, session.user.id, `Receipt #${receipt.receiptNo}`, receipt.id);
    }
    // Cash goes into the collector's wallet, one row per firm line.
    const walletRows = collectedMovements(input.mode, plan.lines);
    if (walletRows.length > 0) {
      await tx.insert(walletMovements).values(
        walletRows.map((w) => ({ ...w, collectorId: session.user.id, receiptId: receipt.id, actorId: session.user.id })),
      );
    }
    await notifyMoney(tx, {
      event: "payment_recorded",
      firmId: plan.lines.length === 1 ? plan.lines[0].firmId : null,
      firmNames: plan.lines.map((l) => firmName.get(l.firmId) ?? ""),
      retailerName: retailer.name,
      amountPaise: input.totalPaise,
      actorId: session.user.id,
      link: `/receipts/${receipt.id}`,
    });
    return { ok: true, id: receipt.id };
  });
  if (res.ok) {
    revalidatePath("/wallet");
    revalidatePath("/receipts");
    revalidatePath("/ledger");
    revalidatePath(`/ledger/${input.retailerId}`);
  }
  return res;
}

/**
 * Reverses a whole receipt (every firm line together, spec 6.1). Accounts / admin only.
 * Locks the receipt, then the retailer, then (cash) the collector, so it cannot race a
 * new receipt, a cheque bounce, a verification or a handover request.
 */
export async function reverseReceipt(receiptId: string, reason: string): Promise<ReverseResult> {
  const session = await requireRole(...rolesFor("reverseReceipt"));
  const blocked = await writeBlock();
  if (blocked) return { ok: false, error: blocked };
  if (!isUuid(receiptId)) return { ok: false, error: "Receipt not found." };
  let retailerId = "";
  const res = await db.transaction(async (tx): Promise<ReverseResult> => {
    const [receipt] = await tx.select().from(receipts).where(eq(receipts.id, receiptId)).for("update");
    if (!receipt) return { ok: false, error: "Receipt not found." };
    retailerId = receipt.retailerId;
    const [retailer] = await tx
      .select({ id: retailers.id, name: retailers.name })
      .from(retailers)
      .where(eq(retailers.id, receipt.retailerId))
      .for("update");
    if (!retailer) return { ok: false, error: "Retailer not found." };

    const lines = await getReceiptLines(receipt.id, tx);
    const firmIds = [...new Set([...lines.map((l) => l.firmId), ...(receipt.receivedFirmId ? [receipt.receivedFirmId] : [])])];
    const names = new Map<string, string>();
    for (const id of firmIds) {
      const firm = await findAccessibleFirm(session.user.id, session.user.role, id);
      if (!firm) return { ok: false, error: "You cannot work on one of this receipt's firms." };
      names.set(id, firm.name);
    }

    const available: Record<string, number> = {};
    if (receipt.mode === "cash" && lines.length > 0) {
      // Lock the collector (like a handover request) so the cash cannot be handed over meanwhile.
      await tx.select({ id: user.id }).from(user).where(eq(user.id, receipt.receivedBy)).for("update");
      const moves = await tx
        .select()
        .from(walletMovements)
        .where(
          and(
            eq(walletMovements.collectorId, receipt.receivedBy),
            inArray(
              walletMovements.firmId,
              lines.map((l) => l.firmId),
            ),
          ),
        );
      for (const l of lines) available[l.firmId] = walletBalance(moves.filter((m) => m.firmId === l.firmId)).availablePaise;
    }

    const plan = planReversal(session.user.role, receipt, lines, reason, available);
    if (!plan.ok) return plan;
    for (const l of plan.ledger) {
      await postEntry(
        tx,
        { firmId: l.firmId, retailerId: receipt.retailerId, kind: "receipt_credit", amountPaise: l.amountPaise },
        session.user.id,
        plan.note,
        receipt.id,
      );
    }
    if (plan.wallet.length > 0) {
      await tx.insert(walletMovements).values(
        plan.wallet.map((w) => ({
          ...w,
          collectorId: receipt.receivedBy,
          receiptId: receipt.id,
          actorId: session.user.id,
        })),
      );
    }
    const now = new Date();
    await tx
      .update(receipts)
      .set({ status: "reversed", reversedAt: now, reversedBy: session.user.id, reversalReason: plan.reason, updatedAt: now })
      .where(eq(receipts.id, receipt.id));
    await notifyMoney(tx, {
      event: "receipt_reversed",
      firmId: lines.length === 1 ? lines[0].firmId : null,
      firmNames: lines.map((l) => names.get(l.firmId) ?? ""),
      retailerName: retailer.name,
      amountPaise: receipt.totalPaise,
      actorId: session.user.id,
      collectorId: receipt.receivedBy,
      link: `/receipts/${receipt.id}`,
      reason: plan.reason,
    });
    return { ok: true };
  });
  if (res.ok) {
    revalidatePath("/receipts");
    revalidatePath(`/receipts/${receiptId}`);
    revalidatePath("/receipts/review");
    revalidatePath("/wallet");
    revalidatePath("/ledger");
    revalidatePath(`/ledger/${retailerId}`);
  }
  return res;
}
