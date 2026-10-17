import Link from "next/link";
import { TextLink } from "@/components/app/text-link";
import { runBooksCheck } from "@/lib/books-check";
import { summarize } from "@/lib/books-check-rules";
import { requireRole } from "@/lib/session";
import { cn } from "@/lib/utils";

export default async function BooksCheckPage() {
  await requireRole("admin");
  const lines = summarize(await runBooksCheck());
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-bold">Books check</h1>
        <TextLink href="/reports">Reports</TextLink>
      </div>
      <div className="flex flex-col gap-3">
        {lines.map((l, i) => (
          <section
            key={l.id}
            aria-label={l.title}
            className="animate-in-up flex flex-col gap-2 rounded-2xl bg-card p-4 shadow-card ring-1 ring-foreground/6"
            style={{ animationDelay: `${Math.min(i, 8) * 45}ms` }}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-base leading-snug font-semibold">{l.title}</h2>
                <p className="text-xs text-muted-foreground">{l.meaning}</p>
              </div>
              <span className={cn("shrink-0 text-sm font-semibold tabular-nums", l.ok ? "text-emerald-700" : "text-rose-700")}>
                {l.label}
              </span>
            </div>
            {l.rows.length > 0 && (
              <ul className="flex flex-col text-sm [overflow-wrap:anywhere]">
                {l.rows.map((r, j) => (
                  <li key={j}>
                    {r.href ? (
                      <Link href={r.href} className="flex min-h-12 items-center underline underline-offset-2">
                        {r.text}
                      </Link>
                    ) : (
                      <span className="flex min-h-12 items-center">{r.text}</span>
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
