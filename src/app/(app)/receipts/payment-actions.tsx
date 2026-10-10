"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

/** Reason + confirm, then rejects an online payment ("reject") or reverses a payment ("reverse"). */
export function ReasonAction({ receiptId, action }: { receiptId: string; action: "reject" | "reverse" }) {
  const router = useRouter();
  const [asking, setAsking] = useState(false);
  const [reason, setReason] = useState("");
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
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex gap-2">
        <Button variant="outline" onClick={() => setAsking(false)} disabled={pending}>
          Back
        </Button>
        <Button
          variant="destructive"
          disabled={pending || reason.trim() === ""}
          onClick={() =>
            start(async () => {
              const res = action === "reject" ? await rejectOnline(receiptId, reason) : await reverseReceipt(receiptId, reason);
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
