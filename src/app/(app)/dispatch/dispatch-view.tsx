"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { EmptyState } from "@/components/app/empty-state";
import { ListCard } from "@/components/app/list-card";
import { Sheet } from "@/components/app/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { remainingBags } from "@/lib/order-rules";
import { dispatchOrder, markDelivered } from "./actions";

type OrderRow = {
  id: string;
  productId: string;
  retailer: string;
  product: string;
  bags: number;
  sent: number;
  ratePaise: number | null;
  status: string;
  /** Logistics person on the order (shown to admin). */
  assignee: string | null;
};
/** A stock place; `truck` is its number when the bags are on a truck. */
type Place = { id: string; name: string; truck: string | null };
type Balance = { productId: string; locationId: string; bags: number };

const selectClass = "h-11 w-full rounded-xl border bg-background px-3 text-base";

export function DispatchView({
  isAdmin,
  orders,
  locations,
  balances,
}: {
  firmId: string;
  isAdmin: boolean;
  orders: OrderRow[];
  locations: Place[];
  balances: Balance[];
  userId: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState<OrderRow | null>(null);
  const [bags, setBags] = useState("");
  const [truck, setTruck] = useState("");
  const [locationId, setLocationId] = useState("");
  const [driverName, setDriverName] = useState("");
  const [driverPhone, setDriverPhone] = useState("");
  const [rate, setRate] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();

  function openSheet(o: OrderRow) {
    setOpen(o);
    setBags(String(remainingBags(o.bags, o.sent)));
    // Start with the place holding the most bags of this product.
    const fullest = [...locations].sort((a, b) => stockHere(o, b.id) - stockHere(o, a.id))[0];
    pickPlace(fullest?.id ?? "");
    setDriverName("");
    setDriverPhone("");
    setRate("");
    setReason("");
    setError("");
  }

  /** Bags already on a truck usually leave on that truck, so its number is filled in. */
  function pickPlace(id: string) {
    setLocationId(id);
    setTruck(locations.find((l) => l.id === id)?.truck ?? "");
  }

  function stockHere(o: OrderRow, loc: string) {
    return balances.find((b) => b.productId === o.productId && b.locationId === loc)?.bags ?? 0;
  }

  function submit() {
    if (!open) return;
    start(async () => {
      const res = await dispatchOrder({
        orderId: open.id,
        bags: Number(bags),
        vehicleNumber: truck,
        locationId: locationId || null,
        driverName,
        driverPhone,
        newRateRupees: rate,
        rateReason: reason,
      });
      if (res.ok) {
        setOpen(null);
        router.refresh();
      } else setError(res.error);
    });
  }

  function deliver(id: string) {
    start(async () => {
      const res = await markDelivered(id);
      if (res.ok) router.refresh();
      else setError(res.error);
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {locations.length === 0 && (
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
                      {isAdmin && <> · {o.assignee ?? "Not assigned"}</>}
                    </div>
                  }
                />
                <div className="mt-2">
                  {left > 0 ? (
                    <Button className="w-full" onClick={() => openSheet(o)} disabled={locations.length === 0}>
                      Dispatch
                    </Button>
                  ) : (
                    <Button className="w-full" variant="outline" onClick={() => deliver(o.id)} disabled={pending}>
                      Mark delivered
                    </Button>
                  )}
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
              <select className={selectClass} value={locationId} onChange={(e) => pickPlace(e.target.value)}>
                {locations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name} ({stockHere(open, l.id)} bags)
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
            <label className="flex flex-col gap-1 text-sm font-semibold">
              New rate per bag in ₹ for this truck (only to change it)
              <Input
                inputMode="numeric"
                maxLength={5}
                value={rate}
                onChange={(e) => setRate(e.target.value.replace(/\D/g, ""))}
                placeholder={open.ratePaise !== null ? String(open.ratePaise / 100) : ""}
              />
            </label>
            {rate && (
              <label className="flex flex-col gap-1 text-sm font-semibold">
                Reason for the new rate
                <Input value={reason} onChange={(e) => setReason(e.target.value)} />
              </label>
            )}
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
