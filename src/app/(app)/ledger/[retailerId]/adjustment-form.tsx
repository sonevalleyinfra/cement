"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { parseRupeesToPaise } from "@/lib/money";
import { MAX_REASON } from "@/lib/receipt-rules";
import { useSubmit } from "@/lib/use-submit";
import { addAdjustment } from "../actions";

/** Admin adds a + or - adjustment to this retailer's ledger, with a reason. */
export function AdjustmentForm({ retailerId }: { retailerId: string }) {
  const router = useRouter();
  const { pending, run } = useSubmit();
  const [open, setOpen] = useState(false);
  const [owesMore, setOwesMore] = useState(true);
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");

  if (!open) {
    return (
      <Button variant="outline" onClick={() => setOpen(true)}>
        Adjustment
      </Button>
    );
  }

  function submit() {
    setError("");
    const paise = parseRupeesToPaise(amount);
    if (paise === null || paise <= 0) return setError("Enter the amount.");
    run(
      (requestId) => addAdjustment({ retailerId, amountPaise: owesMore ? paise : -paise, reason, requestId }),
      (res) => {
        if (res.ok) {
          setAmount("");
          setReason("");
          setOpen(false);
          router.refresh();
        } else setError(res.error);
      },
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-2xl bg-card p-4 shadow-card ring-1 ring-foreground/6">
      <div className="text-sm font-semibold">Adjustment</div>
      <div className="grid grid-cols-2 gap-2">
        <Button type="button" variant={owesMore ? "default" : "outline"} onClick={() => setOwesMore(true)}>
          Owes more
        </Button>
        <Button type="button" variant={owesMore ? "outline" : "default"} onClick={() => setOwesMore(false)}>
          Owes less
        </Button>
      </div>
      <Input inputMode="decimal" placeholder="Amount (₹)" aria-label="Amount" value={amount} onChange={(e) => setAmount(e.target.value)} />
      <Input placeholder="Reason" aria-label="Reason" maxLength={MAX_REASON} value={reason} onChange={(e) => setReason(e.target.value)} />
      {error && (
        <p role="status" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
          Back
        </Button>
        <Button onClick={submit} disabled={pending || !amount.trim() || !reason.trim()}>
          {pending ? "Saving…" : "Save adjustment"}
        </Button>
      </div>
    </div>
  );
}
