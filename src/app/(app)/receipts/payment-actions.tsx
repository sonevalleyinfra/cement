"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";
import { FormHint } from "@/components/app/form-hint";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { firstMissing } from "@/lib/form-rules";
import type { CashPlace } from "@/lib/receipt-reversal";
import { MAX_REASON } from "@/lib/receipt-rules";
import { useFormError } from "@/lib/use-form-error";
import { rejectOnline, reverseReceipt, verifyOnline } from "./actions";

/** Accounts tap "Verify" after finding the payment on the bank statement. */
export function VerifyButton({ receiptId }: { receiptId: string }) {
  const router = useRouter();
  const { error, setError, clearError } = useFormError();
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-col gap-1">
      <Button
        className="w-full"
        disabled={pending}
        onClick={() => {
          clearError();
          start(async () => {
            const res = await verifyOnline(receiptId);
            if (res.ok) {
              clearError();
              router.refresh();
            } else setError(res.error);
          });
        }}
      >
        {pending ? "Saving…" : "Verify"}
      </Button>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}

const choice = (on: boolean) =>
  `min-h-12 rounded-xl px-3 py-2 text-left text-sm font-semibold ring-1 transition-[background-color,color,transform] duration-150 ease-out active:scale-[0.98] ${on ? "bg-primary text-primary-foreground ring-primary" : "bg-card ring-foreground/10"}`;

/**
 * Reason + confirm, then rejects an online payment ("reject") or reverses a payment ("reverse").
 * Reversing cash also asks where the cash is now (`cashHolder` = who recorded it; null for online).
 */
export function ReasonAction({
  receiptId,
  action,
  cashHolder = null,
  primary,
  inline = false,
}: {
  receiptId: string;
  action: "reject" | "reverse";
  cashHolder?: string | null;
  /** The primary button of a decision (Verify): shown beside the outline button, two equal halves. */
  primary?: ReactNode;
  /** Inside a list card: the reason form sits flat in the card instead of in its own panel. */
  inline?: boolean;
}) {
  const router = useRouter();
  const [asking, setAsking] = useState(false);
  const [reason, setReason] = useState("");
  const [cashPlace, setCashPlace] = useState<CashPlace | null>(null);
  const needsPlace = action === "reverse" && cashHolder !== null;
  const { error, setError, clearError } = useFormError([reason, cashPlace]);
  const [pending, start] = useTransition();
  const label = action === "reject" ? "Reject" : "Reverse";
  const reasonLabel = action === "reject" ? "Reason for rejecting" : "Reason for reversing";
  const hint = firstMissing([
    [reason.trim() === "", "Enter a reason"],
    [needsPlace && cashPlace === null, "Pick where the cash is"],
  ]);

  if (!asking) {
    if (primary)
      return (
        <div className="grid grid-cols-2 items-start gap-2">
          <Button className="w-full" variant="outline" onClick={() => setAsking(true)}>
            {label}
          </Button>
          {primary}
        </div>
      );
    return (
      <Button variant="outline" onClick={() => setAsking(true)}>
        {label}
      </Button>
    );
  }
  return (
    <div
      className={
        inline ? "flex flex-col gap-2" : "flex flex-col gap-2 rounded-2xl bg-card p-4 shadow-card ring-1 ring-foreground/6"
      }
    >
      <Input
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        maxLength={MAX_REASON}
        placeholder={reasonLabel}
        aria-label={reasonLabel}
      />
      {needsPlace && (
        <div className="grid gap-2" role="radiogroup" aria-label="Where is the cash now">
          <button
            type="button"
            role="radio"
            aria-checked={cashPlace === "holder"}
            className={choice(cashPlace === "holder")}
            onClick={() => setCashPlace("holder")}
          >
            Cash is still with {cashHolder}
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={cashPlace === "office"}
            className={choice(cashPlace === "office")}
            onClick={() => setCashPlace("office")}
          >
            Cash already handed to office
          </button>
        </div>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
      <FormHint>{hint}</FormHint>
      <div className="grid grid-cols-2 gap-2">
        <Button
          variant="outline"
          onClick={() => {
            clearError();
            setAsking(false);
          }}
          disabled={pending}
        >
          Back
        </Button>
        <Button
          variant="destructive"
          disabled={pending || hint !== null}
          onClick={() => {
            clearError();
            start(async () => {
              const res =
                action === "reject"
                  ? await rejectOnline(receiptId, reason)
                  : await reverseReceipt(receiptId, reason, cashPlace ?? undefined);
              if (res.ok) {
                clearError();
                router.refresh();
              } else setError(res.error);
            });
          }}
        >
          {pending ? "Saving…" : `Confirm ${label.toLowerCase()}`}
        </Button>
      </div>
    </div>
  );
}
