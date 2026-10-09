"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Keypad } from "@/components/app/keypad";
import { Button } from "@/components/ui/button";
import { setOpeningBalance } from "../actions";

/** Admin sets the one opening balance for this retailer with this firm. */
export function OpeningForm({
  retailerId,
  firmId,
  firmName,
}: {
  retailerId: string;
  firmId: string;
  firmName: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [digits, setDigits] = useState("");
  const [owes, setOwes] = useState(true);
  const [error, setError] = useState("");

  function submit() {
    setError("");
    start(async () => {
      const res = await setOpeningBalance({ retailerId, firmId, rupeeDigits: digits, owes });
      if (res.ok) {
        setDigits("");
        router.refresh();
      } else setError(res.error);
    });
  }

  return (
    <div className="flex flex-col gap-3 rounded-2xl bg-card p-4 shadow-card ring-1 ring-foreground/6">
      <div className="text-sm font-semibold">Opening balance with {firmName}</div>
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
      <Button onClick={submit} disabled={pending || Number(digits || 0) === 0}>
        Set opening balance
      </Button>
    </div>
  );
}
