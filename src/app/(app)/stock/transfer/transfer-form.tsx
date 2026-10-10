"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Keypad } from "@/components/app/keypad";
import { PinnedAction } from "@/components/app/pinned-action";
import { SelectField } from "@/components/app/select-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { productGroups } from "@/lib/catalogue-rules";
import { transferStock } from "../actions";

type Option = { id: string; name: string };
type ProductOption = Option & { channel: string };
type Balance = { productId: string; locationId: string; bags: number };

const selectClass = "h-11 w-full rounded-xl border bg-background px-3 text-base";

export function TransferForm({
  firmId,
  places,
  products,
  balances,
}: {
  firmId: string;
  places: Option[];
  products: ProductOption[];
  balances: Balance[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [productId, setProductId] = useState(products[0]?.id ?? "");
  const [fromId, setFromId] = useState(places[0]?.id ?? "");
  const [toId, setToId] = useState(places[1]?.id ?? "");
  const [digits, setDigits] = useState("");
  const [note, setNote] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const bagsAt = (locationId: string) =>
    balances.find((b) => b.productId === productId && b.locationId === locationId)?.bags ?? 0;
  const bags = Number(digits || 0);

  function submit() {
    setMessage(null);
    start(async () => {
      const res = await transferStock({ firmId, productId, fromLocationId: fromId, toLocationId: toId, bags, note });
      if (res.ok) {
        setMessage({ ok: true, text: "Bags moved." });
        setDigits("");
        setNote("");
        router.refresh();
      } else setMessage({ ok: false, text: res.error });
    });
  }

  if (places.length < 2 || products.length === 0) {
    return (
      <p className="rounded-2xl bg-card p-4 text-sm shadow-card ring-1 ring-foreground/6">
        This firm needs at least two places and a product first.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <SelectField label="Product" value={productId} onChange={setProductId} groups={productGroups(products)} />
      <label className="flex flex-col gap-1 text-sm font-medium">
        From
        <select className={selectClass} value={fromId} onChange={(e) => setFromId(e.target.value)}>
          {places.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>
      <p className="text-sm text-muted-foreground">There now: {bagsAt(fromId)} bags</p>
      <label className="flex flex-col gap-1 text-sm font-medium">
        To
        <select className={selectClass} value={toId} onChange={(e) => setToId(e.target.value)}>
          {places.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>
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
        <Button onClick={submit} disabled={pending || bags === 0 || fromId === toId}>
          Move bags
        </Button>
      </PinnedAction>
    </div>
  );
}
