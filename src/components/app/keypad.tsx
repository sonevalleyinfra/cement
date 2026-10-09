"use client";

import { Delete } from "lucide-react";
import { cn } from "@/lib/utils";

const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "00", "0", "del"] as const;

/**
 * On-screen number pad for bags and rupee amounts.
 * `value` is a string of digits; the parent converts it (e.g. to paise).
 */
export function Keypad({
  value,
  onChange,
  maxLength = 9,
}: {
  value: string;
  onChange: (value: string) => void;
  maxLength?: number;
}) {
  function press(key: (typeof keys)[number]) {
    if (key === "del") return onChange(value.slice(0, -1));
    const next = (value + key).replace(/^0+(?=\d)/, "");
    if (next.length <= maxLength) onChange(next);
  }

  return (
    <div className="grid grid-cols-3 gap-2">
      {keys.map((key) => (
        <button
          key={key}
          type="button"
          onClick={() => press(key)}
          aria-label={key === "del" ? "Delete" : key}
          className={cn(
            "tabular flex h-14 items-center justify-center rounded-2xl bg-card text-xl font-semibold shadow-card ring-1 ring-foreground/6",
            "transition-[transform,background-color,color] duration-150 ease-out active:scale-[0.95] active:bg-primary/10 active:text-primary",
          )}
        >
          {key === "del" ? <Delete className="size-5" /> : key}
        </button>
      ))}
    </div>
  );
}
