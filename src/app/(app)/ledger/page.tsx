import { asc, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { EmptyState } from "@/components/app/empty-state";
import { ListCard } from "@/components/app/list-card";
import { PageHeader } from "@/components/app/page-header";
import { db } from "@/db";
import { retailers } from "@/db/schema";
import { getAllBalances } from "@/lib/ledger";
import { balanceLine } from "@/lib/ledger-view-rules";
import { formatINR } from "@/lib/money";
import { hasAnyRole, hasRole } from "@/lib/roles";
import { requireUser } from "@/lib/session";
import { ownRetailerId } from "./access";

export default async function LedgerPage() {
  const { user } = await requireUser();
  const staff = hasAnyRole(user.role, ["accounts", "sales"]);
  const isRetailer = hasRole(user.role, "retailer");
  const header = <PageHeader title="Ledger" />;
  const empty = (title: string) => (
    <div className="flex flex-col gap-4">
      {header}
      <EmptyState title={title} />
    </div>
  );
  if (!staff && !isRetailer) return empty("No access");

  const own = staff ? null : await ownRetailerId(user.id);
  if (!staff && !own) return empty("Your login is not linked to a retailer");

  const balances = await getAllBalances();
  const list = await db
    .select({ id: retailers.id, name: retailers.name, place: retailers.place })
    .from(retailers)
    .where(own ? eq(retailers.id, own) : undefined)
    .orderBy(asc(retailers.name));

  // A shop with one login sees one ledger: go straight to it.
  if (own && list.length === 1) redirect(`/ledger/${list[0].id}`);
  if (list.length === 0) return empty("No retailers yet");
  return (
    <div className="flex flex-col gap-4">
      {header}
      <ul className="flex flex-col gap-3">
        {list.map((r, i) => {
          const line = balanceLine(balances.find((b) => b.retailerId === r.id)?.balancePaise ?? 0);
          return (
            <li key={r.id}>
              <ListCard
                index={i}
                href={`/ledger/${r.id}`}
                title={r.place ? `${r.name} · ${r.place}` : r.name}
                bottom={
                  <>
                    <span className="text-xs text-muted-foreground">{line.label}</span>
                    <span className={`tabular text-lg font-bold ${line.label === "Advance" ? "text-green-700" : ""}`}>
                      {formatINR(line.amountPaise, { hidePaise: true })}
                    </span>
                  </>
                }
              />
            </li>
          );
        })}
      </ul>
    </div>
  );
}
