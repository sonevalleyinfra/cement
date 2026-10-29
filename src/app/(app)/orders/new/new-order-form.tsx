"use client";

import { ChevronDown, MapPin } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useId, useState, type ReactNode } from "react";
import { chipClass } from "@/components/app/chip";
import { FormHint } from "@/components/app/form-hint";
import { Keypad } from "@/components/app/keypad";
import { PageHeader } from "@/components/app/page-header";
import { PinnedAction } from "@/components/app/pinned-action";
import { RateField } from "@/components/app/rate-field";
import { RateHints, StockHintLine } from "@/components/app/rate-hints";
import { SelectField } from "@/components/app/select-field";
import { Sheet } from "@/components/app/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { productGroups } from "@/lib/catalogue-rules";
import { firstMissing } from "@/lib/form-rules";
import {
  addDaysToKey,
  DELIVER_TO,
  DELIVER_TO_LABELS,
  MAX_ORDER_NOTE,
  MAX_RECEIVER_NAME,
  MAX_REQUIRED_BY_DAYS,
  MAX_SITE_ADDRESS,
  ORDER_SOURCE_LABELS,
  STAFF_ORDER_SOURCES,
  type DeliverTo,
} from "@/lib/order-delivery-rules";
import { useFormError } from "@/lib/use-form-error";
import { useSubmit } from "@/lib/use-submit";
import { placeOrder } from "../actions";
import { getOrderHints, type OrderHints } from "../hints-actions";

type Retailer = { id: string; name: string; place: string; address?: string | null; pincode?: string | null };
type Product = { id: string; name: string; channel: string; brand: string };

/** Equal-width chips, 2 per row, where exactly one is picked (Source, Deliver to). */
function ChipChoice<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <Label id={id}>{label}</Label>
      <div role="radiogroup" aria-labelledby={id} className="grid grid-cols-2 gap-2">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={o.value === value}
            className={chipClass(o.value === value, "w-full")}
            onClick={() => onChange(o.value)}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: (id: string) => ReactNode }) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children(id)}
    </div>
  );
}

