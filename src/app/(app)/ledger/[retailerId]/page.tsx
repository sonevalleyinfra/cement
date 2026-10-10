import { eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { EmptyState } from "@/components/app/empty-state";
import { db } from "@/db";
import { retailers, user as users } from "@/db/schema";
import { formatDateTime } from "@/lib/datetime";
import { isUuid } from "@/lib/ids";
import { getEntries } from "@/lib/ledger";
import { withRunningBalance } from "@/lib/ledger-rules";
import { ledgerEntryLabel, showLedgerNotes } from "@/lib/ledger-view-rules";
import { formatINR } from "@/lib/money";
import { isRetailerOnly } from "@/lib/order-access";
import { can } from "@/lib/permissions";
import { hasAnyRole } from "@/lib/roles";
import { requireUser } from "@/lib/session";
import { mayViewLedger } from "../access";
import { AdjustmentForm } from "./adjustment-form";
import { OpeningForm } from "./opening-form";

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
  const showNotes = showLedgerNotes(user.role);
  const rows = await getEntries(retailerId);
  const actors = new Map(
    (await db.select({ id: users.id, name: users.name }).from(users)).map((u) => [u.id, u.name]),
  );
  const entries = withRunningBalance(rows);
  const balance = entries.at(-1)?.balancePaise ?? 0;
  const hasOpening = rows.some((r) => r.kind === "opening");

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">{retailer.name}</h1>
        {staff && (
          <Link href="/ledger" className="text-sm text-muted-foreground underline">
            All retailers
          </Link>
        )}
        {isRetailerOnly(user.role) && (
          <Link href="/receipts" className="text-sm text-muted-foreground underline">
            Payments
          </Link>
        )}
      </div>
      <div className="rounded-2xl bg-card p-4 shadow-card ring-1 ring-foreground/6">
        <div className="text-xs text-muted-foreground">{balance < 0 ? "Advance" : "Dues"}</div>
        <div className="tabular text-3xl font-bold">{formatINR(Math.abs(balance))}</div>
      </div>
      {can(user.role, "setOpeningBalance") && !hasOpening && <OpeningForm retailerId={retailerId} />}
      {can(user.role, "adjustLedger") && <AdjustmentForm retailerId={retailerId} />}
      {entries.length === 0 ? (
        <EmptyState title="No entries yet" />
      ) : (
        <ul className="flex flex-col gap-2">
          {entries.map((e) => (
            <li key={e.id} className="flex flex-col gap-1 rounded-2xl bg-card p-3 shadow-card ring-1 ring-foreground/6">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold">{ledgerEntryLabel(e.kind, e.amountPaise)}</span>
                <span className={`tabular text-sm font-semibold ${e.amountPaise < 0 ? "text-green-700" : ""}`}>
                  {e.amountPaise < 0 ? "- " : ""}
                  {formatINR(Math.abs(e.amountPaise))}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                <span>
                  {formatDateTime(e.createdAt)}
                  {showNotes && e.note ? ` · ${e.note}` : ""}
                  {staff ? ` · ${actors.get(e.actorId) ?? ""}` : ""}
                </span>
                <span className="tabular">Balance {formatINR(e.balancePaise)}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
