import Link from "next/link";
import { CallButton } from "@/components/app/call-button";
import { formatDayMonth } from "@/lib/datetime";
import { formatINR } from "@/lib/money";
import type { OverdueRow as Row } from "@/lib/overdue-rules";
import { cn } from "@/lib/utils";
import { daysText } from "@/lib/words";

const money = (p: number) => formatINR(p, { hidePaise: true });

/**
 * One shop on the collection list. The whole row is a link (`href`); the call button sits above it,
 * so tapping it dials instead of opening the link. Shops with nothing overdue yet show their dues and
 * "Not yet due". Switched-off shops are faded with an "Off" pill. `compact` = 56px, lines 1 and 2 only.
 */
export function OverdueRow({ row, href, density = "full" }: { row: Row; href: string; density?: "full" | "compact" }) {
  const overdue = row.overduePaise > 0;
  const faded = !row.active && "opacity-60";
  const parts = [
    row.place,
    overdue ? (
      <span key="days" className={cn(row.daysPastTerms >= 60 && "text-risk-foreground")}>
        {daysText(row.daysPastTerms)}
      </span>
    ) : (
      "Not yet due"
    ),
    row.salesRepName,
  ].filter(Boolean);
  return (
    <div
      className={cn(
        "relative flex flex-col",
        density === "full"
          ? "gap-1 rounded-2xl bg-card p-4 shadow-card ring-1 ring-foreground/6"
          : "min-h-14 justify-center px-4 py-2",
      )}
    >
      <div className="flex items-center gap-2">
        <Link
          href={href}
          className={cn(
            "min-w-0 truncate text-base font-semibold outline-none after:absolute after:inset-0 after:rounded-2xl focus-visible:after:ring-2 focus-visible:after:ring-ring",
            faded,
          )}
        >
          {row.name}
        </Link>
        {!row.active && (
          <span className={cn("inline-flex h-6 shrink-0 items-center rounded-full bg-muted px-2 text-xs font-semibold text-muted-foreground", faded)}>
            Off
          </span>
        )}
        <span className={cn("tabular ml-auto shrink-0 text-base font-bold", overdue && "text-risk-foreground", faded)}>
          {money(overdue ? row.overduePaise : row.duePaise)}
        </span>
        <CallButton phone={row.phone} shop={row.name} className="relative z-10 -my-2 -mr-2" />
      </div>
      <p className={cn("tabular text-xs text-muted-foreground", faded)}>
        {parts.map((p, i) => (
          <span key={i}>
            {i > 0 && " · "}
            {p}
          </span>
        ))}
      </p>
      {density === "full" && (
        <p className={cn("tabular text-xs text-muted-foreground", faded)}>
          Due {money(row.duePaise)} ·{" "}
          {row.lastPayment
            ? `Paid ${money(row.lastPayment.totalPaise)} on ${formatDayMonth(row.lastPayment.createdAt)}`
            : "No payment yet"}
        </p>
      )}
    </div>
  );
}
