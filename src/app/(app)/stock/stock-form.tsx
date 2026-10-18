"use client";

import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { chipClass } from "@/components/app/chip";
import { FormHint } from "@/components/app/form-hint";
import { Keypad } from "@/components/app/keypad";
import { PinnedAction } from "@/components/app/pinned-action";
import { RateField } from "@/components/app/rate-field";
import { SelectField } from "@/components/app/select-field";
import { TextLink } from "@/components/app/text-link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CHANNEL_LABELS, hasManyBrands, pickProductParts, startBrand } from "@/lib/catalogue-rules";
import { firstMissing } from "@/lib/form-rules";
import { parseRupeesToPaise } from "@/lib/money";
import {
  NEW_TRUCK_PLACE,
  placeGroups,
  STOCK_FIX_LABELS,
  STOCK_FIX_REASONS,
  type StockFixReason,
} from "@/lib/stock-rules";
import { useFormError } from "@/lib/use-form-error";
import { useSubmit } from "@/lib/use-submit";
import { bagsText } from "@/lib/words";
import { recordAdjustment, recordOpening, recordPurchase } from "./actions";
import { TruckFields, type TruckInput } from "./truck-fields";

type ProductOption = { id: string; name: string; channel: string; brandId: string; gradeId: string; bagKg: number };
type Lists = {
  brands: { id: string; name: string }[];
  types: { id: string; code: string; name: string }[];
  grades: { id: string; typeId: string; name: string }[];
};
type PlaceOption = { key: string; kind: string; name: string };
type Balance = { productId: string; placeKey: string; bags: number };

const copy = {
  purchase: { button: "Add purchase", note: "Supplier / note (optional)", done: "Purchase added." },
  opening: { button: "Set opening stock", note: "", done: "Opening stock set." },
  adjust: { button: "Save adjustment", note: "Note (optional)", done: "Adjustment saved." },
} as const;

const NO_TRUCK: TruckInput = { number: "", driverName: "", driverPhone: "" };

function NoteField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} value={value} onChange={(e) => onChange(e.target.value)} maxLength={200} />
    </div>
  );
}

/**
 * Purchase, opening stock and stock correction. The product is picked with drop-downs that only offer
 * existing products (brand → trade-type → type → grade); picking a brand starts again at that brand's
 * first product, so nothing new is ever made here (products are added in Catalogue).
 */
