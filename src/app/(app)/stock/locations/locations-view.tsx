"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { addLocation, setLocationActive } from "../actions";

type Place = { id: string; name: string; kind: string; active: boolean };

export function LocationsView({
  firmId,
  places,
  freeVehicles,
}: {
  firmId: string;
  places: Place[];
  freeVehicles: { id: string; number: string }[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [godown, setGodown] = useState("");
  const [vehicleId, setVehicleId] = useState(freeVehicles[0]?.id ?? "");
  const [error, setError] = useState("");

  function run(fn: () => Promise<{ ok: true } | { ok: false; error: string }>) {
    setError("");
    start(async () => {
      const res = await fn();
      if (res.ok) {
        setGodown("");
        router.refresh();
      } else setError(res.error);
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-bold">Stock places</h1>
      <ul className="flex flex-col gap-2">
        {places.map((p) => (
          <li key={p.id} className="flex items-center justify-between rounded-2xl bg-card p-4 ring-1 ring-foreground/8">
            <span className={p.active ? "font-semibold" : "text-muted-foreground line-through"}>
              {p.kind === "vehicle" ? `Vehicle ${p.name}` : p.name}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={pending}
              onClick={() => run(() => setLocationActive(p.id, !p.active))}
            >
              {p.active ? "Switch off" : "Switch on"}
            </Button>
          </li>
        ))}
      </ul>
      <div className="flex gap-2">
        <Input value={godown} onChange={(e) => setGodown(e.target.value)} placeholder="New godown name" aria-label="Godown name" />
        <Button disabled={pending} onClick={() => run(() => addLocation(firmId, { kind: "godown", name: godown, vehicleId: null }))}>
          Add
        </Button>
      </div>
      {freeVehicles.length > 0 && (
        <div className="flex gap-2">
          <select
            className="h-11 w-full rounded-xl border bg-background px-3 text-base"
            value={vehicleId}
            onChange={(e) => setVehicleId(e.target.value)}
            aria-label="Vehicle"
          >
            {freeVehicles.map((v) => (
              <option key={v.id} value={v.id}>
                {v.number}
              </option>
            ))}
          </select>
          <Button disabled={pending} onClick={() => run(() => addLocation(firmId, { kind: "vehicle", name: "", vehicleId }))}>
            Add
          </Button>
        </div>
      )}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
