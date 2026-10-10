"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { CashPlace } from "@/lib/receipt-reversal";
import { MAX_REASON } from "@/lib/receipt-rules";
import { rejectOnline, reverseReceipt, verifyOnline } from "./actions";

/** Accounts tap "Verified" after finding the payment on the bank statement. */
export function VerifyButton({ receiptId }: { receiptId: string }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-col gap-1">
      <Button
        disabled={pending}
        onClick={() =>
          start(async () => {
            const res = await verifyOnline(receiptId);
            if (res.ok) router.refresh();
            else setError(res.error);
          })
        }
      >
        {pending ? "Saving…" : "Verified"}
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
}: {
  receiptId: string;
  action: "reject" | "reverse";
  cashHolder?: string | null;
}) {
  const router = useRouter();
  const [asking, setAsking] = useState(false);
  const [reason, setReason] = useState("");
  const [cashPlace, setCashPlace] = useState<CashPlace | null>(null);
  const needsPlace = action === "reverse" && cashHolder !== null;
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const label = action === "reject" ? "Reject" : "Reverse";

  if (!asking) {
    return (
      <Button variant="outline" onClick={() => setAsking(true)}>
        {label}
      </Button>
    );
  }
  return (
    <div className="flex flex-col gap-2 rounded-2xl bg-card p-4 shadow-card ring-1 ring-foreground/6">
      <Input
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        maxLength={MAX_REASON}
        placeholder="Reason"
        aria-label="Reason"
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
      <div className="flex gap-2">
        <Button variant="outline" onClick={() => setAsking(false)} disabled={pending}>
          Back
        </Button>
        <Button
          variant="destructive"
          disabled={pending || reason.trim() === "" || (needsPlace && cashPlace === null)}
          onClick={() =>
            start(async () => {
              const res =
                action === "reject"
                  ? await rejectOnline(receiptId, reason)
                  : await reverseReceipt(receiptId, reason, cashPlace ?? undefined);
              if (res.ok) router.refresh();
              else setError(res.error);
            })
          }
        >
          {pending ? "Saving…" : `Confirm ${label.toLowerCase()}`}
        </Button>
      </div>
    </div>
  );
}
