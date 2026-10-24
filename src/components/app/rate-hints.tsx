import { HintLine } from "@/components/app/hint-line";
import { checkRateInput } from "@/lib/rate-rules";
import { deviationText, lastRateText, rateDeviation, type RateHint, stockHint } from "@/lib/rate-hint-rules";

/**
 * Under the rate field: the shop's last rate and this week's range (muted), then a warning when the
 * typed rate is more than ₹10 away from the last rate. Staff only. Never blocks saving.
 */
export function RateHints({ hint, rateText }: { hint: RateHint | null; rateText: string }) {
  const typed = checkRateInput(rateText);
  const dev = typed.ok ? rateDeviation(typed.paise, hint?.last?.ratePaise ?? null) : null;
  return (
    <>
      <HintLine>{lastRateText(hint)}</HintLine>
      {dev && <HintLine tone="caution">{deviationText(dev)}</HintLine>}
    </>
  );
}

/** Bags in stock for the product; caution when `bags` is more than the stock, or none is left. `null` = loading. */
export function StockHintLine({ stockBags, bags }: { stockBags: number | null; bags: number }) {
  if (stockBags === null) return <HintLine />;
  const s = stockHint(stockBags, bags);
  return <HintLine tone={s.tone}>{s.text}</HintLine>;
}
