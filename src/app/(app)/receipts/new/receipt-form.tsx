"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { FirmChip } from "@/components/app/firm-chip";
import { Keypad } from "@/components/app/keypad";
import { PinnedAction } from "@/components/app/pinned-action";
import { Sheet } from "@/components/app/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatDate } from "@/lib/datetime";
import { formatINR, parseRupeesToPaise } from "@/lib/money";
import { autoSplitOldestFirst, clearFull, PAYMENT_MODES, validateModeDetails, type PaymentMode } from "@/lib/receipt-rules";
import { loadOutstanding, saveReceipt, type DueRow } from "../actions";

type Firm = { id: string; name: string; slot: "a" | "b" | "c" };
type RetailerRow = { id: string; name: string; place: string };

const modeLabel: Record<PaymentMode, string> = { cash: "Cash", online: "Online", cheque: "Cheque" };

const chip = (on: boolean) =>
  `h-11 rounded-full px-4 text-sm font-semibold ring-1 ring-foreground/10 ${on ? "bg-primary text-primary-foreground" : "bg-card"}`;

export function ReceiptForm({ retailers, firms }: { retailers: RetailerRow[]; firms: Firm[] }) {
  const router = useRouter();
  const [retailer, setRetailer] = useState<RetailerRow | null>(null);
  const [pickOpen, setPickOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [digits, setDigits] = useState("");
  const [mode, setMode] = useState<PaymentMode>("cash");
  const [utr, setUtr] = useState("");
  const [receivedFirmId, setReceivedFirmId] = useState(firms[0]?.id ?? "");
  const [chequeNumber, setChequeNumber] = useState("");
  const [chequeDate, setChequeDate] = useState("");
  const [bankName, setBankName] = useState("");
  const [dues, setDues] = useState<DueRow[]>([]);
  // What the person typed per order (rupee text). Missing = use the auto-split value.
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [forced, setForced] = useState<Record<string, number> | null>(null);
  const [advanceFirmId, setAdvanceFirmId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();

  const totalPaise = digits ? Number(digits) * 100 : 0;
  const firmById = useMemo(() => new Map(firms.map((f) => [f.id, f])), [firms]);
  const items = useMemo(
    () => dues.map((d) => ({ orderId: d.orderId, firmId: d.firmId, dueSinceDate: d.dueSinceDate, duePaise: d.duePaise })),
    [dues],
  );
  const sortedDues = useMemo(() => {
    return [...dues].sort((a, b) => (a.dueSinceDate < b.dueSinceDate ? -1 : a.dueSinceDate > b.dueSinceDate ? 1 : 0));
  }, [dues]);

  // Amount for each order: typed value, else clear/auto value, else auto-split preview.
  const auto = useMemo(() => autoSplitOldestFirst(totalPaise, items), [totalPaise, items]);
  const amounts = useMemo(() => {
    const base: Record<string, number> = {};
    const source = forced ?? Object.fromEntries(auto.allocations.map((a) => [a.orderId, a.amountPaise]));
    for (const d of dues) base[d.orderId] = source[d.orderId] ?? 0;
    for (const [id, text] of Object.entries(edits)) {
      const p = text.trim() === "" ? 0 : parseRupeesToPaise(text);
      base[id] = p === null || p < 0 ? NaN : p;
    }
    return base;
  }, [auto, forced, edits, dues]);

  const allocated = Object.values(amounts).reduce((n, v) => n + (Number.isNaN(v) ? 0 : v), 0);
  const badInput = Object.values(amounts).some((v) => Number.isNaN(v));
  const overDue = dues.some((d) => (amounts[d.orderId] ?? 0) > d.duePaise);
  const leftover = totalPaise - allocated;
  const advancePaise = advanceFirmId && leftover > 0 ? leftover : 0;
  const remaining = leftover - advancePaise;

  const modeError = validateModeDetails(mode, { utr, receivedFirmId, chequeNumber, chequeDate, bankName });
  const canSave = !!retailer && totalPaise > 0 && remaining === 0 && !badInput && !overDue && !modeError && !pending;

  function pickRetailer(r: RetailerRow) {
    setRetailer(r);
    setPickOpen(false);
    setDues([]);
    setEdits({});
    setForced(null);
    setAdvanceFirmId(null);
    setError("");
    start(async () => {
      const res = await loadOutstanding(r.id);
      if (res.ok) setDues(res.rows);
    });
  }

  function resetAlloc(next: Record<string, number> | null) {
    setEdits({});
    setForced(next);
    setAdvanceFirmId(null);
  }

  function submit() {
    if (!retailer) return;
    setError("");
    start(async () => {
      const res = await saveReceipt({
        retailerId: retailer.id,
        mode,
        totalPaise,
        utr,
        receivedFirmId: mode === "cash" ? undefined : receivedFirmId,
        chequeNumber,
        chequeDate,
        bankName,
        allocations: dues
          .filter((d) => (amounts[d.orderId] ?? 0) > 0)
          .map((d) => ({ orderId: d.orderId, firmId: d.firmId, amountPaise: amounts[d.orderId] })),
        advance: advanceFirmId && advancePaise > 0 ? { firmId: advanceFirmId, amountPaise: advancePaise } : null,
      });
      if (res.ok) router.push("/receipts");
      else setError(res.error);
    });
  }

  const matches = retailers.filter((r) => `${r.name} ${r.place}`.toLowerCase().includes(search.trim().toLowerCase()));

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-xl font-bold">New receipt</h1>

      <button
        type="button"
        onClick={() => setPickOpen(true)}
        className="flex min-h-14 items-center justify-between rounded-2xl bg-card p-4 text-left text-base font-semibold ring-1 ring-foreground/8"
      >
        {retailer ? (retailer.place ? `${retailer.name} · ${retailer.place}` : retailer.name) : "Pick retailer"}
        <span className="text-sm font-medium text-muted-foreground">Change</span>
      </button>
      <Sheet open={pickOpen} onOpenChange={setPickOpen} title="Retailer">
        <Input placeholder="Search" value={search} onChange={(e) => setSearch(e.target.value)} className="mb-3" />
        <ul className="flex flex-col gap-2">
          {matches.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                onClick={() => pickRetailer(r)}
                className="min-h-12 w-full rounded-xl bg-card p-3 text-left text-base font-medium ring-1 ring-foreground/8"
              >
                {r.name}
                {r.place && <span className="text-muted-foreground"> · {r.place}</span>}
              </button>
            </li>
          ))}
          {matches.length === 0 && <li className="py-6 text-center text-muted-foreground">No match</li>}
        </ul>
      </Sheet>

      <section className="flex flex-col gap-3">
        <div className="tabular text-center text-4xl font-bold">{formatINR(totalPaise, { hidePaise: true })}</div>
        <Keypad value={digits} onChange={(v) => { setDigits(v); resetAlloc(null); }} />
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex gap-2">
          {PAYMENT_MODES.map((m) => (
            <button key={m} type="button" className={chip(mode === m)} onClick={() => setMode(m)}>
              {modeLabel[m]}
            </button>
          ))}
        </div>
        {mode === "online" && (
          <div className="flex flex-col gap-2">
            <Label htmlFor="utr">UTR / reference</Label>
            <Input id="utr" value={utr} onChange={(e) => setUtr(e.target.value)} />
          </div>
        )}
        {mode === "cheque" && (
          <div className="flex flex-col gap-2">
            <Label htmlFor="chq">Cheque number</Label>
            <Input id="chq" value={chequeNumber} onChange={(e) => setChequeNumber(e.target.value)} />
            <Label htmlFor="chqd">Cheque date</Label>
            <Input id="chqd" type="date" value={chequeDate} onChange={(e) => setChequeDate(e.target.value)} />
            <Label htmlFor="bank">Bank</Label>
            <Input id="bank" value={bankName} onChange={(e) => setBankName(e.target.value)} />
          </div>
        )}
        {mode !== "cash" && (
          <div className="flex flex-col gap-2">
            <Label>Received in which firm&apos;s account</Label>
            <div className="flex flex-wrap gap-2">
              {firms.map((f) => (
                <button key={f.id} type="button" className={chip(receivedFirmId === f.id)} onClick={() => setReceivedFirmId(f.id)}>
                  {f.name}
                </button>
              ))}
            </div>
          </div>
        )}
      </section>

      {retailer && (
        <section className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold">Allocate</h2>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => resetAlloc(null)}>
                Auto-split
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => resetAlloc(Object.fromEntries(clearFull(items).allocations.map((a) => [a.orderId, a.amountPaise])))}
              >
                Clear full
              </Button>
            </div>
          </div>
          {sortedDues.length === 0 && !pending && <p className="py-4 text-center text-muted-foreground">No dues</p>}
          <ul className="flex flex-col gap-2">
            {sortedDues.map((d) => {
              const firm = firmById.get(d.firmId);
              const value = edits[d.orderId] ?? String((amounts[d.orderId] ?? 0) / 100);
              return (
                <li key={d.orderId} className="flex items-center justify-between gap-3 rounded-2xl bg-card p-3 ring-1 ring-foreground/8">
                  <div className="flex flex-col gap-1">
                    {firm && <FirmChip name={firm.name} slot={firm.slot} />}
                    <span className="text-xs text-muted-foreground">
                      {formatDate(d.dueSinceDate)} · Due {formatINR(d.duePaise)}
                    </span>
                  </div>
                  <Input
                    inputMode="decimal"
                    aria-label="Amount"
                    className="tabular w-28 text-right"
                    value={value}
                    onChange={(e) => setEdits((prev) => ({ ...prev, [d.orderId]: e.target.value }))}
                  />
                </li>
              );
            })}
          </ul>

          {leftover > 0 && (
            <div className="flex flex-col gap-2">
              <Label>Keep {formatINR(leftover)} as advance with</Label>
              <div className="flex flex-wrap gap-2">
                {firms.map((f) => (
                  <button key={f.id} type="button" className={chip(advanceFirmId === f.id)} onClick={() => setAdvanceFirmId(advanceFirmId === f.id ? null : f.id)}>
                    {f.name}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="flex items-baseline justify-between rounded-2xl bg-muted p-3">
            <span className="text-sm font-medium">Remaining</span>
            <span className={`tabular text-lg font-bold ${remaining === 0 ? "" : "text-destructive"}`}>{formatINR(remaining)}</span>
          </div>
          {advancePaise > 0 && <p className="text-sm text-muted-foreground">Advance {formatINR(advancePaise)}</p>}
          {overDue && <p className="text-sm text-destructive">An amount is more than the amount due.</p>}
        </section>
      )}

      {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
      <PinnedAction>
        <Button type="button" size="lg" disabled={!canSave} onClick={submit}>
          {pending ? "Saving…" : "Save receipt"}
        </Button>
      </PinnedAction>
    </div>
  );
}
