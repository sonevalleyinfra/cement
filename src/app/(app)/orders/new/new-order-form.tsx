"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Keypad } from "@/components/app/keypad";
import { PinnedAction } from "@/components/app/pinned-action";
import { Sheet } from "@/components/app/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { placeOrder } from "../actions";

type Retailer = { id: string; name: string; place: string };
type Product = { id: string; name: string };

export function NewOrderForm({
  firmId,
  firmName,
  retailers,
  products,
  fixedRetailerId,
}: {
  firmId: string;
  firmName: string;
  retailers: Retailer[];
  products: Product[];
  fixedRetailerId: string | null;
}) {
  const router = useRouter();
  const [retailerId, setRetailerId] = useState<string | null>(fixedRetailerId);
  const [productId, setProductId] = useState<string | null>(products[0]?.id ?? null);
  const [bags, setBags] = useState("");
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();

  const retailer = retailers.find((r) => r.id === retailerId);
  const q = search.trim().toLowerCase();
  const shown = q
    ? retailers.filter((r) => `${r.name} ${r.place}`.toLowerCase().includes(q))
    : retailers;

  function submit() {
    setError("");
    start(async () => {
      const res = await placeOrder({
        firmId,
        retailerId,
        productId,
        bags: Number(bags || 0),
      });
      if (res.ok) router.push("/orders");
      else setError(res.error);
    });
  }

  return (
    <div className="flex flex-col gap-5">
      <p className="text-sm font-medium text-muted-foreground">{firmName}</p>

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

      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Product">
        {products.map((p) => (
          <button
            key={p.id}
            type="button"
            role="radio"
            aria-checked={p.id === productId}
            onClick={() => setProductId(p.id)}
            className={cn(
              "h-12 rounded-full px-5 text-sm font-semibold ring-1 transition-[background-color,color,transform] duration-150 ease-out active:scale-[0.97]",
              p.id === productId
                ? "bg-primary text-primary-foreground shadow-brand ring-primary"
                : "bg-card ring-foreground/10",
            )}
          >
            {p.name}
          </button>
        ))}
      </div>

      <div className="tabular text-center text-5xl font-bold">
        {bags || "0"}
        <span className="ml-2 text-lg font-medium text-muted-foreground">bags</span>
      </div>
      <Keypad value={bags} onChange={setBags} maxLength={6} />

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
