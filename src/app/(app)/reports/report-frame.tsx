import { TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";
import { RangeForm } from "@/components/app/range-form";
import { Stat } from "@/components/app/stat";
import { TextLink } from "@/components/app/text-link";
import { formatINR } from "@/lib/money";
import { rangeQuery, type ReportRange } from "@/lib/report-range";

/** Money in reports and statements: exact, always with paise, so every row and total adds up on screen. */
export const money = (paise: number) => formatINR(paise);
export const num = (v: number) => new Intl.NumberFormat("en-IN").format(v);
/** "+12" / "−5" / "0" for bag changes. */
export const signedNum = (v: number) => (v > 0 ? `+${num(v)}` : v < 0 ? `−${num(-v)}` : "0");

/** Every report page: title, a link back to the reports list (same dates), the date filter, then the report. */
export function ReportFrame({
  title,
  range,
  keep,
  filters,
  children,
}: {
  title: string;
  range: ReportRange;
  keep?: Record<string, string>;
  filters?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-bold">{title}</h1>
        <TextLink href={`/reports?${rangeQuery(range)}`}>Reports</TextLink>
      </div>
      <RangeForm from={range.from} to={range.to} keep={keep}>
        {filters}
      </RangeForm>
      {children}
    </div>
  );
}

/** A card of big numbers, two per row. */
export function Stats({ items }: { items: { label: string; value: string }[] }) {
  return (
    <div className="animate-in-up grid grid-cols-2 gap-4 rounded-2xl bg-card p-4 shadow-card ring-1 ring-foreground/6 [overflow-wrap:anywhere] [&>*]:min-w-0">
      {items.map((s) => (
        <Stat key={s.label} label={s.label} value={s.value} />
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
