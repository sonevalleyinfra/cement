"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Dues } from "@/lib/dues";
import { formatINR } from "@/lib/money";
import { orderTotalPaise } from "@/lib/order-rules";
import { decideOrder } from "../orders/actions";

export function ApprovalCard({
  order,
  dues,
  chip,
  index,
}: {
  order: { id: string; retailer: string; product: string; bags: number; ratePaise: number };
  dues: Dues;
  chip: ReactNode;
  index: number;
}) {
  const router = useRouter();
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();

  function decide(decision: "approved" | "rejected") {
    start(async () => {
      const res = await decideOrder(order.id, decision, reason);
      if (res.ok) router.refresh();
      else setError(res.error);
    });
  }

  return (
    <div
      className="animate-in-up flex flex-col gap-3 rounded-2xl bg-card p-4 shadow-card ring-1 ring-foreground/6"
      style={{ animationDelay: `${Math.min(index, 8) * 30}ms` }}
    >
      <div className="flex items-center justify-between">{chip}</div>
      <Link href={`/orders/${order.id}`} className="text-base font-semibold">
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
      <div className="text-xs text-muted-foreground">
        {dues.known
          ? `Dues with this firm ${formatINR(dues.withFirmPaise)} · all firms ${formatINR(dues.allFirmsPaise)}`
          : "Dues: not available yet"}
      </div>
      {rejecting ? (
        <div className="flex flex-col gap-2">
          <Input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Reason for rejecting"
            aria-label="Reason for rejecting"
          />
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setRejecting(false)} disabled={pending}>
              Back
            </Button>
            <Button variant="destructive" onClick={() => decide("rejected")} disabled={pending}>
              Confirm reject
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setRejecting(true)} disabled={pending}>
            Reject
          </Button>
          <Button onClick={() => decide("approved")} disabled={pending}>
            Approve
          </Button>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
      )}
    </div>
  );
}
