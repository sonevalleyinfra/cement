"use client";

import Link from "next/link";
import { Building2, ChevronDown, ChevronRight, Eye, EyeOff, Pencil, Truck } from "lucide-react";
import { useRouter } from "next/navigation";
import { type FormEvent, useState, useTransition } from "react";
import { CallButton } from "@/components/app/call-button";
import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { Sheet } from "@/components/app/sheet";
import { Stat } from "@/components/app/stat";
import { StatusChip } from "@/components/app/status-chip";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { activeLoadedTrucks } from "@/lib/truck-rules";
import type { TruckRow } from "@/lib/trucks";
import { useFormError } from "@/lib/use-form-error";
import { cn } from "@/lib/utils";
import { bagsText, formatCount } from "@/lib/words";
import { editTruck, setTruckActive } from "./actions";

const counterClass = "rounded-2xl bg-card p-3 shadow-card ring-1 ring-foreground/6";

export function TrucksView({ rows, back }: { rows: TruckRow[]; initialTab?: string; back: string }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [sheet, setSheet] = useState<{ truck: TruckRow } | null>(null);
  const [showHidden, setShowHidden] = useState(false);

  const trimmed = query.trim();
  const normalized = trimmed.toUpperCase().replace(/[^A-Z0-9]/g, "");
  function matchesQuery(r: TruckRow): boolean {
    if (!trimmed) return true;
    const matchNum = normalized !== "" && r.number.toUpperCase().includes(normalized);
    const matchDriver = r.driverName.toLowerCase().includes(trimmed.toLowerCase());
    const matchPhone = r.driverPhone.includes(trimmed);
    return matchNum || matchDriver || matchPhone;
  }

  // Only loaded trucks holding bags (`bags > 0`) stay in operational UI.
  // Once bags reach 0, trucks stay in Admin Reports & CSV only.
  const visibleRows = activeLoadedTrucks(rows);
  const hiddenRows = rows.filter((r) => !r.active && r.bags > 0);
  const shown = visibleRows.filter(matchesQuery);
  const shownHidden = hiddenRows.filter(matchesQuery);
  const totalBagsOnTrucks = visibleRows.reduce((sum, r) => sum + r.bags, 0);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Trucks" back={back} />

      {/* Live Fleet Radar Banner */}
      <div className="flex items-center justify-between gap-2 rounded-2xl bg-gradient-to-r from-blue-600/10 via-indigo-600/10 to-emerald-600/10 p-3.5 ring-1 ring-primary/20">
        <div className="flex items-center gap-2">
          <span className="relative flex size-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex size-2.5 rounded-full bg-emerald-500" />
          </span>
          <span className="text-xs font-black tracking-wide uppercase text-foreground">Live Fleet Radar</span>
        </div>
        <span className="text-xs font-semibold text-muted-foreground">
          {visibleRows.length} active {visibleRows.length === 1 ? "truck" : "trucks"} on road
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Stat label="Loaded trucks" value={formatCount(visibleRows.length)} className={counterClass} />
        <Stat label="Bags on trucks" value={formatCount(totalBagsOnTrucks)} className={counterClass} />
      </div>

      {visibleRows.length > 0 && (
        <Input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search truck no., driver, phone"
          aria-label="Search trucks"
          autoComplete="off"
        />
      )}

      {visibleRows.length === 0 ? (
        <EmptyState
          title="No loaded trucks right now"
          action={
            <p className="max-w-xs text-xs text-muted-foreground">
              Add truck details when recording a Purchase. Once bags reach 0, trucks stay in Admin Reports &amp; CSV only.
            </p>
          }
        />
      ) : shown.length === 0 ? (
        <EmptyState title="No matching trucks" />
      ) : (
        <ul className="flex flex-col gap-3">
          {shown.map((r) => (
            <li key={r.id}>
              <TruckCard truck={r} onEdit={() => setSheet({ truck: r })} />
            </li>
          ))}
        </ul>
      )}

      {shownHidden.length > 0 && (
        <div className="flex flex-col gap-3 pt-1">
          <button
            type="button"
            onClick={() => setShowHidden((v) => !v)}
            aria-expanded={showHidden}
            className="flex min-h-11 items-center justify-between rounded-2xl bg-muted/60 px-4 py-2.5 text-sm font-semibold text-muted-foreground ring-1 ring-foreground/8 transition-colors hover:bg-muted hover:text-foreground"
          >
            <span>Hidden trucks ({shownHidden.length})</span>
            {showHidden ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
          </button>
          {showHidden && (
            <ul className="flex flex-col gap-3">
              {shownHidden.map((r) => (
                <li key={r.id}>
                  <TruckCard truck={r} onEdit={() => setSheet({ truck: r })} />
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <Sheet
        open={sheet !== null}
        onOpenChange={(o) => !o && setSheet(null)}
        title="Edit truck"
      >
        {sheet && (
          <TruckForm
            key={sheet.truck.id}
            initial={sheet.truck}
            onDone={() => {
              setSheet(null);
              router.refresh();
            }}
          />
        )}
      </Sheet>
    </div>
  );
}

function SimpleTruckGraphic({ bags, products }: { bags: number; products?: { name: string; bags: number }[] }) {
  const isMulti = (products?.length ?? 0) > 1;
  const p1 = products?.[0];
  const p2 = products?.[1];

  return (
    <div className="relative overflow-hidden rounded-xl bg-gradient-to-b from-muted/60 to-muted/20 p-2.5 ring-1 ring-foreground/6">
      <div className="flex items-center justify-between pb-1 text-[11px] font-semibold text-muted-foreground">
        <span className="flex items-center gap-1 font-bold text-foreground">
          <Truck className="size-3.5 text-primary" />
          Cargo Bed
        </span>
        <span className="font-bold text-primary tabular-nums">{formatCount(bags)} Bags Loaded</span>
      </div>
      <svg
        viewBox="0 0 240 64"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="h-16 w-full max-w-sm mx-auto"
        role="img"
        aria-label="Loaded Truck Graphic"
      >
        {/* Road line with subtle dashes */}
        <line x1="10" y1="58" x2="230" y2="58" stroke="currentColor" strokeWidth="2" strokeDasharray="6 4" className="text-muted-foreground/30" />
        
        {/* Truck Cabin (Right facing) */}
        <rect x="165" y="24" width="46" height="30" rx="6" className="fill-blue-600 dark:fill-blue-500" />
        <path d="M190 26 H207 C209.5 26 211 28 211 31 L211 39 H190 V26 Z" className="fill-sky-100 dark:fill-sky-950" />
        {/* Headlight */}
        <circle cx="211" cy="46" r="2.5" className="fill-amber-300" />
        {/* Front bumper */}
        <rect x="207" y="50" width="6" height="4" rx="1.5" className="fill-foreground/40" />

        {/* Flatbed Chassis */}
        <rect x="18" y="48" width="150" height="6" rx="2" className="fill-foreground/50" />
        <rect x="16" y="52" width="195" height="2" className="fill-foreground/20" />

        {/* Cargo Bed / Sacks */}
        {bags > 0 ? (
          isMulti ? (
            <g>
              {/* Product 1 stack (rear/left) */}
              <rect x="24" y="20" width="64" height="28" rx="4" className="fill-emerald-600/90" />
              <rect x="27" y="23" width="58" height="7" rx="2" className="fill-white/30" />
              <rect x="27" y="32" width="58" height="7" rx="2" className="fill-white/30" />
              <rect x="27" y="41" width="58" height="5" rx="1.5" className="fill-white/20" />
              <text x="56" y="37" textAnchor="middle" fontSize="9" fontWeight="900" fill="white">
                {p1?.bags ?? 0}
              </text>

              {/* Product 2 stack (front/right) */}
              <rect x="92" y="20" width="68" height="28" rx="4" className="fill-indigo-600/90" />
              <rect x="95" y="23" width="62" height="7" rx="2" className="fill-white/30" />
              <rect x="95" y="32" width="62" height="7" rx="2" className="fill-white/30" />
              <rect x="95" y="41" width="62" height="5" rx="1.5" className="fill-white/20" />
              <text x="126" y="37" textAnchor="middle" fontSize="9" fontWeight="900" fill="white">
                {p2?.bags ?? 0}
              </text>
            </g>
          ) : (
            <g>
              {/* Single product stack */}
              <rect x="24" y="18" width="136" height="30" rx="4" className="fill-primary/90" />
              <rect x="28" y="22" width="128" height="7" rx="2" className="fill-white/25" />
              <rect x="28" y="31" width="128" height="7" rx="2" className="fill-white/25" />
              <rect x="28" y="40" width="128" height="6" rx="2" className="fill-white/15" />
              <text x="92" y="36" textAnchor="middle" fontSize="10" fontWeight="900" fill="white">
                {formatCount(bags)} Bags
              </text>
            </g>
          )
        ) : (
          <rect x="24" y="44" width="136" height="4" rx="2" className="fill-muted-foreground/30" />
        )}

        {/* Wheels with rim details */}
        <g>
          <circle cx="44" cy="54" r="7" className="fill-zinc-800 dark:fill-zinc-900" />
          <circle cx="44" cy="54" r="3" className="fill-zinc-400" />
          <circle cx="64" cy="54" r="7" className="fill-zinc-800 dark:fill-zinc-900" />
          <circle cx="64" cy="54" r="3" className="fill-zinc-400" />
          <circle cx="140" cy="54" r="7" className="fill-zinc-800 dark:fill-zinc-900" />
          <circle cx="140" cy="54" r="3" className="fill-zinc-400" />
          <circle cx="192" cy="54" r="7" className="fill-zinc-800 dark:fill-zinc-900" />
          <circle cx="192" cy="54" r="3" className="fill-zinc-400" />
        </g>
      </svg>
    </div>
  );
}

function TruckCard({ truck: r, onEdit }: { truck: TruckRow; onEdit: () => void }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, start] = useTransition();

  function toggle() {
    setError("");
    start(async () => {
      const res = await setTruckActive(r.id, !r.active);
      if (res.ok) router.refresh();
      else setError(res.error);
    });
  }

  return (
    <div className={cn("flex flex-col gap-3 rounded-2xl bg-card p-4 shadow-card ring-1 ring-foreground/6", !r.active && "opacity-75")}>
      <div className="flex items-center justify-between gap-2">
        <Link href={`/trucks/${r.id}`} className="group flex items-center gap-2 hover:opacity-80">
          <span className="text-base font-extrabold tracking-wide group-hover:underline">{r.number}</span>
          {r.active && r.bags > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-bold text-emerald-700 dark:text-emerald-400">
              <span className="size-1.5 rounded-full bg-emerald-500" />
              Active
            </span>
          )}
        </Link>
        {r.active ? (
          <span className="tabular text-xs font-bold text-primary bg-primary/10 px-2.5 py-1 rounded-full">
            {bagsText(r.bags)}
          </span>
        ) : (
          <StatusChip status="cancelled" label="Hidden" />
        )}
      </div>

      {/* Visual Animated Truck Bed Graphic */}
      <Link href={`/trucks/${r.id}`} className="block transition-transform active:scale-[0.99]">
        <SimpleTruckGraphic bags={r.bags} products={r.products} />
      </Link>

      {/* Product breakdown with name and quantity */}
      {r.products && r.products.length > 0 && (
        <div className="divide-y divide-border/50 rounded-xl bg-muted/40 px-3 py-1">
          {r.products.map((p) => (
            <div
              key={p.productId || p.name}
              className="flex items-center justify-between py-1.5 text-xs first:pt-1 last:pb-1"
            >
              <span className="font-semibold text-foreground">{p.name}</span>
              <span className="shrink-0 font-extrabold text-foreground">
                {formatCount(p.bags)} bags
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Driver Info & Quick Call */}
      <div className="flex items-center justify-between gap-2 border-t border-foreground/6 pt-2 text-sm text-muted-foreground">
        <div>
          <p className="font-medium text-foreground">{r.driverName || "No driver"}</p>
          {r.driverPhone && <p className="text-xs">{r.driverPhone}</p>}
        </div>
        {r.driverPhone && <CallButton phone={r.driverPhone} label={`Call ${r.driverName || r.number}`} />}
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {/* Track Live Journey Link */}
      <Link
        href={`/trucks/${r.id}`}
        className="flex items-center justify-between rounded-xl bg-primary/8 px-3 py-2 text-xs font-bold text-primary transition-all hover:bg-primary/15 active:scale-[0.99]"
      >
        <span className="flex items-center gap-1.5">
          <Truck className="size-3.5" />
          Track Live Journey
        </span>
        <ChevronRight className="size-4" />
      </Link>

      {/* 1-Tap Operational Action Buttons */}
      {r.bags > 0 && (
        <div className="grid grid-cols-2 gap-2 pt-1">
          <Link
            href={`/stock/transfer?from=vehicle:${r.id}`}
            className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl border border-primary/25 bg-primary/10 px-3 py-2 text-xs font-bold text-primary transition-all hover:bg-primary/20 active:scale-95 shadow-2xs"
          >
            <Building2 className="size-3.5" />
            Unload to Godown
          </Link>
          <Link
            href={`/dispatch?truck=${encodeURIComponent(r.number)}`}
            className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-xs font-bold text-primary-foreground shadow-xs transition-all hover:bg-primary/90 active:scale-95"
          >
            <Truck className="size-3.5" />
            Dispatch / Divert
          </Link>
        </div>
      )}

      <div className="flex items-center justify-end gap-1.5 pt-0.5 border-t border-foreground/5">
        <Button type="button" variant="outline" size="sm" onClick={onEdit} aria-label={`Edit ${r.number}`}>
          <Pencil className="size-3.5" />
          Edit
        </Button>
        <Button type="button" variant="outline" size="sm" disabled={pending} onClick={toggle}>
          {r.active ? (
            <>
              <EyeOff className="size-3.5" />
              Hide
            </>
          ) : (
            <>
              <Eye className="size-3.5" />
              Unhide
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

function TruckForm({ initial, onDone }: { initial: TruckRow; onDone: () => void }) {
  const [number, setNumber] = useState(initial.number);
  const [driverName, setDriverName] = useState(initial.driverName);
  const [driverPhone, setDriverPhone] = useState(initial.driverPhone);
  const { error, setError, clearError } = useFormError([number, driverName, driverPhone]);
  const [pending, start] = useTransition();

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    clearError();
    start(async () => {
      const payload = { number, driverName, driverPhone };
      const res = await editTruck(initial.id, payload);
      if (res.ok) {
        onDone();
      } else {
        setError(res.error);
      }
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="truck-num">Truck number</Label>
        <Input
          id="truck-num"
          value={number}
          onChange={(e) => setNumber(e.target.value.toUpperCase().replace(/\s+/g, ""))}
          placeholder="BR01AB1234"
          maxLength={14}
          autoComplete="off"
          required
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="truck-driver">Driver name</Label>
        <Input
          id="truck-driver"
          value={driverName}
          onChange={(e) => setDriverName(e.target.value)}
          maxLength={80}
          autoComplete="off"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="truck-phone">Driver phone (optional)</Label>
        <Input
          id="truck-phone"
          value={driverPhone}
          onChange={(e) => setDriverPhone(e.target.value)}
          type="tel"
          inputMode="numeric"
          autoComplete="off"
          maxLength={14}
        />
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Button type="submit" disabled={pending || !number.trim() || !driverName.trim()} className="w-full">
        Save changes
      </Button>
    </form>
  );
}
