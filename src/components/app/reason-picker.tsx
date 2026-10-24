"use client";

import { useRef, type KeyboardEvent } from "react";
import { chipClass } from "@/components/app/chip";
import { FormHint } from "@/components/app/form-hint";
import { Input } from "@/components/ui/input";
import { MAX_REASON_NOTE, reasonHint, REASON_LISTS, type ReasonAction } from "@/lib/reason-codes";
import { cn } from "@/lib/utils";

/**
 * One pattern for every "why" (design spec section 6): the reasons of `action` as chips (2 per row,
 * the picked one orange), a note field that is always there (required for "Other"), and a FormHint
 * with what is missing. Keep the confirm button off until `reasonHint(action, code, note)` is null.
 * Arrow keys move between the chips (a radio group).
 */
export function ReasonPicker({
  action,
  label,
  code,
  onCodeChange,
  note,
  onNoteChange,
  disabled = false,
  showHint = true,
}: {
  action: ReasonAction;
  /** The question, read out for the chips ("Reject order?"). */
  label: string;
  code: string | null;
  onCodeChange: (code: string) => void;
  note: string;
  onNoteChange: (note: string) => void;
  disabled?: boolean;
  /** Off when the form shows its own FormHint just above its button. */
  showHint?: boolean;
}) {
  const options = REASON_LISTS[action];
  const chips = useRef<(HTMLButtonElement | null)[]>([]);
  const picked = options.findIndex((o) => o.code === code);

  function onKeyDown(e: KeyboardEvent<HTMLButtonElement>, i: number) {
    const step = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (step === 0) return;
    e.preventDefault();
    const next = (i + step + options.length) % options.length;
    onCodeChange(options[next].code);
    chips.current[next]?.focus();
  }

  return (
    <div className="flex flex-col gap-2">
      <div role="radiogroup" aria-label={label} className="grid grid-cols-2 gap-2">
        {options.map((o, i) => {
          const on = o.code === code;
          return (
            <button
              key={o.code}
              ref={(el) => {
                chips.current[i] = el;
              }}
              type="button"
              role="radio"
              aria-checked={on}
              tabIndex={on || (picked === -1 && i === 0) ? 0 : -1}
              disabled={disabled}
              onClick={() => onCodeChange(o.code)}
              onKeyDown={(e) => onKeyDown(e, i)}
              className={cn(
                chipClass(on, "w-full"),
                "focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none disabled:opacity-50",
              )}
            >
              {o.label}
            </button>
          );
        })}
      </div>
      <Input
        value={note}
        onChange={(e) => onNoteChange(e.target.value)}
        placeholder={code === "other" ? "Note" : "Note (optional)"}
        aria-label={code === "other" ? "Note" : "Note (optional)"}
        maxLength={MAX_REASON_NOTE}
        disabled={disabled}
      />
      {showHint && <FormHint>{reasonHint(action, code, note)}</FormHint>}
    </div>
  );
}
