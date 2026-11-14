"use client";

import { useRouter } from "next/navigation";
import { type ComponentProps, useId, useState } from "react";
import { chipClass } from "@/components/app/chip";
import { FormHint } from "@/components/app/form-hint";
import { PinnedAction } from "@/components/app/pinned-action";
import { RateField } from "@/components/app/rate-field";
import { ReasonPicker } from "@/components/app/reason-picker";
import { SelectField } from "@/components/app/select-field";
import { TextLink } from "@/components/app/text-link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CHANNEL_LABELS, PRODUCT_CHANNELS, hasManyBrands, startBrand, type ProductChannel } from "@/lib/catalogue-rules";
import { toISTDateKey } from "@/lib/datetime";
import { firstMissing } from "@/lib/form-rules";
import { parseRupeesToPaise } from "@/lib/money";
import { isValidIndianMobile, normalizePhone } from "@/lib/phone-rules";
import { DEFAULT_PURCHASE_SOURCES, PURCHASE_NOTE_MAX, purchaseNote } from "@/lib/purchase-rules";
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
  purchase: { button: "Add purchase", note: "Note (optional)", done: "Purchase added." },
  opening: { button: "Set opening stock", note: "", done: "Opening stock set." },
  adjust: { button: "Save adjustment", note: "Note (optional)", done: "Adjustment saved." },
} as const;

const NO_TRUCK: TruckInput = { number: "", driverName: "", driverPhone: "" };

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
  maxLength = 200,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  maxLength?: number;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} value={value} onChange={(e) => onChange(e.target.value)} maxLength={maxLength} placeholder={placeholder} />
    </div>
  );
}

/**
 * Purchase, opening stock and stock correction. The product is picked with drop-downs that only offer
 * existing products (brand → trade-type → type → grade); picking a brand starts again at that brand's
 * first product, so nothing new is ever made here (products are added in Catalogue).
 */
