export const DEFAULT_PURCHASE_SOURCES = [
  "RLJ Chunar",
  "Satna Plant",
  "Jagatpur Depo",
  "Harhua Depo",
  "Rake - Chaukhandi",
  "Other",
] as const;

"use client";

import { useRouter } from "next/navigation";
import { type ComponentProps, useId, useState } from "react";
import { FormHint } from "@/components/app/form-hint";
import { Keypad } from "@/components/app/keypad";
import { PinnedAction } from "@/components/app/pinned-action";
import { RateField } from "@/components/app/rate-field";
import { ReasonPicker } from "@/components/app/reason-picker";
import { SelectField } from "@/components/app/select-field";
import { TextLink } from "@/components/app/text-link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CHANNEL_LABELS, hasManyBrands, pickProductParts, startBrand } from "@/lib/catalogue-rules";
import { toISTDateKey } from "@/lib/datetime";
import { firstMissing } from "@/lib/form-rules";
import { formatINR, landedUnitCostPaise, parseRupeesToPaise } from "@/lib/money";
import { isValidIndianMobile, normalizePhone } from "@/lib/phone-rules";
import { reasonHint } from "@/lib/reason-codes";
import { NEW_TRUCK_PLACE, placeGroups } from "@/lib/stock-rules";
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
  purchase: { button: "Add purchase", note: "Purchase source / note (optional)", done: "Purchase added." },
  opening: { button: "Set opening stock", note: "", done: "Opening stock set." },
  adjust: { button: "Save adjustment", note: "Note (optional)", done: "Adjustment saved." },
} as const;

const NO_TRUCK: TruckInput = { number: "", driverName: "", driverPhone: "" };

/** Whole bags typed in a small field: digits only, at most 6. */
const bagDigits = (text: string) => text.replace(/\D/g, "").slice(0, 6);
/** Optional rupees (freight, unloading): empty = 0, null when not valid rupees. */
const optionalPaise = (text: string) => {
  if (!text.trim()) return 0;
  const paise = parseRupeesToPaise(text);
  return paise !== null && paise >= 0 ? paise : null;
};

function SmallField({
  label,
  value,
  onChange,
  inputMode,
  ...rest
}: { label: string; value: string; onChange: (v: string) => void } & Omit<
  ComponentProps<typeof Input>,
  "value" | "onChange" | "id"
>) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} value={value} onChange={(e) => onChange(e.target.value)} inputMode={inputMode} autoComplete="off" {...rest} />
    </div>
  );
}

