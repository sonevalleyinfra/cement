import { asc, eq } from "drizzle-orm";
import { EmptyState } from "@/components/app/empty-state";
import { ListCard } from "@/components/app/list-card";
import { db } from "@/db";
import { receipts, retailers, user as users } from "@/db/schema";
import { formatDate } from "@/lib/datetime";
import { formatINR } from "@/lib/money";
import { rolesFor } from "@/lib/permissions";
import { requireRole } from "@/lib/session";
import { ReasonAction, VerifyButton } from "../payment-actions";

/** Online payments waiting for accounts: check the bank statement, then Verify or Reject. */
export default async function ReviewPage() {
  await requireRole(...rolesFor("verifyPayments"));
  const rows = await db
    .select({
      id: receipts.id,
      no: receipts.receiptNo,
      retailer: retailers.name,
      totalPaise: receipts.totalPaise,
      utr: receipts.utr,
      note: receipts.note,
      recorder: users.name,
      createdAt: receipts.createdAt,
    })
    .from(receipts)
    .innerJoin(retailers, eq(retailers.id, receipts.retailerId))
    .innerJoin(users, eq(users.id, receipts.receivedBy))
    .where(eq(receipts.status, "unverified"))
    .orderBy(asc(receipts.createdAt));

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-bold">Verify online</h1>
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
                  <div className="flex w-full flex-col gap-2">
                    <div className="flex items-end justify-between gap-2">
                      <span className="text-sm">
                        UTR <span className="tabular font-semibold">{r.utr}</span>
                      </span>
                      <span className="tabular text-lg font-bold">{formatINR(r.totalPaise)}</span>
                    </div>
                    {r.note && <span className="text-xs text-muted-foreground">{r.note}</span>}
                    <ReasonAction receiptId={r.id} action="reject" primary={<VerifyButton receiptId={r.id} />} />
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
