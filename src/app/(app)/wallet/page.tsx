import { inArray } from "drizzle-orm";
import { EmptyState } from "@/components/app/empty-state";
import { db } from "@/db";
import { user as userTable, walletMovements } from "@/db/schema";
import { getAccessibleFirms } from "@/lib/firm-access";
import { hasAnyRole } from "@/lib/roles";
import { requireRole } from "@/lib/session";
import { pendingRequestIds, walletBalance } from "@/lib/wallet-rules";
import { WalletView } from "./wallet-view";

export default async function WalletPage() {
  const { user } = await requireRole("accounts", "sales");
  const firms = await getAccessibleFirms(user.id, user.role);
  if (firms.length === 0) return <EmptyState title="No firm available" />;
  const firmIds = firms.map((f) => f.id);
  const all = await db.select().from(walletMovements).where(inArray(walletMovements.firmId, firmIds));

  const mine = firms.map((f) => {
    const b = walletBalance(all.filter((m) => m.firmId === f.id && m.collectorId === user.id));
    return { firmId: f.id, firmName: f.name, balancePaise: b.balancePaise, pendingPaise: b.pendingPaise, availablePaise: b.availablePaise };
  });

  let collectors: { key: string; collector: string; firmName: string; balancePaise: number }[] = [];
  let requests: { id: string; collector: string; firmName: string; amountPaise: number; own: boolean }[] = [];
  if (hasAnyRole(user.role, ["accounts"])) {
    const ids = [...new Set(all.map((m) => m.collectorId))];
    const people = ids.length ? await db.select({ id: userTable.id, name: userTable.name }).from(userTable).where(inArray(userTable.id, ids)) : [];
    const nameOf = new Map(people.map((p) => [p.id, p.name]));
    for (const f of firms) {
      for (const id of ids) {
        const rows = all.filter((m) => m.firmId === f.id && m.collectorId === id);
        if (rows.length === 0) continue;
        const b = walletBalance(rows);
        if (b.balancePaise !== 0) collectors.push({ key: `${f.id}-${id}`, collector: nameOf.get(id) ?? "Unknown", firmName: f.name, balancePaise: b.balancePaise });
        const open = new Set(pendingRequestIds(rows));
        for (const r of rows.filter((x) => open.has(x.id))) {
          requests.push({ id: r.id, collector: nameOf.get(id) ?? "Unknown", firmName: f.name, amountPaise: r.amountPaise, own: id === user.id });
        }
      }
    }
  } else {
    collectors = [];
    requests = [];
  }
  return <WalletView mine={mine} collectors={collectors} requests={requests} isAccounts={hasAnyRole(user.role, ["accounts"])} />;
}
