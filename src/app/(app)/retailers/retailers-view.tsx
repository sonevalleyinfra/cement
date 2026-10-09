"use client";

import { useState, useTransition } from "react";
import { EmptyState } from "@/components/app/empty-state";
import { ListCard } from "@/components/app/list-card";
import { PinnedAction } from "@/components/app/pinned-action";
import { Sheet } from "@/components/app/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saveRetailer, setRetailerActive } from "./actions";

type Row = { id: string; name: string; phone: string; place: string; active: boolean };

export function RetailersView({ rows, canEdit }: { rows: Row[]; canEdit: boolean }) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Row | null>(null);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();

  function openSheet(row: Row | null) {
    setEditing(row);
    setError("");
    setOpen(true);
  }

  function submit(formData: FormData) {
    start(async () => {
      const res = await saveRetailer(editing?.id ?? null, {
        name: String(formData.get("name") ?? ""),
        phone: String(formData.get("phone") ?? ""),
        place: String(formData.get("place") ?? ""),
      });
      if (res.ok) setOpen(false);
      else setError(res.error);
    });
  }

  return (
    <>
      {rows.length === 0 ? (
        <EmptyState title="No retailers" />
      ) : (
        <ul className="flex flex-col gap-3">
          {rows.map((r, i) => (
            <li key={r.id}>
              <ListCard
                index={i}
                title={r.name}
                className={r.active ? undefined : "opacity-60"}
                top={
                  <span className="text-xs text-muted-foreground">
                    {r.active ? "Active" : "Inactive"}
                  </span>
                }
                bottom={
                  <>
                    <div className="text-xs text-muted-foreground">
                      <span className="tabular">{r.phone}</span>
                      {r.place && ` · ${r.place}`}
                    </div>
                    {canEdit && (
                      <div className="flex gap-2">
                        <Button variant="outline" onClick={() => openSheet(r)}>
                          Edit
                        </Button>
                        <Button
                         
                          variant="ghost"
                          disabled={pending}
                          onClick={() => start(async () => void (await setRetailerActive(r.id, !r.active)))}
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
      <Sheet open={open} onOpenChange={setOpen} title={editing ? "Edit retailer" : "New retailer"}>
        <form key={editing?.id ?? "new"} action={submit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="name">Name</Label>
            <Input id="name" name="name" defaultValue={editing?.name ?? ""} autoComplete="off" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="phone">Phone</Label>
            <Input id="phone" name="phone" type="tel" inputMode="numeric" defaultValue={editing?.phone ?? ""} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="place">Place</Label>
            <Input id="place" name="place" defaultValue={editing?.place ?? ""} />
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
