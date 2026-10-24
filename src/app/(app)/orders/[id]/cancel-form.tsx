"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { FormHint } from "@/components/app/form-hint";
import { ReasonPicker } from "@/components/app/reason-picker";
import { Button } from "@/components/ui/button";
import { reasonHint } from "@/lib/reason-codes";
import { useFormError } from "@/lib/use-form-error";
import { cancelOrder } from "../actions";

/** Admin cancels the bags not dispatched yet (`notSent`); bags already sent stay billed. */
export function CancelForm({ orderId, notSent, sent }: { orderId: string; notSent: number; sent: number }) {
  const router = useRouter();
  const [asking, setAsking] = useState(false);
  const [code, setCode] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const { error, setError, clearError } = useFormError([code, note]);
  const [pending, start] = useTransition();
  const label = sent > 0 ? `Cancel ${notSent} bags not sent` : "Cancel order";
  const question = sent > 0 ? `Cancel ${notSent} bags not sent?` : "Cancel order?";
  const hint = reasonHint("cancel", code, note);

  if (!asking) {
    return (
      <Button variant="outline" onClick={() => setAsking(true)}>
        {label}
      </Button>
    );
  }
  return (
    <div className="flex flex-col gap-2 rounded-2xl bg-card p-4 shadow-card ring-1 ring-foreground/6">
      <p className="text-base font-semibold">{question}</p>
      <ReasonPicker
        action="cancel"
        label={question}
        code={code}
        onCodeChange={setCode}
        note={note}
        onNoteChange={setNote}
        disabled={pending}
        showHint={false}
      />
      {error && <p className="text-sm text-destructive">{error}</p>}
      <FormHint>{hint}</FormHint>
      <div className="grid grid-cols-2 gap-2">
        <Button
          variant="outline"
          onClick={() => {
            clearError();
            setAsking(false);
          }}
          disabled={pending}
        >
          Back
        </Button>
        <Button
          variant="destructive"
          disabled={pending || hint !== null}
          onClick={() =>
            start(async () => {
              const res = await cancelOrder(orderId, code ?? "", note);
              if (res.ok) {
                clearError();
                router.refresh();
              } else setError(res.error);
            })
          }
        >
          Confirm cancel
        </Button>
      </div>
    </div>
  );
}
