"use client";

import { useId } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatINR } from "@/lib/money";
import { orderTotalPaise } from "@/lib/order-rules";
import { checkRateInput, cleanRateInput, rateChangePreview } from "@/lib/rate-rules";

/**
 * The one way to type a rate per bag (rupees and paise, "335.50"): new order, filling a retailer's
 * order, changing a rate. A 48px decimal field; `value` is the cleaned text (cleanRateInput).
 * `bags` (when given) shows the total under it. With `billedPaise` > 0 (a rate change on a partly
 * sent order) it shows the not-sent bags' amount and the whole order total instead.
 */
export function RateField({
  value,
  onChange,
  bags,
  billedPaise,
  label = "Rate per bag (₹)",
  autoFocus,
}: {
  value: string;
  onChange: (text: string) => void;
  bags?: number;
  billedPaise?: number;
  label?: string;
  autoFocus?: boolean;
}) {
  const id = useId();
  const check = checkRateInput(value);
  const showTotal = check.ok && bags !== undefined && bags > 0;
  const split =
    check.ok && bags !== undefined && billedPaise !== undefined && billedPaise > 0
      ? rateChangePreview({ unsentBags: bags, billedPaise, newRatePaise: check.paise })
      : null;
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(cleanRateInput(e.target.value))}
        autoComplete="off"
        autoFocus={autoFocus}
        aria-invalid={value !== "" && !check.ok}
      />
      {value !== "" && !check.ok && <p className="text-sm text-destructive">{check.error}</p>}
      {showTotal && split && (
        <div className="tabular text-sm text-muted-foreground">
          <p>Unsent bags {formatINR(split.unsentPaise)}</p>
          <p>Order total {formatINR(split.orderTotalPaise)}</p>
        </div>
      )}
      {showTotal && !split && (
        <p className="tabular text-sm text-muted-foreground">Total {formatINR(orderTotalPaise(bags, check.paise))}</p>
      )}
    </div>
  );
}
