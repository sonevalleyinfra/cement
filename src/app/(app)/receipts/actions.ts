"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { receiptAllocations, receipts, retailers, walletMovements } from "@/db/schema";
import { getAccessibleFirms } from "@/lib/firm-access";
import { postEntry } from "@/lib/ledger";
import { getOutstanding } from "@/lib/receipts";
import { planReceipt } from "@/lib/receipt-plan";
import { PAYMENT_MODES } from "@/lib/receipt-rules";
import { requireRole } from "@/lib/session";
import { collectedMovements } from "@/lib/wallet-rules";
import { firmLines } from "@/lib/receipt-rules";

export type DueRow = { orderId: string; firmId: string; dueSinceDate: string; duePaise: number };
export type DuesResult = { ok: true; rows: DueRow[] } | { ok: false; error: string };
export type SaveReceiptResult = { ok: true } | { ok: false; error: string };

/** Outstanding orders of one retailer, only for firms this user may work on. */
export async function loadOutstanding(retailerId: string): Promise<DuesResult> {
  const session = await requireRole("accounts", "sales");
  const firms = await getAccessibleFirms(session.user.id, session.user.role);
  const rows = await getOutstanding(retailerId, firms.map((f) => f.id));
  return {
    ok: true,
    rows: rows.map((r) => ({
      orderId: r.orderId,
      firmId: r.firmId,
      dueSinceDate: r.dueSinceDate,
      duePaise: r.duePaise,
    })),
  };
}

/**
 * Saves one receipt: receipt + allocations + ledger credits in one transaction.
 * The server rebuilds the outstanding list itself and re-checks every number.
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
  allocations: { orderId: string; firmId: string; amountPaise: number }[];
  advance: { firmId: string; amountPaise: number } | null;
}): Promise<SaveReceiptResult> {
  const session = await requireRole("accounts", "sales");
  if (!(PAYMENT_MODES as readonly string[]).includes(input.mode)) return { ok: false, error: "Pick a payment mode." };

  const firms = await getAccessibleFirms(session.user.id, session.user.role);
  const allowed = new Set(firms.map((f) => f.id));
  const touched = [
    ...input.allocations.filter((a) => a.amountPaise > 0).map((a) => a.firmId),
    ...(input.advance && input.advance.amountPaise > 0 ? [input.advance.firmId] : []),
    ...(input.mode !== "cash" && input.receivedFirmId ? [input.receivedFirmId] : []),
  ];
  if (touched.some((id) => !allowed.has(id))) return { ok: false, error: "You cannot work on one of these firms." };

  const [retailer] = await db.select({ id: retailers.id }).from(retailers).where(eq(retailers.id, input.retailerId)).limit(1);
  if (!retailer) return { ok: false, error: "Retailer not found." };

  const res = await db.transaction(async (tx): Promise<SaveReceiptResult> => {
    // Lock the retailer so two receipts cannot both use the same dues.
    await tx.select({ id: retailers.id }).from(retailers).where(eq(retailers.id, input.retailerId)).for("update");
    const outstanding = await getOutstanding(input.retailerId, [...allowed], tx);
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
        allocations: input.allocations,
        advance: input.advance,
      },
      outstanding,
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
      await postEntry(tx, { ...entry }, session.user.id, `Receipt #${receipt.receiptNo}`, receipt.id);
    }
    // Cash goes into the collector's wallet, one row per firm line.
    const walletRows = collectedMovements(
      input.mode,
      firmLines(input.allocations, input.advance),
    );
    if (walletRows.length > 0) {
      await tx.insert(walletMovements).values(
        walletRows.map((w) => ({ ...w, collectorId: session.user.id, receiptId: receipt.id, actorId: session.user.id })),
      );
    }
    return { ok: true };
  });
  if (res.ok) {
    revalidatePath("/wallet");
    revalidatePath("/receipts");
    revalidatePath("/ledger");
    revalidatePath(`/ledger/${input.retailerId}`);
  }
  return res;
}
