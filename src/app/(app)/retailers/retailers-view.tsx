"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type ComponentProps, type FormEvent, type ReactNode, useState, useTransition } from "react";
import { ConfirmStep } from "@/components/app/confirm-step";
import { EmptyState } from "@/components/app/empty-state";
import { FormHint } from "@/components/app/form-hint";
import { HintLine } from "@/components/app/hint-line";
import { ListCard } from "@/components/app/list-card";
import { PageHeader } from "@/components/app/page-header";
import { PinnedAction } from "@/components/app/pinned-action";
import { ReasonPicker } from "@/components/app/reason-picker";
import { SectionCaption } from "@/components/app/section-caption";
import { SelectField } from "@/components/app/select-field";
import { Sheet } from "@/components/app/sheet";
import { StatusChip } from "@/components/app/status-chip";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { creditLimitText, effectiveCreditDays, parseCreditLimit, validateCreditDays } from "@/lib/credit-rules";
import { formatDate, toISTDateKey } from "@/lib/datetime";
import { firstMissing } from "@/lib/form-rules";
import { formatINR } from "@/lib/money";
import { reasonHint } from "@/lib/reason-codes";
import { matchesRetailerSearch } from "@/lib/retailer-rules";
import {
  CREDIT_STATUSES,
  CREDIT_STATUS_LABELS,
  type CreditStatus,
  isShopCategory,
  SHOP_CATEGORIES,
  SHOP_CATEGORY_LABELS,
} from "@/lib/shop-lists";
import { ADDRESS_MAX, cleanGeo, geoErrorText, mapUrl, OWNER_NAME_MAX } from "@/lib/shop-master-rules";
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
  ownerName: string | null;
  altPhone: string | null;
  address: string | null;
  areaId: string | null;
  areaName: string;
  /** Admin only: what the shop owes now (paise, 0 when nothing); null for everyone else. */
  duesPaise: number | null;
  pincode: string | null;
  lat: number | null;
  lng: number | null;
  category: string | null;
  openedOn: string | null;
  gstin: string | null;
  /** null = this viewer may not see credit terms. */
  credit: { limitPaise: number | null; creditDays: number | null; status: CreditStatus } | null;
  /** Admin only: the last credit changes, newest first, ready to show. */
  creditHistory: { id: string; summary: string; by: string; at: string }[];
};
type Login = { id: string; label: string };

/** A phone number as a 48px tap-to-call link. */
function PhoneLink({ phone }: { phone: string }) {
  return (
    <a href={`tel:${phone}`} className="tabular -my-1 inline-flex min-h-12 items-center font-semibold underline underline-offset-2">
      {phone}
    </a>
  );
}

/** "Open map" for a pinned shop (opens Google Maps in a new tab), with a 48px tap area. */
function MapLink({ lat, lng }: { lat: number; lng: number }) {
  return (
    <a
      href={mapUrl(lat, lng)}
      target="_blank"
      rel="noreferrer"
      className="-mx-2 inline-flex min-h-12 min-w-12 items-center justify-center px-2 text-sm font-semibold underline underline-offset-2"
    >
      Open map
    </a>
  );
}

const NO_LIMIT_CLASS = "text-amber-700";

export function RetailersView({
  rows,
  canEdit,
  logins,
  salesReps,
  areas = null,
  onlyNoRep = false,
  onlyNoLimit = false,
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
  /** Switched-on areas admin may pick; null = this viewer cannot edit. */
  areas?: Login[] | null;
  /** Only the shops that need a sales person are listed (`?filter=no-rep`, from Home). */
  onlyNoRep?: boolean;
  /** Only switched-on shops with no credit limit are listed (`?filter=no-limit`, from Home). */
  onlyNoLimit?: boolean;
  /** Shortcuts in the shop sheet: record a payment / place an order with this shop filled in. */
  canRecordPayment?: boolean;
  canOrder?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [detailId, setDetailId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const detail = rows.find((r) => r.id === detailId) ?? null;
  const shown = rows.filter((r) => matchesRetailerSearch(r, query));
  // Opened from a Home shortcut: back goes to the full list, and an empty list reads "None left".
  const fromHome = onlyNoRep || onlyNoLimit;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Retailers" back={fromHome ? "/retailers" : undefined} />
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
        <EmptyState title={fromHome ? "None left" : "No retailers"} />
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
                      {r.areaName && ` · ${r.areaName}`}
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
            areas={areas ?? []}
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

/** One label + value in the read-only shop card. */
function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

/** A text field with its label, 48px tall. */
function TextField({
  id,
  label,
  value,
  onChange,
  ...props
}: { id: string; label: string; value: string; onChange: (v: string) => void } & Omit<
  ComponentProps<typeof Input>,
  "id" | "value" | "onChange"
>) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} value={value} onChange={(e) => onChange(e.target.value)} autoComplete="off" {...props} />
    </div>
  );
}

