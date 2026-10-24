"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { FormHint } from "@/components/app/form-hint";
import { Keypad } from "@/components/app/keypad";
import { PinnedAction } from "@/components/app/pinned-action";
import { SelectField } from "@/components/app/select-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { hasManyBrands, productGroups, startBrand } from "@/lib/catalogue-rules";
import { firstMissing } from "@/lib/form-rules";
import { NEW_TRUCK_PLACE, placeGroups } from "@/lib/stock-rules";
import { useFormError } from "@/lib/use-form-error";
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
  // "Bags moved." stays until the next save; an error goes away as soon as any field changes.
  const [done, setDone] = useState("");
  const { error, setError, clearError } = useFormError([productId, from, to, truck, digits, note]);
  const newTruck = to === NEW_TRUCK_PLACE;

  const bagsAt = (key: string) => balances.find((b) => b.productId === productId && b.placeKey === key)?.bags ?? 0;
  const bags = Number(digits || 0);

  const hint = firstMissing([
    [!productId, "Pick a product"],
    [from === to, "Pick two different places"],
    [newTruck && (!truck.number.trim() || !truck.driverName.trim()), "Enter the truck number and driver"],
    [bags === 0, "Enter the bags"],
  ]);

  function submit() {
    setDone("");
    clearError();
    run(
      (requestId) =>
        transferStock({ productId, from, to, truck: newTruck ? truck : undefined, bags, note, requestId }),
      (res) => {
        if (res.ok) {
          setDone("Bags moved.");
          setDigits("");
          setNote("");
          if (newTruck) setTruck(NO_TRUCK);
          router.refresh();
        } else setError(res.error);
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
      {newTruck && <TruckFields value={truck} onChange={setTruck} phoneOptional />}
      <div className="tabular text-center text-4xl font-bold" aria-live="polite">
        {bags} <span className="text-base font-medium text-muted-foreground">bags</span>
      </div>
      <Keypad value={digits} onChange={setDigits} maxLength={6} />
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="transfer-note">Note (optional)</Label>
        <Input id="transfer-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} />
      </div>
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
          Move bags
        </Button>
      </PinnedAction>
    </div>
  );
}
