"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { FormHint } from "@/components/app/form-hint";
import { Keypad } from "@/components/app/keypad";
import { Button } from "@/components/ui/button";
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
      <div className="tabular text-center text-3xl font-bold" aria-live="polite">
        ₹{Number(digits || 0).toLocaleString("en-IN")}
      </div>
      <Keypad value={digits} onChange={setDigits} maxLength={9} />
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
