"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { FirmChip, type FirmSlot } from "@/components/app/firm-chip";
import { Keypad } from "@/components/app/keypad";
import { PinnedAction } from "@/components/app/pinned-action";
import { Sheet } from "@/components/app/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatDate } from "@/lib/datetime";
import { formatINR, parseRupeesToPaise } from "@/lib/money";
import { fillAllocation, PAYMENT_MODES, validateModeDetails, type PaymentMode } from "@/lib/receipt-rules";
import { loadDues, saveReceipt, type FirmDueRow } from "../actions";

type Firm = { id: string; name: string; slot: FirmSlot };
type RetailerRow = { id: string; name: string; place: string };

const modeLabel: Record<PaymentMode, string> = { cash: "Cash", online: "Online", cheque: "Cheque" };

const chip = (on: boolean) =>
  `h-11 rounded-full px-4 text-sm font-semibold ring-1 transition-[background-color,color,transform] duration-150 ease-out active:scale-[0.97] ${on ? "bg-primary text-primary-foreground shadow-brand ring-primary" : "bg-card ring-foreground/10"}`;

/** Paise as plain rupee text for an input ("40000", "123.45"). */
const rupeeText = (paise: number) => (paise % 100 === 0 ? String(paise / 100) : (paise / 100).toFixed(2));

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
  const [dues, setDues] = useState<FirmDueRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  // What the person typed per firm (rupee text). Firms not in here share the rest by auto-split.
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [advanceFirmId, setAdvanceFirmId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();

  const totalPaise = digits ? Number(digits) * 100 : 0;
  const firmById = useMemo(() => new Map(firms.map((f) => [f.id, f])), [firms]);

  // Typed amounts in paise; a bad entry is NaN (blocks saving).
  const typed = useMemo(() => {
    const out: Record<string, number> = {};
    for (const [id, text] of Object.entries(edits)) {
      const p = text.trim() === "" ? 0 : parseRupeesToPaise(text);
      out[id] = p === null || p < 0 ? NaN : p;
    }
    return out;
  }, [edits]);
  const badInput = Object.values(typed).some((v) => Number.isNaN(v));
  const fixed = useMemo(
    () => Object.fromEntries(Object.entries(typed).filter(([, v]) => !Number.isNaN(v))),
    [typed],
  );
  const fill = useMemo(() => fillAllocation(totalPaise, dues, fixed), [totalPaise, dues, fixed]);
  const amountOf = (firmId: string) => fill.amounts[firmId] ?? 0;

  const overDue = dues.some((d) => amountOf(d.firmId) > d.duePaise);
  const leftover = fill.leftoverPaise;
  const advancePaise = advanceFirmId && leftover > 0 ? leftover : 0;
  const remaining = leftover - advancePaise;

  const modeError = validateModeDetails(mode, { utr, receivedFirmId, chequeNumber, chequeDate, bankName });
  const canSave = !!retailer && totalPaise > 0 && remaining === 0 && !badInput && !overDue && !modeError && !pending;

  function pickRetailer(r: RetailerRow) {
    setRetailer(r);
    setPickOpen(false);
    setDues([]);
    setLoaded(false);
    setEdits({});
    setAdvanceFirmId(null);
    setError("");
    start(async () => {
      const res = await loadDues(r.id);
      if (res.ok) setDues(res.firms);
      else setError(res.error);
      setLoaded(true);
    });
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
          .filter((d) => amountOf(d.firmId) > 0)
          .map((d) => ({ firmId: d.firmId, amountPaise: amountOf(d.firmId) })),
        advance: advanceFirmId && advancePaise > 0 ? { firmId: advanceFirmId, amountPaise: advancePaise } : null,
      });
      if (res.ok) router.push(`/receipts/${res.id}`);
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
        className="flex min-h-14 items-center justify-between rounded-2xl bg-card p-4 text-left text-base font-semibold shadow-card ring-1 ring-foreground/6"
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
                className="min-h-12 w-full rounded-xl bg-card p-3 text-left text-base font-medium shadow-card ring-1 ring-foreground/6"
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
        <Keypad
          value={digits}
          onChange={(v) => {
            setDigits(v);
            setEdits({});
            setAdvanceFirmId(null);
          }}
        />
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
            {dues.length > 0 && (
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setEdits({});
                  setAdvanceFirmId(null);
                }}
              >
                Auto-split
              </Button>
            )}
          </div>
          {loaded && dues.length === 0 && <p className="py-4 text-center text-muted-foreground">No dues</p>}
          <ul className="flex flex-col gap-2">
            {dues.map((d) => {
              const firm = firmById.get(d.firmId);
              const value = edits[d.firmId] ?? rupeeText(amountOf(d.firmId));
              const oldest = d.items[0]?.dueSince;
              return (
                <li key={d.firmId} className="flex flex-col gap-2 rounded-2xl bg-card p-3 shadow-card ring-1 ring-foreground/6">
                  <div className="flex items-center justify-between gap-2">
                    {firm && <FirmChip name={firm.name} slot={firm.slot} />}
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => setEdits((prev) => ({ ...prev, [d.firmId]: rupeeText(d.duePaise) }))}
                    >
                      Clear full
                    </Button>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex flex-col">
                      <span className="tabular text-base font-bold">{formatINR(d.duePaise)}</span>
                      {oldest && <span className="text-xs text-muted-foreground">Since {formatDate(oldest)}</span>}
                    </div>
                    <Input
                      inputMode="decimal"
                      aria-label={`Amount for ${firm?.name ?? "firm"}`}
                      className="tabular w-32 text-right"
                      value={value}
                      onChange={(e) => setEdits((prev) => ({ ...prev, [d.firmId]: e.target.value }))}
                    />
                  </div>
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
          {overDue && <p className="text-sm text-destructive">An amount is more than that firm&apos;s dues.</p>}
          {badInput && <p className="text-sm text-destructive">Check the amounts.</p>}
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
