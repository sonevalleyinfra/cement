import { cn } from "@/lib/utils";

/** Big number with a small muted label: the main way numbers appear in the app. */
export function Stat({
  label,
  value,
  className,
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-0.5", className)}>
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="tabular text-2xl leading-tight font-bold tracking-tight">{value}</span>
    </div>
  );
}
