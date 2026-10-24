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
import { BANK_NAME_MAX, bankAccountLabel, UPI_ID_MAX } from "@/lib/bank-account-rules";
import { useFormError } from "@/lib/use-form-error";
import { deleteBankAccount, saveBankAccount, setBankAccountActive } from "./actions";

type Row = { id: string; name: string; last4: string | null; upiId: string | null; active: boolean; payments: number };

const paymentsText = (n: number) => `${n} ${n === 1 ? "payment" : "payments"}`;

export function BankAccountsView({ rows }: { rows: Row[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Row | null>(null);
  const [confirming, setConfirming] = useState<"off" | "delete" | null>(null);
  // The fields are read with FormData, so the form's onInput clears the error.
  const { error, setError, clearError } = useFormError();
  const [pending, start] = useTransition();

  function openSheet(row: Row | null) {
    setEditing(row);
    setConfirming(null);
    clearError();
    setOpen(true);
  }

  function finish(res: { ok: true } | { ok: false; error: string }) {
    if (res.ok) {
      setOpen(false);
      router.refresh();
    } else setError(res.error);
  }

  // onSubmit (not a form action) so the fields keep their text when there is an error.
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    clearError();
    start(async () => {
      finish(
        await saveBankAccount(editing?.id ?? null, {
          name: String(formData.get("name") ?? ""),
          last4: String(formData.get("last4") ?? ""),
          upiId: String(formData.get("upiId") ?? ""),
        }),
      );
    });
  }

  function run(action: () => Promise<{ ok: true } | { ok: false; error: string }>) {
    clearError();
    start(async () => finish(await action()));
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Bank accounts" />
      {rows.length === 0 ? (
        <EmptyState title="No bank accounts" />
      ) : (
        <ul className="flex flex-col gap-3">
          {rows.map((r, i) => (
            <li key={r.id}>
              <ListCard
                index={i}
                title={bankAccountLabel(r)}
                onClick={() => openSheet(r)}
                className={r.active ? undefined : "opacity-60"}
                top={
                  <>
                    {!r.active && <StatusChip status="cancelled" label="Off" />}
                    <span className="tabular ml-auto text-sm font-semibold">{paymentsText(r.payments)}</span>
                  </>
                }
                bottom={r.upiId ? <span className="truncate text-xs text-muted-foreground">{r.upiId}</span> : undefined}
              />
            </li>
          ))}
        </ul>
      )}
      <PinnedAction>
        <Button onClick={() => openSheet(null)}>Add account</Button>
      </PinnedAction>
      <Sheet
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) clearError();
        }}
        title={editing ? "Edit account" : "New account"}
      >
        <form key={editing?.id ?? "new"} onSubmit={submit} onInput={clearError} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="bank-name">Name</Label>
            <Input id="bank-name" name="name" defaultValue={editing?.name ?? ""} autoComplete="off" maxLength={BANK_NAME_MAX} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="bank-last4">Last 4 digits (optional)</Label>
            <Input
              id="bank-last4"
              name="last4"
              defaultValue={editing?.last4 ?? ""}
              inputMode="numeric"
              autoComplete="off"
              maxLength={4}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="bank-upi">UPI ID (optional)</Label>
            <Input
              id="bank-upi"
              name="upiId"
              defaultValue={editing?.upiId ?? ""}
              autoComplete="off"
              autoCapitalize="none"
              maxLength={UPI_ID_MAX}
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          {!confirming && (
            <Button type="submit" disabled={pending}>
              Save
            </Button>
          )}
        </form>
        {editing && (
          <div className="mt-4 flex flex-col gap-2">
            {confirming === "off" ? (
              <ConfirmStep
                question={`Switch off ${editing.name}?`}
                confirmLabel="Switch off"
                destructive
                pending={pending}
                onBack={() => setConfirming(null)}
                onConfirm={() => run(() => setBankAccountActive(editing.id, false))}
              />
            ) : confirming === "delete" ? (
              <ConfirmStep
                question={`Delete ${editing.name}?`}
                confirmLabel="Delete"
                destructive
                pending={pending}
                onBack={() => setConfirming(null)}
                onConfirm={() => run(() => deleteBankAccount(editing.id))}
              />
            ) : (
              <>
                {editing.active ? (
                  <Button
                    variant="ghost"
                    className="text-destructive"
                    disabled={pending}
                    onClick={() => {
                      clearError();
                      setConfirming("off");
                    }}
                  >
                    Switch off
                  </Button>
                ) : (
                  <Button variant="outline" disabled={pending} onClick={() => run(() => setBankAccountActive(editing.id, true))}>
                    Switch on
                  </Button>
                )}
                {editing.payments === 0 && (
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
                )}
              </>
            )}
          </div>
        )}
      </Sheet>
    </div>
  );
}
