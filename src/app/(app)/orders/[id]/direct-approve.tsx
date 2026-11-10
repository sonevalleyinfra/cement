"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ReasonPicker } from "@/components/app/reason-picker";
import { Button } from "@/components/ui/button";
import { useFormError } from "@/lib/use-form-error";
import { decideOrder } from "../actions";

export function DirectApprove({
  orderId,
  ratePaise,
}: {
  orderId: string;
  ratePaise: number;
}) {
  const router = useRouter();
  const [overriding, setOverriding] = useState(false);
  const [overCode, setOverCode] = useState<string | null>(null);
  const [overNote, setOverNote] = useState("");
  const { error, setError, clearError } = useFormError([overCode, overNote]);
  const [pending, start] = useTransition();

  function onApprove() {
    clearError();
    start(async () => {
      const override = overriding ? { code: overCode ?? "", note: overNote } : null;
      const res = await decideOrder(orderId, "approved", null, null, ratePaise, override);
      if (!res.ok) {
        setError(res.error);
        if ("needsOverride" in res && res.needsOverride) {
          setOverriding(true);
        }
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-3 rounded-2xl bg-card p-4 shadow-card ring-1 ring-foreground/6 border border-emerald-500/20">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
          <h4 className="text-sm font-bold text-foreground">Order Approval Ready</h4>
        </div>
        <span className="text-xs text-muted-foreground">Rate set · Awaiting confirmation</span>
      </div>

      {overriding && (
        <div className="flex flex-col gap-2 rounded-xl bg-amber-500/10 p-3 border border-amber-500/30">
          <p className="text-xs font-semibold text-amber-900 dark:text-amber-200">
            ⚠️ Credit limit reached or overdue balance. Pick an override reason to approve:
          </p>
          <ReasonPicker
            action="override"
            label="Override credit check"
            code={overCode}
            onCodeChange={setOverCode}
            note={overNote}
            onNoteChange={setOverNote}
            disabled={pending}
            showHint={true}
          />
        </div>
      )}

      {error && <p className="text-xs text-destructive font-medium">{error}</p>}

      <div className="flex items-center justify-end gap-2">
        <Button
          type="button"
          onClick={onApprove}
          disabled={pending}
          className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-6"
        >
          {pending ? "Approving…" : overriding ? "✓ Confirm & Override" : "✓ Approve Order"}
        </Button>
      </div>
    </div>
  );
}
