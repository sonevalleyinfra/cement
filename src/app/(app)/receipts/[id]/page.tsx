import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/app/page-header";
import { ProofModal } from "@/components/app/proof-modal";
import { StatusChip } from "@/components/app/status-chip";
import { db } from "@/db";
import { bankAccounts, receipts, retailers, user as users } from "@/db/schema";
import { bankAccountLabel } from "@/lib/bank-account-rules";
import { formatDate, formatDateTime } from "@/lib/datetime";
import { isUuid } from "@/lib/ids";
import { formatINR } from "@/lib/money";
import { isRetailerOnly } from "@/lib/order-access";
import { can } from "@/lib/permissions";
import { reasonText } from "@/lib/reason-codes";
import { canReverseReceipt } from "@/lib/receipt-reversal";
import { canVerifyPayments, isSafeProofImage, MODE_LABELS, ONLINE_METHOD_LABELS, receiptChip } from "@/lib/receipt-rules";
import { istStartOf } from "@/lib/report-range";
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
      onlineMethod: receipts.onlineMethod,
      accountName: bankAccounts.name,
      accountLast4: bankAccounts.last4,
      payerName: receipts.payerName,
      proofImage: receipts.proofImage,
      chequeDate: receipts.chequeDate,
      chequeBank: receipts.chequeBank,
      receivedOn: receipts.receivedOn,
      backdateReasonCode: receipts.backdateReasonCode,
      backdateNote: receipts.backdateNote,
      collector: users.name,
      createdAt: receipts.createdAt,
      checkedBy: receipts.checkedBy,
      checkedAt: receipts.checkedAt,
      rejectReason: receipts.rejectReason,
      reasonCode: receipts.reasonCode,
      reversedAt: receipts.reversedAt,
      reversedBy: receipts.reversedBy,
      reversalReason: receipts.reversalReason,
    })
    .from(receipts)
    .innerJoin(retailers, eq(retailers.id, receipts.retailerId))
    .innerJoin(users, eq(users.id, receipts.receivedBy))
    .leftJoin(bankAccounts, eq(bankAccounts.id, receipts.bankAccountId))
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
  // Old online payments have no method or account: those lines are left out. Notes and backdate reasons are staff only.
  const details = (
    [
      ["Received on", formatDate(istStartOf(r.receivedOn))],
      ["Method", r.onlineMethod ? (ONLINE_METHOD_LABELS[r.onlineMethod] ?? r.onlineMethod) : ""],
      ["Into", r.accountName ? bankAccountLabel({ name: r.accountName, last4: r.accountLast4 }) : ""],
      [r.onlineMethod === "cheque" ? "Cheque Number" : "UTR", r.mode === "online" ? (r.utr ?? "") : ""],
      ["Cheque Date", r.chequeDate ? formatDate(istStartOf(r.chequeDate)) : ""],
      ["Cheque Bank", r.chequeBank ?? ""],
      ["Payer", r.payerName],
      ["Note", staffDetails ? r.note : ""],
      ["Backdated", staffDetails ? reasonText(r.backdateReasonCode, r.backdateNote, "backdate") : ""],
    ] as const
  ).filter(([, value]) => value);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={r.retailer} back="/receipts" action={<StatusChip status={chip.status} label={chip.label} />}>
        {MODE_LABELS[r.mode] ?? r.mode} · #{r.no} · {formatDateTime(r.createdAt)}
        {staffDetails ? ` · ${r.collector}` : ""}
      </PageHeader>
      <div className="tabular text-3xl font-bold">{formatINR(r.totalPaise)}</div>

      {/* Same facts block as the order page: 14px muted label, 16px semibold value, 32px rows. */}
      <dl className="flex flex-col gap-1 rounded-2xl bg-card p-4 shadow-card ring-1 ring-foreground/6">
        {details.map(([label, value]) => (
          <div key={label} className="flex min-h-8 items-baseline justify-between gap-4">
            <dt className="shrink-0 text-sm text-muted-foreground">{label}</dt>
            <dd className="tabular text-right text-base font-semibold break-words">{value}</dd>
          </div>
        ))}
      </dl>

      {isSafeProofImage(r.proofImage) && (
        <div className="flex flex-col gap-2 rounded-2xl bg-card p-4 shadow-card ring-1 ring-foreground/6">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {r.onlineMethod === "cheque" ? "Cheque Photo" : "Payment Proof"}
          </span>
          <ProofModal
            imageUrl={r.proofImage}
            title={r.onlineMethod === "cheque" ? "Cheque Photo" : "Payment Proof"}
          />
        </div>
      )}

      {r.mode === "online" && ((checker && r.checkedAt) || (staffDetails && r.status === "rejected")) && (
        <div className="flex flex-col gap-1 rounded-2xl bg-card p-4 text-sm shadow-card ring-1 ring-foreground/6">
          {checker && r.checkedAt && (
            <div className="text-muted-foreground">
              {r.status === "rejected" ? "Rejected" : "Verified"} · {checker} · {formatDateTime(r.checkedAt)}
            </div>
          )}
          {staffDetails && r.status === "rejected" && reasonText(r.reasonCode, r.rejectReason, "payment") && (
            <div>Reason: {reasonText(r.reasonCode, r.rejectReason, "payment")}</div>
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
          {staffDetails && reasonText(r.reasonCode, r.reversalReason, "payment") && (
            <div>Reason: {reasonText(r.reasonCode, r.reversalReason, "payment")}</div>
          )}
        </div>
      )}

      {toCheck && (
        <ReasonAction receiptId={r.id} action="reject" primary={<VerifyButton receiptId={r.id} />} />
      )}
      {showReverse && (
        <ReasonAction receiptId={r.id} action="reverse" cashHolder={r.mode === "cash" ? r.collector : null} />
      )}
    </div>
  );
}
