import { EmptyState } from "@/components/app/empty-state";
import { db } from "@/db";
import { user as users } from "@/db/schema";
import { formatDate, toISTDateKey } from "@/lib/datetime";
import { formatINR } from "@/lib/money";
import { rolesFor } from "@/lib/permissions";
import { getPrismBalance, getPrismEntries, hasPrismOpening } from "@/lib/prism";
import { PRISM_MODE_LABELS, prismBalanceLabel, prismKindLabel, type PrismPaymentMode } from "@/lib/prism-rules";
import { requireRole } from "@/lib/session";
import { PrismActions } from "./prism-actions";

/** Most entries shown; the balance always counts all of them. */
const SHOWN = 200;

export default async function PrismPage() {
  await requireRole(...rolesFor("viewPrism"));
  const [balance, hasOpening, rows, people] = await Promise.all([
    getPrismBalance(),
    hasPrismOpening(),
    getPrismEntries(SHOWN),
    db.select({ id: users.id, name: users.name }).from(users),
  ]);
  const who = new Map(people.map((u) => [u.id, u.name]));
  const big = prismBalanceLabel(balance);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-bold">Prism account</h1>
      <div className="rounded-2xl bg-card p-4 shadow-card ring-1 ring-foreground/6">
        <div className="text-xs text-muted-foreground">{big.text}</div>
        <div className="tabular text-3xl font-bold">{formatINR(big.amountPaise)}</div>
      </div>
      <PrismActions hasOpening={hasOpening} today={toISTDateKey(new Date())}>
        {rows.length === 0 ? (
          <EmptyState title="No entries yet" />
        ) : (
          <ul className="flex flex-col gap-2">
            {rows.map((e) => {
              const detail = [
                e.kind === "payment" && e.mode ? PRISM_MODE_LABELS[e.mode as PrismPaymentMode] : "",
                e.reference,
                e.kind === "opening" ? "" : e.note,
              ].filter(Boolean);
              return (
                <li key={e.id} className="flex flex-col gap-1 rounded-2xl bg-card p-3 shadow-card ring-1 ring-foreground/6">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold">{prismKindLabel(e.kind)}</span>
                    <span className={`tabular text-sm font-semibold ${e.amountPaise < 0 ? "text-green-700" : ""}`}>
                      {e.amountPaise < 0 ? "- " : ""}
                      {formatINR(Math.abs(e.amountPaise))}
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {[formatDate(e.entryDate), ...detail, who.get(e.actorId) ?? ""].filter(Boolean).join(" · ")}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </PrismActions>
    </div>
  );
}
