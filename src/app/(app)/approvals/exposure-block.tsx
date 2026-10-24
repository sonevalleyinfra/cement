import { CircleAlert } from "lucide-react";
import { KeyValue } from "@/components/app/key-value";
import { Meter } from "@/components/app/meter";
import {
  exposureLine,
  lastPaymentText,
  meterPercent,
  termsText,
  type CreditAssessment,
} from "@/lib/credit-check-rules";
import { formatINR } from "@/lib/money";
import { cn } from "@/lib/utils";
import { daysText } from "@/lib/words";

const money = (p: number) => formatINR(p, { hidePaise: true });
const RED = "bg-risk-soft ring-1 ring-risk/30";

/** The red pill next to a red card's shop name ("Over limit", "Overdue", "On hold", "Blocked"). */
export function CreditPill({ children }: { children: string }) {
  return (
    <span className="inline-flex h-6 shrink-0 items-center rounded-full bg-risk-soft px-2.5 text-xs font-semibold text-risk-foreground">
      {children}
    </span>
  );
}

/**
 * The credit exposure inside an approval card (design spec section 2): normal (muted), red (over the
 * limit, overdue, on hold / blocked) or amber "No limit set". `credit` null = it could not be read.
 */
export function ExposureBlock({ credit, onRetry }: { credit: CreditAssessment | null; onRetry: () => void }) {
  if (!credit) {
    return (
      <div className={cn("flex items-center justify-between gap-2 rounded-xl px-3", RED)}>
        <p className="flex items-center gap-2 text-sm font-semibold text-risk-foreground">
          <CircleAlert className="size-4 shrink-0 text-risk" aria-hidden />
          Couldn&apos;t check dues
        </p>
        <button
          type="button"
          onClick={onRetry}
          className="-mr-1 inline-flex min-h-12 min-w-12 items-center justify-center px-2 text-sm underline underline-offset-2"
        >
          Retry
        </button>
      </div>
    );
  }

  const red = credit.needsOverride;
  const over = credit.flags.includes("over_limit");
  const pct = meterPercent(credit.afterPaise, credit.limitPaise);
  const [first, ...rest] = credit.headlines;
  return (
    <div className={cn("flex flex-col gap-2 rounded-xl p-3", red ? RED : "bg-muted")}>
      {red && first && (
        <div className="flex flex-col">
          <p className="flex items-center gap-2 text-sm font-semibold text-risk-foreground">
            <CircleAlert className="size-4 shrink-0 text-risk" aria-hidden />
            {first}
          </p>
          {rest.map((line) => (
            <p key={line} className="pl-6 text-xs text-risk-foreground">
              {line}
            </p>
          ))}
        </div>
      )}
      {!red && credit.noLimit && (
        <div className="flex flex-col">
          <p className="flex items-center gap-2 text-sm font-semibold text-caution-foreground">
            <CircleAlert className="size-4 shrink-0 text-caution" aria-hidden />
            No limit set
          </p>
          <p className="pl-6 text-xs text-muted-foreground">{termsText(credit.creditDays)}</p>
        </div>
      )}
      <KeyValue
        label="After this order"
        value={
          <>
            <span className={cn("font-bold", over && "text-risk-foreground")}>{money(credit.afterPaise)}</span>
            {credit.limitPaise !== null && <span className="text-muted-foreground"> / {money(credit.limitPaise)}</span>}
          </>
        }
      />
      {pct !== null && <Meter percent={pct} tone={red ? "risk" : "primary"} label="Credit used" />}
      <p className="tabular text-xs text-muted-foreground">{exposureLine(credit)}</p>
      <KeyValue
        label="Oldest overdue"
        value={
          credit.oldestOverdueDays > 0 ? (
            <span className="text-risk-foreground">{daysText(credit.oldestOverdueDays)}</span>
          ) : (
            "None"
          )
        }
      />
      <KeyValue label="Last payment" value={lastPaymentText(credit.lastPayment)} />
    </div>
  );
}
