"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { bagsText } from "@/lib/words";
import { useFormError } from "@/lib/use-form-error";
import { updateOrderBags } from "../actions";

export function EditBagsForm({
  orderId,
  currentBags,
  sentBags,
  needsReapproval = false,
}: {
  orderId: string;
  currentBags: number;
  sentBags: number;
  needsReapproval?: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [bagsTextValue, setBagsTextValue] = useState(String(currentBags));
  const [note, setNote] = useState("");
  const { error, setError, clearError } = useFormError([bagsTextValue, note]);
  const [pending, start] = useTransition();

  const minBags = Math.max(1, sentBags);

  function addQuick(amount: number) {
    const current = Number.parseInt(bagsTextValue, 10) || currentBags;
    const next = Math.max(minBags, current + amount);
    setBagsTextValue(String(next));
  }

  function handleSave() {
    clearError();
    const val = Number.parseInt(bagsTextValue, 10);
    if (!Number.isInteger(val) || val <= 0) {
      setError("Please enter a valid positive number of bags.");
      return;
    }
    if (val < sentBags) {
      setError(`Cannot be less than ${bagsText(sentBags)} already dispatched.`);
      return;
    }
    if (val === currentBags) {
      setError(`Quantity is already ${bagsText(currentBags)}.`);
      return;
    }

    start(async () => {
      const res = await updateOrderBags(orderId, val, note);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setEditing(false);
      router.refresh();
    });
  }

  if (!editing) {
    return (
      <Button
        variant="outline"
        size="sm"
        className="rounded-xl font-semibold border-primary/30 text-primary hover:bg-primary/10"
        onClick={() => {
          setBagsTextValue(String(currentBags));
          setEditing(true);
        }}
      >
        ✏️ Edit Quantity (+ / −)
      </Button>
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-2xl bg-card p-4 shadow-card ring-1 ring-foreground/10 border border-primary/20">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-bold text-foreground">Update Order Quantity</h4>
        <span className="text-xs text-muted-foreground">Current: {bagsText(currentBags)}</span>
      </div>
      {needsReapproval && (
        <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
          Updating an approved order will send it back to Accountant &amp; Admin for approval.
        </p>
      )}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="order-edit-bags" className="text-xs">
          Total Ordered Bags {sentBags > 0 && `(Min ${sentBags} dispatched)`}
        </Label>
        <Input
          id="order-edit-bags"
          type="number"
          min={minBags}
          value={bagsTextValue}
          onChange={(e) => setBagsTextValue(e.target.value)}
          className="text-lg font-bold tabular"
          disabled={pending}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-xs text-muted-foreground">Quick adjust quantity:</span>
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => addQuick(-200)}
            className="rounded-lg bg-rose-500/10 text-rose-700 dark:text-rose-400 border border-rose-500/20 px-2.5 py-1 text-xs font-bold hover:bg-rose-500/20 active:scale-95 transition-all"
            disabled={pending || (Number.parseInt(bagsTextValue, 10) || currentBags) <= minBags}
          >
            −200
          </button>
          <button
            type="button"
            onClick={() => addQuick(-100)}
            className="rounded-lg bg-rose-500/10 text-rose-700 dark:text-rose-400 border border-rose-500/20 px-2.5 py-1 text-xs font-bold hover:bg-rose-500/20 active:scale-95 transition-all"
            disabled={pending || (Number.parseInt(bagsTextValue, 10) || currentBags) <= minBags}
          >
            −100
          </button>
          <button
            type="button"
            onClick={() => addQuick(-50)}
            className="rounded-lg bg-rose-500/10 text-rose-700 dark:text-rose-400 border border-rose-500/20 px-2.5 py-1 text-xs font-bold hover:bg-rose-500/20 active:scale-95 transition-all"
            disabled={pending || (Number.parseInt(bagsTextValue, 10) || currentBags) <= minBags}
          >
            −50
          </button>
          <span className="text-xs text-muted-foreground/60 mx-0.5">|</span>
          <button
            type="button"
            onClick={() => addQuick(50)}
            className="rounded-lg bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20 px-2.5 py-1 text-xs font-bold hover:bg-emerald-500/20 active:scale-95 transition-all"
            disabled={pending}
          >
            +50
          </button>
          <button
            type="button"
            onClick={() => addQuick(100)}
            className="rounded-lg bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20 px-2.5 py-1 text-xs font-bold hover:bg-emerald-500/20 active:scale-95 transition-all"
            disabled={pending}
          >
            +100
          </button>
          <button
            type="button"
            onClick={() => addQuick(200)}
            className="rounded-lg bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20 px-2.5 py-1 text-xs font-bold hover:bg-emerald-500/20 active:scale-95 transition-all"
            disabled={pending}
          >
            +200
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="order-edit-note" className="text-xs">
          Reason / Note (optional)
        </Label>
        <Input
          id="order-edit-note"
          type="text"
          placeholder="e.g. Retailer called to increase order"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={200}
          disabled={pending}
        />
      </div>

      {error && <p className="text-xs text-destructive font-medium">{error}</p>}

      <div className="flex items-center justify-end gap-2 pt-1">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            clearError();
            setEditing(false);
          }}
          disabled={pending}
        >
          Cancel
        </Button>
        <Button
          type="button"
          size="sm"
          onClick={handleSave}
          disabled={pending}
          className="bg-primary text-primary-foreground font-semibold"
        >
          {pending ? "Saving…" : "Save Quantity"}
        </Button>
      </div>
    </div>
  );
}
