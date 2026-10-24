import type { ReactNode } from "react";
import { chipClass } from "@/components/app/chip";
import { Button } from "@/components/ui/button";
import { matchPreset, PRESET_LABELS, PRESETS, presetRange } from "@/lib/report-presets";
import { cn } from "@/lib/utils";

const field = "h-12 w-full min-w-0 rounded-xl border bg-background px-3 text-base";

/**
 * A filter box that reloads the page with the picked values in the address bar (a plain GET form,
 * no JavaScript needed): From / To days (India), any extra filters as `children`
 * (use `FilterSelect`), and `keep` for values to carry along unchanged (e.g. the picked retailer).
 * With `presets`, a row of one-tap ranges (Today, This week, ...) sits on top; they are plain links that
 * carry the `keep` values (a drop-down in `children` cannot be carried without JavaScript).
 */
export function RangeForm({
  from,
  to,
  keep,
  presets,
  children,
  className,
}: {
  from: string;
  to: string;
  keep?: Record<string, string>;
  presets?: boolean;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <form method="get" className={cn("flex flex-col gap-3 rounded-2xl bg-card p-3 shadow-card ring-1 ring-foreground/6", className)}>
      {presets && <PresetLinks from={from} to={to} keep={keep} />}
      {children}
      <div className="grid grid-cols-2 gap-2">
        <label className="flex min-w-0 flex-col gap-1 text-sm font-medium">
          From
          <input type="date" name="from" defaultValue={from} className={field} />
        </label>
        <label className="flex min-w-0 flex-col gap-1 text-sm font-medium">
          To
          <input type="date" name="to" defaultValue={to} className={field} />
        </label>
      </div>
      {keep && Object.entries(keep).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <Button type="submit" variant="outline">
        Show
      </Button>
    </form>
  );
}

/** A native drop-down inside a `RangeForm` (sent with the form; no JavaScript). */
export function FilterSelect({
  name,
  label,
  value,
  options,
}: {
  name: string;
  label: string;
  value: string;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="flex min-w-0 flex-col gap-1 text-sm font-medium">
      {label}
      <select name={name} defaultValue={value} className={cn(field, "font-normal")}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

/** Today, This week, ... as links to the same page with that range. Computed on the server with the current time. */
function PresetLinks({ from, to, keep }: { from: string; to: string; keep?: Record<string, string> }) {
  const now = new Date();
  const current = matchPreset({ from, to }, now);
  return (
    <nav
      aria-label="Date presets"
      className="-mx-3 -my-2 flex snap-x scroll-px-3 gap-2 overflow-x-auto px-3 py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {PRESETS.map((id) => {
        const r = presetRange(id, now);
        const href = `?${new URLSearchParams({ from: r.from, to: r.to, ...keep })}`;
        return (
          <a
            key={id}
            href={href}
            aria-current={id === current ? "true" : undefined}
            className={chipClass(id === current, "snap-start")}
          >
            {PRESET_LABELS[id]}
          </a>
        );
      })}
    </nav>
  );
}
