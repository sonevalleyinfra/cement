import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { StatusChip } from "@/components/app/status-chip";
import { db } from "@/db";
import { receipts, retailers, user as users } from "@/db/schema";
import { formatDate, formatDateTime } from "@/lib/datetime";
import { isUuid } from "@/lib/ids";
import { formatINR } from "@/lib/money";
import { isRetailerOnly } from "@/lib/order-access";
import { can } from "@/lib/permissions";
import { canReverseReceipt } from "@/lib/receipt-reversal";
import { MODE_LABELS, receiptChip } from "@/lib/receipt-rules";
import { showReversalDetails } from "@/lib/receipt-view-rules";
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

  // A pure retailer sees only their own shop's receipts; staff see every receipt.
  const retailerView = isRetailerOnly(user.role);
  if (retailerView) {
    const [own] = await db.select({ id: retailers.id }).from(retailers).where(eq(retailers.userId, user.id)).limit(1);
    if (own?.id !== r.retailerId) notFound();
  } else if (!can(user.role, "viewReceipts")) notFound();

  const showReversal = showReversalDetails(user.role);
  const reverser = showReversal && r.reversedBy
    ? (await db.select({ name: users.name }).from(users).where(eq(users.id, r.reversedBy)).limit(1))[0]?.name
    : null;

  const showReverse = !retailerView && canReverseReceipt(user.role, r.status);
  const chip = receiptChip(r.status);

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
        <div className="flex flex-col gap-1 rounded-2xl bg-card p-4 text-sm shadow-card ring-1 ring-foreground/6">
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

      {r.status === "reversed" && (
        <div className="flex flex-col gap-1 rounded-2xl bg-muted p-4 text-sm">
          <div className="font-semibold">Reversed</div>
          <div className="text-muted-foreground">
            {reverser ? <>{reverser} · </> : ""}
            {r.reversedAt && formatDateTime(r.reversedAt)}
          </div>
          {showReversal && r.reversalReason && <div>Reason: {r.reversalReason}</div>}
        </div>
      )}

      {showReverse && <ReverseForm receiptId={r.id} label={r.mode === "online" && r.status === "unverified" ? "Not received" : "Reverse receipt"} />}
    </div>
  );
}
