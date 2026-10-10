"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Keypad } from "@/components/app/keypad";
import { PinnedAction } from "@/components/app/pinned-action";
import { SelectField } from "@/components/app/select-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { productGroups } from "@/lib/catalogue-rules";
import { recordAdjustment, recordOpening, recordPurchase } from "./actions";

type Option = { id: string; name: string };
type ProductOption = Option & { channel: string };
type Balance = { productId: string; locationId: string; bags: number };

const selectClass = "h-11 w-full rounded-xl border bg-background px-3 text-base";

const copy = {
  purchase: { button: "Add purchase", note: "Supplier / note (optional)", done: "Purchase added." },
  opening: { button: "Set opening stock", note: "", done: "Opening stock set." },
  adjust: { button: "Save adjustment", note: "Reason (required)", done: "Adjustment saved." },
} as const;

export function StockForm({
  mode,
  firmId,
  places,
  products,
  balances,
}: {
  mode: keyof typeof copy;
  firmId: string;
  places: Option[];
  products: ProductOption[];
  balances: Balance[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [productId, setProductId] = useState(products[0]?.id ?? "");
  const [locationId, setLocationId] = useState(places[0]?.id ?? "");
  const [digits, setDigits] = useState("");
  const [minus, setMinus] = useState(false);
  const [note, setNote] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const current = balances.find((b) => b.productId === productId && b.locationId === locationId)?.bags ?? 0;
  const bags = Number(digits || 0);

  function submit() {
    setMessage(null);
    const input = {
      firmId,
      productId,
      locationId,
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
        router.refresh();
      } else setMessage({ ok: false, text: res.error });
    });
  }

  if (places.length === 0 || products.length === 0) {
    return (
      <p className="rounded-2xl bg-card p-4 text-sm shadow-card ring-1 ring-foreground/6">
        Add a godown or vehicle place for this firm first (Stock, then Places).
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <SelectField label="Product" value={productId} onChange={setProductId} groups={productGroups(products)} />
      <label className="flex flex-col gap-1 text-sm font-medium">
        Place
        <select className={selectClass} value={locationId} onChange={(e) => setLocationId(e.target.value)}>
          {places.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>
      <p className="text-sm text-muted-foreground">In stock here now: {current} bags</p>
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
          disabled={pending || bags === 0 || (mode === "adjust" && !note.trim())}
        >
          {copy[mode].button}
        </Button>
      </PinnedAction>
    </div>
  );
}
