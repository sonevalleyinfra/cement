import { Download, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";
import { PageHeader } from "@/components/app/page-header";
import { RangeForm } from "@/components/app/range-form";
import { Stat } from "@/components/app/stat";
import { buttonVariants } from "@/components/ui/button";
import { formatDate } from "@/lib/datetime";
import { formatINR } from "@/lib/money";
import { deltaLabel, previousRange } from "@/lib/report-compare";
import { daysBetween, istStartOf, rangeQuery, type ReportRange } from "@/lib/report-range";
import { cn } from "@/lib/utils";

/** Money in reports and statements: exact, always with paise, so every row and total adds up on screen. */
export const money = (paise: number) => formatINR(paise);
export const num = (v: number) => new Intl.NumberFormat("en-IN").format(v);
/** "+12" / "−5" / "0" for bag changes. */
export const signedNum = (v: number) => (v > 0 ? `+${num(v)}` : v < 0 ? `−${num(-v)}` : "0");

/** Every report page: title with a back chevron to the reports list (same dates), the date filter, then the report. */
export function ReportFrame({
  title,
  range,
  keep,
  filters,
  csvHref,
  children,
}: {
  title: string;
  range: ReportRange;
  keep?: Record<string, string>;
  filters?: ReactNode;
  /** Address of the CSV download (with the dates and any picked filter); leave out when the report has none. */
  csvHref?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={title} back={`/reports?${rangeQuery(range)}`} />
      <RangeForm from={range.from} to={range.to} keep={keep} presets>
        {filters}
      </RangeForm>
      {csvHref && (
        <a href={csvHref} download className={cn(buttonVariants({ variant: "outline" }), "w-full")}>
          <Download aria-hidden />
          Export CSV
        </a>
      )}
      {children}
    </div>
  );
}

/** Change against the period before, as text: `delta` like "+12%", `previous` the old value. */
export type StatCompare = { delta: string; tone: "up" | "down" | "flat"; previous: string };

const COMPARE_TONE = { up: "text-emerald-700", down: "text-rose-700", flat: "text-muted-foreground" } as const;

/** The compare line for one number: its change against `previous`, and the old value shown with `format`. */
export function compareOf(current: number, previous: number, format: (v: number) => string): StatCompare {
  const d = deltaLabel(current, previous);
  return { delta: d.text, tone: d.tone, previous: format(previous) };
}

/** One line saying which days the "prev" numbers are from. */
export function CompareNote({ range }: { range: Pick<ReportRange, "from" | "to"> }) {
  const p = previousRange(range);
  return (
    <p className="text-xs text-muted-foreground">
      vs previous {daysBetween(p.from, p.to) + 1} {daysBetween(p.from, p.to) === 0 ? "day" : "days"} ({formatDate(istStartOf(p.from))} –{" "}
      {formatDate(istStartOf(p.to))})
    </p>
  );
}

/** A card of big numbers, two per row. */
export function Stats({ items }: { items: { label: string; value: string; compare?: StatCompare }[] }) {
  return (
    <div className="animate-in-up grid grid-cols-2 gap-4 rounded-2xl bg-card p-4 shadow-card ring-1 ring-foreground/6 [overflow-wrap:anywhere] [&>*]:min-w-0">
      {items.map((s) => (
        <div key={s.label} className="flex flex-col gap-0.5">
          <Stat label={s.label} value={s.value} />
          {s.compare && (
            <span className="text-xs text-muted-foreground">
              <span className={cn("font-medium", COMPARE_TONE[s.compare.tone])}>{s.compare.delta}</span> · prev {s.compare.previous}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

export function Section({ title }: { title: string }) {
  return <h2 className="mt-2 text-sm font-medium text-muted-foreground">{title}</h2>;
}

/** Shown when a report's numbers do not add up (they always should). */
export function Mismatch({ text = "Does not add up" }: { text?: string }) {
  return (
    <div role="alert" className="flex items-center gap-2 rounded-2xl bg-rose-100 p-3 text-sm font-semibold text-rose-800">
      <TriangleAlert aria-hidden className="size-4 shrink-0" />
      {text}
    </div>
  );
}
