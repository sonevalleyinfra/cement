import { asc, eq } from "drizzle-orm";
import { EmptyState } from "@/components/app/empty-state";
import { ListCard } from "@/components/app/list-card";
import { db } from "@/db";
import { retailers } from "@/db/schema";
import { getAllBalances } from "@/lib/ledger";
import { duesFrom } from "@/lib/ledger-rules";
import { formatINR } from "@/lib/money";
import { hasAnyRole, hasRole } from "@/lib/roles";
import { requireUser } from "@/lib/session";
import { ownRetailerId } from "./access";

export default async function LedgerPage() {
  const { user } = await requireUser();
  const staff = hasAnyRole(user.role, ["accounts", "sales"]);
  const isRetailer = hasRole(user.role, "retailer");
  if (!staff && !isRetailer) return <EmptyState title="No access" />;

  const own = staff ? null : await ownRetailerId(user.id);
  if (!staff && !own) return <EmptyState title="Your login is not linked to a retailer" />;

  const balances = await getAllBalances();
  const list = await db
    .select({ id: retailers.id, name: retailers.name, place: retailers.place })
    .from(retailers)
    .where(own ? eq(retailers.id, own) : undefined)
    .orderBy(asc(retailers.name));

  if (list.length === 0) return <EmptyState title="No retailers yet" />;
  return (
    <div className="flex flex-col gap-3">
      <h1 className="text-xl font-bold">Ledger</h1>
      <ul className="flex flex-col gap-3">
        {list.map((r, i) => {
          const dues = duesFrom(balances.find((b) => b.retailerId === r.id)?.balancePaise ?? 0);
          return (
            <li key={r.id}>
              <ListCard
                index={i}
                href={`/ledger/${r.id}`}
                title={r.place ? `${r.name} · ${r.place}` : r.name}
                bottom={
                  <>
                    <span className="text-xs text-muted-foreground">Dues</span>
                    <span className="tabular text-lg font-bold">{formatINR(dues)}</span>
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
