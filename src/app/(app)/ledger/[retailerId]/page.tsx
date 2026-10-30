import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { TextLink } from "@/components/app/text-link";
import { db } from "@/db";
import { retailers, user as users } from "@/db/schema";
import { formatDate, formatDateTime } from "@/lib/datetime";
import { isUuid } from "@/lib/ids";
import { getEntries } from "@/lib/ledger";
import { newestFirstWithBalance } from "@/lib/ledger-rules";
import { balanceLine, ledgerRowsForViewer } from "@/lib/ledger-view-rules";
import { formatINR } from "@/lib/money";
import { isRetailerOnly } from "@/lib/order-access";
import { can } from "@/lib/permissions";
import { hasAnyRole } from "@/lib/roles";
import { requireUser } from "@/lib/session";
import { mayViewLedger } from "../access";
import { LedgerActions } from "./ledger-actions";

export default async function RetailerLedgerPage({
  params,
}: {
  params: Promise<{ retailerId: string }>;
}) {
  const { user } = await requireUser();
  const { retailerId } = await params;
  if (!isUuid(retailerId)) notFound();
  if (!(await mayViewLedger(user, retailerId))) notFound();

  const [retailer] = await db.select().from(retailers).where(eq(retailers.id, retailerId)).limit(1);
  if (!retailer) notFound();

  const staff = hasAnyRole(user.role, ["accounts", "sales"]);
  const rows = await getEntries(retailerId);
  const actors = new Map(
    (await db.select({ id: users.id, name: users.name }).from(users)).map((u) => [u.id, u.name]),
  );
  // Newest first (same as the supplier account); each row keeps its balance-after.
  const withBalance = newestFirstWithBalance(rows);
  const balance = withBalance[0]?.balancePaise ?? 0;
  // A shop's own login sees no dispatch amounts and no running balance (owner's rule, ledger-view-rules).
  const entries = ledgerRowsForViewer(user.role, withBalance);
  const hasOpening = rows.some((r) => r.kind === "opening");

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={retailer.name}
        back={staff ? "/ledger" : undefined}
        action={isRetailerOnly(user.role) && <TextLink href="/receipts">Payments</TextLink>}
      />
      <div className="rounded-2xl bg-card p-4 shadow-card ring-1 ring-foreground/6">
        <div className="text-xs text-muted-foreground">{balanceLine(balance).label}</div>
        <div className="tabular text-3xl font-bold">{formatINR(balanceLine(balance).amountPaise)}</div>
      </div>
      <LedgerActions
        retailerId={retailerId}
        canOpen={can(user.role, "setOpeningBalance") && !hasOpening}
        canAdjust={can(user.role, "adjustLedger")}
        canCollect={can(user.role, "recordReceipt")}
        duesPaise={balance > 0 ? balance : 0}
      />
      {entries.length === 0 ? (
        <EmptyState title="No entries yet" />
      ) : (
        <ul className="flex flex-col gap-2">
          {entries.map((e) => (
            <li key={e.id} className="flex flex-col gap-1 rounded-2xl bg-card p-3 shadow-card ring-1 ring-foreground/6">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold">{e.label}</span>
                {e.amountPaise !== null && (
                  <span className={`tabular text-sm font-semibold ${e.amountPaise < 0 ? "text-green-700" : ""}`}>
                    {formatINR(e.amountPaise)}
                  </span>
                )}
              </div>
              {e.what && <div className="text-sm">{e.what}</div>}
              <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                <span>
                  {e.backdated ? formatDate(e.createdAt) : formatDateTime(e.createdAt)}
                  {e.note ? ` · ${e.note}` : ""}
                  {e.actorId ? ` · ${actors.get(e.actorId) ?? ""}` : ""}
                </span>
                {e.balancePaise !== null && <span className="tabular">Balance {formatINR(e.balancePaise)}</span>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
