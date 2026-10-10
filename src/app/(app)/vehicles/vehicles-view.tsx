"use client";

import { type FormEvent, useState, useTransition } from "react";
import { EmptyState } from "@/components/app/empty-state";
import { ListCard } from "@/components/app/list-card";
import { PinnedAction } from "@/components/app/pinned-action";
import { Sheet } from "@/components/app/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saveVehicle, setVehicleActive } from "./actions";

type Row = { id: string; number: string; driverName: string; driverPhone: string; active: boolean };

export function VehiclesView({ rows, canEdit }: { rows: Row[]; canEdit: boolean }) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Row | null>(null);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();

  function openSheet(row: Row | null) {
    setEditing(row);
    setError("");
    setOpen(true);
  }

  // onSubmit (not a form action) so the fields keep their text when there is an error.
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    start(async () => {
      const res = await saveVehicle(editing?.id ?? null, {
        number: String(formData.get("number") ?? ""),
        driverName: String(formData.get("driverName") ?? ""),
        driverPhone: String(formData.get("driverPhone") ?? ""),
      });
      if (res.ok) setOpen(false);
      else setError(res.error);
    });
  }

  return (
    <>
      {error && !open && <p className="text-sm text-destructive">{error}</p>}
      {rows.length === 0 ? (
        <EmptyState title="No vehicles" />
      ) : (
        <ul className="flex flex-col gap-3">
          {rows.map((r, i) => (
            <li key={r.id}>
              <ListCard
                index={i}
                title={r.number}
                className={r.active ? undefined : "opacity-60"}
                top={
                  <span className="text-xs text-muted-foreground">
                    {r.active ? "Active" : "Inactive"}
                  </span>
                }
                bottom={
                  <>
                    <div className="text-xs text-muted-foreground">
                      {r.driverName}
                      {r.driverPhone && <> · <span className="tabular">{r.driverPhone}</span></>}
                    </div>
                    {canEdit && (
                      <div className="flex gap-2">
                        <Button variant="outline" onClick={() => openSheet(r)}>
                          Edit
                        </Button>
                        <Button
                         
                          variant="ghost"
                          disabled={pending}
                          onClick={() =>
                            start(async () => {
                              setError("");
                              const res = await setVehicleActive(r.id, !r.active);
                              if (!res.ok) setError(res.error);
                            })
                          }
                        >
                          {r.active ? "Turn off" : "Turn on"}
                        </Button>
                      </div>
                    )}
                  </>
                }
              />
            </li>
          ))}
        </ul>
      )}
      {canEdit && (
        <PinnedAction>
          <Button onClick={() => openSheet(null)}>Add</Button>
        </PinnedAction>
      )}
      <Sheet
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) setError("");
        }}
        title={editing ? "Edit vehicle" : "New vehicle"}
      >
        <form key={editing?.id ?? "new"} onSubmit={submit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="number">Vehicle number</Label>
            <Input id="number" name="number" defaultValue={editing?.number ?? ""} autoComplete="off" autoCapitalize="characters" placeholder="BR01AB1234" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="driverName">Driver name</Label>
            <Input id="driverName" name="driverName" defaultValue={editing?.driverName ?? ""} autoComplete="off" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="driverPhone">Driver phone (optional)</Label>
            <Input id="driverPhone" name="driverPhone" type="tel" inputMode="numeric" defaultValue={editing?.driverPhone ?? ""} />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" disabled={pending}>
            Save
          </Button>
        </form>
      </Sheet>
    </>
  );
}
