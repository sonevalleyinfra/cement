"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MAX_REVERSAL_REASON } from "@/lib/receipt-reversal";
import { reverseReceipt } from "../actions";

/** Reason + confirm, then reverses every firm line of the receipt. Also used for online "Not received". */
export function ReverseForm({ receiptId, label = "Reverse receipt" }: { receiptId: string; label?: string }) {
  const router = useRouter();
  const [asking, setAsking] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();

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
        maxLength={MAX_REVERSAL_REASON}
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
              const res = await reverseReceipt(receiptId, reason);
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
