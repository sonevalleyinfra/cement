import { db } from "@/db";
import { user as userTable, walletMovements } from "@/db/schema";
import { can, rolesFor } from "@/lib/permissions";
import { requireRole } from "@/lib/session";
import { pendingRequestIds, walletBalance } from "@/lib/wallet-rules";
import { WalletView } from "./wallet-view";

/** Cash held: my own, and for accounts / admin everyone's plus the handovers to confirm. */
export default async function WalletPage() {
  const { user } = await requireRole(...rolesFor("useWallet"));
  const isAccounts = can(user.role, "confirmHandover");
  const all = await db.select().from(walletMovements);

  const b = walletBalance(all.filter((m) => m.collectorId === user.id));
  const mine = { balancePaise: b.balancePaise, pendingPaise: b.pendingPaise, availablePaise: b.availablePaise };

  const holders: { id: string; name: string; balancePaise: number; pendingPaise: number }[] = [];
  const requests: { id: string; collector: string; amountPaise: number; own: boolean }[] = [];
  if (isAccounts) {
    const people = await db.select({ id: userTable.id, name: userTable.name }).from(userTable);
    const nameOf = new Map(people.map((p) => [p.id, p.name]));
    for (const id of new Set(all.map((m) => m.collectorId))) {
      const rows = all.filter((m) => m.collectorId === id);
      const w = walletBalance(rows);
      if (w.balancePaise !== 0 || w.pendingPaise !== 0) {
        holders.push({ id, name: nameOf.get(id) ?? "Unknown", balancePaise: w.balancePaise, pendingPaise: w.pendingPaise });
      }
      const open = new Set(pendingRequestIds(rows));
      for (const r of rows.filter((x) => open.has(x.id))) {
        requests.push({ id: r.id, collector: nameOf.get(id) ?? "Unknown", amountPaise: r.amountPaise, own: id === user.id });
      }
    }
    holders.sort((a, b) => b.balancePaise - a.balancePaise);
  }
  return <WalletView mine={mine} holders={holders} requests={requests} isAccounts={isAccounts} />;
}
