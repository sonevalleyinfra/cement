import { cn } from "@/lib/utils";

export type SelectOption = { value: string; label: string };
export type SelectGroup = { label: string; options: SelectOption[] };

/**
 * The one drop-down for the whole app: a native select (best on phones), 48px tall, 16px text.
 * Pass `options` for a flat list or `groups` for headed sections (e.g. Trade / Non-trade).
 */
export function SelectField({
  label,
  value,
  onChange,
  options,
  groups,
  placeholder,
  disabled,
  className,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options?: SelectOption[];
  groups?: SelectGroup[];
  /** Shown first with an empty value, e.g. "Pick a grade". */
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}) {
  const option = (o: SelectOption) => (
    <option key={o.value} value={o.value}>
      {o.label}
    </option>
  );
  return (
    <label className={cn("flex flex-col gap-1 text-sm font-medium", className)}>
      {label}
      <select
        className="h-12 w-full rounded-xl border bg-background px-3 text-base font-normal disabled:opacity-60"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      >
        {placeholder !== undefined && (
          <option value="" disabled>
            {placeholder}
          </option>
        )}
        {options?.map(option)}
        {groups
          ?.filter((g) => g.options.length > 0)
          .map((g) => (
            <optgroup key={g.label} label={g.label}>
              {g.options.map(option)}
            </optgroup>
          ))}
      </select>
    </label>
  );
}
