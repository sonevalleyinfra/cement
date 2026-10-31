import { eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { TextLink } from "@/components/app/text-link";
import { buttonVariants } from "@/components/ui/button";
import { db } from "@/db";
import { retailers, user as users, walletMovements } from "@/db/schema";
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
import { cn } from "@/lib/utils";
import { walletBalance } from "@/lib/wallet-rules";
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
  let cashInHandPaise = 0;
  if (staff) {
    const movements = await db
      .select({ amountPaise: walletMovements.amountPaise, kind: walletMovements.kind })
      .from(walletMovements)
      .where(eq(walletMovements.collectorId, user.id));
    cashInHandPaise = walletBalance(movements).balancePaise;
  }

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
      {staff && (
        <div className="flex items-center justify-between gap-3 rounded-2xl bg-card p-4 shadow-card ring-1 ring-foreground/6">
          <div>
            <div className="text-xs font-medium text-muted-foreground">My cash in hand</div>
            <div className="tabular text-2xl font-bold">{formatINR(cashInHandPaise)}</div>
          </div>
          <Link href="/wallet" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
            {cashInHandPaise > 0 ? "Hand over cash" : "Wallet"}
          </Link>
        </div>
      )}
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
                  <span className={`tabular text-sm font-semibold ${e.amountPaise < 0 ? "text-good-foreground" : ""}`}>
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
                {e.balancePaise !== null && (
                  <span className={`tabular shrink-0 whitespace-nowrap ${e.balancePaise < 0 ? "text-good-foreground font-medium" : ""}`}>
                    {balanceLine(e.balancePaise).label} {formatINR(balanceLine(e.balancePaise).amountPaise)}
                  </span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
