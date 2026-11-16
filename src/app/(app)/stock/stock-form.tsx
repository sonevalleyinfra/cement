"use client";

import { useRouter } from "next/navigation";
import { type ComponentProps, useId, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { chipClass } from "@/components/app/chip";
import { FormHint } from "@/components/app/form-hint";
import { PinnedAction } from "@/components/app/pinned-action";
import { PostActionDialog } from "@/components/app/post-action-dialog";
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
import { HintLine } from "@/components/app/hint-line";
import { DEFAULT_PURCHASE_SOURCES, PURCHASE_NOTE_MAX, loadedTruckError, purchaseNote } from "@/lib/purchase-rules";
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
  trucks?: { number: string; driverName: string; driverPhone: string; bags?: number }[];
}) {
  const router = useRouter();
  const { pending, run } = useSubmit();
  const purchase = mode === "purchase";
  const availablePlaces = places;

  // Product 1
  const [pick, setPick] = useState({ brandId: products[0]?.brandId ?? "", channel: "", typeId: "", gradeId: "", productId: "" });
  const [place, setPlace] = useState(purchase ? NEW_TRUCK_PLACE : (places[0]?.key ?? ""));
  const [digits, setDigits] = useState("");
  const [minus, setMinus] = useState(false);
  const [note, setNote] = useState("");
  const [reason, setReason] = useState<string | null>(null);

  // Purchase only: cost (typed in rupees), supplier invoice, and truck
  const [costText, setCostText] = useState("");
  const [invoiceNo, setInvoiceNo] = useState("");
  const [today] = useState(() => toISTDateKey(new Date()));
  const [invoiceDate, setInvoiceDate] = useState(today);
  const [truck, setTruck] = useState(NO_TRUCK);
  const [purchaseSource, setPurchaseSource] = useState<string>(DEFAULT_PURCHASE_SOURCES[0]);
  const [otherSource, setOtherSource] = useState("");
  const newTruck = purchase;

  // Product 2 (Optional for purchase, up to 2 products per truckload)
  const [hasSecondProduct, setHasSecondProduct] = useState(false);
  const [pick2, setPick2] = useState({ channel: "", typeId: "", gradeId: "", productId: "" });
  const [digits2, setDigits2] = useState("");
  const [costText2, setCostText2] = useState("");

  const [done, setDone] = useState("");
  const [showHomePrompt, setShowHomePrompt] = useState(false);
  const { error, setError, clearError } = useFormError([
    pick,
    pick2,
    hasSecondProduct,
    place,
    digits,
    digits2,
    minus,
    note,
    reason,
    costText,
    costText2,
    invoiceNo,
    invoiceDate,
    truck,
  ]);

  // Brand first
  const brandId = startBrand(lists.brands, pick.brandId);
  const brandName = lists.brands.find((b) => b.id === brandId)?.name ?? "";
  const brandProducts = products.filter((p) => p.brandId === brandId);
  const channels = PRODUCT_CHANNELS.filter((c) => brandProducts.some((p) => p.channel === c));

  // Product 1 derivation
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

  // Product 2 derivation
  const currentChannel2 = (channels as readonly string[]).includes(pick2.channel)
    ? (pick2.channel as ProductChannel)
    : currentChannel;
  const channelProducts2 = brandProducts.filter((p) => p.channel === currentChannel2);
  const product2 =
    channelProducts2.find((p) => p.id === pick2.productId || p.gradeId === pick2.gradeId) ??
    channelProducts2[0] ??
    null;
  const gradeId2 = product2?.gradeId ?? "";
  const typeId2 = lists.grades.find((g) => g.id === gradeId2)?.typeId ?? lists.types[0]?.id ?? "";
  const bags2 = Number(digits2 || 0);
  const costPaise2 = parseRupeesToPaise(costText2);
  const costOk2 = costPaise2 !== null && costPaise2 >= 1;

  // Truck empty check
  const cleanTruckNo = truck.number.toUpperCase().replace(/\s+/g, "");
  const loadedTruck = trucks.find(
    (t) => t.number.toUpperCase().replace(/\s+/g, "") === cleanTruckNo
  );
  const truckBusy = cleanTruckNo && loadedTruck ? loadedTruckError(cleanTruckNo, loadedTruck.bags ?? 0) : null;
  const isTruckLoaded = truckBusy !== null;

  const why = mode === "adjust" ? reasonHint("stock", reason, note) : null;
  const hint = firstMissing([
    [!product, "Pick a product"],
    [!place, "Pick a place"],
    [purchase && !truck.number.trim(), "Enter the truck number"],
    [purchase && isTruckLoaded, "Empty this truck first"],
    [purchase && !truck.driverName.trim(), "Enter the driver name"],
    [purchase && !isValidIndianMobile(normalizePhone(truck.driverPhone)), "Enter the driver mobile (10 digits)"],
    [purchase && !invoiceNo.trim(), "Enter the invoice no."],
    [purchase && !invoiceDate, "Pick the invoice date"],
    [bags === 0, purchase && hasSecondProduct ? "Enter bags for Product 1" : "Enter the bags"],
    [why !== null, why ?? ""],
    [purchase && !costOk, purchase && hasSecondProduct ? "Enter cost per bag for Product 1" : "Enter the cost per bag"],
    [purchase && hasSecondProduct && !product2, "Pick the second product"],
    [purchase && hasSecondProduct && product && product2 && product.id === product2.id, "Second product must be different from first product"],
    [purchase && hasSecondProduct && bags2 === 0, "Enter bags for Product 2"],
    [purchase && hasSecondProduct && !costOk2, "Enter cost per bag for Product 2"],
  ]);

  function submit() {
    setDone("");
    clearError();

    const items = hasSecondProduct
      ? [
          {
            brandId,
            channel: currentChannel,
            typeId,
            gradeId,
            productId: product?.id,
            bags,
            costPerBagPaise: costPaise!,
            shortBags: 0,
            burstBags: 0,
          },
          {
            brandId,
            channel: currentChannel2,
            typeId: typeId2,
            gradeId: gradeId2,
            productId: product2?.id,
            bags: bags2,
            costPerBagPaise: costPaise2!,
            shortBags: 0,
            burstBags: 0,
          },
        ]
      : [
          {
            brandId,
            channel: currentChannel,
            typeId,
            gradeId,
            productId: product?.id,
            bags,
            costPerBagPaise: costPaise!,
            shortBags: 0,
            burstBags: 0,
          },
        ];

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
            items,
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
          setDigits("");
          setMinus(false);
          setNote("");
          setReason(null);
          setCostText("");
          setDigits2("");
          setCostText2("");
          setHasSecondProduct(false);
          setInvoiceNo("");
          setInvoiceDate(today);
          setTruck(NO_TRUCK);
          router.refresh();
          setShowHomePrompt(true);
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
          onChange={(id) => {
            setPick({ brandId: id, channel: "", typeId: "", gradeId: "", productId: "" });
            setPick2({ channel: "", typeId: "", gradeId: "", productId: "" });
          }}
          options={lists.brands.map((b) => ({ value: b.id, label: b.name }))}
        />
      )}

      {/* Non-purchase mode (Opening / Adjust) product fields */}
      {!purchase && (
        <>
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
          <SelectField
            label="Place"
            value={place}
            onChange={setPlace}
            groups={placeGroups(availablePlaces)}
          />
          {!newTruck && <p className="text-sm text-muted-foreground">In stock here now: {bagsText(current)}</p>}
        </>
      )}

      {/* Purchase Mode Fields */}
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

          <div className="flex flex-col gap-2">
            <TruckFields
              value={truck}
              onChange={setTruck}
              directEntry
              knownTrucks={trucks}
              numberHint={truckBusy ? <HintLine tone="risk">{truckBusy}</HintLine> : null}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <SmallField label="Invoice no." value={invoiceNo} onChange={setInvoiceNo} maxLength={60} />
            <SmallField label="Invoice date" type="date" value={invoiceDate} onChange={setInvoiceDate} max={today} />
          </div>

          {/* Product 1 Block */}
          <div className="rounded-2xl bg-card p-3 shadow-card ring-1 ring-foreground/6 flex flex-col gap-3">
            <div className="flex items-center justify-between pb-1 border-b border-border/50">
              <span className="font-semibold text-sm text-foreground">
                {hasSecondProduct ? "Product 1" : "Product Details"}
              </span>
              {product && (
                <span className="text-xs text-muted-foreground font-medium">
                  {product.name}
                </span>
              )}
            </div>

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

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="stock-bags-1" className="text-sm font-semibold">
                  Bags
                </Label>
                <Input
                  id="stock-bags-1"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  placeholder="e.g. 200"
                  value={digits}
                  onChange={(e) => setDigits(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  autoComplete="off"
                  className="h-11 font-semibold"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="cost-1" className="text-sm font-semibold">
                  Cost per bag (₹)
                </Label>
                <Input
                  id="cost-1"
                  type="text"
                  inputMode="decimal"
                  placeholder="e.g. 522"
                  value={costText}
                  onChange={(e) => setCostText(e.target.value)}
                  autoComplete="off"
                  className="h-11 font-semibold"
                />
              </div>
            </div>
          </div>

          {/* Product 2 Block */}
          {hasSecondProduct ? (
            <div className="rounded-2xl bg-card p-3 shadow-card ring-1 ring-foreground/6 flex flex-col gap-3">
              <div className="flex items-center justify-between pb-1 border-b border-border/50">
                <span className="font-semibold text-sm text-foreground">Product 2</span>
                <button
                  type="button"
                  className="text-xs text-rose-600 dark:text-rose-400 font-medium hover:underline flex items-center gap-1"
                  onClick={() => {
                    setHasSecondProduct(false);
                    setDigits2("");
                    setCostText2("");
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Remove
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <SelectField
                  label="Trade-type"
                  value={currentChannel2}
                  onChange={(channel) => setPick2({ channel, typeId: "", gradeId: "", productId: "" })}
                  options={channels.map((c) => ({ value: c, label: CHANNEL_LABELS[c] }))}
                />
                <SelectField
                  label="Cement Name / Variant"
                  value={product2?.id ?? ""}
                  onChange={(prodId) => {
                    const p = channelProducts2.find((x) => x.id === prodId);
                    const tId = lists.grades.find((g) => g.id === p?.gradeId)?.typeId ?? "";
                    setPick2({
                      channel: currentChannel2,
                      typeId: tId,
                      gradeId: p?.gradeId ?? "",
                      productId: p?.id ?? "",
                    });
                  }}
                  options={channelProducts2.map((p) => ({
                    value: p.id,
                    label: variantLabel(p, lists.grades),
                  }))}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="stock-bags-2" className="text-sm font-semibold">
                    Bags
                  </Label>
                  <Input
                    id="stock-bags-2"
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    placeholder="e.g. 200"
                    value={digits2}
                    onChange={(e) => setDigits2(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    autoComplete="off"
                    className="h-11 font-semibold"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="cost-2" className="text-sm font-semibold">
                    Cost per bag (₹)
                  </Label>
                  <Input
                    id="cost-2"
                    type="text"
                    inputMode="decimal"
                    placeholder="e.g. 522"
                    value={costText2}
                    onChange={(e) => setCostText2(e.target.value)}
                    autoComplete="off"
                    className="h-11 font-semibold"
                  />
                </div>
              </div>
            </div>
          ) : (
            <Button
              type="button"
              variant="outline"
              className="w-full border-dashed py-3 flex items-center justify-center gap-2 text-primary font-medium hover:bg-primary/5 active:scale-[0.99] transition-all"
              onClick={() => {
                const otherProd = channelProducts.find((p) => p.id !== product?.id) ?? channelProducts[0];
                const otherGrade = otherProd?.gradeId ?? "";
                const otherType = lists.grades.find((g) => g.id === otherGrade)?.typeId ?? lists.types[0]?.id ?? "";
                setPick2({
                  channel: currentChannel,
                  typeId: otherType,
                  gradeId: otherGrade,
                  productId: otherProd?.id ?? "",
                });
                setHasSecondProduct(true);
              }}
            >
              <Plus className="h-4 w-4" />
              + Add Second Product (Optional)
            </Button>
          )}

          {/* Total & Summary */}
          {hasSecondProduct ? (
            <div className="rounded-2xl bg-card p-3 shadow-card ring-1 ring-foreground/6 flex flex-col gap-2 text-xs">
              <div className="flex justify-between items-center text-muted-foreground">
                <span>{product?.name ?? "Product 1"}</span>
                <span>{bags} bags × ₹{costText || "0"} = ₹{(((bags * (costPaise ?? 0))) / 100).toLocaleString("en-IN")}</span>
              </div>
              <div className="flex justify-between items-center text-muted-foreground">
                <span>{product2?.name ?? "Product 2"}</span>
                <span>{bags2} bags × ₹{costText2 || "0"} = ₹{(((bags2 * (costPaise2 ?? 0))) / 100).toLocaleString("en-IN")}</span>
              </div>
              <div className="border-t border-border/60 pt-1.5 flex justify-between items-center font-semibold text-sm text-foreground">
                <span>Total Truck Load: {bags + bags2} bags</span>
                <span>Owed to {brandName}: ₹{((((bags * (costPaise ?? 0)) + (bags2 * (costPaise2 ?? 0)))) / 100).toLocaleString("en-IN")}</span>
              </div>
            </div>
          ) : (
            costPaise && costPaise > 0 && bags > 0 ? (
              <div className="rounded-2xl bg-card p-3 shadow-card ring-1 ring-foreground/6 flex justify-between items-center text-sm">
                <span className="text-muted-foreground">Total ({bags} bags):</span>
                <span className="font-bold text-foreground">₹{(((bags * costPaise)) / 100).toLocaleString("en-IN")}</span>
              </div>
            ) : null
          )}

          <NoteField label={copy.purchase.note} value={note} onChange={setNote} maxLength={PURCHASE_NOTE_MAX} />
        </>
      )}

      {/* Adjust Mode extra fields */}
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

      {/* Opening / Adjust bags input */}
      {!purchase && (
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
      )}

      {mode === "adjust" && (
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

      <PostActionDialog
        open={showHomePrompt}
        title={mode === "purchase" ? "Purchase added" : mode === "opening" ? "Opening stock set" : "Adjustment saved"}
        message="Stock is updated."
        primaryLabel="Home"
        secondaryLabel={mode === "purchase" ? "Add another" : "Stay here"}
        primaryHref="/dashboard"
        onSecondary={() => setShowHomePrompt(false)}
      />
    </div>
  );
}
