"use client";

import Link from "next/link";
import { type FormEvent, useState, useTransition } from "react";
import { ConfirmStep } from "@/components/app/confirm-step";
import { EmptyState } from "@/components/app/empty-state";
import { FormHint } from "@/components/app/form-hint";
import { ListCard } from "@/components/app/list-card";
import { PageHeader } from "@/components/app/page-header";
import { PinnedAction } from "@/components/app/pinned-action";
import { SelectField } from "@/components/app/select-field";
import { Sheet } from "@/components/app/sheet";
import { StatusChip } from "@/components/app/status-chip";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { firstMissing } from "@/lib/form-rules";
import { matchesRetailerSearch } from "@/lib/retailer-rules";
import { cn } from "@/lib/utils";
import { useFormError } from "@/lib/use-form-error";
import { addRetailer, saveShop, setRetailerActive } from "./actions";

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

export function RetailersView({
  rows,
  canEdit,
  logins,
  salesReps,
  onlyNoRep = false,
  canRecordPayment = false,
  canOrder = false,
}: {
  rows: Row[];
  /** Admin: add, edit and turn off shops. */
  canEdit: boolean;
  /** Retailer logins not linked to a shop yet; null = this viewer cannot link. */
  logins: Login[] | null;
  /** Sales people admin may pick; null = this viewer cannot change it. */
  salesReps: Login[] | null;
  /** Only the shops that need a sales person are listed (`?filter=no-rep`, from Home). */
  onlyNoRep?: boolean;
  /** Shortcuts in the shop sheet: record a payment / place an order with this shop filled in. */
  canRecordPayment?: boolean;
  canOrder?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [detailId, setDetailId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const detail = rows.find((r) => r.id === detailId) ?? null;
  const shown = rows.filter((r) => matchesRetailerSearch(r, query));

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Retailers" back={onlyNoRep ? "/retailers" : undefined} />
      {rows.length > 0 && (
        <Input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search name, phone or place"
          aria-label="Search retailers"
          autoComplete="off"
        />
      )}
      {rows.length === 0 ? (
        <EmptyState title={onlyNoRep ? "None left" : "No retailers"} />
      ) : shown.length === 0 ? (
        <EmptyState title="No match" />
      ) : (
        <ul className="flex flex-col gap-3">
          {shown.map((r, i) => (
            <li key={r.id}>
              <ListCard
                index={i}
                title={r.name}
                onClick={() => setDetailId(r.id)}
                className={r.active ? undefined : "opacity-60"}
                top={r.active ? undefined : <StatusChip status="cancelled" label="Off" />}
                bottom={
                  <div className="flex w-full min-w-0 flex-col gap-0.5 text-xs text-muted-foreground">
                    <span>
                      <span className="tabular">{r.phone}</span>
                      {r.place && ` · ${r.place}`}
                    </span>
                    {salesReps && <span>{r.salesRepName || "No sales person"}</span>}
                  </div>
                }
              />
            </li>
          ))}
        </ul>
      )}
      {canEdit && (
        <PinnedAction>
          <Button onClick={() => setAdding(true)}>Add</Button>
        </PinnedAction>
      )}
      <Sheet open={detail !== null} onOpenChange={(o) => !o && setDetailId(null)} title={detail?.name ?? ""}>
        {detail && (
          <ShopDetail
            key={detail.id}
            row={detail}
            canEdit={canEdit}
            logins={logins}
            salesReps={salesReps}
            canRecordPayment={canRecordPayment}
            canOrder={canOrder}
            onDone={() => setDetailId(null)}
          />
        )}
      </Sheet>
      <Sheet open={adding} onOpenChange={setAdding} title="New retailer">
        {adding && <AddShop salesReps={salesReps ?? []} onDone={() => setAdding(false)} />}
      </Sheet>
    </div>
  );
}

/**
 * Everything about one shop in one place: details, sales person and login are saved together with one
 * Save button. Turning a shop off asks "sure?" first. Without edit rights it is a read-only card.
 */
function ShopDetail({
  row,
  canEdit,
  logins,
  salesReps,
  canRecordPayment,
  canOrder,
  onDone,
}: {
  row: Row;
  canEdit: boolean;
  logins: Login[] | null;
  salesReps: Login[] | null;
  canRecordPayment: boolean;
  canOrder: boolean;
  onDone: () => void;
}) {
  const [name, setName] = useState(row.name);
  const [phone, setPhone] = useState(row.phone);
  const [place, setPlace] = useState(row.place);
  const [repId, setRepId] = useState(row.salesRepId ?? "");
  const [loginId, setLoginId] = useState(row.userId ?? "");
  const [turningOff, setTurningOff] = useState(false);
  const { error, setError, clearError } = useFormError([name, phone, place, repId, loginId, turningOff]);
  const [pending, start] = useTransition();

  const shortcuts = row.active && (canRecordPayment || canOrder) && (
    <div className="flex gap-2">
      {canRecordPayment && (
        <Link href={`/receipts/new?retailer=${row.id}`} className={cn(buttonVariants({ size: "lg" }), "flex-1")}>
          Record payment
        </Link>
      )}
      {canOrder && (
        <Link
          href={`/orders/new?retailer=${row.id}`}
          className={cn(buttonVariants({ size: "lg", variant: canRecordPayment ? "outline" : "default" }), "flex-1")}
        >
          New order
        </Link>
      )}
    </div>
  );

  if (!canEdit) {
    return (
      <div className="flex flex-col gap-4">
        {shortcuts}
        <dl className="flex flex-col gap-3 text-base">
          <div>
            <dt className="text-xs text-muted-foreground">Phone</dt>
            <dd>
              <a
                href={`tel:${row.phone}`}
                className="tabular -my-1 inline-flex min-h-12 items-center font-semibold underline underline-offset-2"
              >
                {row.phone}
              </a>
            </dd>
          </div>
          {row.place && (
            <div>
              <dt className="text-xs text-muted-foreground">Place</dt>
              <dd>{row.place}</dd>
            </div>
          )}
          <div>
            <dt className="text-xs text-muted-foreground">Sales person</dt>
            <dd>{row.salesRepName || "None"}</dd>
          </div>
        </dl>
      </div>
    );
  }

  /** One save for everything (details, sales person, login): all of it is saved, or nothing. */
  function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    clearError();
    start(async () => {
      const res = await saveShop(row.id, {
        name,
        phone,
        place,
        salesRepId: salesReps && repId && repId !== (row.salesRepId ?? "") ? repId : undefined,
        userId: logins && loginId !== (row.userId ?? "") ? loginId || null : undefined,
      });
      if (res.ok) onDone();
      else setError(res.error);
    });
  }

  function switchTo(active: boolean) {
    clearError();
    start(async () => {
      const res = await setRetailerActive(row.id, active);
      if (res.ok) onDone();
      else setError(res.error);
    });
  }

  // A sales person or login who is no longer in the list is still shown while they are the current pick.
  const repOptions = [
    ...(row.salesRepId && !salesReps?.some((p) => p.id === row.salesRepId)
      ? [{ value: row.salesRepId, label: row.salesRepName || "Former sales person" }]
      : []),
    ...(salesReps ?? []).map((p) => ({ value: p.id, label: p.label })),
  ];
  const loginOptions = [
    { value: "", label: "No login" },
    ...(row.userId && !logins?.some((l) => l.id === row.userId)
      ? [{ value: row.userId, label: row.loginName || "Linked login" }]
      : []),
    ...(logins ?? []).map((l) => ({ value: l.id, label: l.label })),
  ];

  return (
    <div className="flex flex-col gap-4">
      {shortcuts}
      <form onSubmit={save} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="shop-name">Name</Label>
          <Input id="shop-name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="shop-phone">Phone</Label>
          <Input
            id="shop-phone"
            type="tel"
            inputMode="numeric"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            autoComplete="off"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="shop-place">Place</Label>
          <Input id="shop-place" value={place} onChange={(e) => setPlace(e.target.value)} autoComplete="off" />
        </div>
        {salesReps && (
          <SelectField
            label="Sales person"
            value={repId}
            onChange={setRepId}
            placeholder="No sales person"
            options={repOptions}
          />
        )}
        {logins && <SelectField label="Login" value={loginId} onChange={setLoginId} options={loginOptions} />}
        {error && <p className="text-sm text-destructive">{error}</p>}
        {!turningOff && (
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : "Save"}
          </Button>
        )}
      </form>
      {turningOff ? (
        <ConfirmStep
          question={`Turn off ${row.name}?`}
          confirmLabel="Turn off"
          destructive
          pending={pending}
          onBack={() => setTurningOff(false)}
          onConfirm={() => switchTo(false)}
        />
      ) : row.active ? (
        <Button variant="ghost" className="text-destructive" disabled={pending} onClick={() => setTurningOff(true)}>
          Turn off
        </Button>
      ) : (
        <Button variant="outline" disabled={pending} onClick={() => switchTo(true)}>
          Turn on
        </Button>
      )}
    </div>
  );
}

