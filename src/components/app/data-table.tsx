import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type Column = { label: string; align?: "left" | "right" };

/**
 * A compact table of numbers inside a card. On a narrow phone it scrolls sideways inside its own
 * box (the page never scrolls sideways). The first column stays put while the numbers scroll.
 * `total` is an optional bold last row.
 * `stacked` is for tables with many number columns: each row becomes its own small card (name on top,
 * then one "label ... number" line per column, numbers on the right). Empty and "–" cells are left out.
 */
export function DataTable({
  columns,
  rows,
  total,
  stacked = false,
  className,
}: {
  columns: Column[];
  rows: ReactNode[][];
  total?: ReactNode[];
  stacked?: boolean;
  className?: string;
}) {
  if (stacked) {
    const card = "rounded-2xl bg-card p-3 shadow-card ring-1 ring-foreground/6";
    const lines = (cells: ReactNode[]) =>
      cells.slice(1).map((cell, i) =>
        cell === "" || cell === "–" || cell == null ? null : (
          <div key={i} className="flex items-baseline justify-between gap-3">
            <dt className="text-muted-foreground">{columns[i + 1]?.label}</dt>
            <dd className="text-right font-medium">{cell}</dd>
          </div>
        ),
      );
    return (
      <ul className={cn("flex flex-col gap-2", className)}>
        {rows.map((r, ri) => (
          <li key={ri} className={cn(card, "animate-in-up")}>
            <div className="font-semibold [overflow-wrap:anywhere]">{r[0]}</div>
            <dl className="tabular mt-1 flex flex-col gap-1 text-sm">{lines(r)}</dl>
          </li>
        ))}
        {total && (
          <li className={cn(card, "font-bold [&_dd]:font-bold")}>
            <div>{total[0]}</div>
            <dl className="tabular mt-1 flex flex-col gap-1 text-sm">{lines(total)}</dl>
          </li>
        )}
      </ul>
    );
  }
  const align = (i: number) => (columns[i]?.align ?? (i === 0 ? "left" : "right")) === "right" ? "text-right" : "text-left";
  const sticky = "sticky left-0 z-10 bg-card";
  // 16px at both outer edges: at scroll end the last column's padding is exactly the 16px fade.
  const pad = (i: number) => cn(i === 0 && "pl-4", i === columns.length - 1 && "pr-4");
  return (
    <div className={cn("animate-in-up overflow-hidden rounded-2xl bg-card shadow-card ring-1 ring-foreground/6", className)}>
      <div className="scroll-x-fade-end">
        <table className="tabular w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-border/70 text-xs text-muted-foreground">
              {columns.map((c, i) => (
                <th key={c.label} scope="col" className={cn("px-3 py-2 font-medium whitespace-nowrap", align(i), pad(i), i === 0 && sticky)}>
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, ri) => (
              <tr key={ri} className="border-b border-border/40 last:border-0">
                {r.map((cell, i) => (
                  <td key={i} className={cn("px-3 py-2", align(i), pad(i), i === 0 ? cn(sticky, "max-w-40 font-medium") : "whitespace-nowrap")}>
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          {total && (
            <tfoot>
              <tr className="border-t border-border font-bold">
                {total.map((cell, i) => (
                  <td key={i} className={cn("px-3 py-2 whitespace-nowrap", align(i), pad(i), i === 0 && sticky)}>
                    {cell}
                  </td>
                ))}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
