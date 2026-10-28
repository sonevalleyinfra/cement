"use client";

import { Phone, Plus, Search, Truck as TruckIcon } from "lucide-react";
import { type FormEvent, useState, useTransition } from "react";
import { CallButton } from "@/components/app/call-button";
import { EmptyState } from "@/components/app/empty-state";
import { ListCard } from "@/components/app/list-card";
import { PageHeader } from "@/components/app/page-header";
import { PinnedAction } from "@/components/app/pinned-action";
import { Sheet } from "@/components/app/sheet";
import { StatusChip } from "@/components/app/status-chip";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useFormError } from "@/lib/use-form-error";
import { formatCount } from "@/lib/words";
import { addTruck, setTruckActive } from "./actions";
import type { TruckRow } from "@/lib/trucks";

export function TrucksView({ rows }: { rows: TruckRow[] }) {
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState(false);
  const [filter, setFilter] = useState<"all" | "loaded" | "standing">("all");

  const normalized = query.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  const shown = rows
    .filter((r) => {
      if (filter === "loaded") return r.bags > 0;
      if (filter === "standing") return r.bags === 0;
      return true;
    })
    .filter((r) => {
      if (!query.trim()) return true;
      const matchNum = r.number.toUpperCase().includes(normalized);
      const matchDriver = r.driverName.toLowerCase().includes(query.toLowerCase());
      const matchPhone = r.driverPhone.includes(query.trim());
      return matchNum || matchDriver || matchPhone;
    });

  const loadedCount = rows.filter((r) => r.bags > 0).length;
  const standingCount = rows.filter((r) => r.bags === 0 && r.active).length;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Trucks" back="/more" />

      {/* Summary counters */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl bg-card p-3 shadow-card ring-1 ring-foreground/6">
          <span className="text-xs text-muted-foreground">Loaded Trucks</span>
          <p className="tabular text-xl font-bold text-blue-600">{loadedCount}</p>
        </div>
        <div className="rounded-2xl bg-card p-3 shadow-card ring-1 ring-foreground/6">
          <span className="text-xs text-muted-foreground">Standing (Empty)</span>
          <p className="tabular text-xl font-bold text-foreground">{standingCount}</p>
        </div>
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
          <div className="flex gap-2">
            {(["all", "loaded", "standing"] as const).map((f) => (
              <Button
                key={f}
                type="button"
                size="sm"
                variant={filter === f ? "default" : "outline"}
                onClick={() => setFilter(f)}
                className="rounded-full text-xs font-semibold h-8 capitalize"
              >
                {f === "all" ? `All (${rows.length})` : f === "loaded" ? `Loaded (${loadedCount})` : `Standing (${standingCount})`}
              </Button>
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
          {shown.map((r, i) => (
            <li key={r.id}>
              <div className="flex flex-col gap-2 rounded-2xl bg-card p-4 shadow-card ring-1 ring-foreground/6">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold text-base tracking-wide">{r.number}</span>
                  {r.bags > 0 ? (
                    <span className="inline-flex items-center rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-semibold text-blue-800 dark:bg-blue-950 dark:text-blue-300">
                      Loaded: {formatCount(r.bags)} bags
                    </span>
                  ) : (
                    <span className="inline-flex items-center rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                      Standing (Empty)
                    </span>
                  )}
                </div>

                <div className="flex items-center justify-between gap-2 text-sm text-muted-foreground pt-1 border-t border-foreground/6">
                  <div>
                    <p className="font-medium text-foreground">{r.driverName || "No driver assigned"}</p>
                    <p className="text-xs">{r.driverPhone || "No phone"}</p>
                  </div>
                  {r.driverPhone && (
                    <CallButton phone={r.driverPhone} label={`Call ${r.driverName || r.number}`} />
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      <PinnedAction>
        <Button onClick={() => setAdding(true)} className="flex items-center gap-2">
          <Plus className="size-4" />
          Add Truck
        </Button>
      </PinnedAction>

      <Sheet open={adding} onOpenChange={setAdding} title="Add Truck">
        {adding && <AddTruckForm onDone={() => setAdding(false)} />}
      </Sheet>
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
          placeholder="e.g. UP65BT1234"
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
          placeholder="e.g. Ramesh Singh"
          maxLength={80}
          autoComplete="off"
          required
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="truck-phone">Driver phone (10 digits)</Label>
        <Input
          id="truck-phone"
          value={driverPhone}
          onChange={(e) => setDriverPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
          placeholder="e.g. 9876543210"
          type="tel"
          inputMode="numeric"
          autoComplete="off"
        />
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Button type="submit" disabled={pending || !number.trim() || !driverName.trim()} className="w-full">
        Save Truck
      </Button>
    </form>
  );
}
