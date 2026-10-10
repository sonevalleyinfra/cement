"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { FormHint } from "@/components/app/form-hint";
import { RateField } from "@/components/app/rate-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { firstMissing } from "@/lib/form-rules";
import { checkRateDigits } from "@/lib/rate-rules";
import { useFormError } from "@/lib/use-form-error";
import { bagsText } from "@/lib/words";
import { changeRate, fillRate } from "../actions";

/**
 * Rate per bag in whole rupees (typed with the shared `RateField`).
 * `mode="fill"`: the sales person (or admin) fills / changes it while the order is placed.
 * `mode="change"`: logistics or admin change it after approval, with a reason; it applies to the
 * `bags` not dispatched yet.
 */
export function RateForm({
  orderId,
  bags,
  mode,
  hasRate,
}: {
  orderId: string;
  bags: number;
  mode: "fill" | "change";
  hasRate: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(mode === "fill" && !hasRate);
  const [digits, setDigits] = useState("");
  const [reason, setReason] = useState("");
  const { error, setError, clearError } = useFormError([digits, reason]);
  const [pending, start] = useTransition();
  const check = checkRateDigits(digits);
  const hint = firstMissing([
    [!check.ok, "Enter the rate"],
    [mode === "change" && !reason.trim(), "Enter a reason"],
  ]);

  function submit() {
    clearError();
    start(async () => {
      const res = mode === "fill" ? await fillRate(orderId, digits) : await changeRate(orderId, digits, reason);
      if (res.ok) {
        setOpen(false);
        setDigits("");
        setReason("");
        clearError();
        router.refresh();
      } else setError(res.error);
    });
  }

  if (!open) {
    return (
      <Button variant="outline" onClick={() => setOpen(true)}>
        Change rate
      </Button>
    );
  }
  return (
    <div className="flex flex-col gap-3 rounded-2xl bg-card p-4 shadow-card ring-1 ring-foreground/6">
      <RateField
        value={digits}
        onChange={setDigits}
        bags={bags}
        label={mode === "change" ? `New rate per bag (₹) · ${bagsText(bags)} not sent` : "Rate per bag (₹)"}
      />
      {mode === "change" && (
        <Input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Reason"
          aria-label="Reason for the new rate"
          maxLength={300}
        />
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
      <FormHint>{hint}</FormHint>
      <div className="flex gap-2">
        {(hasRate || mode === "change") && (
          <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
            Back
          </Button>
        )}
        <Button className="flex-1" onClick={submit} disabled={pending || hint !== null}>
          Save rate
        </Button>
      </div>
    </div>
  );
}
