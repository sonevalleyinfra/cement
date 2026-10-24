"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { FormHint } from "@/components/app/form-hint";
import { HintLine } from "@/components/app/hint-line";
import { ReasonPicker } from "@/components/app/reason-picker";
import { Button } from "@/components/ui/button";
import { creditPill, type CreditAssessment } from "@/lib/credit-check-rules";
import { formatINR } from "@/lib/money";
import { stagger } from "@/lib/motion";
import { orderTotalPaise } from "@/lib/order-rules";
import { deviationText, lastRateText, rateDeviation, type RateHint } from "@/lib/rate-hint-rules";
import { reasonHint } from "@/lib/reason-codes";
import { useFormError } from "@/lib/use-form-error";
import { decideOrder } from "../orders/actions";
import { CreditPill, ExposureBlock } from "./exposure-block";

export function ApprovalCard({
  order,
  credit,
  index,
  hint = null,
}: {
  order: { id: string; retailer: string; product: string; bags: number; ratePaise: number; staffNote: string };
  /** The credit check as the page saw it (null = it could not be read: approving needs a reason). The server checks again. */
  credit: CreditAssessment | null;
  index: number;
  /** The shop's last rate and this week's range for the product (warns only, never blocks). */
  hint?: RateHint | null;
}) {
  const router = useRouter();
  const [rejecting, setRejecting] = useState(false);
  const [code, setCode] = useState<string | null>(null);
  const [note, setNote] = useState("");
  // The override step (a red card, or the dues could not be checked).
  const [overriding, setOverriding] = useState(false);
  const [overCode, setOverCode] = useState<string | null>(null);
  const [overNote, setOverNote] = useState("");
  const { error, setError, clearError } = useFormError([code, note, overCode, overNote]);
  const [pending, start] = useTransition();
  const dev = rateDeviation(order.ratePaise, hint?.last?.ratePaise ?? null);
  const missing = reasonHint("reject", code, note);
  const missingOverride = reasonHint("override", overCode, overNote);
  const red = credit === null || credit.needsOverride;
  const pill = credit ? creditPill(credit.flags) : null;

  function decide(decision: "approved" | "rejected") {
    clearError();
    start(async () => {
      const override = decision === "approved" && overriding ? { code: overCode ?? "", note: overNote } : null;
      const res = await decideOrder(order.id, decision, code, note, order.ratePaise, override);
      if (!res.ok) {
        setError(res.error);
        // The server found the check red (e.g. another approval just went through): ask for a reason.
        if ("needsOverride" in res && res.needsOverride) setOverriding(true);
      }
      // Also after an error: a changed rate or new dues show on the card at once.
      router.refresh();
    });
  }

  return (
    <div
      className="animate-in-up flex flex-col gap-3 rounded-2xl bg-card p-4 shadow-card ring-1 ring-foreground/6"
      style={stagger(index)}
    >
      <div className="-my-2 flex min-h-12 items-center justify-between gap-2">
        <Link href={`/orders/${order.id}`} className="flex min-h-12 min-w-0 items-center text-base font-semibold">
          {order.retailer}
        </Link>
        {pill && <CreditPill>{pill}</CreditPill>}
      </div>
      <div className="flex items-end justify-between">
        <div className="text-xs text-muted-foreground">
          {order.product} · <span className="tabular">{order.bags}</span> bags at{" "}
          {formatINR(order.ratePaise, { hidePaise: true })}
        </div>
        <div className="tabular text-lg font-semibold">
          {formatINR(orderTotalPaise(order.bags, order.ratePaise), { hidePaise: true })}
        </div>
      </div>
      <div className="-mt-2 flex flex-col">
        <HintLine>{lastRateText(hint)}</HintLine>
        {dev && <HintLine tone="caution">{deviationText(dev)}</HintLine>}
      </div>
      <ExposureBlock credit={credit} onRetry={() => router.refresh()} />
      {order.staffNote && (
        <p className="text-sm">
          <span className="text-muted-foreground">Staff note · </span>
          {order.staffNote}
        </p>
      )}
      {rejecting ? (
        <div className="flex flex-col gap-2">
          <p className="text-base font-semibold">Reject order?</p>
          <ReasonPicker
            action="reject"
            label="Reject order?"
            code={code}
            onCodeChange={setCode}
            note={note}
            onNoteChange={setNote}
            disabled={pending}
            showHint={false}
          />
          {error && <p className="text-sm text-destructive">{error}</p>}
          <FormHint>{missing}</FormHint>
          <div className="grid grid-cols-2 gap-2">
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
            <Button variant="destructive" onClick={() => decide("rejected")} disabled={pending || missing !== null}>
              Reject
            </Button>
          </div>
        </div>
      ) : overriding ? (
        <div className="animate-in-up flex flex-col gap-2">
          <p className="text-base font-semibold">Approve anyway?</p>
          <ReasonPicker
            action="override"
            label="Approve anyway?"
            code={overCode}
            onCodeChange={setOverCode}
            note={overNote}
            onNoteChange={setOverNote}
            disabled={pending}
            showHint={false}
          />
          {error && <p className="text-sm text-destructive">{error}</p>}
          <FormHint>{missingOverride}</FormHint>
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="outline"
              onClick={() => {
                clearError();
                setOverriding(false);
              }}
              disabled={pending}
            >
              Back
            </Button>
            <Button onClick={() => decide("approved")} disabled={pending || missingOverride !== null}>
              Approve
            </Button>
          </div>
        </div>
      ) : (
        <>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="grid grid-cols-2 gap-2">
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
            <Button
              onClick={() => {
                if (!red) return decide("approved");
                clearError();
                setOverriding(true);
              }}
              disabled={pending}
            >
              {red ? "Approve anyway" : "Approve"}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
