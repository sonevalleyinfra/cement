import { and, asc, eq, sql } from "drizzle-orm";
import { Image as ImageIcon } from "lucide-react";
import Link from "next/link";
import { EmptyState } from "@/components/app/empty-state";
import { FilterTabs } from "@/components/app/filter-tabs";
import { ListCard } from "@/components/app/list-card";
import { PageHeader } from "@/components/app/page-header";
import { buttonVariants } from "@/components/ui/button";
import { db } from "@/db";
import { bankAccounts, receipts, retailers, user as users } from "@/db/schema";
import { bankAccountLabel } from "@/lib/bank-account-rules";
import { formatDate, toISTDateKey } from "@/lib/datetime";
import { isUuid } from "@/lib/ids";
import { formatINR } from "@/lib/money";
import { rolesFor } from "@/lib/permissions";
import { ONLINE_METHOD_LABELS } from "@/lib/receipt-rules";
import { istStartOf, param } from "@/lib/report-range";
import { requireRole } from "@/lib/session";
import { cn } from "@/lib/utils";
import { ReasonAction, VerifyButton } from "../payment-actions";

/**
 * Online payments waiting for accounts: check the bank statement, then Verify or Reject.
 * `?account=<id>` shows only the payments into that bank account (an unknown id shows all).
 */
export default async function ReviewPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireRole(...rolesFor("verifyPayments"));
  const accounts = await db
    .select({ id: bankAccounts.id, name: bankAccounts.name, last4: bankAccounts.last4 })
    .from(bankAccounts)
    .orderBy(asc(bankAccounts.name));
  const wanted = param((await searchParams).account);
  const account = isUuid(wanted) && accounts.some((a) => a.id === wanted) ? wanted : "";
  const rows = await db
    .select({
      id: receipts.id,
      no: receipts.receiptNo,
      retailer: retailers.name,
      totalPaise: receipts.totalPaise,
      utr: receipts.utr,
      note: receipts.note,
      onlineMethod: receipts.onlineMethod,
      accountName: bankAccounts.name,
      accountLast4: bankAccounts.last4,
      payerName: receipts.payerName,
      hasProof: sql<boolean>`${receipts.proofImage} is not null`,
      chequeDate: receipts.chequeDate,
      chequeBank: receipts.chequeBank,
      receivedOn: receipts.receivedOn,
      recorder: users.name,
      createdAt: receipts.createdAt,
    })
    .from(receipts)
    .innerJoin(retailers, eq(retailers.id, receipts.retailerId))
    .innerJoin(users, eq(users.id, receipts.receivedBy))
    .leftJoin(bankAccounts, eq(bankAccounts.id, receipts.bankAccountId))
    .where(and(eq(receipts.status, "unverified"), account ? eq(receipts.bankAccountId, account) : undefined))
    .orderBy(asc(receipts.createdAt));

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Verify online" back="/receipts" />
      {accounts.length > 0 && (
        <FilterTabs
          path="/receipts/review"
          param="account"
          value={account}
          label="Bank account"
          tabs={[{ value: "", label: "All" }, ...accounts.map((a) => ({ value: a.id, label: bankAccountLabel(a) }))]}
        />
      )}
      {rows.length === 0 ? (
        <EmptyState title="Nothing to verify" />
      ) : (
        <ul className="flex flex-col gap-3">
          {rows.map((r, i) => (
            <li key={r.id}>
              <ListCard
                index={i}
                title={r.retailer}
                top={
                  <span className="text-xs text-muted-foreground">
                    #{r.no} · {formatDate(r.createdAt)} · {r.recorder}
                  </span>
                }
                bottom={
                  <div className="flex w-full flex-col gap-3">
                    <div className="flex items-end justify-between gap-2">
                      <span className="text-sm">
                        {r.onlineMethod === "cheque" ? "Cheque #" : "UTR "}{" "}
                        <span className="tabular font-semibold">{r.utr}</span>
                      </span>
                      <span className="tabular text-lg font-bold">{formatINR(r.totalPaise, { hidePaise: true })}</span>
                    </div>

                    {(r.onlineMethod || r.accountName || r.chequeBank || r.chequeDate) && (
                      <span className="text-sm text-foreground/90">
                        {[
                          r.onlineMethod ? (ONLINE_METHOD_LABELS[r.onlineMethod] ?? r.onlineMethod) : "",
                          r.chequeBank ? `Bank: ${r.chequeBank}` : "",
                          r.chequeDate ? `Date: ${r.chequeDate}` : "",
                          r.accountName ? `Into: ${bankAccountLabel({ name: r.accountName, last4: r.accountLast4 })}` : "",
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    )}

                    {/* The top line already has the entry day: show Received only when it differs. */}
                    {(r.receivedOn !== toISTDateKey(r.createdAt) || r.payerName) && (
                      <span className="text-xs text-muted-foreground">
                        {[
                          r.receivedOn !== toISTDateKey(r.createdAt) ? `Received ${formatDate(istStartOf(r.receivedOn))}` : "",
                          r.payerName ? `Payer: ${r.payerName}` : "",
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    )}
                    {r.note && <span className="text-xs text-muted-foreground">{r.note}</span>}

                    {r.hasProof && (
                      <Link
                        href={`/receipts/${r.id}`}
                        className={cn(buttonVariants({ variant: "outline", size: "sm" }), "self-start")}
                      >
                        <ImageIcon aria-hidden />
                        {r.onlineMethod === "cheque" ? "Cheque photo" : "Payment proof"}
                      </Link>
                    )}

                    <ReasonAction receiptId={r.id} action="reject" inline primary={<VerifyButton receiptId={r.id} />} />
                  </div>
                }
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
