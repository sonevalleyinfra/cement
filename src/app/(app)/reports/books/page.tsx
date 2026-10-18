import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/app/page-header";
import { StatusChip } from "@/components/app/status-chip";
import { runBooksCheck } from "@/lib/books-check";
import { summarize, type BooksLine, type ShownRow } from "@/lib/books-check-rules";
import { stagger } from "@/lib/motion";
import { requireRole } from "@/lib/session";

/** Lines with problems (or that could not run) first; ADR order within each group. */
const problemsFirst = (lines: BooksLine[]) => [...lines.filter((l) => !l.ok), ...lines.filter((l) => l.ok)];

const chipStatus = (l: BooksLine) => (l.ok ? "approved" : l.error ? "placed" : "rejected");

function RowBody({ row }: { row: ShownRow }) {
  return (
    <span className="min-w-0 flex-1">
      <span className="block text-sm font-medium">{row.title}</span>
      {row.detail && <span className="block text-sm text-muted-foreground tabular-nums">{row.detail}</span>}
    </span>
  );
}

export default async function BooksCheckPage() {
  await requireRole("admin");
  const lines = problemsFirst(summarize(await runBooksCheck()));
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Books check" back="/reports" />
      <div className="flex flex-col gap-3">
        {lines.map((l, i) => (
          <section
            key={l.id}
            aria-label={l.title}
            className="animate-in-up flex flex-col gap-2 rounded-2xl bg-card p-4 shadow-card ring-1 ring-foreground/6"
            style={stagger(i)}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-base leading-snug font-semibold">{l.title}</h2>
                <p className="text-xs text-muted-foreground">{l.meaning}</p>
              </div>
              <StatusChip status={chipStatus(l)} label={l.ok ? "OK" : l.label} className="shrink-0 tabular-nums" />
            </div>
            {l.rows.length > 0 && (
              <ul className="flex flex-col divide-y divide-foreground/6 border-t border-foreground/6 [overflow-wrap:anywhere]">
                {l.rows.map((r, j) => (
                  <li key={j}>
                    {r.href ? (
                      <Link href={r.href} className="flex min-h-12 items-center gap-3 py-2 transition-opacity duration-150 active:opacity-60">
                        <RowBody row={r} />
                        <ChevronRight aria-hidden className="size-4 shrink-0 text-muted-foreground" />
                      </Link>
                    ) : (
                      <div className="flex min-h-12 items-center py-2">
                        <RowBody row={r} />
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {l.more > 0 && <p className="text-xs text-muted-foreground">+{l.more} more</p>}
          </section>
        ))}
      </div>
    </div>
  );
}
