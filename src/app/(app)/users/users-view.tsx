"use client";

import { type FormEvent, useState, useTransition } from "react";
import { EmptyState } from "@/components/app/empty-state";
import { ListCard } from "@/components/app/list-card";
import { PinnedAction } from "@/components/app/pinned-action";
import { Sheet } from "@/components/app/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { parseRoles, ROLES } from "@/lib/roles";
import { type RoleTab, usersInTab } from "@/lib/user-admin-rules";
import { createUser, deleteUser, setUserActive, type UserResult, updateUserAccess } from "./actions";

type Row = { id: string; name: string; email: string; phone: string; role: string; active: boolean };

const chip = "rounded-full bg-muted px-2 py-0.5 text-xs font-medium";

const tabChip = (on: boolean) =>
  `h-11 shrink-0 rounded-full px-4 text-sm font-semibold capitalize ring-1 transition-[background-color,color,transform] duration-150 ease-out active:scale-[0.97] ${on ? "bg-primary text-primary-foreground shadow-brand ring-primary" : "bg-card ring-foreground/10"}`;

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

export function UsersView({ rows, myId }: { rows: Row[]; myId: string }) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Row | null>(null);
  const [roles, setRoles] = useState<string[]>([]);
  const [tempPassword, setTempPassword] = useState("");
  const [error, setError] = useState("");
  const [listError, setListError] = useState("");
  const [pending, start] = useTransition();

  // Role tabs (a person with several roles shows under each), then Active / Deactivated.
  const tabs: RoleTab[] = [...ROLES, ...(rows.some((r) => parseRoles(r.role).length === 0) ? ["none" as const] : [])];
  const count = (t: RoleTab) => usersInTab(rows, t, true).length + usersInTab(rows, t, false).length;
  const [tab, setTab] = useState<RoleTab>(() => tabs.find((t) => t !== "admin" && count(t) > 0) ?? "admin");
  const [showActive, setShowActive] = useState(true);
  const visible = usersInTab(rows, tab, showActive);

  function rowAction(run: () => Promise<UserResult>) {
    setListError("");
    start(async () => {
      const res = await run();
      if (!res.ok) setListError(res.error);
    });
  }

  function remove(r: Row) {
    if (!window.confirm(`Delete ${r.name}? They disappear from this list. Their records stay.`)) return;
    rowAction(() => deleteUser(r.id));
  }

  function openSheet(row: Row | null) {
    setEditing(row);
    setRoles(row ? parseRoles(row.role) : []);
    setTempPassword("");
    setError("");
    setOpen(true);
  }

  // onSubmit (not a form action) so the fields keep their text when there is an error.
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    start(async () => {
      const res = editing
        ? await updateUserAccess(editing.id, {
            email: String(formData.get("email") ?? ""),
            phone: String(formData.get("phone") ?? ""),
            roles,
            password: tempPassword,
          })
        : await createUser({
            name: String(formData.get("name") ?? ""),
            email: String(formData.get("email") ?? ""),
            phone: String(formData.get("phone") ?? ""),
            roles,
            password: tempPassword,
          });
      if (res.ok) setOpen(false);
      else setError(res.error);
    });
  }

  return (
    <>
      <div className="-mx-4 mb-3 flex gap-2 overflow-x-auto px-4 pb-1">
        {tabs.map((t) => (
          <button key={t} type="button" className={tabChip(tab === t)} onClick={() => setTab(t)}>
            {t === "none" ? "No role" : t} <span className="tabular opacity-70">{count(t)}</span>
          </button>
        ))}
      </div>
      <div className="mb-4 grid grid-cols-2 gap-2">
        {[true, false].map((a) => (
          <button key={String(a)} type="button" className={tabChip(showActive === a)} onClick={() => setShowActive(a)}>
            {a ? "Active" : "Deactivated"} <span className="tabular opacity-70">{usersInTab(rows, tab, a).length}</span>
          </button>
        ))}
      </div>
      {listError && <p className="mb-3 text-sm text-destructive">{listError}</p>}
      {visible.length === 0 ? (
        <EmptyState title="No users" />
      ) : (
        <ul className="flex flex-col gap-3">
          {visible.map((r, i) => (
            <li key={r.id}>
              <ListCard
                index={i}
                title={r.name}
                top={
                  <span className="text-xs text-muted-foreground">
                    {r.email}
                    {r.phone && <span className="tabular"> · {r.phone}</span>}
                  </span>
                }
                bottom={
                  <>
                    <div className="flex flex-wrap gap-1">
                      {parseRoles(r.role).map((x) => (
                        <span key={x} className={chip}>{x}</span>
                      ))}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button variant="outline" onClick={() => openSheet(r)}>Edit</Button>
                      {r.id !== myId && (
                        <Button variant="ghost" disabled={pending} onClick={() => rowAction(() => setUserActive(r.id, !r.active))}>
                          {r.active ? "Deactivate" : "Reactivate"}
                        </Button>
                      )}
                      {!r.active && r.id !== myId && (
                        <Button variant="ghost" className="text-destructive" disabled={pending} onClick={() => remove(r)}>
                          Delete
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
        <form key={editing?.id ?? "new"} onSubmit={submit} className="flex flex-col gap-4">
          {!editing && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="name">Name</Label>
              <Input id="name" name="name" autoComplete="off" />
            </div>
          )}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" autoComplete="off" defaultValue={editing?.email ?? ""} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="phone">Phone</Label>
            <Input
              id="phone"
              name="phone"
              type="tel"
              inputMode="numeric"
              autoComplete="off"
              defaultValue={editing?.phone ?? ""}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="password">{editing ? "New temporary password" : "Temporary password"}</Label>
            {/* Plain text so the admin can read it out or copy it to the user. Blank = no change / email a link. */}
            <Input
              id="password"
              name="password"
              type="text"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              value={tempPassword}
              onChange={(e) => setTempPassword(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Roles</Label>
            <Checks options={ROLES.map((x) => ({ id: x, label: x }))} value={roles} onChange={setRoles} />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" disabled={pending}>
            {editing ? "Save" : tempPassword.trim() ? "Create" : "Create and email link"}
          </Button>
        </form>
      </Sheet>
    </>
  );
}
