"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Keypad } from "@/components/app/keypad";
import { PinnedAction } from "@/components/app/pinned-action";
import { SelectField } from "@/components/app/select-field";
import { Sheet } from "@/components/app/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { productGroups } from "@/lib/catalogue-rules";
import { useSubmit } from "@/lib/use-submit";
import { placeOrder } from "../actions";

type Retailer = { id: string; name: string; place: string };
type Product = { id: string; name: string; channel: string; brand: string };

export function NewOrderForm({
  retailers,
  products,
  fixedRetailerId,
  askRate,
}: {
  retailers: Retailer[];
  products: Product[];
  fixedRetailerId: string | null;
  /** Staff type the rate per bag; a retailer never sees it. */
  askRate: boolean;
}) {
  const router = useRouter();
  const [retailerId, setRetailerId] = useState<string | null>(fixedRetailerId);
  const [productId, setProductId] = useState<string | null>(products[0]?.id ?? null);
  const [bags, setBags] = useState("");
  const [rate, setRate] = useState("");
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const { pending, run } = useSubmit();

  const retailer = retailers.find((r) => r.id === retailerId);
  const q = search.trim().toLowerCase();
  const shown = q
    ? retailers.filter((r) => `${r.name} ${r.place}`.toLowerCase().includes(q))
    : retailers;

  function submit() {
    setError("");
    run(
      (requestId) =>
        placeOrder({
          retailerId,
          productId,
          bags: Number(bags || 0),
          rateRupees: askRate ? rate : undefined,
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
      <h1 className="text-xl font-bold">New order</h1>

      {fixedRetailerId ? (
        <div className="rounded-2xl bg-card p-4 text-base font-semibold shadow-card ring-1 ring-foreground/6">
          {retailer?.name}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex h-14 items-center justify-between rounded-2xl bg-card px-4 text-left text-base font-semibold shadow-card ring-1 ring-foreground/6"
        >
          {retailer ? retailer.name : <span className="text-muted-foreground">Retailer</span>}
        </button>
      )}

      <SelectField label="Product" value={productId ?? ""} onChange={setProductId} groups={productGroups(products)} />

      <div className="tabular text-center text-5xl font-bold">
        {bags || "0"}
        <span className="ml-2 text-lg font-medium text-muted-foreground">bags</span>
      </div>
      <Keypad value={bags} onChange={setBags} maxLength={6} />

      {askRate && (
        <label className="flex flex-col gap-1 text-sm font-semibold">
          Rate per bag (₹)
          <Input
            inputMode="numeric"
            value={rate}
            onChange={(e) => setRate(e.target.value.replace(/\D/g, ""))}
            maxLength={5}
            autoComplete="off"
          />
        </label>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}
      <PinnedAction>
        <Button onClick={submit} disabled={pending}>
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