/**
 * "Pin location": takes the phone's GPS position (high accuracy, 15 s at most). It only fills the form;
 * Save stores it. Shows the pinned "lat, lng" with a map link and Clear.
 */
function GpsField({
  lat,
  lng,
  onChange,
}: {
  lat: number | null;
  lng: number | null;
  onChange: (geo: { lat: number | null; lng: number | null }) => void;
}) {
  const [finding, setFinding] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);

  function pin() {
    setGeoError(null);
    if (!("geolocation" in navigator)) {
      setGeoError("Location not available");
      return;
    }
    setFinding(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setFinding(false);
        const geo = cleanGeo({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        if (geo.ok) onChange(geo.value);
        else setGeoError(geo.error);
      },
      (err) => {
        setFinding(false);
        setGeoError(geoErrorText(err.code));
      },
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 },
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-medium">GPS</span>
      {lat !== null && lng !== null && (
        <div className="flex flex-wrap items-center gap-x-4">
          <span className="tabular text-base">
            {lat}, {lng}
          </span>
          <MapLink lat={lat} lng={lng} />
          <Button type="button" variant="ghost" size="sm" onClick={() => onChange({ lat: null, lng: null })}>
            Clear
          </Button>
        </div>
      )}
      <Button type="button" variant="outline" disabled={finding} onClick={pin}>
        {finding ? "Finding…" : "Pin location"}
      </Button>
      {geoError && <p className="text-sm text-destructive">{geoError}</p>}
    </div>
  );
}

/** The read-only shop card for staff who cannot edit. Empty fields are left out. */
function ShopFacts({ row }: { row: Row }) {
  const credit = row.credit;
  return (
    <dl className="flex flex-col gap-3 text-base">
      <Fact label="Phone">
        <PhoneLink phone={row.phone} />
      </Fact>
      {row.altPhone && (
        <Fact label="Alt phone">
          <PhoneLink phone={row.altPhone} />
        </Fact>
      )}
      {row.ownerName && <Fact label="Owner">{row.ownerName}</Fact>}
      {row.place && <Fact label="Place">{row.place}</Fact>}
      {row.address && <Fact label="Address">{row.address}</Fact>}
      {row.areaName && <Fact label="Area">{row.areaName}</Fact>}
      {row.pincode && (
        <Fact label="Pincode">
          <span className="tabular">{row.pincode}</span>
        </Fact>
      )}
      {row.lat !== null && row.lng !== null && (
        <Fact label="Location">
          <MapLink lat={row.lat} lng={row.lng} />
        </Fact>
      )}
      {row.category && isShopCategory(row.category) && (
        <Fact label="Category">{SHOP_CATEGORY_LABELS[row.category]}</Fact>
      )}
      {row.openedOn && <Fact label="Opened on">{formatDate(row.openedOn)}</Fact>}
      {row.gstin && (
        <Fact label="GSTIN">
          <span className="tabular">{row.gstin}</span>
        </Fact>
      )}
      <Fact label="Sales person">{row.salesRepName || "None"}</Fact>
      {credit && (
        <>
          <Fact label="Credit limit">
            {credit.limitPaise === null ? (
              <span className={NO_LIMIT_CLASS}>No limit set</span>
            ) : (
              <span className="tabular font-semibold">{formatINR(credit.limitPaise, { hidePaise: true })}</span>
            )}
          </Fact>
          <Fact label="Credit days">
            <span className="tabular">{effectiveCreditDays(credit.creditDays)}</span>
            {credit.creditDays === null && " (default)"}
          </Fact>
          <Fact label="Credit status">{CREDIT_STATUS_LABELS[credit.status]}</Fact>
        </>
      )}
    </dl>
  );
}

/**
 * Everything about one shop in one place: details, master data, credit terms, sales person and login
 * are saved together with one Save button. Turning a shop off asks "sure?" first. Without edit rights
 * it is a read-only card.
 */
