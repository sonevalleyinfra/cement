"use client";

import { Eye, EyeOff } from "lucide-react";
import { useRouter } from "next/navigation";
import { type FormEvent, useState, useTransition } from "react";
import { ChipCount, chipClass } from "@/components/app/chip";
import { ConfirmStep } from "@/components/app/confirm-step";
import { EmptyState } from "@/components/app/empty-state";
import { ListCard } from "@/components/app/list-card";
import { PageHeader } from "@/components/app/page-header";
import { PinnedAction } from "@/components/app/pinned-action";
import { Sheet } from "@/components/app/sheet";
import { StatusChip } from "@/components/app/status-chip";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { parseRoles, ROLES } from "@/lib/roles";
import { type RoleTab, usersInTab } from "@/lib/user-admin-rules";
import { useFormError } from "@/lib/use-form-error";
import { roleLabel } from "@/lib/words";
import { createUser, deleteUser, setUserActive, type UserResult, updateUserAccess } from "./actions";

type Row = { id: string; name: string; email: string; phone: string; role: string; active: boolean };

const chip = "rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium";

const tabChip = (on: boolean) => chipClass(on);

function toggle(list: string[], value: string) {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

function Checks({ options, value, onChange }: { options: { id: string; label: string }[]; value: string[]; onChange: (v: string[]) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => (
        <label key={o.id} className="flex min-h-12 items-center gap-2 rounded-full bg-muted px-4 text-sm">
          <input
            type="checkbox"
            className="size-5"
            checked={value.includes(o.id)}
            onChange={() => onChange(toggle(value, o.id))}
          />
          {o.label}
        </label>
      ))}
    </div>
  );
}

export function UsersView({ rows, myId }: { rows: Row[]; myId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Row | null>(null);
  const [roles, setRoles] = useState<string[]>([]);
  const [tempPassword, setTempPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [confirming, setConfirming] = useState<null | "deactivate" | "delete">(null);
  const { error, setError, clearError } = useFormError([roles, tempPassword]);
  const [pending, start] = useTransition();

  // All, then role tabs (a person with several roles shows under each), then Active / Deactivated.
  const tabs: RoleTab[] = [
    "all",
    ...ROLES,
    ...(rows.some((r) => parseRoles(r.role).length === 0) ? ["none" as const] : []),
  ];
  const count = (t: RoleTab) => usersInTab(rows, t, true).length + usersInTab(rows, t, false).length;
  const [tab, setTab] = useState<RoleTab>("all");
  const [showActive, setShowActive] = useState(true);
  const visible = usersInTab(rows, tab, showActive);

  /** A Deactivate / Reactivate / Delete from the sheet: errors stay in the sheet, success closes it. */
  function sheetAction(run: () => Promise<UserResult>) {
    clearError();
    start(async () => {
      const res = await run();
      if (res.ok) {
        setOpen(false);
        router.refresh();
      } else setError(res.error);
    });
  }

  function openSheet(row: Row | null) {
    setEditing(row);
    setRoles(row ? parseRoles(row.role) : []);
    setTempPassword("");
    setShowPassword(false);
    setConfirming(null);
    clearError();
    setOpen(true);
  }

  // onSubmit (not a form action) so the fields keep their text when there is an error.
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    clearError();
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
      if (res.ok) {
        setOpen(false);
        router.refresh();
      } else setError(res.error);
    });
  }

  return (
    <>
      <div className="mb-4">
        <PageHeader title="Users" />
      </div>
      <div className="scroll-x-fade -mx-4 mb-3 flex gap-2 px-4 pb-1">
        {tabs.map((t) => (
          <button key={t} type="button" className={tabChip(tab === t)} onClick={() => setTab(t)}>
            {t === "all" ? "All" : t === "none" ? "No role" : roleLabel(t)}
            <ChipCount n={count(t)} on={tab === t} />
          </button>
        ))}
      </div>
      <div className="mb-4 grid grid-cols-2 gap-2">
        {[true, false].map((a) => (
          <button key={String(a)} type="button" className={tabChip(showActive === a)} onClick={() => setShowActive(a)}>
            {a ? "Active" : "Deactivated"}
            <ChipCount n={usersInTab(rows, tab, a).length} on={showActive === a} />
          </button>
        ))}
      </div>
      {visible.length === 0 ? (
        <EmptyState title="No users" />
      ) : (
        <ul className="flex flex-col gap-3">
          {visible.map((r, i) => (
            <li key={r.id}>
              <ListCard
                index={i}
                title={r.name}
                onClick={() => openSheet(r)}
                className={r.active ? undefined : "opacity-60"}
                top={
                  <>
                    <span className="min-w-0 truncate text-xs text-muted-foreground">
                      {r.email}
                      {r.phone && <span className="tabular"> · {r.phone}</span>}
                    </span>
                    {!r.active && <StatusChip status="cancelled" label="Deactivated" className="shrink-0" />}
                  </>
                }
                bottom={
                  <div className="flex flex-wrap gap-1">
                    {parseRoles(r.role).map((x) => (
                      <span key={x} className={chip}>{roleLabel(x)}</span>
                    ))}
                  </div>
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
        <form key={editing?.id ?? "new"} onSubmit={submit} onInput={clearError} className="flex flex-col gap-4">
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
            <div className="relative">
              <Input
                id="password"
                name="password"
                type={showPassword ? "text" : "password"}
                className="pr-12"
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                value={tempPassword}
                onChange={(e) => setTempPassword(e.target.value)}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute inset-y-0 right-0"
                aria-label={showPassword ? "Hide password" : "Show password"}
                aria-pressed={showPassword}
                onClick={() => setShowPassword((s) => !s)}
              >
                {showPassword ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
              </Button>
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Roles</Label>
            <Checks options={ROLES.map((x) => ({ id: x, label: roleLabel(x) }))} value={roles} onChange={setRoles} />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          {!confirming && (
            <Button type="submit" disabled={pending}>
              {editing ? "Save" : tempPassword.trim() ? "Create" : "Create and email link"}
            </Button>
          )}
        </form>
        {editing && editing.id !== myId && (
          <div className="mt-4 flex flex-col gap-2">
            {confirming ? (
              <ConfirmStep
                question={`${confirming === "delete" ? "Delete" : "Deactivate"} ${editing.name}?`}
                confirmLabel={confirming === "delete" ? "Delete" : "Deactivate"}
                destructive
                pending={pending}
                onBack={() => setConfirming(null)}
                onConfirm={() =>
                  sheetAction(() => (confirming === "delete" ? deleteUser(editing.id) : setUserActive(editing.id, false)))
                }
              />
            ) : editing.active ? (
              <Button
                variant="ghost"
                className="text-destructive"
                disabled={pending}
                onClick={() => {
                  clearError();
                  setConfirming("deactivate");
                }}
              >
                Deactivate
              </Button>
            ) : (
              <>
                <Button
                  variant="outline"
                  disabled={pending}
                  onClick={() => sheetAction(() => setUserActive(editing.id, true))}
                >
                  Reactivate
                </Button>
                <Button
                  variant="ghost"
                  className="text-destructive"
                  disabled={pending}
                  onClick={() => {
                    clearError();
                    setConfirming("delete");
                  }}
                >
                  Delete
                </Button>
              </>
            )}
          </div>
        )}
      </Sheet>
    </>
  );
}
