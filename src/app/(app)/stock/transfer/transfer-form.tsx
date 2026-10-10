"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Keypad } from "@/components/app/keypad";
import { PinnedAction } from "@/components/app/pinned-action";
import { SelectField } from "@/components/app/select-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { productGroups } from "@/lib/catalogue-rules";
import { placeGroups } from "@/lib/stock-rules";
import { transferStock } from "../actions";

type ProductOption = { id: string; name: string; channel: string };
type PlaceOption = { key: string; kind: string; name: string };
type Balance = { productId: string; placeKey: string; bags: number };

export function TransferForm({
  firmId,
  places,
  products,
  balances,
}: {
  firmId: string;
  places: PlaceOption[];
  products: ProductOption[];
  balances: Balance[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [productId, setProductId] = useState(products[0]?.id ?? "");
  const [from, setFrom] = useState(places[0]?.key ?? "");
  const [to, setTo] = useState(places[1]?.key ?? "");
  const [digits, setDigits] = useState("");
  const [note, setNote] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const bagsAt = (key: string) => balances.find((b) => b.productId === productId && b.placeKey === key)?.bags ?? 0;
  const bags = Number(digits || 0);

  function submit() {
    setMessage(null);
    start(async () => {
      const res = await transferStock({ firmId, productId, from, to, bags, note });
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
        Add two places and a product first.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <SelectField label="Product" value={productId} onChange={setProductId} groups={productGroups(products)} />
      <SelectField label="From" value={from} onChange={setFrom} groups={placeGroups(places)} />
      <p className="text-sm text-muted-foreground">There now: {bagsAt(from)} bags</p>
      <SelectField label="To" value={to} onChange={setTo} groups={placeGroups(places)} />
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
        <Button onClick={submit} disabled={pending || bags === 0 || from === to}>
          Move bags
        </Button>
      </PinnedAction>
    </div>
  );
}
