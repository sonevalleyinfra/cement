import Link from "next/link";
import { notFound } from "next/navigation";
import {
  Building2,
  CheckCircle2,
  Clock,
  Factory,
  Truck,
} from "lucide-react";
import { CallButton } from "@/components/app/call-button";
import { PageHeader } from "@/components/app/page-header";
import { can } from "@/lib/permissions";
import { requireRole } from "@/lib/session";
import { getTruckJourney } from "@/lib/trucks";
import { bagsText, formatCount } from "@/lib/words";

function formatIST(date: Date): string {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(date);
}

export default async function TruckJourneyPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireRole("admin", "logistics", "accounts");
  const { id } = await params;
  const journey = await getTruckJourney(id);

  if (!journey) {
    notFound();
  }

  const { vehicle, latestPurchase, events } = journey;
  const isLoaded = vehicle.bags > 0;
  const canDispatch = can(session.user.role, "dispatch");

  return (
    <div className="flex flex-col gap-4 pb-8">
      <PageHeader
        title={vehicle.number}
        back="/trucks"
        action={
          isLoaded ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-bold text-emerald-700 dark:text-emerald-400 ring-1 ring-emerald-500/30">
              <span className="relative flex size-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
              </span>
              {bagsText(vehicle.bags)} on road
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-xs font-bold text-muted-foreground ring-1 ring-foreground/10">
              <CheckCircle2 className="size-3 text-emerald-600" />
              Empty (0 bags)
            </span>
          )
        }
      />

      {/* Hero Live Status Card */}
      <div className="flex flex-col gap-3 rounded-2xl bg-gradient-to-br from-card via-card to-primary/5 p-4 shadow-card ring-1 ring-foreground/6">
        <div className="flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              Live Fleet Status
            </span>
            <p className="text-xl font-black text-foreground">
              {isLoaded ? "In-Transit & Delivering" : "Trip Completed & Vehicle Emptied"}
            </p>
          </div>
          <span className="flex size-11 items-center justify-center rounded-2xl bg-primary/10 text-primary shadow-2xs">
            <Truck className="size-6" />
          </span>
        </div>

        {/* Cargo Products Loaded */}
        {vehicle.products && vehicle.products.length > 0 && (
          <div className="flex flex-col gap-1.5 rounded-xl bg-muted/40 p-3 ring-1 ring-foreground/5">
            <div className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide">
              Cargo on Truck Bed
            </div>
            <div className="divide-y divide-border/40">
              {vehicle.products.map((p) => (
                <div key={p.productId || p.name} className="flex items-center justify-between py-1 text-xs first:pt-0 last:pb-0">
                  <span className="font-semibold text-foreground">{p.name}</span>
                  <span className="font-black text-primary tabular-nums">
                    {formatCount(p.bags)} bags
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Driver Contact Box */}
        <div className="flex items-center justify-between gap-3 border-t border-foreground/6 pt-3">
          <div className="min-w-0">
            <span className="text-[11px] font-semibold text-muted-foreground">Assigned Driver</span>
            <p className="font-bold text-foreground truncate">{vehicle.driverName || "No driver assigned"}</p>
            {vehicle.driverPhone && <p className="text-xs text-muted-foreground">{vehicle.driverPhone}</p>}
          </div>
          {vehicle.driverPhone && (
            <CallButton phone={vehicle.driverPhone} label={`Call ${vehicle.driverName || vehicle.number}`} />
          )}
        </div>
      </div>

      {/* 1-Tap Operational Quick Actions (for Logistics & Admin) */}
      {isLoaded && canDispatch && (
        <div className="grid grid-cols-2 gap-2">
          <Link
            href={`/stock/transfer?from=vehicle:${vehicle.id}`}
            className="flex min-h-11 items-center justify-center gap-2 rounded-2xl border border-primary/25 bg-primary/10 px-3 py-2 text-xs font-bold text-primary transition-all hover:bg-primary/20 active:scale-95 shadow-2xs"
          >
            <Building2 className="size-4" />
            Unload to Godown
          </Link>
          <Link
            href={`/dispatch?truck=${encodeURIComponent(vehicle.number)}`}
            className="flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-primary px-3 py-2 text-xs font-bold text-primary-foreground shadow-xs transition-all hover:bg-primary/90 active:scale-95"
          >
            <Truck className="size-4" />
            Dispatch / Divert
          </Link>
        </div>
      )}

      {/* Amazon / Flipkart Style Live Journey Stepper */}
      <div className="flex flex-col gap-4 rounded-2xl bg-card p-4 shadow-card ring-1 ring-foreground/6">
        <div className="flex items-center justify-between border-b border-foreground/6 pb-2.5">
          <span className="text-sm font-black uppercase tracking-wider text-foreground">
            Live Journey Timeline
          </span>
          <span className="text-xs font-semibold text-muted-foreground">
            {events.length} {events.length === 1 ? "activity" : "activities"}
          </span>
        </div>

        <div className="relative flex flex-col gap-6 pl-6 pt-1">
          {/* Vertical Tracking Line */}
          <div className="absolute bottom-4 left-2.5 top-3 w-0.5 bg-gradient-to-b from-emerald-500 via-primary to-border" />

          {/* Milestone 1: Latest Purchase / Plant Loading */}
          {latestPurchase && (
            <div className="relative flex flex-col gap-1">
              <span className="absolute -left-6 top-0.5 flex size-5 items-center justify-center rounded-full bg-emerald-500 text-white shadow-xs">
                <CheckCircle2 className="size-3.5" />
              </span>
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-sm font-bold text-foreground">Loaded at Factory / Plant</span>
                <span className="text-[11px] text-muted-foreground tabular-nums">
                  {formatIST(latestPurchase.createdAt)}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                Invoice #{latestPurchase.invoiceNo} &middot;{" "}
                <span className="font-bold text-foreground">{formatCount(latestPurchase.billedBags)} Bags Billed</span>
              </p>
              <div className="mt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <Factory className="size-3 text-emerald-600" />
                <span>Tracking ID: {latestPurchase.trackingId}</span>
              </div>
            </div>
          )}

          {/* Milestone 2: Highway Transit / Entered Territory */}
          <div className="relative flex flex-col gap-1">
            <span className="absolute -left-6 top-0.5 flex size-5 items-center justify-center rounded-full bg-emerald-500 text-white shadow-xs">
              <CheckCircle2 className="size-3.5" />
            </span>
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-sm font-bold text-foreground">In-Transit on Highway</span>
              <span className="text-[11px] text-emerald-600 font-semibold">Active</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Driver: {vehicle.driverName || "Assigned"} ({vehicle.driverPhone || "No contact"}) &middot; Vehicle #{vehicle.number}
            </p>
          </div>

          {/* Milestone 3: Intermediate Dispatches & Unloads */}
          {events.length > 0 ? (
            events.map((e) => (
              <div key={e.id} className="relative flex flex-col gap-1">
                <span className="absolute -left-6 top-0.5 flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-xs">
                  {e.type === "dispatch" ? <Truck className="size-3" /> : <Building2 className="size-3" />}
                </span>
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-sm font-bold text-foreground">{e.title}</span>
                  <span className="text-[11px] text-muted-foreground tabular-nums">
                    {formatIST(e.date)}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">{e.subtitle}</p>
                {e.details?.ratePaise != null && (
                  <span className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
                    Billed at ₹{(e.details.ratePaise / 100).toFixed(2)} / bag
                  </span>
                )}
              </div>
            ))
          ) : (
            <div className="relative flex flex-col gap-1">
              <span className="absolute -left-6 top-0.5 flex size-5 items-center justify-center rounded-full bg-amber-500 text-white shadow-xs">
                <Clock className="size-3" />
              </span>
              <span className="text-sm font-semibold text-muted-foreground">
                No customer dispatches yet &middot; Full load intact on vehicle
              </span>
            </div>
          )}

          {/* Milestone 4: Final Trip Settlement (The 0-Bag Rule) */}
          <div className="relative flex flex-col gap-1">
            {isLoaded ? (
              <>
                <span className="absolute -left-6 top-0.5 flex size-5 items-center justify-center rounded-full bg-blue-600 text-white shadow-xs">
                  <span className="size-2 rounded-full bg-white animate-pulse" />
                </span>
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-sm font-bold text-foreground">Delivering in Territory</span>
                  <span className="text-[11px] font-bold text-primary tabular-nums">
                    {bagsText(vehicle.bags)} left
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Truck will remain locked for new purchases until all {vehicle.bags} bags are dispatched or unloaded into a godown.
                </p>
              </>
            ) : (
              <>
                <span className="absolute -left-6 top-0.5 flex size-5 items-center justify-center rounded-full bg-emerald-600 text-white shadow-xs">
                  <CheckCircle2 className="size-3.5" />
                </span>
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-sm font-black text-foreground">Trip Completed &amp; Emptied</span>
                  <span className="text-[11px] font-bold text-emerald-600">0 Bags</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  All cargo accounted for. Vehicle is now unlocked and available for the next factory purchase.
                </p>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
