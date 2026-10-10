import { db } from "@/db";
import { user as userTable, walletMovements } from "@/db/schema";
import { can, rolesFor } from "@/lib/permissions";
import { requireRole } from "@/lib/session";
import { pendingRequestIds, walletBalance } from "@/lib/wallet-rules";
import { WalletView } from "./wallet-view";

export default async function WalletPage() {
  const { user } = await requireRole(...rolesFor("useWallet"));
  const isAccounts = can(user.role, "confirmHandover");
  const all = await db.select().from(walletMovements);

  const b = walletBalance(all.filter((m) => m.collectorId === user.id));
  const mine = { balancePaise: b.balancePaise, pendingPaise: b.pendingPaise, availablePaise: b.availablePaise };

  const collectors: { key: string; collector: string; balancePaise: number }[] = [];
  const requests: { id: string; collector: string; amountPaise: number; own: boolean }[] = [];
  if (isAccounts) {
    const people = await db.select({ id: userTable.id, name: userTable.name }).from(userTable);
    const nameOf = new Map(people.map((p) => [p.id, p.name]));
    for (const id of new Set(all.map((m) => m.collectorId))) {
      const rows = all.filter((m) => m.collectorId === id);
      const balance = walletBalance(rows).balancePaise;
      if (balance !== 0) collectors.push({ key: id, collector: nameOf.get(id) ?? "Unknown", balancePaise: balance });
      const open = new Set(pendingRequestIds(rows));
      for (const r of rows.filter((x) => open.has(x.id))) {
        requests.push({ id: r.id, collector: nameOf.get(id) ?? "Unknown", amountPaise: r.amountPaise, own: id === user.id });
      }
    }
  }
  return <WalletView mine={mine} collectors={collectors} requests={requests} isAccounts={isAccounts} />;
}