function variantLabel(p: ProductOption, listGrades: { id: string; name: string }[]): string {
  const gName = listGrades.find((g) => g.id === p.gradeId)?.name;
  if (p.channel === "non_trade") {
    if (gName === "NFR" || p.name.includes("NFR")) return "PPC NFR";
    if (gName === "43" || p.name.includes("OPC 43")) return "OPC 43";
  }
  if (p.channel === "trade") {
    if (gName === "43" || p.name.includes("OPC 43")) return "OPC 43";
    if (gName) return gName;
  }
  return p.name;
}

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
  const purchase = mode === "purchase";
  const availablePlaces = places;
  const [pick, setPick] = useState({ brandId: products[0]?.brandId ?? "", channel: "", typeId: "", gradeId: "", productId: "" });
  const [place, setPlace] = useState(purchase ? NEW_TRUCK_PLACE : (places[0]?.key ?? ""));
  const [digits, setDigits] = useState("");
  const [minus, setMinus] = useState(false);
  const [note, setNote] = useState("");
  const [reason, setReason] = useState<string | null>(null);
  // Purchase only: what one bag cost (typed in rupees), the supplier invoice, and extras paid.
  const [costText, setCostText] = useState("");
  const [invoiceNo, setInvoiceNo] = useState("");
  const [today] = useState(() => toISTDateKey(new Date()));
  const [invoiceDate, setInvoiceDate] = useState(today);
  // The truck and driver of a purchase: typed directly; nothing needs pre-adding on Trucks.
  const [truck, setTruck] = useState(NO_TRUCK);
  const [purchaseSource, setPurchaseSource] = useState<string>(DEFAULT_PURCHASE_SOURCES[0]);
  const [otherSource, setOtherSource] = useState("");
  const newTruck = purchase;
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
    truck,
  ]);

  // Brand first. With one brand there is no Brand drop-down: that brand is used.
  const brandId = startBrand(lists.brands, pick.brandId);
  const brandName = lists.brands.find((b) => b.id === brandId)?.name ?? "";
  const brandProducts = products.filter((p) => p.brandId === brandId);
  const channels = PRODUCT_CHANNELS.filter((c) => brandProducts.some((p) => p.channel === c));
  const currentChannel = (channels as readonly string[]).includes(pick.channel)
    ? (pick.channel as ProductChannel)
    : (channels[0] ?? "trade");
  const channelProducts = brandProducts.filter((p) => p.channel === currentChannel);
  const product =
    channelProducts.find((p) => p.id === pick.productId || p.gradeId === pick.gradeId) ??
    channelProducts[0] ??
    null;
  const gradeId = product?.gradeId ?? "";
  const typeId = lists.grades.find((g) => g.id === gradeId)?.typeId ?? lists.types[0]?.id ?? "";

  const current = product ? (balances.find((b) => b.productId === product.id && b.placeKey === place)?.bags ?? 0) : 0;
  const bags = Number(digits || 0);
  const costPaise = parseRupeesToPaise(costText);
  const costOk = costPaise !== null && costPaise >= 1;

  const why = mode === "adjust" ? reasonHint("stock", reason, note) : null;
  const hint = firstMissing([
    [!product, "Pick a product"],
    [!place, "Pick a place"],
    [purchase && !truck.number.trim(), "Enter the truck number"],
    [purchase && !truck.driverName.trim(), "Enter the driver name"],
    [purchase && !isValidIndianMobile(normalizePhone(truck.driverPhone)), "Enter the driver mobile (10 digits)"],
    [purchase && !invoiceNo.trim(), "Enter the invoice no."],
    [purchase && !invoiceDate, "Pick the invoice date"],
    [bags === 0, "Enter the bags"],
    [why !== null, why ?? ""],
    [purchase && !costOk, "Enter the cost per bag"],
  ]);

  function submit() {
    setDone("");
    clearError();
    const input = {
      brandId,
      channel: currentChannel,
      typeId,
      gradeId,
      place,
      truck: purchase ? truck : undefined,
      bags: mode === "adjust" && minus ? -bags : bags,
      note: purchase ? purchaseNote({ source: purchaseSource, otherSource, note }) : note,
      ...(mode === "adjust" ? { reason: reason ?? "" } : {}),
      ...(purchase
        ? {
            costPerBagPaise: costPaise ?? undefined,
            invoiceNo,
            invoiceDate,
            shortBags: 0,
            burstBags: 0,
          }
        : {}),
    };
    const action = mode === "purchase" ? recordPurchase : mode === "opening" ? recordOpening : recordAdjustment;
    run(
      (requestId) => action({ ...input, requestId }),
      (res) => {
        if (res.ok) {
          const code = "trackingId" in res && res.trackingId ? ` · Tracking ID: ${res.trackingId}` : "";
          setDone(`${copy[mode].done}${code}`);
          // A fresh form: amount empty and (adjust) back to "Add bags", so it never shows "-0 bags".
          setDigits("");
          setMinus(false);
          setNote("");
          setReason(null);
          setCostText("");
          setInvoiceNo("");
          setInvoiceDate(today);
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
          onChange={(id) => setPick({ brandId: id, channel: "", typeId: "", gradeId: "", productId: "" })}
          options={lists.brands.map((b) => ({ value: b.id, label: b.name }))}
        />
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <SelectField
          label="Trade-type"
          value={currentChannel}
          onChange={(channel) => setPick({ brandId, channel, typeId: "", gradeId: "", productId: "" })}
          options={channels.map((c) => ({ value: c, label: CHANNEL_LABELS[c] }))}
        />
        <SelectField
          label="Cement Name / Variant"
          value={product?.id ?? ""}
          onChange={(prodId) => {
            const p = channelProducts.find((x) => x.id === prodId);
            const tId = lists.grades.find((g) => g.id === p?.gradeId)?.typeId ?? "";
            setPick({
              brandId,
              channel: currentChannel,
              typeId: tId,
              gradeId: p?.gradeId ?? "",
              productId: p?.id ?? "",
            });
          }}
          options={channelProducts.map((p) => ({
            value: p.id,
            label: variantLabel(p, lists.grades),
          }))}
        />
      </div>
      {product && (
        <div className="flex items-center justify-between rounded-xl bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
          <span>Product:</span>
          <span className="font-semibold text-foreground">{product.name}</span>
        </div>
      )}
      {!purchase && (
        <SelectField
          label="Place"
          value={place}
          onChange={setPlace}
          groups={placeGroups(availablePlaces)}
        />
      )}
      {!newTruck && <p className="text-sm text-muted-foreground">In stock here now: {bagsText(current)}</p>}
      {purchase && (
        <>
          <div className="flex flex-col gap-2">
            <Label>Source</Label>
            <div className="flex flex-wrap gap-2">
              {DEFAULT_PURCHASE_SOURCES.map((source) => (
                <button
                  key={source}
                  type="button"
                  aria-pressed={purchaseSource === source}
                  className={chipClass(purchaseSource === source)}
                  onClick={() => setPurchaseSource(source)}
                >
                  {source}
                </button>
              ))}
            </div>
            {purchaseSource === "Other" && (
              <Input
                aria-label="Source name"
                placeholder="Source name"
                value={otherSource}
                onChange={(e) => setOtherSource(e.target.value)}
                maxLength={60}
                autoFocus
              />
            )}
          </div>
          <TruckFields value={truck} onChange={setTruck} directEntry knownTrucks={trucks} />
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
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="stock-bags" className="text-sm font-semibold">
          {mode === "adjust" ? "Bags to adjust" : "Number of bags"}
        </Label>
        <Input
          id="stock-bags"
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          placeholder="Enter bags (e.g. 200)"
          value={digits}
          onChange={(e) => setDigits(e.target.value.replace(/\D/g, "").slice(0, 6))}
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          className="h-12 text-lg font-semibold"
        />
      </div>
      {purchase && (
        <>
          <NoteField label={copy.purchase.note} value={note} onChange={setNote} maxLength={PURCHASE_NOTE_MAX} />
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
