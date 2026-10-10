"use client";

import { type FormEvent, useState, useTransition } from "react";
import { EmptyState } from "@/components/app/empty-state";
import { ListCard } from "@/components/app/list-card";
import { PinnedAction } from "@/components/app/pinned-action";
import { Sheet } from "@/components/app/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { matchesRetailerSearch } from "@/lib/retailer-rules";
import { addRetailerFromLogin, linkRetailerUser, saveRetailer, setRetailerActive } from "./actions";

type Row = { id: string; name: string; phone: string; place: string; active: boolean; userId: string | null };
type Login = { id: string; label: string };
type Pickable = { id: string; name: string; email: string; phone: string };

export function RetailersView({
  rows,
  canEdit,
  logins,
  pickable,
}: {
  rows: Row[];
  canEdit: boolean;
  logins: Login[] | null;
  pickable: Pickable[];
}) {
  const [linkError, setLinkError] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Row | null>(null);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const [adding, setAdding] = useState(false);
  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState<Pickable | null>(null);
  const matches = pickable.filter((p) => matchesRetailerSearch(p, search));

  function openSheet(row: Row) {
    setEditing(row);
    setError("");
    setOpen(true);
  }

  function openAdd() {
    setSearch("");
    setPicked(null);
    setError("");
    setAdding(true);
  }

  function submitAdd(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!picked) return;
    const place = String(new FormData(e.currentTarget).get("place") ?? "");
    start(async () => {
      const res = await addRetailerFromLogin(picked.id, place);
      if (res.ok) setAdding(false);
      else setError(res.error);
    });
  }

  // onSubmit (not a form action) so the fields keep their text when there is an error.
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!editing) return;
    const formData = new FormData(e.currentTarget);
    start(async () => {
      const res = await saveRetailer(editing.id, {
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
          {linkError && <p className="text-sm text-destructive">{linkError}</p>}
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
                    {logins && (
                      <select
                        aria-label={`Login for ${r.name}`}
                        className="h-9 max-w-40 rounded-lg border bg-background px-2 text-xs"
                        value={r.userId ?? ""}
                        disabled={pending}
                        onChange={(e) =>
                          start(async () => {
                            const res = await linkRetailerUser(r.id, e.target.value || null);
                            setLinkError(res.ok ? "" : res.error);
                          })
                        }
                      >
                        <option value="">No login</option>
                        {logins.map((l) => (
                          <option key={l.id} value={l.id}>
                            {l.label}
                          </option>
                        ))}
                      </select>
                    )}
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
          <Button onClick={openAdd}>Add</Button>
        </PinnedAction>
      )}
      <Sheet open={open} onOpenChange={setOpen} title="Edit retailer">
        <form key={editing?.id ?? "none"} onSubmit={submit} className="flex flex-col gap-4">
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
      <Sheet open={adding} onOpenChange={setAdding} title={picked ? "New retailer" : "Pick retailer"}>
        {picked ? (
          <form onSubmit={submitAdd} className="flex flex-col gap-4">
            <button
              type="button"
              onClick={() => setPicked(null)}
              className="flex min-h-12 w-full flex-col items-start rounded-2xl bg-card px-4 py-2.5 text-left shadow-card ring-1 ring-foreground/6"
            >
              <span className="font-semibold">{picked.name}</span>
              <span className="text-xs text-muted-foreground">
                <span className="tabular">{picked.phone}</span> · {picked.email}
              </span>
            </button>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="add-place">Place</Label>
              <Input id="add-place" name="place" autoComplete="off" />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" disabled={pending}>
              Add
            </Button>
          </form>
        ) : (
          <>
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Name, email or phone"
              aria-label="Search retailers"
              autoComplete="off"
              className="mb-3"
            />
            <ul className="flex flex-col gap-2">
              {matches.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setPicked(p);
                      setError("");
                    }}
                    className="flex min-h-12 w-full flex-col items-start rounded-2xl bg-card px-4 py-2.5 text-left shadow-card ring-1 ring-foreground/6"
                  >
                    <span className="font-semibold">{p.name}</span>
                    <span className="text-xs text-muted-foreground">
                      <span className="tabular">{p.phone || "No phone"}</span> · {p.email}
                    </span>
                  </button>
                </li>
              ))}
              {matches.length === 0 && (
                <li className="py-6 text-center text-muted-foreground">
                  {pickable.length === 0 ? "No new retailers. Ask admin to add one." : "No match"}
                </li>
              )}
            </ul>
          </>
        )}
      </Sheet>
    </>
  );
}
