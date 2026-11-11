"use client";

import Link from "next/link";
import { ChevronDown, ChevronRight, Eye, EyeOff, Pencil, Plus } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
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
import { addTruck, editTruck, setTruckActive } from "./actions";

type Filter = "all" | "loaded" | "standing";

const FILTER_LABELS: Record<Filter, string> = { all: "All", loaded: "Loaded", standing: "Standing" };

const counterClass = "rounded-2xl bg-card p-3 shadow-card ring-1 ring-foreground/6";

function matchesFilter(r: TruckRow, filter: Filter): boolean {
  if (filter === "loaded") return isLoaded(r);
  if (filter === "standing") return isStanding(r);
  return true;
}

export function TrucksView({ rows }: { rows: TruckRow[] }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [sheet, setSheet] = useState<{ mode: "add" } | { mode: "edit"; truck: TruckRow } | null>(null);
  const [showHidden, setShowHidden] = useState(false);
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab");
  const [filter, setFilter] = useState<Filter>(tabParam === "loaded" || tabParam === "standing" ? tabParam : "all");

  const trimmed = query.trim();
  const normalized = trimmed.toUpperCase().replace(/[^A-Z0-9]/g, "");
  function matchesQuery(r: TruckRow): boolean {
    if (!trimmed) return true;
    const matchNum = normalized !== "" && r.number.toUpperCase().includes(normalized);
    const matchDriver = r.driverName.toLowerCase().includes(trimmed.toLowerCase());
    const matchPhone = r.driverPhone.includes(trimmed);
    return matchNum || matchDriver || matchPhone;
  }

  const visibleRows = rows.filter((r) => r.active);
  const hiddenRows = rows.filter((r) => !r.active);
  const shown = visibleRows.filter((r) => matchesFilter(r, filter) && matchesQuery(r));
  const shownHidden = hiddenRows.filter(matchesQuery);

  const counts = truckCounts(visibleRows);
  const tabCount: Record<Filter, number> = { all: visibleRows.length, ...counts };

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

      {visibleRows.length === 0 ? (
        <EmptyState title={hiddenRows.length > 0 ? "All trucks are hidden" : "No trucks added yet"} />
      ) : shown.length === 0 ? (
        <EmptyState title="No matching trucks" />
      ) : (
        <ul className="flex flex-col gap-3">
          {shown.map((r) => (
            <li key={r.id}>
              <TruckCard truck={r} onEdit={() => setSheet({ mode: "edit", truck: r })} />
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
                  <TruckCard truck={r} onEdit={() => setSheet({ mode: "edit", truck: r })} />
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <PinnedAction>
        <Button onClick={() => setSheet({ mode: "add" })} className="flex items-center gap-2">
          <Plus className="size-4" />
          Add truck
        </Button>
      </PinnedAction>

      <Sheet
        open={sheet !== null}
        onOpenChange={(o) => !o && setSheet(null)}
        title={sheet?.mode === "edit" ? "Edit truck" : "Add truck"}
      >
        {sheet && (
          <TruckForm
            key={sheet.mode === "edit" ? sheet.truck.id : "add"}
            initial={sheet.mode === "edit" ? sheet.truck : undefined}
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
    <div className={cn("flex flex-col gap-2 rounded-2xl bg-card p-4 shadow-card ring-1 ring-foreground/6", !r.active && "opacity-75")}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-base font-bold tracking-wide">{r.number}</span>
        {r.active ? (
          <span className="tabular text-sm text-muted-foreground">{r.bags > 0 ? bagsText(r.bags) : "Empty"}</span>
        ) : (
          <StatusChip status="cancelled" label="Hidden" />
        )}
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-foreground/6 pt-2 text-sm text-muted-foreground">
        <div>
          <p className="font-medium text-foreground">{r.driverName || "No driver"}</p>
          {r.driverPhone && <p className="text-xs">{r.driverPhone}</p>}
        </div>
        {r.driverPhone && <CallButton phone={r.driverPhone} label={`Call ${r.driverName || r.number}`} />}
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex flex-wrap items-center justify-between gap-2">
        {r.bags > 0 ? (
          <Link
            href={`/stock/transfer?from=vehicle:${r.id}`}
            className="inline-flex min-h-9 items-center justify-center rounded-xl border border-primary/25 bg-primary/10 px-3 py-1.5 text-xs font-bold text-primary transition-all hover:bg-primary/20 active:scale-95"
          >
            Unload to Godown
          </Link>
        ) : (
          <span />
        )}
        <div className="ml-auto flex items-center gap-1.5">
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
    </div>
  );
}

function TruckForm({ initial, onDone }: { initial?: TruckRow; onDone: () => void }) {
  const [number, setNumber] = useState(initial?.number ?? "");
  const [driverName, setDriverName] = useState(initial?.driverName ?? "");
  const [driverPhone, setDriverPhone] = useState(initial?.driverPhone ?? "");
  const { error, setError, clearError } = useFormError([number, driverName, driverPhone]);
  const [pending, start] = useTransition();

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    clearError();
    start(async () => {
      const payload = { number, driverName, driverPhone };
      const res = initial ? await editTruck(initial.id, payload) : await addTruck(payload);
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
        {initial ? "Save changes" : "Save truck"}
      </Button>
    </form>
  );
}
