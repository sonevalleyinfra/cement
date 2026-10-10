import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { StatusChip } from "@/components/app/status-chip";
import { db } from "@/db";
import { receipts, retailers, user as users } from "@/db/schema";
import { formatDateTime } from "@/lib/datetime";
import { isUuid } from "@/lib/ids";
import { formatINR } from "@/lib/money";
import { isRetailerOnly } from "@/lib/order-access";
import { can } from "@/lib/permissions";
import { canReverseReceipt } from "@/lib/receipt-reversal";
import { canVerifyPayments, MODE_LABELS, receiptChip } from "@/lib/receipt-rules";
import { showStaffDetails } from "@/lib/receipt-view-rules";
import { requireUser } from "@/lib/session";
import { ReasonAction, VerifyButton } from "../payment-actions";

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
      note: receipts.note,
      collector: users.name,
      createdAt: receipts.createdAt,
      checkedBy: receipts.checkedBy,
      checkedAt: receipts.checkedAt,
      rejectReason: receipts.rejectReason,
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

  // A pure retailer sees only their own shop's payments; staff see every payment.
  const retailerView = isRetailerOnly(user.role);
  if (retailerView) {
    const [own] = await db.select({ id: retailers.id }).from(retailers).where(eq(retailers.userId, user.id)).limit(1);
    if (own?.id !== r.retailerId) notFound();
  } else if (!can(user.role, "viewReceipts")) notFound();

  // Who checked or reversed it, and why, is staff information. A shop owner only sees the status.
  const staffDetails = showStaffDetails(user.role);
  const nameOf = async (userId: string | null) =>
    staffDetails && userId
      ? ((await db.select({ name: users.name }).from(users).where(eq(users.id, userId)).limit(1))[0]?.name ?? null)
      : null;
  const [checker, reverser] = await Promise.all([nameOf(r.checkedBy), nameOf(r.reversedBy)]);

  const toCheck = !retailerView && r.mode === "online" && r.status === "unverified" && canVerifyPayments(user.role);
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
          #{r.no} · {formatDateTime(r.createdAt)}
          {staffDetails ? ` · ${r.collector}` : ""}
        </p>
      </div>
      <div className="tabular text-3xl font-bold">{formatINR(r.totalPaise)}</div>

      {r.mode === "online" && (
        <div className="flex flex-col gap-1 rounded-2xl bg-card p-4 text-sm shadow-card ring-1 ring-foreground/6">
          <div className="text-muted-foreground">
            UTR <span className="tabular font-semibold text-foreground">{r.utr}</span>
          </div>
          {staffDetails && r.note && <div className="text-muted-foreground">{r.note}</div>}
          {checker && r.checkedAt && (
            <div className="text-muted-foreground">
              {r.status === "rejected" ? "Rejected" : "Verified"} · {checker} · {formatDateTime(r.checkedAt)}
            </div>
          )}
          {staffDetails && r.status === "rejected" && r.rejectReason && <div>Reason: {r.rejectReason}</div>}
        </div>
      )}

      {r.status === "reversed" && (
        <div className="flex flex-col gap-1 rounded-2xl bg-muted p-4 text-sm">
          <div className="font-semibold">Reversed</div>
          <div className="text-muted-foreground">
            {reverser ? <>{reverser} · </> : ""}
            {r.reversedAt && formatDateTime(r.reversedAt)}
          </div>
          {staffDetails && r.reversalReason && <div>Reason: {r.reversalReason}</div>}
        </div>
      )}

      {toCheck && (
        <div className="flex flex-col gap-2">
          <VerifyButton receiptId={r.id} />
          <ReasonAction receiptId={r.id} action="reject" />
        </div>
      )}
      {showReverse && <ReasonAction receiptId={r.id} action="reverse" />}
    </div>
  );
}
