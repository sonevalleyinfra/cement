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
import { placesWithStock, truckAfterPlacePick, type TruckChip } from "@/lib/dispatch-rules";
import { firstMissing } from "@/lib/form-rules";
import { isValidIndianMobile, normalizePhone } from "@/lib/phone-rules";
import { formatINR } from "@/lib/money";
import { stagger } from "@/lib/motion";
import { isOrderStatus, remainingBags } from "@/lib/order-rules";
import { useFormError } from "@/lib/use-form-error";
import { useSubmit } from "@/lib/use-submit";
import { cn } from "@/lib/utils";
import { bagsText } from "@/lib/words";
import { dispatchOrder } from "./actions";

type OrderRow = {
  id: string;
  productId: string;
  retailer: string;
  retailerAddress?: string | null;
  retailerPlace: string;
  retailerPincode?: string | null;
  retailerPhone: string;
  product: string;
  ratePaise?: number | null;
  bags: number;
  sent: number;
  status: string;
  deliverTo: string;
  siteAddress: string | null;
  receiverName: string | null;
  receiverPhone: string | null;
  /** "Needed by" as shown ("30 Oct 2026"), and whether it is before today. */
  requiredByText: string | null;
  late: boolean;
  staffNote: string;
};

function formatShopAddress(address?: string | null, place?: string | null, pincode?: string | null): string {
  return [address?.trim(), place?.trim(), pincode?.trim()].filter(Boolean).join(", ");
}
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
  const phoneOk = isValidIndianMobile(normalizePhone(driverPhone));
  // Goes away when any field is changed, after a save and when the sheet opens again.
  const { error, setError, clearError } = useFormError([open?.id, bags, truck, fromPlace, driverName, driverPhone]);
  const { pending, run, renew } = useSubmit();

  function openSheet(o: OrderRow) {
    setOpen(o);
    const stockPlaces = placesWithStock(places, balances, o.productId);
    const fullest = stockPlaces[0];
    const left = remainingBags(o.bags, o.sent);
    // Suggest the bags to send: if the fullest place has less than remaining, suggest what's in stock
    const suggestedBags = fullest ? Math.min(left, fullest.bagsHere) : left;
    setBags(String(suggestedBags));
    const truckNo = fullest?.truck ?? null;
    const chip = truckNo ? truckChips.find((c) => c.truck === truckNo) : null;
    setFromPlace(fullest?.key ?? "");
    setTruck(truckNo ?? "");
    setAutoTruck(truckNo);
    setDriverName(chip?.driverName ?? "");
    setDriverPhone(chip?.driverPhone ?? "");
    clearError();
    renew();
  }

  /** Bags already on a truck usually leave on that truck, so its number is filled in; a typed number stays. */
  function pickPlace(key: string, current = truck, auto = autoTruck) {
    setFromPlace(key);
    const picked = options.find((p) => p.key === key);
    const truckNo = picked?.truck ?? null;
    if (picked && open) {
      const left = remainingBags(open.bags, open.sent);
      if (Number(bags || 0) > picked.bagsHere) {
        setBags(String(Math.min(left, picked.bagsHere)));
      }
    }
    const next = truckAfterPlacePick(current, auto, truckNo);
    setTruck(next.truck);
    setAutoTruck(next.autoFilled);
    if (next.autoFilled) {
      const chip = truckChips.find((c) => c.truck === next.autoFilled);
      if (chip) {
        setDriverName(chip.driverName || "");
        setDriverPhone(chip.driverPhone || "");
      }
    }
  }

  /** A chip fills the truck number and driver; if the truck holds stock of this product, also select it as source. */
  function pickChip(c: TruckChip) {
    setTruck(c.truck);
    setAutoTruck(null);
    setDriverName(c.driverName || "");
    setDriverPhone(c.driverPhone || "");
    const matchingStockPlace = options.find((p) => p.truck === c.truck);
    if (matchingStockPlace) {
      setFromPlace(matchingStockPlace.key);
      if (open) {
        const left = remainingBags(open.bags, open.sent);
        if (Number(bags || 0) > matchingStockPlace.bagsHere) {
          setBags(String(Math.min(left, matchingStockPlace.bagsHere)));
        }
      }
    }
  }

  // All places holding stock of this product, sorted with fullest first. Never hides partial trucks.
  const options = open ? placesWithStock(places, balances, open.productId) : [];
  const chosenPlace = options.some((p) => p.key === fromPlace) ? fromPlace : (options[0]?.key ?? "");
  const chosenPlaceObj = options.find((p) => p.key === chosenPlace);
  const requestedBags = Number(bags || 0);
  const exceedsStock = chosenPlaceObj ? requestedBags > chosenPlaceObj.bagsHere : false;

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
              <li
                key={o.id}
                className={cn(
                  o.receiverPhone &&
                    "animate-in-up overflow-hidden rounded-2xl bg-card shadow-card ring-1 ring-foreground/6",
                )}
                style={o.receiverPhone ? stagger(i) : undefined}
              >
                <ListCard
                  index={i}
                  className={cn(
                    o.receiverPhone &&
                      "animate-none rounded-none shadow-none ring-0 hover:translate-y-0 hover:shadow-none",
                  )}
                  {...(places.length === 0 || left === 0 ? { href: `/orders/${o.id}` } : { onClick: () => openSheet(o) })}
                  title={o.retailer}
                  top={isOrderStatus(o.status) && <StatusChip status={o.status} />}
                  bottom={
                    <div className="flex min-w-0 flex-col gap-1 text-xs text-muted-foreground">
                      <span>
                        {o.product} · <span className="tabular">{o.sent}</span> of{" "}
                        <span className="tabular">{o.bags}</span> {o.bags === 1 ? "bag" : "bags"} sent
                        {o.ratePaise ? (
                          <span className="tabular font-medium text-foreground"> · @ {formatINR(o.ratePaise)}/bag</span>
                        ) : null}
                      </span>
                      {o.deliverTo === "site" && o.siteAddress && (
                        <span className="text-sm text-foreground">Site · {o.siteAddress}</span>
                      )}
                      {o.deliverTo === "shop" && (
                        <span className="text-sm text-foreground">
                          Shop · {formatShopAddress(o.retailerAddress, o.retailerPlace, o.retailerPincode) || o.retailerPlace || "Shop"}
                        </span>
                      )}
                      {o.requiredByText && (
                        <span className={o.late ? "font-semibold text-caution-foreground" : undefined}>
                          Needed by {o.requiredByText}
                        </span>
                      )}
                      {o.staffNote && <span>Staff note · {o.staffNote}</span>}
                    </div>
                  }
                />
                {o.receiverPhone ? (
                  <a
                    href={`tel:${o.receiverPhone}`}
                    className="flex min-h-12 items-center gap-1 border-t border-border px-4 text-sm text-muted-foreground"
                  >
                    {o.receiverName ? `${o.receiverName} · ` : "Receiver · "}
                    <span className="tabular font-semibold text-foreground underline underline-offset-2">
                      {o.receiverPhone}
                    </span>
                  </a>
                ) : o.retailerPhone ? (
                  <a
                    href={`tel:${o.retailerPhone}`}
                    className="flex min-h-12 items-center gap-1 border-t border-border px-4 text-sm text-muted-foreground"
                  >
                    {"Shop Contact · "}
                    <span className="tabular font-semibold text-foreground underline underline-offset-2">
                      {o.retailerPhone}
                    </span>
                  </a>
                ) : null}
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
                {open.ratePaise ? ` · @ ${formatINR(open.ratePaise)}/bag` : ""}
              </span>
              <div className="flex items-center gap-2">
                <TextLink href={`/orders/${open.id}#cancel`}>Cancel</TextLink>
                <span>·</span>
                <TextLink href={`/orders/${open.id}`}>Order</TextLink>
              </div>
            </div>
            <div className="rounded-xl bg-muted/60 p-3 text-xs text-muted-foreground">
              <div className="font-semibold text-foreground">
                📍 Delivery: {open.deliverTo === "site" && open.siteAddress ? `Site · ${open.siteAddress}` : `Shop · ${formatShopAddress(open.retailerAddress, open.retailerPlace, open.retailerPincode) || open.retailerPlace || "Shop"}`}
              </div>
              {(open.receiverName || open.receiverPhone || open.retailerPhone) && (
                <div className="mt-0.5">
                  Contact: {open.receiverName ? `${open.receiverName} · ` : ""}{open.receiverPhone || open.retailerPhone}
                </div>
              )}
            </div>
            {/* Step 1: Stock Source */}
            <div className="flex flex-col gap-2 rounded-2xl border border-border/70 bg-card p-3.5 shadow-xs">
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                📦 1. Mal Kahan Se Niklega (Stock Source)
              </span>
              <label className="flex flex-col gap-1 text-sm font-semibold">
                Bags to Dispatch
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
                options={options.map((p) => ({
                  value: p.key,
                  label: `${p.name} (${p.bagsHere} bags in stock)`,
                }))}
              />
              {options.length === 0 && (
                <p className="text-sm text-destructive">No godown or truck has stock of this product.</p>
              )}
              {chosenPlaceObj && exceedsStock && (
                <p className="text-sm font-medium text-amber-600 dark:text-amber-400">
                  Only {chosenPlaceObj.bagsHere} bags available in {chosenPlaceObj.name}. (You entered {requestedBags} bags)
                </p>
              )}
            </div>

            {/* Step 2: Delivery Vehicle & Driver */}
            <div className="flex flex-col gap-2.5 rounded-2xl border border-border/70 bg-card p-3.5 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  🚚 2. Delivery Gaadi & Driver
                </span>
                {truck && (
                  <span className="text-xs font-semibold text-muted-foreground">
                    Selected: <strong className="text-foreground">{truck}</strong>
                  </span>
                )}
              </div>

              {truckChips.length > 0 && (
                <div className="flex flex-col gap-1">
                  <span className="text-xs text-muted-foreground">Click a truck to choose delivery vehicle:</span>
                  <div className="grid grid-cols-2 gap-2">
                    {truckChips.map((c) => {
                      const stockInTruck = options.find((p) => p.truck === c.truck)?.bagsHere ?? 0;
                      const isSelected = truck === c.truck;
                      return (
                        <button
                          key={c.truck}
                          type="button"
                          onClick={() => pickChip(c)}
                          aria-pressed={isSelected}
                          className={`tabular rounded-xl p-2.5 text-left text-xs transition-[background-color,color,transform] duration-150 ease-out active:scale-[0.98] ring-1 ${
                            isSelected
                              ? "bg-primary text-primary-foreground ring-primary"
                              : "bg-muted/40 ring-border/50 hover:bg-muted text-card-foreground"
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-sm">{c.truck}</span>
                            {stockInTruck > 0 ? (
                              <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold ${isSelected ? "bg-primary-foreground/20 text-primary-foreground" : "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"}`}>
                                ★ {stockInTruck} bags
                              </span>
                            ) : (
                              <span className={`text-[10px] ${isSelected ? "text-primary-foreground/80" : "text-muted-foreground"}`}>
                                Empty Gaadi
                              </span>
                            )}
                          </div>
                          {c.driverName && (
                            <span className="block mt-0.5 text-xs opacity-90 truncate">{c.driverName}</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Delivery Source Notice */}
              {truck && (
                <div className="rounded-xl border border-primary/20 bg-primary/5 p-2.5 text-xs text-foreground">
                  {chosenPlaceObj?.truck === truck ? (
                    <span>
                      ✅ <strong>Direct Dispatch:</strong> Mal truck <strong>{truck}</strong> se direct deliver hoga (is truck me <strong>{chosenPlaceObj.bagsHere} bags</strong> loaded hain).
                    </span>
                  ) : chosenPlaceObj && !chosenPlaceObj.truck ? (
                    <span>
                      ℹ️ <strong>Godown se Dispatch:</strong> Mal godown <strong>{chosenPlaceObj.name}</strong> se nikal kar delivery truck <strong>{truck}</strong> me load hoga.
                    </span>
                  ) : (
                    <span>
                      ℹ️ Mal <strong>{chosenPlaceObj?.name}</strong> se deliver hoga via gaadi <strong>{truck}</strong>.
                    </span>
                  )}
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
                Driver phone
                <Input
                  type="tel"
                  inputMode="numeric"
                  autoComplete="off"
                  maxLength={14}
                  value={driverPhone}
                  onChange={(e) => setDriverPhone(e.target.value)}
                />
              </label>
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <div>
              <FormHint>
                {firstMissing([
                  [Number(bags || 0) < 1, "Enter the bags"],
                  [chosenPlace === "" && options.length > 0, "Pick where the bags come from"],
                  [!phoneOk, "Enter the driver mobile"],
                ])}
              </FormHint>
              <Button
                className="w-full"
                onClick={submit}
                disabled={pending || requestedBags < 1 || !chosenPlace || exceedsStock || !phoneOk}
              >
                {chosenPlaceObj?.truck === truck
                  ? `Dispatch ${bagsText(requestedBags)} directly from Truck ${truck}`
                  : `Dispatch ${bagsText(requestedBags)} from ${chosenPlaceObj?.name || "Godown"} via ${truck || "Truck"}`}
              </Button>
            </div>
          </div>
        )}
      </Sheet>
    </div>
  );
}
