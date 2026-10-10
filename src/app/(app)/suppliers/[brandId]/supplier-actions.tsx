"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, type ReactNode, useState } from "react";
import { PinnedAction } from "@/components/app/pinned-action";
import { SelectField } from "@/components/app/select-field";
import { Sheet } from "@/components/app/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { parseRupeesToPaise } from "@/lib/money";
import { MAX_REASON } from "@/lib/receipt-rules";
import { SUPPLIER_MODE_LABELS, SUPPLIER_PAYMENT_MODES } from "@/lib/supplier-rules";
import { useSubmit } from "@/lib/use-submit";
import { addSupplierAdjustment, recordSupplierCredit, recordSupplierPayment, setSupplierOpening } from "../actions";

type Kind = "opening" | "payment" | "credit" | "adjustment";

const titles = (brand: string): Record<Kind, string> => ({
  opening: "Opening balance",
  payment: `Payment to ${brand}`,
  credit: "Scheme credit",
  adjustment: "Adjustment",
});

/**
 * The four things the admin can add to one brand's supplier account. Payment is the one main button;
 * credit, adjustment and (until it is set) opening balance sit above the list.
 * Each opens a sheet with one short form. `children` is the entry list.
 */
export function SupplierActions({
  brandId,
  brandName,
  hasOpening,
  today,
  children,
}: {
  brandId: string;
  brandName: string;
  hasOpening: boolean;
  /** Today in India, "YYYY-MM-DD". */
  today: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState<Kind | null>(null);
  const secondary: Kind[] = hasOpening ? ["credit", "adjustment"] : ["opening", "credit", "adjustment"];
  return (
    <>
      <div className={`grid gap-2 ${hasOpening ? "grid-cols-2" : "grid-cols-3"}`}>
        {secondary.map((k) => (
          <Button key={k} variant="outline" onClick={() => setOpen(k)}>
            {k === "opening" ? "Opening" : k === "credit" ? "Credit" : "Adjust"}
          </Button>
        ))}
      </div>
      {children}
      <PinnedAction>
        <Button onClick={() => setOpen("payment")}>Record payment</Button>
      </PinnedAction>
      <Sheet open={open !== null} onOpenChange={(o) => !o && setOpen(null)} title={open ? titles(brandName)[open] : ""}>
        {open && (
          <EntryForm
            key={open}
            kind={open}
            brandId={brandId}
            brandName={brandName}
            today={today}
            onDone={() => setOpen(null)}
          />
        )}
      </Sheet>
    </>
  );
}

function EntryForm({
  kind,
  brandId,
  brandName,
  today,
  onDone,
}: {
  kind: Kind;
  brandId: string;
  brandName: string;
  today: string;
  onDone: () => void;
}) {
  const router = useRouter();
  const { pending, run } = useSubmit();
  const [error, setError] = useState("");
  // Opening: true = we owe the supplier. Adjustment: true = we owe more.
  const [plus, setPlus] = useState(true);
  const [mode, setMode] = useState<string>("bank");

  // onSubmit (not a form action) so the fields keep their text when there is an error.
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    const f = new FormData(e.currentTarget);
    const paise = parseRupeesToPaise(String(f.get("amount") ?? ""));
    if (paise === null || paise <= 0) return setError("Enter the amount.");
    const entryDate = String(f.get("date") ?? "");
    const reason = String(f.get("reason") ?? "");
    const reference = String(f.get("reference") ?? "");
    run(
      (requestId) =>
        kind === "opening"
          ? setSupplierOpening({ brandId, amountPaise: paise, weOwe: plus, entryDate, requestId })
          : kind === "payment"
            ? recordSupplierPayment({ brandId, amountPaise: paise, mode, reference, entryDate, requestId })
            : kind === "credit"
              ? recordSupplierCredit({ brandId, amountPaise: paise, reason, entryDate, requestId })
              : addSupplierAdjustment({ brandId, amountPaise: plus ? paise : -paise, reason, entryDate, requestId }),
      (res) => {
        if (res.ok) {
          onDone();
          router.refresh();
        } else setError(res.error);
      },
    );
  }

  const toggle = (labels: [string, string]) => (
    <div className="grid grid-cols-2 gap-2">
      <Button type="button" variant={plus ? "default" : "outline"} onClick={() => setPlus(true)}>
        {labels[0]}
      </Button>
      <Button type="button" variant={plus ? "outline" : "default"} onClick={() => setPlus(false)}>
        {labels[1]}
      </Button>
    </div>
  );

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      {kind === "opening" && toggle([`We owe ${brandName}`, `${brandName} owes us`])}
      {kind === "adjustment" && toggle(["We owe more", "We owe less"])}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="amount">Amount (₹)</Label>
        <Input id="amount" name="amount" inputMode="decimal" autoComplete="off" autoFocus />
      </div>
      {kind === "payment" && (
        <>
          <SelectField
            label="Mode"
            value={mode}
            onChange={setMode}
            options={SUPPLIER_PAYMENT_MODES.map((m) => ({ value: m, label: SUPPLIER_MODE_LABELS[m] }))}
          />
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="reference">{mode === "bank" ? "UTR / reference" : "Reference (optional)"}</Label>
            <Input id="reference" name="reference" autoComplete="off" maxLength={60} />
          </div>
        </>
      )}
      {(kind === "credit" || kind === "adjustment") && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="reason">Reason</Label>
          <Input id="reason" name="reason" autoComplete="off" maxLength={MAX_REASON} />
        </div>
      )}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="date">Date</Label>
        <Input id="date" name="date" type="date" defaultValue={today} max={today} />
      </div>
      {error && (
        <p role="status" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save"}
      </Button>
    </form>
  );
}
