"use client";

import { useState, useTransition } from "react";
import { EmptyState } from "@/components/app/empty-state";
import { ListCard } from "@/components/app/list-card";
import { PinnedAction } from "@/components/app/pinned-action";
import { Sheet } from "@/components/app/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { parseRoles, ROLES } from "@/lib/roles";
import { createUser, setUserActive, updateUserAccess } from "./actions";

type Row = { id: string; name: string; email: string; role: string; active: boolean; firmIds: string[] };
type Firm = { id: string; name: string };

const chip = "rounded-full bg-muted px-2 py-0.5 text-xs font-medium";

function toggle(list: string[], value: string) {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

function Checks({ options, value, onChange }: { options: { id: string; label: string }[]; value: string[]; onChange: (v: string[]) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => (
        <label key={o.id} className="flex items-center gap-1.5 rounded-full bg-muted px-3 py-1.5 text-sm">
          <input type="checkbox" checked={value.includes(o.id)} onChange={() => onChange(toggle(value, o.id))} />
          {o.label}
        </label>
      ))}
    </div>
  );
}

export function UsersView({ rows, firms, myId }: { rows: Row[]; firms: Firm[]; myId: string }) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Row | null>(null);
  const [roles, setRoles] = useState<string[]>([]);
  const [firmIds, setFirmIds] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const firmName = (id: string) => firms.find((f) => f.id === id)?.name ?? "";

  function openSheet(row: Row | null) {
    setEditing(row);
    setRoles(row ? parseRoles(row.role) : []);
    setFirmIds(row ? row.firmIds : []);
    setError("");
    setOpen(true);
  }

  function submit(formData: FormData) {
    start(async () => {
      const res = editing
        ? await updateUserAccess(editing.id, { roles, firmIds })
        : await createUser({
            name: String(formData.get("name") ?? ""),
            email: String(formData.get("email") ?? ""),
            roles,
            firmIds,
          });
      if (res.ok) setOpen(false);
      else setError(res.error);
    });
  }

  return (
    <>
      {rows.length === 0 ? (
        <EmptyState title="No users" />
      ) : (
        <ul className="flex flex-col gap-3">
          {rows.map((r, i) => (
            <li key={r.id}>
              <ListCard
                index={i}
                title={r.name}
                className={r.active ? undefined : "opacity-60"}
                top={
                  <>
                    <span className="text-xs text-muted-foreground">{r.email}</span>
                    <span className="text-xs text-muted-foreground">{r.active ? "Active" : "Blocked"}</span>
                  </>
                }
                bottom={
                  <>
                    <div className="flex flex-col gap-1.5">
                      <div className="flex flex-wrap gap-1">
                        {parseRoles(r.role).map((x) => (
                          <span key={x} className={chip}>{x}</span>
                        ))}
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {r.firmIds.map((id) => (
                          <span key={id} className={`${chip} bg-secondary`}>{firmName(id)}</span>
                        ))}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" onClick={() => openSheet(r)}>Edit</Button>
                      {r.id !== myId && (
                        <Button
                          variant="ghost"
                          disabled={pending}
                          onClick={() => start(async () => void (await setUserActive(r.id, !r.active)))}
                        >
                          {r.active ? "Deactivate" : "Reactivate"}
                        </Button>
                      )}
                    </div>
                  </>
                }
              />
            </li>
          ))}
        </ul>
      )}
      <PinnedAction>
        <Button onClick={() => openSheet(null)}>Add</Button>
      </PinnedAction>
      <Sheet open={open} onOpenChange={setOpen} title={editing ? `Edit ${editing.name}` : "New user"}>
        <form key={editing?.id ?? "new"} action={submit} className="flex flex-col gap-4">
          {!editing && (
            <>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="name">Name</Label>
                <Input id="name" name="name" autoComplete="off" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="email">Email</Label>
                <Input id="email" name="email" type="email" autoComplete="off" />
              </div>
            </>
          )}
          <div className="flex flex-col gap-1.5">
            <Label>Roles</Label>
            <Checks options={ROLES.map((x) => ({ id: x, label: x }))} value={roles} onChange={setRoles} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Firms {roles.includes("admin") && "(admin sees all)"}</Label>
            <Checks options={firms.map((f) => ({ id: f.id, label: f.name }))} value={firmIds} onChange={setFirmIds} />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" disabled={pending}>
            {editing ? "Save" : "Create and email link"}
          </Button>
        </form>
      </Sheet>
    </>
  );
}
