"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cancelOrder } from "../actions";

export function CancelForm({ orderId }: { orderId: string }) {
  const router = useRouter();
  const [asking, setAsking] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();

  if (!asking) {
    return (
      <Button variant="outline" onClick={() => setAsking(true)}>
        Cancel order
      </Button>
    );
  }
  return (
    <div className="flex flex-col gap-2 rounded-2xl bg-card p-4 ring-1 ring-foreground/8">
      <Input
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Reason for cancelling"
        aria-label="Reason for cancelling"
      />
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex gap-2">
        <Button variant="outline" onClick={() => setAsking(false)} disabled={pending}>
          Back
        </Button>
        <Button
          variant="destructive"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const res = await cancelOrder(orderId, reason);
              if (res.ok) router.refresh();
              else setError(res.error);
            })
          }
        >
          Confirm cancel
        </Button>
      </div>
    </div>
  );
}