export function NewOrderForm({
  retailers,
  products,
  fixedRetailerId,
  initialRetailerId = null,
  askRate,
  defaultSource,
  todayKey,
}: {
  retailers: Retailer[];
  products: Product[];
  fixedRetailerId: string | null;
  /** From `?retailer=`, already checked against `retailers` on the server. */
  initialRetailerId?: string | null;
  /** Staff type the rate per bag; a retailer never sees it. */
  askRate: boolean;
  /** Staff: the Source chip picked first (by role). Null for a shop's own login (always "Shop app"). */
  defaultSource: string | null;
  /** Today in India ("YYYY-MM-DD"): the first day "Needed by" allows. */
  todayKey: string;
}) {
  const router = useRouter();
  const [retailerId, setRetailerId] = useState<string | null>(fixedRetailerId ?? initialRetailerId);
  const [productId, setProductId] = useState<string | null>(products[0]?.id ?? null);
  const [bags, setBags] = useState("");
  const [rate, setRate] = useState("");
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [source, setSource] = useState(defaultSource ?? "");
  const [deliverTo, setDeliverTo] = useState<DeliverTo>("shop");
  const [siteAddress, setSiteAddress] = useState("");
  const [receiverName, setReceiverName] = useState("");
  const [receiverPhone, setReceiverPhone] = useState("");
  const [requiredBy, setRequiredBy] = useState("");
  const [shopNote, setShopNote] = useState("");
  const [staffNote, setStaffNote] = useState("");
  // The error goes away as soon as any field is changed.
  const { error, setError, clearError } = useFormError([
    retailerId,
    productId,
    bags,
    rate,
    source,
    deliverTo,
    siteAddress,
    receiverName,
    receiverPhone,
    requiredBy,
    shopNote,
    staffNote,
  ]);
  const staff = defaultSource !== null;
  const { pending, run } = useSubmit();
  // Staff only: the shop's last rate, this week's range and the stock, for the picked shop and product.
  const [hints, setHints] = useState<{ key: string; data: OrderHints | null } | null>(null);
  const hintKey = `${retailerId ?? ""}:${productId ?? ""}`;

  useEffect(() => {
    if (!askRate || !productId) return;
    let stale = false;
    getOrderHints({ retailerId, productId })
      .then((data) => {
        if (!stale) setHints({ key: `${retailerId ?? ""}:${productId}`, data });
      })
      .catch(() => {
        if (!stale) setHints({ key: `${retailerId ?? ""}:${productId}`, data: null });
      });
    return () => {
      stale = true;
    };
  }, [askRate, retailerId, productId]);
  // Hints for another shop or product are never shown while the new ones load.
  const current = hints?.key === hintKey ? hints.data : null;

  const retailer = retailers.find((r) => r.id === retailerId);
  const q = search.trim().toLowerCase();
  const shown = q
    ? retailers.filter((r) => `${r.name} ${r.place}`.toLowerCase().includes(q))
    : retailers;

  const site = deliverTo === "site";
  const hint = firstMissing([
    [Number(bags || 0) <= 0, "Enter the bags"],
    [site && !siteAddress.trim(), "Enter the site address"],
    [site && !receiverPhone.trim(), "Enter the receiver's phone"],
  ]);

  function submit() {
    clearError();
    run(
      (requestId) =>
        placeOrder({
          retailerId,
          productId,
          bags: Number(bags || 0),
          rateRupees: askRate ? rate : undefined,
          deliverTo,
          siteAddress: site ? siteAddress : "",
          receiverName,
          receiverPhone,
          requiredBy,
          source: staff ? source : undefined,
          shopNote,
          staffNote: staff ? staffNote : undefined,
          requestId,
        }),
      (res) => {
        if (res.ok) router.push("/orders");
        else setError(res.error);
      },
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="New order" back="/orders" />

      {fixedRetailerId ? (
        <div className="rounded-2xl bg-card p-4 text-base font-semibold shadow-card ring-1 ring-foreground/6">
          {retailer?.name}
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          <Label>Retailer</Label>
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="flex h-14 items-center justify-between gap-2 rounded-2xl bg-card px-4 text-left text-base font-semibold shadow-card ring-1 ring-foreground/6"
          >
            {retailer ? retailer.name : <span className="text-muted-foreground">Pick retailer</span>}
            <ChevronDown className="size-5 shrink-0 text-muted-foreground" aria-hidden />
          </button>
        </div>
      )}

      <div className="flex flex-col gap-1">
        <SelectField label="Product" value={productId ?? ""} onChange={setProductId} groups={productGroups(products)} />
        {askRate && <StockHintLine stockBags={current?.stockBags ?? null} bags={Number(bags || 0)} />}
      </div>

      <div className="tabular text-center text-5xl font-bold">
        {bags || "0"}
        <span className="ml-2 text-lg font-medium text-muted-foreground">bags</span>
      </div>
      <Keypad value={bags} onChange={setBags} maxLength={6} />

      {askRate && (
        <RateField value={rate} onChange={setRate} bags={Number(bags || 0)}>
          <RateHints hint={current?.rate ?? null} rateText={rate} />
        </RateField>
      )}

      <ChipChoice
        label="Deliver to"
        options={DELIVER_TO.map((v) => ({ value: v, label: DELIVER_TO_LABELS[v] }))}
        value={deliverTo}
        onChange={setDeliverTo}
      />
      {!site && retailer && (
        <div className="flex items-start gap-2.5 rounded-2xl bg-muted/50 p-3.5 text-xs text-muted-foreground ring-1 ring-foreground/6">
          <MapPin className="size-4 shrink-0 text-primary mt-0.5" aria-hidden />
          <div className="min-w-0">
            <span className="font-semibold text-foreground">Delivery to Shop: </span>
            {[retailer.address, retailer.place, retailer.pincode].filter(Boolean).join(", ") || "Shop address not set"}
          </div>
        </div>
      )}
      {site && (
        <div className="animate-in-up flex flex-col gap-4">
          <Field label="Site address">
            {(id) => (
              <Input
                id={id}
                value={siteAddress}
                onChange={(e) => setSiteAddress(e.target.value)}
                maxLength={MAX_SITE_ADDRESS}
                autoComplete="off"
              />
            )}
          </Field>
          <Field label="Receiver name (optional)">
            {(id) => (
              <Input
                id={id}
                value={receiverName}
                onChange={(e) => setReceiverName(e.target.value)}
                maxLength={MAX_RECEIVER_NAME}
                autoComplete="off"
              />
            )}
          </Field>
          <Field label="Receiver phone">
            {(id) => (
              <Input
                id={id}
                type="tel"
                inputMode="numeric"
                value={receiverPhone}
                onChange={(e) => setReceiverPhone(e.target.value)}
                maxLength={16}
                autoComplete="off"
              />
            )}
          </Field>
        </div>
      )}

      <Field label="Needed by (optional)">
        {(id) => (
          <Input
            id={id}
            type="date"
            value={requiredBy}
            min={todayKey}
            max={addDaysToKey(todayKey, MAX_REQUIRED_BY_DAYS)}
            onChange={(e) => setRequiredBy(e.target.value)}
          />
        )}
      </Field>

      {staff && (
        <ChipChoice
          label="Source"
          options={STAFF_ORDER_SOURCES.map((v) => ({ value: v, label: ORDER_SOURCE_LABELS[v] }))}
          value={source}
          onChange={setSource}
        />
      )}

      <Field label={staff ? "Note for shop (optional)" : "Note (optional)"}>
        {(id) => (
          <Input
            id={id}
            value={shopNote}
            onChange={(e) => setShopNote(e.target.value)}
            maxLength={MAX_ORDER_NOTE}
            autoComplete="off"
          />
        )}
      </Field>
      {staff && (
        <Field label="Staff note (optional)">
          {(id) => (
            <Input
              id={id}
              value={staffNote}
              onChange={(e) => setStaffNote(e.target.value)}
              maxLength={MAX_ORDER_NOTE}
              autoComplete="off"
            />
          )}
        </Field>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}
      <PinnedAction>
        <FormHint>{hint}</FormHint>
        <Button onClick={submit} disabled={pending || hint !== null}>
          Place order
        </Button>
      </PinnedAction>

      <Sheet open={open} onOpenChange={setOpen} title="Retailer">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search"
          autoComplete="off"
          className="mb-3"
        />
        <ul className="flex flex-col gap-2">
          {shown.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                onClick={() => {
                  setRetailerId(r.id);
                  setOpen(false);
                  setSearch("");
                }}
                className="flex min-h-12 w-full flex-col items-start rounded-2xl bg-card px-4 py-2.5 text-left shadow-card ring-1 ring-foreground/6"
              >
                <span className="font-semibold">{r.name}</span>
                {r.place && <span className="text-xs text-muted-foreground">{r.place}</span>}
              </button>
            </li>
          ))}
          {shown.length === 0 && <li className="py-6 text-center text-muted-foreground">No match</li>}
        </ul>
      </Sheet>
    </div>
  );
}
