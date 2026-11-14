"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { FormHint } from "@/components/app/form-hint";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { firstMissing } from "@/lib/form-rules";
import { useFormError } from "@/lib/use-form-error";
import { setOpeningBalance } from "../actions";

/** Admin sets the one opening balance for this retailer (shown in a sheet). `onDone` closes the sheet. */
export function OpeningForm({ retailerId, onDone }: { retailerId: string; onDone: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [digits, setDigits] = useState("");
  const [owes, setOwes] = useState(true);
  const { error, setError, clearError } = useFormError([digits, owes]);
  const hint = firstMissing([[Number(digits || 0) === 0, "Enter the amount"]]);

  function submit() {
    clearError();
    start(async () => {
      const res = await setOpeningBalance({ retailerId, rupeeDigits: digits, owes });
      if (res.ok) {
        clearError();
        setDigits("");
        onDone();
        router.refresh();
      } else setError(res.error);
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-2">
        <Button type="button" variant={owes ? "default" : "outline"} onClick={() => setOwes(true)}>
          Owes us
        </Button>
        <Button type="button" variant={owes ? "outline" : "default"} onClick={() => setOwes(false)}>
          Paid in advance
        </Button>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="opening-amount" className="text-sm font-semibold">Opening Amount (₹)</Label>
        <Input
          id="opening-amount"
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          placeholder="Enter opening amount"
          value={digits}
          onChange={(e) => setDigits(e.target.value.replace(/\D/g, "").slice(0, 9))}
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          className="h-12 text-lg font-semibold"
        />
      </div>
      {error && (
        <p role="status" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div>
        <FormHint>{hint}</FormHint>
        <Button className="w-full" onClick={submit} disabled={pending || hint !== null}>
          Set opening balance
        </Button>
      </div>
    </div>
  );
}
