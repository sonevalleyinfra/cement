"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Keypad } from "@/components/app/keypad";
import { Button } from "@/components/ui/button";
import { formatINR } from "@/lib/money";
import { orderTotalPaise } from "@/lib/order-rules";
import { ratePaiseFromRupeeDigits } from "@/lib/rate-rules";
import { fillRate } from "../actions";

export function RateForm({ orderId, bags }: { orderId: string; bags: number }) {
  const router = useRouter();
  const [digits, setDigits] = useState("");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const paise = ratePaiseFromRupeeDigits(digits);

  function submit() {
    start(async () => {
      const res = await fillRate(orderId, digits);
      if (res.ok) router.refresh();
      else setError(res.error);
    });
  }

  return (
    <div className="flex flex-col gap-3 rounded-2xl bg-card p-4 ring-1 ring-foreground/8">
      <div className="text-sm font-semibold">Rate per bag (₹)</div>
      <div className="tabular text-3xl font-bold">{digits ? `₹${digits}` : "₹0"}</div>
      {paise !== null && (
        <div className="text-sm text-muted-foreground">
          Total {formatINR(orderTotalPaise(bags, paise))}
        </div>
      )}
      <Keypad value={digits} onChange={setDigits} maxLength={5} />
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button onClick={submit} disabled={pending || paise === null}>
        Send for approval
      </Button>
    </div>
  );
}
