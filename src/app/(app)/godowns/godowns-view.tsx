"use client";

import Link from "next/link";
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

type GodownProduct = { id: string; name: string; bags: number };
type Row = { id: string; name: string; address: string; active: boolean; bags: number; products?: GodownProduct[] };

export function GodownsView({ rows, canManage = true }: { rows: Row[]; canManage?: boolean }) {
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
                onClick={canManage ? () => openSheet(r) : undefined}
                className={r.active ? undefined : "opacity-60"}
                top={
                  <>
                    {!r.active && <StatusChip status="cancelled" label="Off" />}
                    <span className="tabular ml-auto text-sm font-semibold">
                      {bagsText(r.bags)}
                    </span>
                  </>
                }
                bottom={
                  <div className="flex flex-col gap-2 pt-1 border-t border-border/40">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs text-muted-foreground">{r.address || "Main depot"}</span>
                      {r.active && (
                        <Link
                          href={`/stock/transfer?to=godown:${r.id}`}
                          onClick={(e) => e.stopPropagation()}
                          className="inline-flex items-center justify-center rounded-xl border border-primary/25 bg-primary/10 px-3 py-1.5 text-xs font-bold text-primary transition-all hover:bg-primary/20 active:scale-95"
                        >
                          Unload Truck Here
                        </Link>
                      )}
                    </div>
                    {r.products && r.products.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5 pt-0.5">
                        {r.products.map((p) => (
                          <span
                            key={p.id}
                            className="inline-flex items-center gap-1 rounded-lg bg-muted/60 px-2 py-0.5 text-[11px] font-medium text-foreground ring-1 ring-border/50"
                          >
                            <span>{p.name}:</span>
                            <strong className="font-bold text-primary">{p.bags} bags</strong>
                          </span>
                        ))}
                      </div>
                    ) : r.active ? (
                      <span className="text-[11px] italic text-muted-foreground">Empty (0 bags in godown)</span>
                    ) : null}
                  </div>
                }
              />
            </li>
          ))}
        </ul>
      )}
      {canManage && (
        <PinnedAction>
          <Button onClick={() => openSheet(null)}>Add godown</Button>
        </PinnedAction>
      )}
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
