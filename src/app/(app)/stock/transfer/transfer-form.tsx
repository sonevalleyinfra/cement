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
import { NEW_TRUCK_PLACE } from "@/lib/stock-rules";
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
  trucks = [],
  initialFrom,
  initialTo,
}: {
  places: PlaceOption[];
  products: ProductOption[];
  balances: Balance[];
  trucks?: { number: string; driverName: string; driverPhone: string }[];
  initialFrom?: string;
  initialTo?: string;
}) {
  const router = useRouter();
  const { pending, run } = useSubmit();

  // Find places that currently have loaded stock
  const placesWithAnyStock = places.filter((p) =>
    balances.some((b) => b.placeKey === p.key && b.bags > 0),
  );

  // If initialFrom is provided and valid, use it; else if a vehicle has stock, prefer that for unloading; else places[0]
  const startingFrom =
    (initialFrom && places.some((p) => p.key === initialFrom) ? initialFrom : null) ||
    placesWithAnyStock.find((p) => p.kind === "vehicle")?.key ||
    places[0]?.key ||
    "";

  const [from, setFrom] = useState(startingFrom);

  // Determine initial product that actually has stock at 'from'
  const inStockAtStart = balances.filter((b) => b.placeKey === startingFrom && b.bags > 0);
  const bestInitialProd = inStockAtStart[0]
    ? products.find((p) => p.id === inStockAtStart[0].productId)
    : products[0];

  const brands = [...new Map(products.map((p) => [p.brandId, { id: p.brandId, name: p.brand }])).values()];
  const [brandPick, setBrandPick] = useState(bestInitialProd?.brandId ?? products[0]?.brandId ?? "");
  const brandId = startBrand(brands, brandPick);
  const brandProducts = products.filter((p) => p.brandId === brandId);

  const [productPick, setProductPick] = useState(bestInitialProd?.id ?? products[0]?.id ?? "");
  const productId = brandProducts.some((p) => p.id === productPick) ? productPick : (brandProducts[0]?.id ?? "");

  // Another place when there is one, else a new hired truck.
  // If 'from' is a vehicle, prefer godown as destination
  const defaultToPlace = () => {
    if (initialTo && places.some((p) => p.key === initialTo && p.key !== startingFrom)) {
      return initialTo;
    }
    const otherPlaces = places.filter((p) => p.key !== startingFrom);
    const startObj = places.find((p) => p.key === startingFrom);
    if (startObj?.kind === "vehicle") {
      const godown = otherPlaces.find((p) => p.kind === "godown");
      if (godown) return godown.key;
    }
    return otherPlaces[0]?.key ?? NEW_TRUCK_PLACE;
  };

  const [toPick, setTo] = useState(defaultToPlace());
  const to = toPick !== from ? toPick : (places.find((p) => p.key !== from)?.key ?? NEW_TRUCK_PLACE);

  const [truck, setTruck] = useState(NO_TRUCK);
  const [digits, setDigits] = useState("");
  const [note, setNote] = useState("");
  const [done, setDone] = useState("");
  const { error, setError, clearError } = useFormError([productId, from, to, truck, digits, note]);
  const newTruck = to === NEW_TRUCK_PLACE;

  const bagsAt = (key: string) =>
    balances.find((b) => b.productId === productId && b.placeKey === key)?.bags ?? 0;
  const bags = Number(digits || 0);
  const availableBags = bagsAt(from);

  const fromObj = places.find((p) => p.key === from);
  const toObj = places.find((p) => p.key === to);

  function handleFromChange(newFrom: string) {
    setFrom(newFrom);
    // Auto-select product that has stock at this new location
    const inStock = balances.filter((b) => b.placeKey === newFrom && b.bags > 0);
    if (inStock.length > 0) {
      const currentStock = inStock.find((b) => b.productId === productId)?.bags ?? 0;
      if (currentStock === 0) {
        const fullest = inStock.sort((a, b) => b.bags - a.bags)[0];
        const match = products.find((p) => p.id === fullest.productId);
        if (match) {
          setBrandPick(match.brandId);
          setProductPick(match.id);
        }
      }
    }
    // If To matches From, switch To to another place (prefer godown if newFrom is vehicle)
    if (newFrom === toPick || newFrom === to) {
      const others = places.filter((p) => p.key !== newFrom);
      const isVehicle = places.find((p) => p.key === newFrom)?.kind === "vehicle";
      const godown = isVehicle ? others.find((p) => p.kind === "godown") : null;
      setTo(godown ? godown.key : (others[0]?.key ?? NEW_TRUCK_PLACE));
    }
  }

  function placeOptionsWithStock(placeList: PlaceOption[]) {
    return [
      { label: "Godowns", kind: "godown" },
      { label: "Trucks", kind: "vehicle" },
    ]
      .map((g) => ({
        label: g.label,
        options: placeList
          .filter((p) => p.kind === g.kind)
          .map((p) => {
            const stockHere = balances
              .filter((b) => b.placeKey === p.key)
              .reduce((sum, b) => sum + b.bags, 0);
            return {
              value: p.key,
              label: stockHere > 0 ? `${p.name} (${stockHere} bags in stock)` : p.name,
            };
          }),
      }))
      .filter((g) => g.options.length > 0);
  }

  const hint = firstMissing([
    [!productId, "Pick a product"],
    [from === to, "Pick two different places"],
    [newTruck && (!truck.number.trim() || !truck.driverName.trim()), "Enter the truck number and driver"],
    [bags === 0, "Enter the bags"],
    [availableBags === 0, "Selected place has no stock of this product"],
    [bags > availableBags, `Only ${availableBags} bags available at source`],
  ]);

  function submit() {
    setDone("");
    clearError();
    run(
      (requestId) =>
        transferStock({ productId, from, to, truck: newTruck ? truck : undefined, bags, note, requestId }),
      (res) => {
        if (res.ok) {
          setDone("Bags moved successfully.");
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

      <SelectField label="From (Source)" value={from} onChange={handleFromChange} groups={placeOptionsWithStock(places)} />

      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>
          Available to move: <strong className="text-foreground">{availableBags} bags</strong>
        </span>
        {availableBags > 0 && bags !== availableBags && (
          <button
            type="button"
            onClick={() => setDigits(String(availableBags))}
            className="font-bold text-primary hover:underline"
          >
            Move all {availableBags} bags
          </button>
        )}
      </div>

      <SelectField
        label="To (Destination)"
        value={to}
        onChange={setTo}
        groups={[
          ...placeOptionsWithStock(places.filter((p) => p.key !== from)),
          { label: "Hired truck", options: [{ value: NEW_TRUCK_PLACE, label: "New truck…" }] },
        ]}
      />
      {newTruck && <TruckFields value={truck} onChange={setTruck} knownTrucks={trucks} phoneOptional />}

      {bags > availableBags && availableBags > 0 && (
        <p className="text-xs font-semibold text-amber-600 dark:text-amber-400">
          Only {availableBags} bags available in source place. (You entered {bags} bags)
        </p>
      )}

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
        <p role="status" className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">
          {done}
        </p>
      )}
      <PinnedAction>
        <FormHint>{hint}</FormHint>
        <Button onClick={submit} disabled={pending || hint !== null}>
          {fromObj?.kind === "vehicle" && toObj?.kind === "godown"
            ? `Unload to ${toObj.name}`
            : "Move bags"}
        </Button>
      </PinnedAction>
    </div>
  );
}
