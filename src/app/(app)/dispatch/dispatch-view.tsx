"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { EmptyState } from "@/components/app/empty-state";
import { ListCard } from "@/components/app/list-card";
import { Sheet } from "@/components/app/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { truckAfterPlacePick } from "@/lib/dispatch-rules";
import { remainingBags } from "@/lib/order-rules";
import { useSubmit } from "@/lib/use-submit";
import { dispatchOrder } from "./actions";

type OrderRow = {
  id: string;
  productId: string;
  retailer: string;
  product: string;
  bags: number;
  sent: number;
  status: string;
};
/** A stock place (`key` is "godown:<id>" or "vehicle:<id>"); `truck` is its number when the bags are on a truck. */
type Place = { key: string; name: string; truck: string | null };
type Balance = { productId: string; placeKey: string; bags: number };

const selectClass = "h-11 w-full rounded-xl border bg-background px-3 text-base";

export function DispatchView({
  isAdmin,
  orders,
  places,
  balances,
}: {
  isAdmin: boolean;
  orders: OrderRow[];
  places: Place[];
  balances: Balance[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState<OrderRow | null>(null);
  const [bags, setBags] = useState("");
  const [truck, setTruck] = useState("");
  // The truck number last filled in from a truck place (null = what is there was typed).
  const [autoTruck, setAutoTruck] = useState<string | null>(null);
  const [fromPlace, setFromPlace] = useState("");
  const [driverName, setDriverName] = useState("");
  const [driverPhone, setDriverPhone] = useState("");
  const [error, setError] = useState("");
  const { pending, run, renew } = useSubmit();

  function openSheet(o: OrderRow) {
    setOpen(o);
    setBags(String(remainingBags(o.bags, o.sent)));
    // Start with the place holding the most bags of this product, and an empty truck box.
    const fullest = [...places].sort((a, b) => stockHere(o, b.key) - stockHere(o, a.key))[0];
    pickPlace(fullest?.key ?? "", "", null);
    setDriverName("");
    setDriverPhone("");
    setError("");
    renew();
  }

  /** Bags already on a truck usually leave on that truck, so its number is filled in; a typed number stays. */
  function pickPlace(key: string, current = truck, auto = autoTruck) {
    setFromPlace(key);
    const next = truckAfterPlacePick(current, auto, places.find((p) => p.key === key)?.truck ?? null);
    setTruck(next.truck);
    setAutoTruck(next.autoFilled);
  }

  function stockHere(o: OrderRow, key: string) {
    return balances.find((b) => b.productId === o.productId && b.placeKey === key)?.bags ?? 0;
  }

  function submit() {
    if (!open) return;
    run(
      (requestId) =>
        dispatchOrder({
          orderId: open.id,
          bags: Number(bags),
          vehicleNumber: truck,
          fromPlace: fromPlace || null,
          driverName,
          driverPhone,
          requestId,
        }),
      (res) => {
        if (res.ok) {
          setOpen(null);
          router.refresh();
        } else setError(res.error);
      },
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {places.length === 0 && (
        <div className="flex items-center justify-between gap-2 rounded-2xl bg-card p-4 shadow-card ring-1 ring-foreground/6">
          <p className="text-sm font-medium">No stock yet</p>
          {isAdmin && (
            <Link href="/stock/purchase" className="text-sm font-semibold underline">
              Add stock
            </Link>
          )}
        </div>
      )}
      {error && !open && <p className="text-sm text-destructive">{error}</p>}
      {orders.length === 0 ? (
        <EmptyState title="Nothing to dispatch" />
      ) : (
        <ul className="flex flex-col gap-3">
          {orders.map((o, i) => {
            const left = remainingBags(o.bags, o.sent);
            return (
              <li key={o.id}>
                <ListCard
                  index={i}
                  href={`/orders/${o.id}`}
                  title={o.retailer}
                  top={
                    <span className="text-xs text-muted-foreground capitalize">
                      {o.status.replace("_", " ")}
                    </span>
                  }
                  bottom={
                    <div className="text-xs text-muted-foreground">
                      {o.product} · <span className="tabular">{o.sent}</span> of{" "}
                      <span className="tabular">{o.bags}</span> bags sent
                    </div>
                  }
                />
                <div className="mt-2">
                  <Button className="w-full" onClick={() => openSheet(o)} disabled={places.length === 0 || left === 0}>
                    Dispatch
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <Sheet open={open !== null} onOpenChange={(v) => !v && setOpen(null)} title="Dispatch">
        {open && (
          <div className="flex flex-col gap-3">
            <div className="text-sm text-muted-foreground">
              {open.retailer} · {open.product} · {remainingBags(open.bags, open.sent)} bags left
            </div>
            <label className="flex flex-col gap-1 text-sm font-semibold">
              Bags
              <Input
                inputMode="numeric"
                value={bags}
                onChange={(e) => setBags(e.target.value.replace(/\D/g, ""))}
              />
            </label>
            <label className="flex flex-col gap-1 text-sm font-semibold">
              Take from
              <select className={selectClass} value={fromPlace} onChange={(e) => pickPlace(e.target.value)}>
                {places.map((p) => (
                  <option key={p.key} value={p.key}>
                    {p.name} ({stockHere(open, p.key)} bags)
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm font-semibold">
              Truck number
              <Input
                value={truck}
                onChange={(e) => setTruck(e.target.value.toUpperCase())}
                placeholder="BR01AB1234"
                autoCapitalize="characters"
                autoComplete="off"
                maxLength={14}
              />
            </label>
            <label className="flex flex-col gap-1 text-sm font-semibold">
              Driver name
              <Input value={driverName} onChange={(e) => setDriverName(e.target.value)} />
            </label>
            <label className="flex flex-col gap-1 text-sm font-semibold">
              Driver phone (optional)
              <Input
                inputMode="tel"
                value={driverPhone}
                onChange={(e) => setDriverPhone(e.target.value)}
              />
            </label>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button onClick={submit} disabled={pending}>
              Dispatch {bags || 0} bags
            </Button>
          </div>
        )}
      </Sheet>
    </div>
  );
}
