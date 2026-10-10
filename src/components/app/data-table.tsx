import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type Column = { label: string; align?: "left" | "right" };

/**
 * A compact table of numbers inside a card. On a narrow phone it scrolls sideways inside its own
 * box (the page never scrolls sideways). The first column stays put while the numbers scroll.
 * `total` is an optional bold last row.
 */
export function DataTable({
  columns,
  rows,
  total,
  className,
}: {
  columns: Column[];
  rows: ReactNode[][];
  total?: ReactNode[];
  className?: string;
}) {
  const align = (i: number) => (columns[i]?.align ?? (i === 0 ? "left" : "right")) === "right" ? "text-right" : "text-left";
  const sticky = "sticky left-0 z-10 bg-card";
  return (
    <div className={cn("animate-in-up overflow-x-auto rounded-2xl bg-card shadow-card ring-1 ring-foreground/6", className)}>
      <table className="tabular w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-border/70 text-xs text-muted-foreground">
            {columns.map((c, i) => (
              <th key={c.label} scope="col" className={cn("px-3 py-2 font-medium whitespace-nowrap", align(i), i === 0 && sticky)}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, ri) => (
            <tr key={ri} className="border-b border-border/40 last:border-0">
              {r.map((cell, i) => (
                <td key={i} className={cn("px-3 py-2", align(i), i === 0 ? cn(sticky, "max-w-40 font-medium") : "whitespace-nowrap")}>
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
                <td key={i} className={cn("px-3 py-2 whitespace-nowrap", align(i), i === 0 && sticky)}>
                  {cell}
                </td>
              ))}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}
