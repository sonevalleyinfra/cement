"use client";

import { type FormEvent, useState, useTransition } from "react";
import { EmptyState } from "@/components/app/empty-state";
import { ListCard } from "@/components/app/list-card";
import { PinnedAction } from "@/components/app/pinned-action";
import { Sheet } from "@/components/app/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  addRetailer,
  linkRetailerUser,
  saveRetailer,
  setRetailerActive,
  setRetailerSalesRep,
} from "./actions";

type Row = {
  id: string;
  name: string;
  phone: string;
  place: string;
  active: boolean;
  userId: string | null;
  salesRepId: string | null;
  salesRepName: string;
  loginName: string;
};
type Login = { id: string; label: string };

const selectClass = "h-12 w-full rounded-xl border bg-background px-3 text-base";

export function RetailersView({
  rows,
  canEdit,
  logins,
  salesReps,
}: {
  rows: Row[];
  /** Admin: add, edit and turn off shops. */
  canEdit: boolean;
  /** Retailer logins not linked to a shop yet; null = this viewer cannot link. */
  logins: Login[] | null;
  /** Sales people admin may pick; null = this viewer cannot change it. */
  salesReps: Login[] | null;
}) {
  const [linkError, setLinkError] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Row | null>(null);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const [adding, setAdding] = useState(false);
  const [newRep, setNewRep] = useState("");

  function openSheet(row: Row) {
    setEditing(row);
    setError("");
    setOpen(true);
  }

  function openAdd() {
    setNewRep("");
    setError("");
    setAdding(true);
  }

  // onSubmit (not a form action) so the fields keep their text when there is an error.
  function submitAdd(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    start(async () => {
      const res = await addRetailer({
        name: String(f.get("name") ?? ""),
        phone: String(f.get("phone") ?? ""),
        place: String(f.get("place") ?? ""),
        salesRepId: newRep,
      });
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
                top={<span className="text-xs text-muted-foreground">{r.active ? "Active" : "Inactive"}</span>}
                bottom={
                  // One column so the pickers and buttons wrap inside the card on a phone.
                  <div className="flex w-full min-w-0 flex-col gap-2">
                    <div className="text-xs text-muted-foreground">
                      <span className="tabular">{r.phone}</span>
                      {r.place && ` · ${r.place}`}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {salesReps ? (
                        <select
                          aria-label={`Sales person for ${r.name}`}
                          className="h-9 max-w-40 rounded-lg border bg-background px-2 text-xs"
                          value={r.salesRepId ?? ""}
                          disabled={pending}
                          onChange={(e) =>
                            start(async () => {
                              const res = await setRetailerSalesRep(r.id, e.target.value);
                              setLinkError(res.ok ? "" : res.error);
                            })
                          }
                        >
                          {!r.salesRepId && (
                            <option value="" disabled>
                              No sales person
                            </option>
                          )}
                          {/* Keep showing a current pick who is no longer active. */}
                          {r.salesRepId && !salesReps.some((p) => p.id === r.salesRepId) && (
                            <option value={r.salesRepId}>{r.salesRepName || "Former sales person"}</option>
                          )}
                          {salesReps.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.label}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <div className="text-xs text-muted-foreground">{r.salesRepName || "No sales person"}</div>
                      )}
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
                          {r.userId && !logins.some((l) => l.id === r.userId) && (
                            <option value={r.userId}>{r.loginName || "Linked login"}</option>
                          )}
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
                    </div>
                  </div>
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
      <Sheet open={adding} onOpenChange={setAdding} title="New retailer">
        <form onSubmit={submitAdd} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="add-name">Name</Label>
            <Input id="add-name" name="name" autoComplete="off" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="add-phone">Phone</Label>
            <Input id="add-phone" name="phone" type="tel" inputMode="numeric" autoComplete="off" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="add-place">Place</Label>
            <Input id="add-place" name="place" autoComplete="off" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="add-rep">Sales person</Label>
            <select id="add-rep" className={selectClass} value={newRep} onChange={(e) => setNewRep(e.target.value)}>
              <option value="" disabled>
                Pick one
              </option>
              {(salesReps ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" disabled={pending || !newRep}>
            Add
          </Button>
        </form>
      </Sheet>
    </>
  );
}
