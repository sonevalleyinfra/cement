"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { EmptyState } from "@/components/app/empty-state";
import { ListCard } from "@/components/app/list-card";
import { Sheet } from "@/components/app/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { remainingBags } from "@/lib/order-rules";
import { createGodown, dispatchOrder, markDelivered } from "./actions";

type OrderRow = {
  id: string;
  productId: string;
  retailer: string;
  product: string;
  bags: number;
  sent: number;
  ratePaise: number | null;
  status: string;
};
type Vehicle = { id: string; number: string; driverName: string; driverPhone: string };
type Place = { id: string; name: string };
type Balance = { productId: string; locationId: string; bags: number };

const selectClass = "h-11 w-full rounded-xl border bg-background px-3 text-base";

export function DispatchView({
  firmId,
  isAdmin,
  orders,
  locations,
  vehicles,
  balances,
}: {
  firmId: string;
  isAdmin: boolean;
  orders: OrderRow[];
  locations: Place[];
  vehicles: Vehicle[];
  balances: Balance[];
  userId: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState<OrderRow | null>(null);
  const [bags, setBags] = useState("");
  const [vehicleId, setVehicleId] = useState("");
  const [locationId, setLocationId] = useState("");
  const [driverName, setDriverName] = useState("");
  const [driverPhone, setDriverPhone] = useState("");
  const [rate, setRate] = useState("");
  const [reason, setReason] = useState("");
  const [godown, setGodown] = useState("");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();

  function openSheet(o: OrderRow) {
    setOpen(o);
    setBags(String(remainingBags(o.bags, o.sent)));
    setVehicleId("");
    setLocationId(locations[0]?.id ?? "");
    setDriverName("");
    setDriverPhone("");
    setRate("");
    setReason("");
    setError("");
  }

  function pickVehicle(id: string) {
    setVehicleId(id);
    const v = vehicles.find((x) => x.id === id);
    if (v) {
      setDriverName(v.driverName);
      setDriverPhone(v.driverPhone);
    }
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
        vehicleId: vehicleId || null,
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

  function addGodown() {
    start(async () => {
      const res = await createGodown(firmId, godown);
      if (res.ok) {
        setGodown("");
        router.refresh();
      } else setError(res.error);
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {locations.length === 0 && (
        <div className="flex flex-col gap-2 rounded-2xl bg-card p-4 ring-1 ring-foreground/8">
          <p className="text-sm">
            This firm has no godown yet, so nothing can be dispatched.{" "}
            {isAdmin ? "Add one:" : "Ask admin to add a godown."}
          </p>
          {isAdmin && (
            <div className="flex gap-2">
              <Input
                value={godown}
                onChange={(e) => setGodown(e.target.value)}
                placeholder="Godown name"
                aria-label="Godown name"
              />
              <Button onClick={addGodown} disabled={pending}>
                Add
              </Button>
            </div>
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
              <select className={selectClass} value={locationId} onChange={(e) => setLocationId(e.target.value)}>
                {locations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name} ({stockHere(open, l.id)} bags)
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm font-semibold">
              Vehicle
              <select className={selectClass} value={vehicleId} onChange={(e) => pickVehicle(e.target.value)}>
                <option value="">Pick a vehicle</option>
                {vehicles.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.number}
                  </option>
                ))}
              </select>
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
              New rate per bag in ₹ (only to change it)
              <Input
                inputMode="numeric"
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
