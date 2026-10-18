"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useState, useTransition } from "react";
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
import { useFormError } from "@/lib/use-form-error";
import { bagsText } from "@/lib/words";
import { saveGodown, setGodownActive } from "./actions";

type Row = { id: string; name: string; address: string; active: boolean; bags: number };

export function GodownsView({ rows }: { rows: Row[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Row | null>(null);
  const [turningOff, setTurningOff] = useState(false);
  // The fields are read with FormData, so the form's onInput clears the error.
  const { error, setError, clearError } = useFormError();
  const [pending, start] = useTransition();

  function openSheet(row: Row | null) {
    setEditing(row);
    setTurningOff(false);
    clearError();
    setOpen(true);
  }

  // onSubmit (not a form action) so the fields keep their text when there is an error.
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    clearError();
    start(async () => {
      const res = await saveGodown(editing?.id ?? null, {
        name: String(formData.get("name") ?? ""),
        address: String(formData.get("address") ?? ""),
      });
      if (res.ok) {
        clearError();
        setOpen(false);
        router.refresh();
      } else setError(res.error);
    });
  }

  function switchTo(r: Row, active: boolean) {
    clearError();
    start(async () => {
      const res = await setGodownActive(r.id, active);
      if (res.ok) {
        setOpen(false);
        router.refresh();
      } else setError(res.error);
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Godowns" />
      {rows.length === 0 ? (
        <EmptyState title="No godowns" />
      ) : (
        <ul className="flex flex-col gap-3">
          {rows.map((r, i) => (
            <li key={r.id}>
              <ListCard
                index={i}
                title={r.name}
                onClick={() => openSheet(r)}
                className={r.active ? undefined : "opacity-60"}
                top={
                  <>
                    {!r.active && <StatusChip status="cancelled" label="Off" />}
                    <span className="tabular ml-auto text-sm font-semibold">
                      {bagsText(r.bags)}
                    </span>
                  </>
                }
                bottom={r.address ? <div className="text-xs text-muted-foreground">{r.address}</div> : undefined}
              />
            </li>
          ))}
        </ul>
      )}
      <PinnedAction>
        <Button onClick={() => openSheet(null)}>Add godown</Button>
      </PinnedAction>
      <Sheet
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) clearError();
        }}
        title={editing ? "Edit godown" : "New godown"}
      >
        <form key={editing?.id ?? "new"} onSubmit={submit} onInput={clearError} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="name">Name</Label>
            <Input id="name" name="name" defaultValue={editing?.name ?? ""} autoComplete="off" maxLength={60} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="address">Address (optional)</Label>
            <Input id="address" name="address" defaultValue={editing?.address ?? ""} autoComplete="off" maxLength={200} />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          {!turningOff && (
            <Button type="submit" disabled={pending}>
              Save
            </Button>
          )}
        </form>
        {editing && (
          <div className="mt-4 flex flex-col">
            {turningOff ? (
              <ConfirmStep
                question={`Turn off ${editing.name}?`}
                confirmLabel="Turn off"
                destructive
                pending={pending}
                onBack={() => setTurningOff(false)}
                onConfirm={() => switchTo(editing, false)}
              />
            ) : editing.active ? (
              <Button
                variant="ghost"
                className="text-destructive"
                disabled={pending}
                onClick={() => {
                  clearError();
                  setTurningOff(true);
                }}
              >
                Turn off
              </Button>
            ) : (
              <Button variant="outline" disabled={pending} onClick={() => switchTo(editing, true)}>
                Turn on
              </Button>
            )}
          </div>
        )}
      </Sheet>
    </div>
  );
}
