"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useState, useTransition } from "react";
import { EmptyState } from "@/components/app/empty-state";
import { ListCard } from "@/components/app/list-card";
import { PageHeader } from "@/components/app/page-header";
import { PinnedAction } from "@/components/app/pinned-action";
import { Sheet } from "@/components/app/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useFormError } from "@/lib/use-form-error";
import { saveGodown, setGodownActive } from "./actions";

type Row = { id: string; name: string; address: string; active: boolean; bags: number };

export function GodownsView({ rows }: { rows: Row[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Row | null>(null);
  // The fields are read with FormData, so the form's onInput clears the error.
  const { error, setError, clearError } = useFormError();
  const [pending, start] = useTransition();

  function openSheet(row: Row | null) {
    setEditing(row);
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

  function toggle(r: Row) {
    clearError();
    start(async () => {
      const res = await setGodownActive(r.id, !r.active);
      if (res.ok) router.refresh();
      else setError(res.error);
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Godowns" />
      {error && !open && <p className="text-sm text-destructive">{error}</p>}
      {rows.length === 0 ? (
        <EmptyState title="No godowns" />
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
                    <span className="text-xs text-muted-foreground">{r.active ? "Active" : "Inactive"}</span>
                    <span className="tabular text-sm font-semibold">{r.bags} bags</span>
                  </>
                }
                bottom={
                  <>
                    {r.address && <div className="text-xs text-muted-foreground">{r.address}</div>}
                    <div className="flex gap-2">
                      <Button variant="outline" onClick={() => openSheet(r)}>
                        Edit
                      </Button>
                      <Button variant="ghost" disabled={pending} onClick={() => toggle(r)}>
                        {r.active ? "Turn off" : "Turn on"}
                      </Button>
                    </div>
                  </>
                }
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
          <Button type="submit" disabled={pending}>
            Save
          </Button>
        </form>
      </Sheet>
    </div>
  );
}
