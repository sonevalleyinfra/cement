"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Keypad } from "@/components/app/keypad";
import { PinnedAction } from "@/components/app/pinned-action";
import { SelectField } from "@/components/app/select-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CHANNEL_LABELS, hasManyBrands, pickProductParts, startBrand } from "@/lib/catalogue-rules";
import { formatINR, parseRupeesToPaise } from "@/lib/money";
import { purchaseAmountPaise } from "@/lib/supplier-rules";
import {
  NEW_TRUCK_PLACE,
  placeGroups,
  STOCK_FIX_LABELS,
  STOCK_FIX_REASONS,
  type StockFixReason,
} from "@/lib/stock-rules";
import { useSubmit } from "@/lib/use-submit";
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

const chip = (on: boolean) =>
  `h-11 rounded-full px-4 text-sm font-semibold ring-1 transition-[background-color,color,transform] duration-150 ease-out active:scale-[0.97] ${on ? "bg-primary text-primary-foreground shadow-brand ring-primary" : "bg-card ring-foreground/10"}`;

const NO_TRUCK: TruckInput = { number: "", driverName: "", driverPhone: "" };

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
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  // Brand first. With one brand there is no Brand drop-down: that brand is used.
  const brandId = startBrand(lists.brands, pick.brandId);
  const brandName = lists.brands.find((b) => b.id === brandId)?.name ?? "";
  const parts = pickProductParts(products, lists.types, lists.grades, { ...pick, brandId });
  const product = parts.product;

  const current = product ? (balances.find((b) => b.productId === product.id && b.placeKey === place)?.bags ?? 0) : 0;
  const bags = Number(digits || 0);
  const costPaise = parseRupeesToPaise(costText);
  const owedPaise = costPaise === null ? null : purchaseAmountPaise(bags, costPaise);

  function submit() {
    setMessage(null);
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
          setMessage({ ok: true, text: copy[mode].done });
          setDigits("");
          setNote("");
          setReason(null);
          setCostText("");
          setInvoiceNo("");
          setTruck(NO_TRUCK);
          router.refresh();
        } else setMessage({ ok: false, text: res.error });
      },
    );
  }

  if ((places.length === 0 && mode !== "purchase") || products.length === 0) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-2xl bg-card p-4 text-sm shadow-card ring-1 ring-foreground/6">
        <span>{products.length === 0 ? "No products yet" : "No godown yet"}</span>
        <Link href={products.length === 0 ? "/catalogue" : "/godowns"} className="font-semibold underline">
          {products.length === 0 ? "Catalogue" : "Godowns"}
        </Link>
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
        <p className="text-sm text-muted-foreground">In stock here now: {current} bags</p>
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
        {mode === "adjust" && minus ? "-" : ""}
        {bags} <span className="text-base font-medium text-muted-foreground">bags</span>
      </div>
      <Keypad value={digits} onChange={setDigits} maxLength={6} />
      {mode === "adjust" && (
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Reason">
          {STOCK_FIX_REASONS.map((r) => (
            <button
              key={r}
              type="button"
              role="radio"
              aria-checked={reason === r}
              className={chip(reason === r)}
              onClick={() => setReason(r)}
            >
              {STOCK_FIX_LABELS[r]}
            </button>
          ))}
        </div>
      )}
      {mode === "purchase" && (
        <>
          <Input
            value={costText}
            onChange={(e) => setCostText(e.target.value)}
            placeholder="Cost per bag (₹)"
            aria-label="Cost per bag"
            inputMode="decimal"
            autoComplete="off"
            maxLength={10}
          />
          {owedPaise !== null && (
            <div className="tabular text-center text-sm text-muted-foreground" aria-live="polite">
              Owed to {brandName} <span className="font-semibold text-foreground">{formatINR(owedPaise)}</span>
            </div>
          )}
          <Input
            value={invoiceNo}
            onChange={(e) => setInvoiceNo(e.target.value)}
            placeholder="Invoice no. (optional)"
            aria-label="Invoice number"
            autoComplete="off"
            maxLength={60}
          />
        </>
      )}
      {mode !== "opening" && (
        <Input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={copy[mode].note}
          aria-label={copy[mode].note}
          maxLength={200}
        />
      )}
      {message && (
        <p role="status" className={message.ok ? "text-sm text-green-700" : "text-sm text-destructive"}>
          {message.text}
        </p>
      )}
      <PinnedAction>
        <Button
          onClick={submit}
          disabled={
            pending ||
            bags === 0 ||
            !product ||
            !place ||
            (newTruck && (!truck.number.trim() || !truck.driverName.trim())) ||
            (mode === "purchase" && (costPaise === null || costPaise < 1)) ||
            (mode === "adjust" && reason === null)
          }
        >
          {copy[mode].button}
        </Button>
      </PinnedAction>
    </div>
  );
}