export function StockForm({
  mode,
  places,
  products,
  balances,
  lists,
}: {
  mode: keyof typeof copy;
  places: PlaceOption[];
  products: ProductOption[];
  balances: Balance[];
  /** Brands, types and grades the products are made from. */
  lists: Lists;
}) {
  const router = useRouter();
  const { pending, run } = useSubmit();
  const [pick, setPick] = useState({ brandId: products[0]?.brandId ?? "", channel: "", typeId: "", gradeId: "" });
  const [place, setPlace] = useState(places[0]?.key ?? (mode === "purchase" ? NEW_TRUCK_PLACE : ""));
  const [digits, setDigits] = useState("");
  const [minus, setMinus] = useState(false);
  const [note, setNote] = useState("");
  const [reason, setReason] = useState<StockFixReason | null>(null);
  // Purchase only: what one bag cost (typed in rupees) and the optional supplier invoice number.
  const [costText, setCostText] = useState("");
  const [invoiceNo, setInvoiceNo] = useState("");
  // The quick truck form (purchase into a hired truck): nothing about the truck is saved for next time.
  const [truck, setTruck] = useState(NO_TRUCK);
  const newTruck = mode === "purchase" && place === NEW_TRUCK_PLACE;
  // "Purchase added." stays until the next save; an error goes away as soon as any field changes.
  const [done, setDone] = useState("");
  const { error, setError, clearError } = useFormError([pick, place, digits, minus, note, reason, costText, invoiceNo, truck]);

  // Brand first. With one brand there is no Brand drop-down: that brand is used.
  const brandId = startBrand(lists.brands, pick.brandId);
  const brandName = lists.brands.find((b) => b.id === brandId)?.name ?? "";
  const parts = pickProductParts(products, lists.types, lists.grades, { ...pick, brandId });
  const product = parts.product;

  const current = product ? (balances.find((b) => b.productId === product.id && b.placeKey === place)?.bags ?? 0) : 0;
  const bags = Number(digits || 0);
  const costPaise = parseRupeesToPaise(costText);
  const reasonId = useId();

  const hint = firstMissing([
    [!product, "Pick a product"],
    [!place, "Pick a place"],
    [newTruck && (!truck.number.trim() || !truck.driverName.trim()), "Enter the truck number and driver"],
    [bags === 0, "Enter the bags"],
    [mode === "adjust" && reason === null, "Pick a reason"],
    [mode === "purchase" && (costPaise === null || costPaise < 1), "Enter the cost per bag"],
  ]);

  function submit() {
    setDone("");
    clearError();
    const input = {
      brandId,
      channel: parts.channel,
      typeId: parts.typeId,
      gradeId: parts.gradeId,
      place,
      truck: newTruck ? truck : undefined,
      bags: mode === "adjust" && minus ? -bags : bags,
      note,
      ...(mode === "adjust" ? { reason: reason ?? "" } : {}),
      ...(mode === "purchase" ? { costPerBagPaise: costPaise ?? undefined, invoiceNo } : {}),
    };
    const action = mode === "purchase" ? recordPurchase : mode === "opening" ? recordOpening : recordAdjustment;
    run(
      (requestId) => action({ ...input, requestId }),
      (res) => {
        if (res.ok) {
          setDone(copy[mode].done);
          // A fresh form: amount empty and (adjust) back to "Add bags", so it never shows "-0 bags".
          setDigits("");
          setMinus(false);
          setNote("");
          setReason(null);
          setCostText("");
          setInvoiceNo("");
          setTruck(NO_TRUCK);
          router.refresh();
        } else setError(res.error);
      },
    );
  }

  if ((places.length === 0 && mode !== "purchase") || products.length === 0) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-2xl bg-card p-4 text-sm shadow-card ring-1 ring-foreground/6">
        <span>{products.length === 0 ? "No products yet" : "No godown yet"}</span>
        <TextLink href={products.length === 0 ? "/catalogue" : "/godowns"} strong>
          {products.length === 0 ? "Catalogue" : "Godowns"}
        </TextLink>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {hasManyBrands(lists.brands) && (
        <SelectField
          label="Brand"
          value={brandId}
          // A new brand starts at its own first product (nothing from the old brand is kept).
          onChange={(id) => setPick({ brandId: id, channel: "", typeId: "", gradeId: "" })}
          options={lists.brands.map((b) => ({ value: b.id, label: b.name }))}
        />
      )}
      <SelectField
        label="Trade-type"
        value={parts.channel}
        onChange={(channel) => setPick({ ...pick, brandId, channel })}
        options={parts.channels.map((c) => ({ value: c, label: CHANNEL_LABELS[c] }))}
      />
      <div className="grid grid-cols-2 gap-3">
        <SelectField
          label="Type"
          value={parts.typeId}
          onChange={(typeId) => setPick({ ...pick, brandId, channel: parts.channel, typeId })}
          options={parts.typeIds.map((id) => ({ value: id, label: lists.types.find((t) => t.id === id)?.code ?? "" }))}
        />
        <SelectField
          label="Grade"
          value={parts.gradeId}
          onChange={(gradeId) => setPick({ ...pick, brandId, channel: parts.channel, typeId: parts.typeId, gradeId })}
          options={parts.gradeIds.map((id) => ({ value: id, label: lists.grades.find((g) => g.id === id)?.name ?? "" }))}
        />
      </div>
      <SelectField
        label="Place"
        value={place}
        onChange={setPlace}
        groups={[
          ...placeGroups(places),
          ...(mode === "purchase" ? [{ label: "Hired truck", options: [{ value: NEW_TRUCK_PLACE, label: "New truck…" }] }] : []),
        ]}
      />
      {newTruck ? (
        <TruckFields value={truck} onChange={setTruck} />
      ) : (
        <p className="text-sm text-muted-foreground">In stock here now: {bagsText(current)}</p>
      )}
      {mode === "purchase" && (
        <>
          <RateField
            label="Cost per bag (₹)"
            value={costText}
            onChange={setCostText}
            bags={bags}
            allowPaise
            totalLabel={`Owed to ${brandName}`}
          />
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="stock-invoice">Invoice no. (optional)</Label>
            <Input
              id="stock-invoice"
              value={invoiceNo}
              onChange={(e) => setInvoiceNo(e.target.value)}
              autoComplete="off"
              maxLength={60}
            />
          </div>
          <NoteField label={copy.purchase.note} value={note} onChange={setNote} />
        </>
      )}
      {mode === "adjust" && (
        <div className="grid grid-cols-2 gap-2">
          <Button type="button" variant={minus ? "outline" : "default"} onClick={() => setMinus(false)}>
            + Add bags
          </Button>
          <Button type="button" variant={minus ? "default" : "outline"} onClick={() => setMinus(true)}>
            - Remove bags
          </Button>
        </div>
      )}
      <div className="tabular text-center text-4xl font-bold" aria-live="polite">
        {mode === "adjust" && minus ? "−" : ""}
        {bags} <span className="text-base font-medium text-muted-foreground">bags</span>
      </div>
      <Keypad value={digits} onChange={setDigits} maxLength={6} />
      {mode === "adjust" && (
        <>
          <div className="flex flex-col gap-1.5">
            <Label id={reasonId}>Reason</Label>
            <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-labelledby={reasonId}>
              {STOCK_FIX_REASONS.map((r) => (
                <button
                  key={r}
                  type="button"
                  role="radio"
                  aria-checked={reason === r}
                  className={chipClass(reason === r, "w-full")}
                  onClick={() => setReason(r)}
                >
                  {STOCK_FIX_LABELS[r]}
                </button>
              ))}
            </div>
          </div>
          <NoteField label={copy.adjust.note} value={note} onChange={setNote} />
        </>
      )}
      {error && (
        <p role="status" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {done && !error && (
        <p role="status" className="text-sm text-green-700">
          {done}
        </p>
      )}
      <PinnedAction>
        <FormHint>{hint}</FormHint>
        <Button onClick={submit} disabled={pending || hint !== null}>
          {copy[mode].button}
        </Button>
      </PinnedAction>
    </div>
  );
}
