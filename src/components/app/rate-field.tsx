"use client";

import { useId } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatINR, parseRupeesToPaise } from "@/lib/money";
import { orderTotalPaise } from "@/lib/order-rules";
import { checkRateInput, cleanRateInput, type RateInputCheck, rateChangePreview } from "@/lib/rate-rules";
import { purchaseAmountPaise } from "@/lib/supplier-rules";

/** A supplier's cost per bag: rupees and up to 2 paise digits, no rate cap (the server caps it). */
function checkCost(text: string): RateInputCheck {
  const paise = parseRupeesToPaise(text);
  return paise !== null && paise >= 1 ? { ok: true, paise } : { ok: false, error: "Enter the cost per bag." };
}

/**
 * The one way to type a rate per bag (rupees and paise, "335.50"): new order, filling a retailer's
 * order, changing a rate, and (`allowPaise`) a supplier's cost per bag on a purchase. A 48px decimal
 * field; `value` is the cleaned text (cleanRateInput). `bags` (when given) shows the total under it,
 * after `totalLabel`. With `billedPaise` > 0 (a rate change on a partly sent order) it shows the
 * not-sent bags' amount and the whole order total instead.
 */
export function RateField({
  value,
  onChange,
  bags,
  billedPaise,
  label = "Rate per bag (₹)",
  totalLabel = "Total",
  allowPaise = false,
  autoFocus,
}: {
  value: string;
  onChange: (text: string) => void;
  bags?: number;
  billedPaise?: number;
  label?: string;
  /** Word before the total under the field. */
  totalLabel?: string;
  /** Supplier cost per bag: no rate cap, the total is the purchase amount. */
  allowPaise?: boolean;
  autoFocus?: boolean;
}) {
  const id = useId();
  const check = allowPaise ? checkCost(value) : checkRateInput(value);
  const hasBags = bags !== undefined && bags > 0;
  const split =
    !allowPaise && check.ok && hasBags && billedPaise !== undefined && billedPaise > 0
      ? rateChangePreview({ unsentBags: bags, billedPaise, newRatePaise: check.paise })
      : null;
  const total =
    check.ok && hasBags ? (allowPaise ? purchaseAmountPaise(bags, check.paise) : orderTotalPaise(bags, check.paise)) : null;
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
      {split && (
        <div className="tabular text-sm text-muted-foreground">
          <p>Unsent bags {formatINR(split.unsentPaise)}</p>
          <p>Order total {formatINR(split.orderTotalPaise)}</p>
        </div>
      )}
      {!split && total !== null && (
        <p className="tabular text-sm text-muted-foreground">
          {totalLabel} {formatINR(total)}
        </p>
      )}
    </div>
  );
}