function AddShop({ salesReps, onDone }: { salesReps: Login[]; onDone: () => void }) {
  const [rep, setRep] = useState("");
  // The text fields are read with FormData, so the form's onInput clears the error.
  const { error, setError, clearError } = useFormError();
  const [pending, start] = useTransition();
  const hint = firstMissing([[!rep, "Pick a sales person"]]);

  // onSubmit (not a form action) so the fields keep their text when there is an error.
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    clearError();
    const f = new FormData(e.currentTarget);
    start(async () => {
      const res = await addRetailer({
        name: String(f.get("name") ?? ""),
        phone: String(f.get("phone") ?? ""),
        place: String(f.get("place") ?? ""),
        salesRepId: rep,
      });
      if (res.ok) onDone();
      else setError(res.error);
    });
  }

  return (
    <form onSubmit={submit} onInput={clearError} className="flex flex-col gap-4">
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
      <SelectField
        label="Sales person"
        value={rep}
        onChange={(v) => {
          clearError();
          setRep(v);
        }}
        placeholder="Pick one"
        options={salesReps.map((p) => ({ value: p.id, label: p.label }))}
      />
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div>
        <FormHint>{hint}</FormHint>
        <Button className="w-full" type="submit" disabled={pending || hint !== null}>
          Add
        </Button>
      </div>
    </form>
  );
}
