import { eq, inArray } from "drizzle-orm";
import { notFound } from "next/navigation";
import { FirmChip } from "@/components/app/firm-chip";
import { getFirmSelection } from "@/components/app/firm-switcher";
import { StatusChip } from "@/components/app/status-chip";
import { db } from "@/db";
import { firms, receiptAllocations, receipts, retailers, user as users } from "@/db/schema";
import { formatDate, formatDateTime } from "@/lib/datetime";
import { getAccessibleFirms } from "@/lib/firm-access";
import { isUuid } from "@/lib/ids";
import { formatINR } from "@/lib/money";
import { isRetailerOnly } from "@/lib/order-access";
import { can } from "@/lib/permissions";
import { canReverseReceipt } from "@/lib/receipt-reversal";
import { firmLines, interFirmBalances, MODE_LABELS, receiptChip } from "@/lib/receipt-rules";
import { requireUser } from "@/lib/session";
import { ReverseForm } from "./reverse-form";

export default async function ReceiptDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user } = await requireUser();
  if (!isUuid(id)) notFound();

  const [r] = await db
    .select({
      id: receipts.id,
      no: receipts.receiptNo,
      retailerId: receipts.retailerId,
      retailer: retailers.name,
      mode: receipts.mode,
      status: receipts.status,
      totalPaise: receipts.totalPaise,
      receivedFirmId: receipts.receivedFirmId,
      utr: receipts.utr,
      chequeNumber: receipts.chequeNumber,
      chequeDate: receipts.chequeDate,
      bankName: receipts.bankName,
      collector: users.name,
      createdAt: receipts.createdAt,
      reversedAt: receipts.reversedAt,
      reversedBy: receipts.reversedBy,
      reversalReason: receipts.reversalReason,
    })
    .from(receipts)
    .innerJoin(retailers, eq(retailers.id, receipts.retailerId))
    .innerJoin(users, eq(users.id, receipts.receivedBy))
    .where(eq(receipts.id, id))
    .limit(1);
  if (!r) notFound();

  const allocs = await db
    .select({ firmId: receiptAllocations.firmId, amountPaise: receiptAllocations.amountPaise, advance: receiptAllocations.advance })
    .from(receiptAllocations)
    .where(eq(receiptAllocations.receiptId, r.id));
  const firmIds = [...new Set([...allocs.map((a) => a.firmId), ...(r.receivedFirmId ? [r.receivedFirmId] : [])])];

  // A pure retailer sees only their own shop's receipts; staff need one of the receipt's firms.
  const retailerView = isRetailerOnly(user.role);
  if (retailerView) {
    const [own] = await db.select({ id: retailers.id }).from(retailers).where(eq(retailers.userId, user.id)).limit(1);
    if (own?.id !== r.retailerId) notFound();
  } else {
    if (!can(user.role, "viewReceipts")) notFound();
    const mine = new Set((await getAccessibleFirms(user.id, user.role)).map((f) => f.id));
    if (!firmIds.some((f) => mine.has(f))) notFound();
  }

  const firmRows = firmIds.length
    ? await db.select({ id: firms.id, name: firms.name, slot: firms.slot }).from(firms).where(inArray(firms.id, firmIds))
    : [];
  const firmOf = new Map(firmRows.map((f) => [f.id, f]));
  const reverser = r.reversedBy
    ? (await db.select({ name: users.name }).from(users).where(eq(users.id, r.reversedBy)).limit(1))[0]?.name
    : null;

  // One row per firm: the part for dues and the part kept as advance.
  const split = firmLines(allocs).map((l) => ({
    ...l,
    advancePaise: allocs.filter((a) => a.firmId === l.firmId && a.advance).reduce((s, a) => s + a.amountPaise, 0),
  }));
  const owes =
    !retailerView && r.receivedFirmId && r.mode !== "cash" && r.status !== "bounced" && r.status !== "reversed"
      ? interFirmBalances(r.receivedFirmId, firmLines(allocs))
      : [];

  const { selection } = await getFirmSelection();
  const showReverse = !retailerView && !selection.readOnly && canReverseReceipt(user.role, r.status);
  const chip = receiptChip(r.status);
  const firmName = (fid: string | null) => (fid ? (firmOf.get(fid)?.name ?? "") : "");

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <span className="inline-flex h-6 items-center rounded-full bg-muted px-2.5 text-xs font-medium">
          {MODE_LABELS[r.mode] ?? r.mode}
        </span>
        <StatusChip status={chip.status} label={chip.label} />
      </div>
      <div>
        <h1 className="text-xl font-bold">{r.retailer}</h1>
        <p className="text-sm text-muted-foreground">
          #{r.no} · {formatDateTime(r.createdAt)} · {r.collector}
        </p>
      </div>
      <div className="tabular text-3xl font-bold">{formatINR(r.totalPaise)}</div>

      {(r.mode === "online" || r.mode === "cheque") && (
        <div className="flex flex-col gap-1 rounded-2xl bg-card p-4 text-sm ring-1 ring-foreground/8">
          {r.receivedFirmId && <div>Into {firmName(r.receivedFirmId)}</div>}
          {r.mode === "online" && r.utr && (
            <div className="text-muted-foreground">
              UTR <span className="tabular">{r.utr}</span>
            </div>
          )}
          {r.mode === "cheque" && (
            <div className="text-muted-foreground">
              No. <span className="tabular">{r.chequeNumber}</span> · {r.bankName}
              {r.chequeDate && <> · {formatDate(r.chequeDate)}</>}
            </div>
          )}
        </div>
      )}

      <ul className="flex flex-col gap-2">
        {split.map((s) => {
          const f = firmOf.get(s.firmId);
          return (
            <li key={s.firmId} className="flex items-center justify-between gap-3 rounded-2xl bg-card p-4 ring-1 ring-foreground/8">
              <div className="flex flex-col gap-1">
                {f && <FirmChip name={f.name} slot={f.slot} />}
                {s.advancePaise > 0 && (
                  <span className="text-xs text-muted-foreground">Advance {formatINR(s.advancePaise)}</span>
                )}
              </div>
              <span className="tabular text-lg font-bold">{formatINR(s.amountPaise)}</span>
            </li>
          );
        })}
      </ul>

      {owes.map((o) => (
        <p key={o.owedToFirmId} className="text-sm">
          {firmName(o.owedByFirmId)} owes {firmName(o.owedToFirmId)}{" "}
          <span className="tabular font-semibold">{formatINR(o.amountPaise)}</span>
        </p>
      ))}

      {r.status === "reversed" && (
        <div className="flex flex-col gap-1 rounded-2xl bg-muted p-4 text-sm">
          <div className="font-semibold">Reversed</div>
          <div className="text-muted-foreground">
            {reverser ?? ""}
            {r.reversedAt && <> · {formatDateTime(r.reversedAt)}</>}
          </div>
          {r.reversalReason && <div>Reason: {r.reversalReason}</div>}
        </div>
      )}

      {showReverse && <ReverseForm receiptId={r.id} label={r.mode === "online" && r.status === "unverified" ? "Not received" : "Reverse receipt"} />}
    </div>
  );
}
