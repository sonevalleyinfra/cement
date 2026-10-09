import { asc, eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { EmptyState } from "@/components/app/empty-state";
import { FirmChip } from "@/components/app/firm-chip";
import { db } from "@/db";
import { firms as firmsTable, retailers, user as users } from "@/db/schema";
import { formatDateTime } from "@/lib/datetime";
import { getAccessibleFirms } from "@/lib/firm-access";
import { getEntries } from "@/lib/ledger";
import { withRunningBalance } from "@/lib/ledger-rules";
import { formatINR } from "@/lib/money";
import { hasAnyRole, isAdmin } from "@/lib/roles";
import { requireUser } from "@/lib/session";
import { mayViewLedger } from "../access";
import { OpeningForm } from "./opening-form";

const kindLabel: Record<string, string> = {
  opening: "Opening balance",
  order_debit: "Order",
  receipt_credit: "Payment",
  adjustment: "Adjustment",
};

export default async function RetailerLedgerPage({
  params,
  searchParams,
}: {
  params: Promise<{ retailerId: string }>;
  searchParams: Promise<{ firm?: string }>;
}) {
  const { user } = await requireUser();
  const { retailerId } = await params;
  const { firm: firmParam } = await searchParams;
  if (!(await mayViewLedger(user, retailerId))) notFound();

  const [retailer] = await db.select().from(retailers).where(eq(retailers.id, retailerId)).limit(1);
  if (!retailer) notFound();

  const staff = hasAnyRole(user.role, ["accounts", "sales"]);
  const firms = staff
    ? await getAccessibleFirms(user.id, user.role)
    : await db.select().from(firmsTable).where(eq(firmsTable.active, true)).orderBy(asc(firmsTable.slot));
  const firm = firms.find((f) => f.id === firmParam) ?? firms[0];
  if (!firm) return <EmptyState title="No firm available" />;

  const rows = await getEntries(retailerId, firm.id);
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
      </div>
      {firms.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {firms.map((f) => (
            <Link
              key={f.id}
              href={`/ledger/${retailerId}?firm=${f.id}`}
              className={f.id === firm.id ? "opacity-100" : "opacity-60"}
            >
              <FirmChip name={f.name} slot={f.slot as "a" | "b" | "c"} />
            </Link>
          ))}
        </div>
      )}
      <div className="rounded-2xl bg-card p-4 ring-1 ring-foreground/8">
        <div className="text-xs text-muted-foreground">
          {balance < 0 ? "Advance with" : "Dues with"} {firm.name}
        </div>
        <div className="tabular text-3xl font-bold">{formatINR(Math.abs(balance))}</div>
      </div>
      {isAdmin(user.role) && !hasOpening && (
        <OpeningForm retailerId={retailerId} firmId={firm.id} firmName={firm.name} />
      )}
      {entries.length === 0 ? (
        <EmptyState title="No entries yet" />
      ) : (
        <ul className="flex flex-col gap-2">
          {entries.map((e) => (
            <li key={e.id} className="flex flex-col gap-1 rounded-2xl bg-card p-3 ring-1 ring-foreground/8">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold">{kindLabel[e.kind] ?? e.kind}</span>
                <span className={`tabular text-sm font-semibold ${e.amountPaise < 0 ? "text-green-700" : ""}`}>
                  {e.amountPaise < 0 ? "- " : ""}
                  {formatINR(Math.abs(e.amountPaise))}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                <span>
                  {formatDateTime(e.createdAt)}
                  {e.note ? ` · ${e.note}` : ""}
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
