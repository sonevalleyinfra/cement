"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { chipClass } from "@/components/app/chip";
import { FormHint } from "@/components/app/form-hint";
import { Keypad } from "@/components/app/keypad";
import { PinnedAction } from "@/components/app/pinned-action";
import { Sheet } from "@/components/app/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { firstMissing } from "@/lib/form-rules";
import { formatINR, parseRupeesToPaise } from "@/lib/money";
import { useFormError } from "@/lib/use-form-error";
import { useSubmit } from "@/lib/use-submit";
import { MAX_REASON, MAX_UTR, MODE_LABELS, PAYMENT_MODES, validateModeDetails, type PaymentMode } from "@/lib/receipt-rules";
import { loadDues, saveReceipt } from "../actions";

type RetailerRow = { id: string; name: string; place: string };

export function ReceiptForm({ retailers }: { retailers: RetailerRow[] }) {
  const router = useRouter();
  const [retailer, setRetailer] = useState<RetailerRow | null>(null);
  const [pickOpen, setPickOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [digits, setDigits] = useState("");
  const [mode, setMode] = useState<PaymentMode>("cash");
  const [utr, setUtr] = useState("");
  const [note, setNote] = useState("");
  // What the picked retailer owes right now (null until loaded).
  const [duesPaise, setDuesPaise] = useState<number | null>(null);
  // Goes away as soon as the retailer, amount, mode or UTR is changed.
  const { error, setError, clearError } = useFormError([retailer?.id, digits, mode, utr, note]);
  const [loading, start] = useTransition();
  const { pending: saving, run } = useSubmit();
  const pending = loading || saving;

  // The keypad allows paise ("9023.45"); a point typed with nothing after it yet counts as whole rupees.
  const totalPaise = parseRupeesToPaise(digits.replace(/\.$/, "") || "0") ?? 0;
  // Paying more than the dues is fine: the rest stays with the shop as an advance.
  const advancePaise = duesPaise !== null && totalPaise > duesPaise ? totalPaise - duesPaise : 0;

  const modeError = validateModeDetails(mode, { utr });
  const hint = firstMissing([
    [!retailer, "Pick a retailer"],
    [totalPaise <= 0, "Enter the amount"],
    [modeError !== null, modeError ?? ""],
  ]);
  const canSave = hint === null && !pending;

  function pickRetailer(r: RetailerRow) {
    setRetailer(r);
    setPickOpen(false);
    setDuesPaise(null);
    clearError();
    start(async () => {
      const res = await loadDues(r.id);
      if (res.ok) setDuesPaise(res.duesPaise);
      else setError(res.error, [r.id, digits, mode, utr, note]);
    });
  }

  function submit() {
    if (!retailer) return;
    clearError();
    run(
      (requestId) =>
        saveReceipt({
          retailerId: retailer.id,
          mode,
          totalPaise,
          utr: mode === "online" ? utr : "",
          note: mode === "online" ? note : "",
          requestId,
        }),
      (res) => {
        if (res.ok) router.push(`/receipts/${res.id}`);
        else setError(res.error);
      },
    );
  }

  const matches = retailers.filter((r) => `${r.name} ${r.place}`.toLowerCase().includes(search.trim().toLowerCase()));

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-xl font-bold">New payment</h1>

      <button
        type="button"
        onClick={() => setPickOpen(true)}
        className="flex min-h-14 items-center justify-between rounded-2xl bg-card p-4 text-left text-base font-semibold shadow-card ring-1 ring-foreground/6"
      >
        {retailer ? (retailer.place ? `${retailer.name} · ${retailer.place}` : retailer.name) : "Pick retailer"}
        <span className="text-sm font-medium text-muted-foreground">Change</span>
      </button>
      <Sheet open={pickOpen} onOpenChange={setPickOpen} title="Retailer">
        <Input placeholder="Search" value={search} onChange={(e) => setSearch(e.target.value)} className="mb-3" />
        <ul className="flex flex-col gap-2">
          {matches.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                onClick={() => pickRetailer(r)}
                className="min-h-12 w-full rounded-xl bg-card p-3 text-left text-base font-medium shadow-card ring-1 ring-foreground/6"
              >
                {r.name}
                {r.place && <span className="text-muted-foreground"> · {r.place}</span>}
              </button>
            </li>
          ))}
          {matches.length === 0 && <li className="py-6 text-center text-muted-foreground">No match</li>}
        </ul>
      </Sheet>
      {retailer && duesPaise !== null && (
        <div className="flex items-baseline justify-between rounded-2xl bg-muted p-3">
          <span className="text-sm font-medium">Dues</span>
          <span className="tabular text-lg font-bold">{formatINR(duesPaise)}</span>
        </div>
      )}

      <section className="flex flex-col gap-3">
        <div className="tabular text-center text-4xl font-bold">{formatINR(totalPaise, { hidePaise: true })}</div>
        <Keypad value={digits} onChange={setDigits} decimal />
        {advancePaise > 0 && (
          <p className="text-center text-sm text-muted-foreground">Advance {formatINR(advancePaise)}</p>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex gap-2">
          {PAYMENT_MODES.map((m) => (
            <button key={m} type="button" className={chipClass(mode === m)} onClick={() => setMode(m)}>
              {MODE_LABELS[m]}
            </button>
          ))}
        </div>
        {mode === "online" && (
          <div className="flex flex-col gap-2">
            <Label htmlFor="utr">UTR / reference</Label>
            <Input id="utr" value={utr} maxLength={MAX_UTR + 10} autoComplete="off" onChange={(e) => setUtr(e.target.value)} />
            <Label htmlFor="note">Note</Label>
            <Input id="note" value={note} maxLength={MAX_REASON} onChange={(e) => setNote(e.target.value)} />
          </div>
        )}
      </section>

      {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
      <PinnedAction>
        <FormHint>{hint}</FormHint>
        <Button type="button" size="lg" disabled={!canSave} onClick={submit}>
          {saving ? "Saving…" : "Save payment"}
        </Button>
      </PinnedAction>
    </div>
  );
}
