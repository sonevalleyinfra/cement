"use client";

import { Delete } from "lucide-react";
import { pressKey } from "@/lib/form-rules";
import { cn } from "@/lib/utils";

const wholeKeys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "00", "0", "del"] as const;
const decimalKeys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "del"] as const;

/**
 * On-screen number pad for bags and rupee amounts.
 * `value` is the typed text; the parent converts it (e.g. to paise with `parseRupeesToPaise`).
 * `decimal`: a "." key instead of "00", with up to 2 digits after it (amounts in rupees and paise).
 */
export function Keypad({
  value,
  onChange,
  maxLength = 9,
  decimal = false,
}: {
  value: string;
  onChange: (value: string) => void;
  maxLength?: number;
  decimal?: boolean;
}) {
  const keys = decimal ? decimalKeys : wholeKeys;
  function press(key: string) {
    const next = pressKey(value, key, { maxLength, decimal });
    if (next !== value) onChange(next);
  }

  return (
    <div className="grid grid-cols-3 gap-2">
      {keys.map((key) => (
        <button
          key={key}
          type="button"
          onClick={() => press(key)}
          aria-label={key === "del" ? "Delete" : key === "." ? "Decimal point" : key}
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
