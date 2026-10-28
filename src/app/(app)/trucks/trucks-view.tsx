"use client";

import { Plus } from "lucide-react";
import { type FormEvent, useState, useTransition } from "react";
import { CallButton } from "@/components/app/call-button";
import { ChipCount, chipClass } from "@/components/app/chip";
import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { PinnedAction } from "@/components/app/pinned-action";
import { Sheet } from "@/components/app/sheet";
import { Stat } from "@/components/app/stat";
import { StatusChip } from "@/components/app/status-chip";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { isLoaded, isStanding, truckCounts } from "@/lib/truck-rules";
import type { TruckRow } from "@/lib/trucks";
import { useFormError } from "@/lib/use-form-error";
import { cn } from "@/lib/utils";
import { bagsText, formatCount } from "@/lib/words";
import { addTruck, setTruckActive } from "./actions";

type Filter = "all" | "loaded" | "standing";

const FILTER_LABELS: Record<Filter, string> = { all: "All", loaded: "Loaded", standing: "Standing" };

const counterClass = "rounded-2xl bg-card p-3 shadow-card ring-1 ring-foreground/6";

function matchesFilter(r: TruckRow, filter: Filter): boolean {
  if (filter === "loaded") return isLoaded(r);
  if (filter === "standing") return isStanding(r);
  return true;
}

export function TrucksView({ rows }: { rows: TruckRow[] }) {
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");

  const normalized = query.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  const shown = rows.filter((r) => {
    if (!matchesFilter(r, filter)) return false;
    if (!query.trim()) return true;
    const matchNum = normalized !== "" && r.number.toUpperCase().includes(normalized);
    const matchDriver = r.driverName.toLowerCase().includes(query.trim().toLowerCase());
    const matchPhone = r.driverPhone.includes(query.trim());
    return matchNum || matchDriver || matchPhone;
  });

  const counts = truckCounts(rows);
  const tabCount: Record<Filter, number> = { all: rows.length, ...counts };

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Trucks" back="/more" />

      <div className="grid grid-cols-2 gap-3">
        <Stat label="Loaded" value={formatCount(counts.loaded)} className={counterClass} />
        <Stat label="Standing" value={formatCount(counts.standing)} className={counterClass} />
      </div>

      {rows.length > 0 && (
        <div className="flex flex-col gap-2">
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search truck no., driver, phone"
            aria-label="Search trucks"
            autoComplete="off"
          />
          <div className="scroll-x-fade -mx-4 flex gap-2 px-4 pb-1">
            {(["all", "loaded", "standing"] as const).map((f) => (
              <button key={f} type="button" className={chipClass(filter === f)} onClick={() => setFilter(f)}>
                {FILTER_LABELS[f]}
                <ChipCount n={tabCount[f]} on={filter === f} />
              </button>
            ))}
          </div>
        </div>
      )}

      {rows.length === 0 ? (
        <EmptyState title="No trucks added yet" />
      ) : shown.length === 0 ? (
        <EmptyState title="No matching trucks" />
      ) : (
        <ul className="flex flex-col gap-3">
          {shown.map((r) => (
            <li key={r.id}>
              <TruckCard truck={r} />
            </li>
          ))}
        </ul>
      )}

      <PinnedAction>
        <Button onClick={() => setAdding(true)} className="flex items-center gap-2">
          <Plus className="size-4" />
          Add truck
        </Button>
      </PinnedAction>

      <Sheet open={adding} onOpenChange={setAdding} title="Add truck">
        {adding && <AddTruckForm onDone={() => setAdding(false)} />}
      </Sheet>
    </div>
  );
}

function TruckCard({ truck: r }: { truck: TruckRow }) {
  const [error, setError] = useState("");
  const [pending, start] = useTransition();

  function toggle() {
    setError("");
    start(async () => {
      const res = await setTruckActive(r.id, !r.active);
      if (!res.ok) setError(res.error);
    });
  }

  return (
    <div className={cn("flex flex-col gap-2 rounded-2xl bg-card p-4 shadow-card ring-1 ring-foreground/6", !r.active && "opacity-60")}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-base font-bold tracking-wide">{r.number}</span>
        {r.active ? (
          <span className="tabular text-sm text-muted-foreground">{r.bags > 0 ? bagsText(r.bags) : "Empty"}</span>
        ) : (
          <StatusChip status="cancelled" label="Off" />
        )}
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-foreground/6 pt-2 text-sm text-muted-foreground">
        <div>
          <p className="font-medium text-foreground">{r.driverName || "No driver"}</p>
          {r.driverPhone && <p className="text-xs">{r.driverPhone}</p>}
        </div>
        {r.driverPhone && <CallButton phone={r.driverPhone} label={`Call ${r.driverName || r.number}`} />}
      </div>

      <div className="flex items-center justify-between gap-2">
        {error ? <p className="text-sm text-destructive">{error}</p> : <span />}
        <Button type="button" variant="outline" size="sm" disabled={pending} onClick={toggle}>
          {r.active ? "Switch off" : "Switch on"}
        </Button>
      </div>
    </div>
  );
}

function AddTruckForm({ onDone }: { onDone: () => void }) {
  const [number, setNumber] = useState("");
  const [driverName, setDriverName] = useState("");
  const [driverPhone, setDriverPhone] = useState("");
  const { error, setError, clearError } = useFormError([number, driverName, driverPhone]);
  const [pending, start] = useTransition();

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    clearError();
    start(async () => {
      const res = await addTruck({
        number,
        driverName,
        driverPhone,
      });
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
        Save truck
      </Button>
    </form>
  );
}
