"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Keypad } from "@/components/app/keypad";
import { PinnedAction } from "@/components/app/pinned-action";
import { SelectField } from "@/components/app/select-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { hasManyBrands, productGroups, startBrand } from "@/lib/catalogue-rules";
import { NEW_TRUCK_PLACE, placeGroups } from "@/lib/stock-rules";
import { useSubmit } from "@/lib/use-submit";
import { transferStock } from "../actions";
import { TruckFields, type TruckInput } from "../truck-fields";

type ProductOption = { id: string; name: string; channel: string; brandId: string; brand: string };
type PlaceOption = { key: string; kind: string; name: string };
type Balance = { productId: string; placeKey: string; bags: number };

const NO_TRUCK: TruckInput = { number: "", driverName: "", driverPhone: "" };

/**
 * Move bags between places. "To" also offers "New truck…" (a hired truck typed here, like a purchase),
 * so bags can be loaded onto a truck even with only one godown.
 */
export function TransferForm({
  places,
  products,
  balances,
}: {
  places: PlaceOption[];
  products: ProductOption[];
  balances: Balance[];
}) {
  const router = useRouter();
  const { pending, run } = useSubmit();
  // Brand first (only asked when there is more than one), then that brand's products.
  const brands = [...new Map(products.map((p) => [p.brandId, { id: p.brandId, name: p.brand }])).values()];
  const [brandPick, setBrandPick] = useState(products[0]?.brandId ?? "");
  const brandId = startBrand(brands, brandPick);
  const brandProducts = products.filter((p) => p.brandId === brandId);
  const [productPick, setProductPick] = useState(products[0]?.id ?? "");
  const productId = brandProducts.some((p) => p.id === productPick) ? productPick : (brandProducts[0]?.id ?? "");
  const [from, setFrom] = useState(places[0]?.key ?? "");
  // Another place when there is one, else a new hired truck.
  const [toPick, setTo] = useState(places.find((p) => p.key !== places[0]?.key)?.key ?? NEW_TRUCK_PLACE);
  // "To" never offers the "From" place: if they match, the next place (or a new truck) is used.
  const to = toPick !== from ? toPick : (places.find((p) => p.key !== from)?.key ?? NEW_TRUCK_PLACE);
  const [truck, setTruck] = useState(NO_TRUCK);
  const [digits, setDigits] = useState("");
  const [note, setNote] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const newTruck = to === NEW_TRUCK_PLACE;

  const bagsAt = (key: string) => balances.find((b) => b.productId === productId && b.placeKey === key)?.bags ?? 0;
  const bags = Number(digits || 0);

  function submit() {
    setMessage(null);
    run(
      (requestId) =>
        transferStock({ productId, from, to, truck: newTruck ? truck : undefined, bags, note, requestId }),
      (res) => {
        if (res.ok) {
          setMessage({ ok: true, text: "Bags moved." });
          setDigits("");
          setNote("");
          if (newTruck) setTruck(NO_TRUCK);
          router.refresh();
        } else setMessage({ ok: false, text: res.error });
      },
    );
  }

  if (places.length === 0 || products.length === 0) {
    return (
      <p className="rounded-2xl bg-card p-4 text-sm shadow-card ring-1 ring-foreground/6">
        {products.length === 0 ? "No products yet" : "No godown yet"}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {hasManyBrands(brands) && (
        <SelectField
          label="Brand"
          value={brandId}
          onChange={setBrandPick}
          options={brands.map((b) => ({ value: b.id, label: b.name }))}
        />
      )}
      <SelectField label="Product" value={productId} onChange={setProductPick} groups={productGroups(brandProducts)} />
      <SelectField label="From" value={from} onChange={setFrom} groups={placeGroups(places)} />
      <p className="text-sm text-muted-foreground">There now: {bagsAt(from)} bags</p>
      <SelectField
        label="To"
        value={to}
        onChange={setTo}
        groups={[
          ...placeGroups(places.filter((p) => p.key !== from)),
          { label: "Hired truck", options: [{ value: NEW_TRUCK_PLACE, label: "New truck…" }] },
        ]}
      />
      {newTruck && <TruckFields value={truck} onChange={setTruck} />}
      <div className="tabular text-center text-4xl font-bold" aria-live="polite">
        {bags} <span className="text-base font-medium text-muted-foreground">bags</span>
      </div>
      <Keypad value={digits} onChange={setDigits} maxLength={6} />
      <Input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Note (optional)"
        aria-label="Note (optional)"
        maxLength={200}
      />
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
            !productId ||
            from === to ||
            (newTruck && (!truck.number.trim() || !truck.driverName.trim()))
          }
        >
          Move bags
        </Button>
      </PinnedAction>
    </div>
  );
}
