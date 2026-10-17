"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { EmptyState } from "@/components/app/empty-state";
import { FormHint } from "@/components/app/form-hint";
import { ListCard } from "@/components/app/list-card";
import { SelectField } from "@/components/app/select-field";
import { Sheet } from "@/components/app/sheet";
import { StatusChip } from "@/components/app/status-chip";
import { TextLink } from "@/components/app/text-link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { placesWithEnough, truckAfterPlacePick, type TruckChip } from "@/lib/dispatch-rules";
import { firstMissing } from "@/lib/form-rules";
import { isOrderStatus, remainingBags } from "@/lib/order-rules";
import { useFormError } from "@/lib/use-form-error";
import { useSubmit } from "@/lib/use-submit";
import { bagsText } from "@/lib/words";
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

export function DispatchView({
  isAdmin,
  orders,
  places,
  truckChips,
  balances,
}: {
  isAdmin: boolean;
  orders: OrderRow[];
  places: Place[];
  truckChips: TruckChip[];
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
  // Goes away when any field is changed, after a save and when the sheet opens again.
  const { error, setError, clearError } = useFormError([open?.id, bags, truck, fromPlace, driverName, driverPhone]);
  const { pending, run, renew } = useSubmit();

  function openSheet(o: OrderRow) {
    setOpen(o);
    setBags(String(remainingBags(o.bags, o.sent)));
    // Start with the place holding the most bags of this product, and an empty truck box.
    const fullest = placesWithEnough(places, balances, o.productId, remainingBags(o.bags, o.sent)).sort(
      (a, b) => b.bagsHere - a.bagsHere,
    )[0];
    pickPlace(fullest?.key ?? "", "", null);
    setDriverName("");
    setDriverPhone("");
    clearError();
    renew();
  }

  /** Bags already on a truck usually leave on that truck, so its number is filled in; a typed number stays. */
  function pickPlace(key: string, current = truck, auto = autoTruck) {
    setFromPlace(key);
    const next = truckAfterPlacePick(current, auto, places.find((p) => p.key === key)?.truck ?? null);
    setTruck(next.truck);
    setAutoTruck(next.autoFilled);
  }

  /** A chip fills the truck number and the driver; a number filled this way is a typed one (it stays). */
  function pickChip(c: TruckChip) {
    setTruck(c.truck);
    setAutoTruck(null);
    setDriverName(c.driverName);
    setDriverPhone(c.driverPhone);
  }

  // Only places holding enough of this product for the bags typed; a pick that no longer fits is dropped.
  const options = open ? placesWithEnough(places, balances, open.productId, Number(bags || 0)) : [];
  const chosenPlace = options.some((p) => p.key === fromPlace) ? fromPlace : "";

  function submit() {
    if (!open) return;
    clearError();
    run(
      (requestId) =>
        dispatchOrder({
          orderId: open.id,
          bags: Number(bags),
          vehicleNumber: truck,
          fromPlace: chosenPlace || null,
          driverName,
          driverPhone,
          requestId,
        }),
      (res) => {
        if (res.ok) {
          clearError();
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
            <TextLink href="/stock/purchase" strong>
              Add stock
            </TextLink>
          )}
        </div>
      )}
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
                  {...(places.length === 0 || left === 0 ? { href: `/orders/${o.id}` } : { onClick: () => openSheet(o) })}
                  title={o.retailer}
                  top={isOrderStatus(o.status) && <StatusChip status={o.status} />}
                  bottom={
                    <div className="text-xs text-muted-foreground">
                      {o.product} · <span className="tabular">{o.sent}</span> of{" "}
                      <span className="tabular">{o.bags}</span> {o.bags === 1 ? "bag" : "bags"} sent
                    </div>
                  }
                />
              </li>
            );
          })}
        </ul>
      )}
      <Sheet open={open !== null} onOpenChange={(v) => !v && setOpen(null)} title="Dispatch">
        {open && (
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-2 text-sm text-muted-foreground">
              <span>
                {open.retailer} · {open.product} · {remainingBags(open.bags, open.sent)} bags left
              </span>
              <TextLink href={`/orders/${open.id}`}>Order</TextLink>
            </div>
            <label className="flex flex-col gap-1 text-sm font-semibold">
              Bags
              <Input
                inputMode="numeric"
                value={bags}
                onChange={(e) => setBags(e.target.value.replace(/\D/g, ""))}
              />
            </label>
            <SelectField
              label="Take from"
              value={chosenPlace}
              onChange={(key) => pickPlace(key)}
              options={options.map((p) => ({ value: p.key, label: `${p.name} (${p.bagsHere} bags)` }))}
            />
            {options.length === 0 && <p className="text-sm text-destructive">No place holds {Number(bags || 1)} bags.</p>}
            {truckChips.length > 0 && (
              <div className="flex flex-col gap-1">
                <span className="text-sm font-semibold">Recent trucks</span>
                <div className="flex flex-wrap gap-2">
                  {truckChips.map((c) => (
                    <button
                      key={c.truck}
                      type="button"
                      onClick={() => pickChip(c)}
                      aria-pressed={truck === c.truck}
                      className={`tabular min-h-12 rounded-xl px-3 text-sm font-semibold ring-1 transition-[background-color,color,transform] duration-150 ease-out active:scale-[0.98] ${truck === c.truck ? "bg-primary text-primary-foreground ring-primary" : "bg-card ring-foreground/10"}`}
                    >
                      {c.truck}
                    </button>
                  ))}
                </div>
              </div>
            )}
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
            <div>
              <FormHint>
                {firstMissing([
                  [Number(bags || 0) < 1, "Enter the bags"],
                  [chosenPlace === "", "Pick where the bags come from"],
                ])}
              </FormHint>
              <Button className="w-full" onClick={submit} disabled={pending || Number(bags || 0) < 1 || chosenPlace === ""}>
                Dispatch {bagsText(Number(bags || 0))}
              </Button>
            </div>
          </div>
        )}
      </Sheet>
    </div>
  );
}