function NoteField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} value={value} onChange={(e) => onChange(e.target.value)} maxLength={200} placeholder={placeholder} />
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
  trucks = [],
}: {
  mode: keyof typeof copy;
  places: PlaceOption[];
  products: ProductOption[];
  balances: Balance[];
  /** Brands, types and grades the products are made from. */
  lists: Lists;
  trucks?: { number: string; driverName: string; driverPhone: string }[];
}) {
  const router = useRouter();
  const { pending, run } = useSubmit();
  const [pick, setPick] = useState({ brandId: products[0]?.brandId ?? "", channel: "", typeId: "", gradeId: "" });
  const [place, setPlace] = useState(places[0]?.key ?? (mode === "purchase" ? NEW_TRUCK_PLACE : ""));
  const [digits, setDigits] = useState("");
  const [minus, setMinus] = useState(false);
  const [note, setNote] = useState("");
  const [reason, setReason] = useState<string | null>(null);
  // Purchase only: what one bag cost (typed in rupees), the supplier invoice, short / burst bags and extras paid.
  const [costText, setCostText] = useState("");
  const [invoiceNo, setInvoiceNo] = useState("");
  const [today] = useState(() => toISTDateKey(new Date()));
  const [invoiceDate, setInvoiceDate] = useState(today);
  const [shortText, setShortText] = useState("");
  const [burstText, setBurstText] = useState("");
  const [freightText, setFreightText] = useState("");
  const [unloadingText, setUnloadingText] = useState("");
  // The truck and driver of a purchase: nothing about the driver is saved for next time.
  const [truck, setTruck] = useState(NO_TRUCK);
  const [purchaseMode, setPurchaseMode] = useState<"depot" | "direct_site">("depot");
  const [purchaseSource, setPurchaseSource] = useState<string>("RLJ Chunar");
  const [otherSource, setOtherSource] = useState("");
  const [siteName, setSiteName] = useState("");
  const purchase = mode === "purchase";
  const newTruck = purchase && place === NEW_TRUCK_PLACE;
  // A purchase into a truck already in the list keeps that truck's number.
  const placeTruck = purchase && place.startsWith("vehicle:") ? places.find((p) => p.key === place)?.name : undefined;
  // "Purchase added." stays until the next save; an error goes away as soon as any field changes.
  const [done, setDone] = useState("");
  const { error, setError, clearError } = useFormError([
    pick,
    place,
    digits,
    minus,
    note,
    reason,
    costText,
    invoiceNo,
    invoiceDate,
    shortText,
    burstText,
    freightText,
    unloadingText,
    truck,
  ]);

  // Brand first. With one brand there is no Brand drop-down: that brand is used.
  const brandId = startBrand(lists.brands, pick.brandId);
  const brandName = lists.brands.find((b) => b.id === brandId)?.name ?? "";
  const parts = pickProductParts(products, lists.types, lists.grades, { ...pick, brandId });
  const product = parts.product;

  const current = product ? (balances.find((b) => b.productId === product.id && b.placeKey === place)?.bags ?? 0) : 0;
  const bags = Number(digits || 0);
  const costPaise = parseRupeesToPaise(costText);
  const received = bags - Number(shortText || 0) - Number(burstText || 0);
  const freightPaise = optionalPaise(freightText);
  const unloadingPaise = optionalPaise(unloadingText);
  const costOk = costPaise !== null && costPaise >= 1;
  const landed =
    purchase && costOk && received >= 1 && freightPaise !== null && unloadingPaise !== null
      ? landedUnitCostPaise({ unitCostPaise: costPaise, freightPaise, unloadingPaise, receivedBags: received })
      : null;

  const why = mode === "adjust" ? reasonHint("stock", reason, note) : null;
  const hint = firstMissing([
    [!product, "Pick a product"],
    [!place, "Pick a place"],
    [purchase && !placeTruck && !truck.number.trim(), "Enter the truck number"],
    [purchase && !truck.driverName.trim(), "Enter the driver name"],
    [purchase && !isValidIndianMobile(normalizePhone(truck.driverPhone)), "Enter the driver mobile (10 digits)"],
    [purchase && !invoiceNo.trim(), "Enter the invoice no."],
    [purchase && !invoiceDate, "Pick the invoice date"],
    [bags === 0, purchase ? "Enter the billed bags" : "Enter the bags"],
    [purchase && received < 1, "Received bags must be more than 0"],
    [why !== null, why ?? ""],
    [purchase && !costOk, "Enter the cost per bag"],
    [purchase && freightPaise === null, "Enter the freight in rupees"],
    [purchase && unloadingPaise === null, "Enter the unloading in rupees"],
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
      truck: purchase ? truck : undefined,
      bags: mode === "adjust" && minus ? -bags : bags,
      note: purchase ? [`Source: ${purchaseSource === "Other" ? (otherSource.trim() || "Other") : purchaseSource}`, purchaseMode === "direct_site" ? `Site: ${siteName.trim() || "Direct Site"}` : "Depot Stock", note.trim()].filter(Boolean).join(" · ") : note,
      ...(mode === "adjust" ? { reason: reason ?? "" } : {}),
      ...(purchase
        ? {
            costPerBagPaise: costPaise ?? undefined,
            invoiceNo,
            invoiceDate,
            shortBags: Number(shortText || 0),
            burstBags: Number(burstText || 0),
            freightPaise: freightPaise ?? undefined,
            unloadingPaise: unloadingPaise ?? undefined,
          }
        : {}),
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
          setInvoiceDate(today);
          setShortText("");
          setBurstText("");
          setFreightText("");
          setUnloadingText("");
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
      {!newTruck && <p className="text-sm text-muted-foreground">In stock here now: {bagsText(current)}</p>}
      {purchase && (
        <>
          <div className="flex flex-col gap-1.5">
            <Label>Purchase Mode</Label>
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant={purchaseMode === "depot" ? "default" : "outline"}
                onClick={() => setPurchaseMode("depot")}
              >
                Depot / Godown Stock
              </Button>
              <Button
                type="button"
                variant={purchaseMode === "direct_site" ? "default" : "outline"}
                onClick={() => setPurchaseMode("direct_site")}
              >
                Sales Order (Direct Site)
              </Button>
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <SelectField
              label="Purchase Source / Plant"
              value={purchaseSource}
              onChange={setPurchaseSource}
              options={DEFAULT_PURCHASE_SOURCES.map((s) => ({ value: s, label: s }))}
            />
            {purchaseSource === "Other" && (
              <Input
                placeholder="Enter custom plant or depot name"
                value={otherSource}
                onChange={(e) => setOtherSource(e.target.value)}
                maxLength={60}
              />
            )}
          </div>
          {purchaseMode === "direct_site" && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="site-name">Customer Site Name / Location</Label>
              <Input
                id="site-name"
                placeholder="e.g. Rameshwaram Project, Lanka"
                value={siteName}
                onChange={(e) => setSiteName(e.target.value)}
                maxLength={100}
              />
            </div>
          )}
          <TruckFields value={truck} onChange={setTruck} fixedNumber={placeTruck} knownTrucks={trucks} />
          <div className="grid grid-cols-2 gap-3">
            <SmallField label="Invoice no." value={invoiceNo} onChange={setInvoiceNo} maxLength={60} />
            <SmallField label="Invoice date" type="date" value={invoiceDate} onChange={setInvoiceDate} max={today} />
          </div>
          <RateField
            label="Cost per bag (₹)"
            value={costText}
            onChange={setCostText}
            bags={bags}
            allowPaise
            totalLabel={`Owed to ${brandName}`}
          />
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
        {bags} <span className="text-base font-medium text-muted-foreground">{purchase ? "bags billed" : "bags"}</span>
      </div>
      <Keypad value={digits} onChange={setDigits} maxLength={6} />
      {purchase && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <SmallField label="Short" value={shortText} onChange={(v) => setShortText(bagDigits(v))} inputMode="numeric" />
            <SmallField label="Burst" value={burstText} onChange={(v) => setBurstText(bagDigits(v))} inputMode="numeric" />
          </div>
          <p className="tabular text-sm text-muted-foreground">Received {bagsText(Math.max(received, 0))}</p>
          <div className="grid grid-cols-2 gap-3">
            <SmallField label="Freight (₹)" value={freightText} onChange={setFreightText} inputMode="decimal" maxLength={12} />
            <SmallField label="Unloading (₹)" value={unloadingText} onChange={setUnloadingText} inputMode="decimal" maxLength={12} />
          </div>
          {landed !== null && <p className="tabular text-sm text-muted-foreground">Landed {formatINR(landed)} per bag</p>}
          <NoteField label={copy.purchase.note} value={note} onChange={setNote} placeholder="e.g. Maihar Plant, Satna Depot, Supplier name" />
        </>
      )}
      {mode === "adjust" && (
        <>
          <div className="flex flex-col gap-1.5">
            <Label>Reason</Label>
            <ReasonPicker
              action="stock"
              label="Reason"
              code={reason}
              onCodeChange={setReason}
              note={note}
              onNoteChange={setNote}
              disabled={pending}
              showHint={false}
            />
          </div>
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
