"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Keypad } from "@/components/app/keypad";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatINR } from "@/lib/money";
import { orderTotalPaise } from "@/lib/order-rules";
import { checkRateDigits } from "@/lib/rate-rules";
import { changeRate, fillRate } from "../actions";

/**
 * Rate per bag in whole rupees.
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
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const check = checkRateDigits(digits);
  const paise = check.ok ? check.paise : null;

  function submit() {
    setError("");
    start(async () => {
      const res = mode === "fill" ? await fillRate(orderId, digits) : await changeRate(orderId, digits, reason);
      if (res.ok) {
        setOpen(false);
        setDigits("");
        setReason("");
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
      <div className="text-sm font-semibold">
        {mode === "change" ? `New rate per bag (₹) · ${bags} bags not sent` : "Rate per bag (₹)"}
      </div>
      <div className="tabular text-3xl font-bold">{digits ? `₹${digits}` : "₹0"}</div>
      {paise !== null && (
        <div className="text-sm text-muted-foreground">Total {formatINR(orderTotalPaise(bags, paise))}</div>
      )}
      <Keypad value={digits} onChange={setDigits} maxLength={5} />
      {mode === "change" && (
        <Input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Reason"
          aria-label="Reason for the new rate"
          maxLength={300}
        />
      )}
      {digits && !check.ok && <p className="text-sm text-destructive">{check.error}</p>}
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex gap-2">
        {(hasRate || mode === "change") && (
          <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
            Back
          </Button>
        )}
        <Button
          className="flex-1"
          onClick={submit}
          disabled={pending || paise === null || (mode === "change" && !reason.trim())}
        >
          Save rate
        </Button>
      </div>
    </div>
  );
}
