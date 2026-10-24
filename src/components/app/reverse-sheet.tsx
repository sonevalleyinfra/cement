"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { reverseDispatch } from "@/app/(app)/dispatch/reverse-actions";
import { reversePurchase } from "@/app/(app)/stock/purchases/reverse-actions";
import { ConfirmStep } from "@/components/app/confirm-step";
import { FormHint } from "@/components/app/form-hint";
import { ReasonPicker } from "@/components/app/reason-picker";
import { SelectField, type SelectOption } from "@/components/app/select-field";
import { Sheet } from "@/components/app/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { reasonHint } from "@/lib/reason-codes";
import { useFormError } from "@/lib/use-form-error";
import { useSubmit } from "@/lib/use-submit";
import { bagsText } from "@/lib/words";

export type ReverseTarget =
  /** A load of an order: the bags go back into a place picked here (active godowns and trucks). */
  | { kind: "dispatch"; id: string; places: SelectOption[]; defaultPlace: string }
  /** A purchase (its stock movement): the bags leave the place they were bought into. */
  | { kind: "purchase"; id: string; placeName: string };

/**
 * Admin only (v2 B2): a "Reverse" link that opens a sheet. Bags start at what is left (fewer = a part
 * return), then the place, a reason (reversal list) and an optional note; Back / Reverse.
 * The server checks everything again (lib/reversals.ts).
 */
export function ReverseSheet({ target, left }: { target: ReverseTarget; left: number }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="link" size="sm" className="-my-2 -mr-2.5 font-semibold" onClick={() => setOpen(true)}>
        Reverse
      </Button>
      <Sheet open={open} onOpenChange={setOpen} title={target.kind === "dispatch" ? "Reverse load" : "Reverse purchase"}>
        {open && <ReverseForm target={target} left={left} onDone={() => setOpen(false)} />}
      </Sheet>
    </>
  );
}

function ReverseForm({ target, left, onDone }: { target: ReverseTarget; left: number; onDone: () => void }) {
  const router = useRouter();
  const { pending, run } = useSubmit();
  const [bagsText_, setBagsText] = useState(String(left));
  const [place, setPlace] = useState(target.kind === "dispatch" ? target.defaultPlace : "");
  const [code, setCode] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const { error, setError, clearError } = useFormError([bagsText_, place, code, note]);
  const bags = Number(bagsText_);
  const bagsOk = /^\d+$/.test(bagsText_) && bags > 0 && bags <= left;
  const hint = !bagsOk
    ? `Bags: 1 to ${left}`
    : target.kind === "dispatch" && !place
      ? "Pick where the bags go"
      : reasonHint("reversal", code, note);

  function save() {
    run(
      (requestId) =>
        target.kind === "dispatch"
          ? reverseDispatch({ dispatchId: target.id, bags, toPlace: place, reasonCode: code ?? "", note, requestId })
          : reversePurchase({ movementId: target.id, bags, reasonCode: code ?? "", note, requestId }),
      (res) => {
        if (res.ok) {
          clearError();
          onDone();
          router.refresh();
        } else setError(res.error);
      },
    );
  }

  const question = `Reverse ${bagsOk ? bagsText(bags) : "bags"}?`;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="reverse-bags">Bags</Label>
        <Input
          id="reverse-bags"
          inputMode="numeric"
          autoComplete="off"
          value={bagsText_}
          onChange={(e) => setBagsText(e.target.value.replace(/\D/g, "").slice(0, 6))}
          disabled={pending}
        />
        {left > 1 && <p className="text-xs text-muted-foreground">Fewer bags = part return</p>}
      </div>
      {target.kind === "dispatch" ? (
        <SelectField label="Back to" value={place} onChange={setPlace} options={target.places} placeholder="Pick a place" disabled={pending} />
      ) : (
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">From</span>
          <span className="text-base">{target.placeName}</span>
        </div>
      )}
      <ConfirmStep
        question={question}
        confirmLabel="Reverse"
        destructive
        pending={pending}
        confirmDisabled={hint !== null}
        onBack={onDone}
        onConfirm={save}
      >
        <ReasonPicker
          action="reversal"
          label="Why?"
          code={code}
          onCodeChange={setCode}
          note={note}
          onNoteChange={setNote}
          disabled={pending}
          showHint={false}
        />
        {error && <p className="text-sm text-destructive">{error}</p>}
        <FormHint>{hint}</FormHint>
      </ConfirmStep>
    </div>
  );
}