function ShopDetail({
  row,
  canEdit,
  logins,
  salesReps,
  areas,
  canRecordPayment,
  canOrder,
  onDone,
}: {
  row: Row;
  canEdit: boolean;
  logins: Login[] | null;
  salesReps: Login[] | null;
  areas: Login[];
  canRecordPayment: boolean;
  canOrder: boolean;
  onDone: () => void;
}) {
  const saved = row.credit ?? { limitPaise: null, creditDays: null, status: "ok" as CreditStatus };
  const [name, setName] = useState(row.name);
  const [phone, setPhone] = useState(row.phone);
  const [place, setPlace] = useState(row.place);
  const [category, setCategory] = useState(row.category ?? "");
  const [openedOn, setOpenedOn] = useState(row.openedOn ?? "");
  const [gstin, setGstin] = useState(row.gstin ?? "");
  const [ownerName, setOwnerName] = useState(row.ownerName ?? "");
  const [altPhone, setAltPhone] = useState(row.altPhone ?? "");
  const [address, setAddress] = useState(row.address ?? "");
  const [areaId, setAreaId] = useState(row.areaId ?? "");
  const [pincode, setPincode] = useState(row.pincode ?? "");
  const [geo, setGeo] = useState({ lat: row.lat, lng: row.lng });
  const [limit, setLimit] = useState(creditLimitText(saved.limitPaise));
  const [days, setDays] = useState(saved.creditDays === null ? "" : String(saved.creditDays));
  const [creditStatus, setCreditStatus] = useState<string>(saved.status);
  const [note, setNote] = useState("");
  const [repId, setRepId] = useState(row.salesRepId ?? "");
  const [loginId, setLoginId] = useState(row.userId ?? "");
  const [turningOff, setTurningOff] = useState(false);
  const [offCode, setOffCode] = useState<string | null>(null);
  const [offNote, setOffNote] = useState("");
  const router = useRouter();
  const { error, setError, clearError } = useFormError([
    name,
    phone,
    place,
    category,
    openedOn,
    gstin,
    ownerName,
    altPhone,
    address,
    areaId,
    pincode,
    geo,
    limit,
    days,
    creditStatus,
    note,
    repId,
    loginId,
    turningOff,
    offCode,
    offNote,
  ]);
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
        <ShopFacts row={row} />
      </div>
    );
  }

  // The credit part is admin's (canEdit); the note is asked only when a credit value changes.
  const parsedLimit = parseCreditLimit(limit);
  const parsedDays = validateCreditDays(days);
  const creditChanged =
    !parsedLimit.ok ||
    !parsedDays.ok ||
    parsedLimit.value !== saved.limitPaise ||
    parsedDays.value !== saved.creditDays ||
    creditStatus !== saved.status;

  /** One save for everything: all of it is saved, or nothing. */
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
        master: { ownerName, altPhone, address, areaId, pincode, lat: geo.lat, lng: geo.lng, category, openedOn, gstin },
        credit: { limit, days, status: creditStatus, note: creditChanged ? note : "" },
      });
      if (res.ok) onDone();
      else setError(res.error);
    });
  }

  // A shop that owes needs a reason to be turned off (the server checks it too).
  const owes = (row.duesPaise ?? 0) > 0;
  const duesText = owes ? formatINR(row.duesPaise ?? 0, { hidePaise: true }) : "";
  const offHint = owes ? reasonHint("shop_off", offCode, offNote) : null;

  function switchTo(active: boolean) {
    clearError();
    start(async () => {
      const res = await setRetailerActive(row.id, active, active || !offCode ? undefined : { code: offCode, note: offNote });
      if (res.ok) onDone();
      else {
        setError(res.error);
        // Dues came in since the page loaded: reload so the reason picker shows.
        if (!owes && res.error === "Pick a reason") router.refresh();
      }
    });
  }

  // A sales person, login or area that is no longer in the list is still shown while it is the current pick.
  const newRepName = repId && repId !== (row.salesRepId ?? "") ? salesReps?.find((p) => p.id === repId)?.label : undefined;
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
  const areaOptions = [
    { value: "", label: "No area" },
    ...(row.areaId && !areas.some((a) => a.id === row.areaId)
      ? [{ value: row.areaId, label: row.areaName || "Former area" }]
      : []),
    ...areas.map((a) => ({ value: a.id, label: a.label })),
  ];
  const categoryOptions = [
    { value: "", label: "Not set" },
    ...SHOP_CATEGORIES.map((c) => ({ value: c, label: SHOP_CATEGORY_LABELS[c] })),
  ];
  const statusOptions = CREDIT_STATUSES.map((c) => ({ value: c, label: CREDIT_STATUS_LABELS[c] }));

  return (
    <div className="flex flex-col gap-4">
      {shortcuts}
      <form onSubmit={save} className="flex flex-col gap-6">
        <section className="flex flex-col gap-4">
          <SectionCaption>Shop</SectionCaption>
          <TextField id="shop-name" label="Name" value={name} onChange={setName} />
          <TextField id="shop-phone" label="Phone" type="tel" inputMode="numeric" value={phone} onChange={setPhone} />
          <TextField id="shop-place" label="Place" value={place} onChange={setPlace} />
          <SelectField label="Category" value={category} onChange={setCategory} options={categoryOptions} />
          <TextField
            id="shop-opened"
            label="Opened on"
            type="date"
            max={toISTDateKey(new Date())}
            value={openedOn}
            onChange={setOpenedOn}
          />
          <TextField
            id="shop-gstin"
            label="GSTIN"
            value={gstin}
            onChange={(v) => setGstin(v.toUpperCase())}
            maxLength={15}
            autoCapitalize="characters"
            spellCheck={false}
            className="tabular uppercase"
          />
          {salesReps && (
            <SelectField
              label="Sales person"
              value={repId}
              onChange={setRepId}
              placeholder="No sales person"
              options={repOptions}
            />
          )}
          {owes && newRepName && (
            <div className="-mt-2">
              <HintLine>{`${duesText} dues move to ${newRepName}`}</HintLine>
            </div>
          )}
          {logins && <SelectField label="Login" value={loginId} onChange={setLoginId} options={loginOptions} />}
        </section>
        <section className="flex flex-col gap-4">
          <SectionCaption>Contact</SectionCaption>
          <TextField
            id="shop-owner"
            label="Owner name"
            value={ownerName}
            onChange={setOwnerName}
            maxLength={OWNER_NAME_MAX}
          />
          <TextField
            id="shop-alt-phone"
            label="Alt phone"
            type="tel"
            inputMode="numeric"
            value={altPhone}
            onChange={setAltPhone}
          />
        </section>
        <section className="flex flex-col gap-4">
          <SectionCaption>Location</SectionCaption>
          <TextField id="shop-address" label="Address" value={address} onChange={setAddress} maxLength={ADDRESS_MAX} />
          <SelectField label="Area" value={areaId} onChange={setAreaId} options={areaOptions} />
          <TextField
            id="shop-pincode"
            label="Pincode"
            inputMode="numeric"
            maxLength={6}
            value={pincode}
            onChange={setPincode}
            className="tabular"
          />
          <GpsField lat={geo.lat} lng={geo.lng} onChange={setGeo} />
        </section>
        <section className="flex flex-col gap-4">
          <SectionCaption>Credit</SectionCaption>
          <div className="flex flex-col gap-1">
            <TextField
              id="shop-limit"
              label="Credit limit (₹)"
              inputMode="decimal"
              value={limit}
              onChange={setLimit}
              className="tabular"
            />
            {limit.trim() === "" && <p className={cn("text-xs", NO_LIMIT_CLASS)}>No limit set</p>}
          </div>
          <TextField
            id="shop-days"
            label="Credit days"
            inputMode="numeric"
            placeholder={String(effectiveCreditDays(null))}
            value={days}
            onChange={setDays}
            className="tabular"
          />
          <SelectField label="Status" value={creditStatus} onChange={setCreditStatus} options={statusOptions} />
          {creditChanged && (
            <TextField id="shop-credit-note" label="Note (optional)" value={note} onChange={setNote} maxLength={200} />
          )}
          {row.creditHistory.length > 0 && (
            <div className="flex flex-col gap-2">
              <SectionCaption>Credit history</SectionCaption>
              <ul className="flex flex-col gap-2 text-sm">
                {row.creditHistory.map((h) => (
                  <li key={h.id}>
                    <span className="tabular">{h.summary}</span>
                    <span className="text-muted-foreground">
                      {" "}
                      — {h.by}, {h.at}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
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
          confirmDisabled={offHint !== null}
          onBack={() => setTurningOff(false)}
          onConfirm={() => switchTo(false)}
        >
          {owes && (
            <>
              <p className="tabular text-sm text-muted-foreground">{duesText} due</p>
              <ReasonPicker
                action="shop_off"
                label={`Turn off ${row.name}?`}
                code={offCode}
                onCodeChange={setOffCode}
                note={offNote}
                onNoteChange={setOffNote}
                disabled={pending}
              />
            </>
          )}
        </ConfirmStep>
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
