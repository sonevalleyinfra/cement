"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { FormHint } from "@/components/app/form-hint";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { firstMissing } from "@/lib/form-rules";
import { formatINR } from "@/lib/money";
import { orderTotalPaise } from "@/lib/order-rules";
import { useFormError } from "@/lib/use-form-error";
import { decideOrder } from "../orders/actions";

export function ApprovalCard({
  order,
  duesPaise,
  index,
}: {
  order: { id: string; retailer: string; product: string; bags: number; ratePaise: number };
  /** What the retailer owes right now (0 when nothing or an advance). */
  duesPaise: number;
  index: number;
}) {
  const router = useRouter();
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const { error, setError, clearError } = useFormError(reason);
  const [pending, start] = useTransition();
  const hint = firstMissing([[reason.trim() === "", "Enter a reason"]]);

  function decide(decision: "approved" | "rejected") {
    clearError();
    start(async () => {
      const res = await decideOrder(order.id, decision, reason, order.ratePaise);
      if (!res.ok) setError(res.error);
      // Also after an error: a changed rate shows on the card at once.
      router.refresh();
    });
  }

  return (
    <div
      className="animate-in-up flex flex-col gap-3 rounded-2xl bg-card p-4 shadow-card ring-1 ring-foreground/6"
      style={{ animationDelay: `${Math.min(index, 8) * 30}ms` }}
    >
      <Link href={`/orders/${order.id}`} className="-my-2 flex min-h-12 items-center text-base font-semibold">
        {order.retailer}
      </Link>
      <div className="flex items-end justify-between">
        <div className="text-xs text-muted-foreground">
          {order.product} · <span className="tabular">{order.bags}</span> bags at{" "}
          {formatINR(order.ratePaise)}
        </div>
        <div className="tabular text-lg font-semibold">
          {formatINR(orderTotalPaise(order.bags, order.ratePaise))}
        </div>
      </div>
      <div className="text-xs text-muted-foreground">Dues {formatINR(duesPaise)}</div>
      {rejecting ? (
        <div className="flex flex-col gap-2">
          <Input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Reason for rejecting"
            aria-label="Reason for rejecting"
          />
          {error && <p className="text-sm text-destructive">{error}</p>}
          <FormHint>{hint}</FormHint>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => {
                clearError();
                setRejecting(false);
              }}
              disabled={pending}
            >
              Back
            </Button>
            <Button variant="destructive" onClick={() => decide("rejected")} disabled={pending || hint !== null}>
              Confirm reject
            </Button>
          </div>
        </div>
      ) : (
        <>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => {
                clearError();
                setRejecting(true);
              }}
              disabled={pending}
            >
              Reject
            </Button>
            <Button onClick={() => decide("approved")} disabled={pending}>
              Approve
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
