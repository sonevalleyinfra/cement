"use client";

import { useId } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatINR } from "@/lib/money";
import { orderTotalPaise } from "@/lib/order-rules";
import { checkRateDigits } from "@/lib/rate-rules";

/**
 * The one way to type a rate per bag (whole rupees): new order, filling a retailer's order, changing
 * a rate. A 48px number field; `bags` (when given) shows the total under it. `value` is the digits.
 */
export function RateField({
  value,
  onChange,
  bags,
  label = "Rate per bag (₹)",
  autoFocus,
}: {
  value: string;
  onChange: (digits: string) => void;
  bags?: number;
  label?: string;
  autoFocus?: boolean;
}) {
  const id = useId();
  const check = checkRateDigits(value);
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        inputMode="numeric"
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, ""))}
        maxLength={5}
        autoComplete="off"
        autoFocus={autoFocus}
        aria-invalid={value !== "" && !check.ok}
      />
      {value !== "" && !check.ok && <p className="text-sm text-destructive">{check.error}</p>}
      {check.ok && bags !== undefined && bags > 0 && (
        <p className="tabular text-sm text-muted-foreground">Total {formatINR(orderTotalPaise(bags, check.paise))}</p>
      )}
    </div>
  );
}
