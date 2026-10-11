"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { FormHint } from "@/components/app/form-hint";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { firstMissing } from "@/lib/form-rules";
import { parseRupeesToPaise } from "@/lib/money";
import { MAX_REASON } from "@/lib/receipt-rules";
import { useFormError } from "@/lib/use-form-error";
import { useSubmit } from "@/lib/use-submit";
import { addAdjustment } from "../actions";

/** Admin adds a + or - adjustment to this retailer's ledger, with a reason (shown in a sheet). `onDone` closes it. */
export function AdjustmentForm({ retailerId, onDone }: { retailerId: string; onDone: () => void }) {
  const router = useRouter();
  const { pending, run } = useSubmit();
  const [owesMore, setOwesMore] = useState(true);
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const { error, setError, clearError } = useFormError([owesMore, amount, reason]);
  const paise = parseRupeesToPaise(amount);
  const hint = firstMissing([
    [paise === null || paise <= 0, "Enter the amount"],
    [!reason.trim(), "Enter a reason"],
  ]);

  function submit() {
    if (paise === null || paise <= 0) return;
    clearError();
    run(
      (requestId) => addAdjustment({ retailerId, amountPaise: owesMore ? paise : -paise, reason, requestId }),
      (res) => {
        if (res.ok) {
          clearError();
          setAmount("");
          setReason("");
          onDone();
          router.refresh();
        } else setError(res.error);
      },
    );
  }

  return (
    <div className="flex flex-col gap-3">
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
      <div>
        <FormHint>{hint}</FormHint>
        <Button className="w-full" onClick={submit} disabled={pending || hint !== null}>
          {pending ? "Saving…" : "Save adjustment"}
        </Button>
      </div>
    </div>
  );
}
