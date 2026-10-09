"use client";

import { type FormEvent, useState, useTransition } from "react";
import { FirmChip, type FirmSlot } from "@/components/app/firm-chip";
import { ListCard } from "@/components/app/list-card";
import { PinnedAction } from "@/components/app/pinned-action";
import { Sheet } from "@/components/app/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saveFirm, setFirmActive } from "./actions";

type Row = {
  id: string;
  name: string;
  slot: FirmSlot;
  ownerName: string;
  phone: string;
  gstin: string;
  address: string;
  active: boolean;
};

const FIELDS = [
  { name: "name", label: "Firm name", type: "text" },
  { name: "ownerName", label: "Owner (optional)", type: "text" },
  { name: "phone", label: "Phone (optional)", type: "tel" },
  { name: "gstin", label: "GSTIN (optional)", type: "text" },
  { name: "address", label: "Address (optional)", type: "text" },
] as const;

export function FirmsView({ rows }: { rows: Row[] }) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Row | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [listError, setListError] = useState("");
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
      const value = (k: string) => String(formData.get(k) ?? "");
      const res = await saveFirm(editing?.id ?? null, {
        name: value("name"),
        ownerName: value("ownerName"),
        phone: value("phone"),
        gstin: value("gstin"),
        address: value("address"),
      });
      if (res.ok) setOpen(false);
      else setError(res.error);
    });
  }

  function setActive(id: string, active: boolean) {
    start(async () => {
      const res = await setFirmActive(id, active);
      setConfirmId(null);
      setListError(res.ok ? "" : res.error);
    });
  }

  return (
    <>
      {listError && <p className="mb-3 text-sm text-destructive">{listError}</p>}
      <ul className="flex flex-col gap-3">
        {rows.map((r, i) => (
          <li key={r.id}>
            <ListCard
              index={i}
              title={r.name}
              className={r.active ? undefined : "opacity-60"}
              top={
                <>
                  <FirmChip name={r.name} slot={r.slot} />
                  {!r.active && <span className="text-xs text-muted-foreground">Removed</span>}
                </>
              }
              bottom={
                <div className="flex w-full flex-col gap-3">
                  {(r.ownerName || r.phone || r.gstin || r.address) && (
                    <div className="flex flex-col gap-0.5 text-xs text-muted-foreground">
                      {(r.ownerName || r.phone) && (
                        <div>
                          {r.ownerName}
                          {r.ownerName && r.phone && " · "}
                          {r.phone && <span className="tabular">{r.phone}</span>}
                        </div>
                      )}
                      {r.gstin && <div className="tabular">GSTIN {r.gstin}</div>}
                      {r.address && <div>{r.address}</div>}
                    </div>
                  )}
                  {confirmId === r.id ? (
                    <div className="flex gap-2">
                      <Button variant="outline" disabled={pending} onClick={() => setConfirmId(null)}>
                        Back
                      </Button>
                      <Button variant="destructive" disabled={pending} onClick={() => setActive(r.id, false)}>
                        Confirm remove
                      </Button>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <Button variant="outline" onClick={() => openSheet(r)}>
                        Edit
                      </Button>
                      {r.active ? (
                        <Button variant="ghost" disabled={pending} onClick={() => setConfirmId(r.id)}>
                          Remove
                        </Button>
                      ) : (
                        <Button variant="ghost" disabled={pending} onClick={() => setActive(r.id, true)}>
                          Restore
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              }
            />
          </li>
        ))}
      </ul>
      <PinnedAction>
        <Button onClick={() => openSheet(null)}>Add firm</Button>
      </PinnedAction>
      <Sheet open={open} onOpenChange={setOpen} title={editing ? "Edit firm" : "New firm"}>
        <form key={editing?.id ?? "new"} onSubmit={submit} className="flex flex-col gap-4">
          {FIELDS.map((f) => (
            <div key={f.name} className="flex flex-col gap-1.5">
              <Label htmlFor={f.name}>{f.label}</Label>
              <Input
                id={f.name}
                name={f.name}
                type={f.type}
                inputMode={f.type === "tel" ? "numeric" : undefined}
                autoCapitalize={f.name === "gstin" ? "characters" : undefined}
                autoComplete="off"
                defaultValue={editing?.[f.name] ?? ""}
              />
            </div>
          ))}
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" disabled={pending}>
            Save
          </Button>
        </form>
      </Sheet>
    </>
  );
}
