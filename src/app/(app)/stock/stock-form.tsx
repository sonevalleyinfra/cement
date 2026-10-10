"use client";

import { Pencil } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Keypad } from "@/components/app/keypad";
import { PinnedAction } from "@/components/app/pinned-action";
import { SelectField } from "@/components/app/select-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { CatalogueList } from "../catalogue/actions";
import {
  CHANNEL_LABELS,
  DEFAULT_BAG_KG,
  findProductByParts,
  PRODUCT_CHANNELS,
} from "@/lib/catalogue-rules";
import { NEW_TRUCK_PLACE, placeGroups } from "@/lib/stock-rules";
import { recordAdjustment, recordOpening, recordPurchase } from "./actions";
import { ListEditorSheet } from "./list-editor-sheet";

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
  adjust: { button: "Save adjustment", note: "Reason (required)", done: "Adjustment saved." },
} as const;

export function StockForm({
  mode,
  places,
  products,
  balances,
  lists,
  canManageCatalogue,
}: {
  mode: keyof typeof copy;
  places: PlaceOption[];
  products: ProductOption[];
  balances: Balance[];
  /** Brands, types and grades for the four product drop-downs. */
  lists: Lists;
  /** Shows the edit buttons next to the drop-downs (purchase, admin only). */
  canManageCatalogue: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const first = products[0];
  const [brandPick, setBrandPick] = useState(first?.brandId ?? "");
  const [channel, setChannel] = useState(first?.channel ?? PRODUCT_CHANNELS[0]);
  const [typePick, setTypePick] = useState(lists.grades.find((g) => g.id === first?.gradeId)?.typeId ?? "");
  const [gradePick, setGradePick] = useState(first?.gradeId ?? "");
  const [editing, setEditing] = useState<CatalogueList | null>(null);
  const [place, setPlace] = useState(places[0]?.key ?? (mode === "purchase" ? NEW_TRUCK_PLACE : ""));
  const [digits, setDigits] = useState("");
  const [minus, setMinus] = useState(false);
  const [note, setNote] = useState("");
  // The quick truck form (purchase into a hired truck): nothing about the truck is saved for next time.
  const [truck, setTruck] = useState({ number: "", driverName: "", driverPhone: "" });
  const newTruck = mode === "purchase" && place === NEW_TRUCK_PLACE;
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  // A pick that left the list (removed, or a grade of another type) falls back to the first one.
  const brandId = lists.brands.some((b) => b.id === brandPick) ? brandPick : (lists.brands[0]?.id ?? "");
  const typeId = lists.types.some((t) => t.id === typePick) ? typePick : (lists.types[0]?.id ?? "");
  const typeGrades = lists.grades.filter((g) => g.typeId === typeId);
  const gradeId = typeGrades.some((g) => g.id === gradePick) ? gradePick : (typeGrades[0]?.id ?? "");
  const typeCode = lists.types.find((t) => t.id === typeId)?.code ?? "";
  const picked = Boolean(brandId && typeId && gradeId);
  const product = findProductByParts(products, { brandId, channel, gradeId, bagKg: DEFAULT_BAG_KG });
  const missing = picked && !product;

  const current = product ? (balances.find((b) => b.productId === product.id && b.placeKey === place)?.bags ?? 0) : 0;
  const bags = Number(digits || 0);

  function submit() {
    setMessage(null);
    const input = {
      brandId,
      channel,
      typeId,
      gradeId,
      place,
      truck: newTruck ? truck : undefined,
      bags: mode === "adjust" && minus ? -bags : bags,
      note,
    };
    start(async () => {
      const action = mode === "purchase" ? recordPurchase : mode === "opening" ? recordOpening : recordAdjustment;
      const res = await action(input);
      if (res.ok) {
        setMessage({ ok: true, text: copy[mode].done });
        setDigits("");
        setNote("");
        setTruck({ number: "", driverName: "", driverPhone: "" });
        router.refresh();
      } else setMessage({ ok: false, text: res.error });
    });
  }

  if ((places.length === 0 && mode !== "purchase") || (products.length === 0 && !canManageCatalogue)) {
    return (
      <p className="rounded-2xl bg-card p-4 text-sm shadow-card ring-1 ring-foreground/6">
        {places.length === 0 ? "Add a godown or vehicle first." : "Add a product first."}
      </p>
    );
  }

  const edit = (list: CatalogueList, label: string) =>
    canManageCatalogue ? (
      <button
        type="button"
        onClick={() => setEditing(list)}
        aria-label={`Edit ${label}`}
        className="-my-3.5 -mr-3 flex size-12 items-center justify-center rounded-xl text-muted-foreground transition-[background-color,transform] duration-150 ease-out hover:bg-muted active:scale-[0.95]"
      >
        <Pencil className="size-4" />
      </button>
    ) : undefined;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3">
        <SelectField
          label="Brand"
          value={brandId}
          onChange={setBrandPick}
          options={lists.brands.map((b) => ({ value: b.id, label: b.name }))}
          placeholder={lists.brands.length === 0 ? "Add one" : undefined}
          action={edit("brand", "brands")}
        />
        <SelectField
          label="Trade-type"
          value={channel}
          onChange={setChannel}
          options={PRODUCT_CHANNELS.map((c) => ({ value: c, label: CHANNEL_LABELS[c] }))}
        />
        <SelectField
          label="Type"
          value={typeId}
          onChange={setTypePick}
          options={lists.types.map((t) => ({ value: t.id, label: t.code }))}
          placeholder={lists.types.length === 0 ? "Add one" : undefined}
          action={edit("cement_type", "types")}
        />
        <SelectField
          label="Grade"
          value={gradeId}
          onChange={setGradePick}
          options={typeGrades.map((g) => ({ value: g.id, label: g.name }))}
          placeholder={typeGrades.length === 0 ? "Add one" : undefined}
          action={typeId ? edit("grade", "grades") : undefined}
        />
      </div>
      {missing && (
        <p className={mode === "purchase" ? "text-sm font-medium text-primary" : "text-sm text-destructive"}>
          {mode === "purchase" ? "New product" : "Not in catalogue"}
        </p>
      )}
      <SelectField
        label="Place"
        value={place}
        onChange={setPlace}
        placeholder={places.length === 0 && mode !== "purchase" ? "Add a godown first" : undefined}
        groups={[
          ...placeGroups(places),
          ...(mode === "purchase" ? [{ label: "Hired truck", options: [{ value: NEW_TRUCK_PLACE, label: "New truck…" }] }] : []),
        ]}
      />
      {newTruck ? (
        <div className="animate-in-up flex flex-col gap-2 rounded-2xl bg-card p-3 shadow-card ring-1 ring-foreground/6">
          <Input
            value={truck.number}
            onChange={(e) => setTruck({ ...truck, number: e.target.value.toUpperCase() })}
            placeholder="Truck number, e.g. BR01AB1234"
            aria-label="Truck number"
            autoCapitalize="characters"
            autoComplete="off"
            maxLength={14}
          />
          <Input
            value={truck.driverName}
            onChange={(e) => setTruck({ ...truck, driverName: e.target.value })}
            placeholder="Driver name"
            aria-label="Driver name"
            maxLength={80}
          />
          <Input
            value={truck.driverPhone}
            onChange={(e) => setTruck({ ...truck, driverPhone: e.target.value })}
            placeholder="Driver phone (optional)"
            aria-label="Driver phone"
            inputMode="tel"
            maxLength={14}
          />
        </div>
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
            !picked ||
            !place ||
            (newTruck && (!truck.number.trim() || !truck.driverName.trim())) ||
            (missing && mode !== "purchase") ||
            (mode === "adjust" && !note.trim())
          }
        >
          {copy[mode].button}
        </Button>
      </PinnedAction>
      {canManageCatalogue && (
        <>
          <ListEditorSheet
            kind="brand"
            title="Brands"
            items={lists.brands}
            open={editing === "brand"}
            onOpenChange={(o) => setEditing(o ? "brand" : null)}
            onAdded={setBrandPick}
          />
          <ListEditorSheet
            kind="cement_type"
            title="Types"
            items={lists.types}
            open={editing === "cement_type"}
            onOpenChange={(o) => setEditing(o ? "cement_type" : null)}
            onAdded={setTypePick}
          />
          <ListEditorSheet
            kind="grade"
            title={`Grades (${typeCode})`}
            items={typeGrades}
            typeId={typeId}
            open={editing === "grade"}
            onOpenChange={(o) => setEditing(o ? "grade" : null)}
            onAdded={setGradePick}
          />
        </>
      )}
    </div>
  );
}
