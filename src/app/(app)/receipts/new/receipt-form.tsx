"use client";

import { Camera, ChevronDown, ImageIcon, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { chipClass } from "@/components/app/chip";
import { FormHint } from "@/components/app/form-hint";
import { Keypad } from "@/components/app/keypad";
import { PageHeader } from "@/components/app/page-header";
import { PinnedAction } from "@/components/app/pinned-action";
import { ReasonPicker } from "@/components/app/reason-picker";
import { Sheet } from "@/components/app/sheet";
import { TextLink } from "@/components/app/text-link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { firstMissing } from "@/lib/form-rules";
import { formatINR, parseRupeesToPaise } from "@/lib/money";
import { retailerMeta } from "@/lib/retailer-rules";
import { useFormError } from "@/lib/use-form-error";
import { useSubmit } from "@/lib/use-submit";
import {
  BAD_PROOF_IMAGE,
  checkOnlineDetails,
  checkReceivedOn,
  earliestReceivedOn,
  isSafeProofImage,
  MAX_PAYER_NAME,
  MAX_REASON,
  MAX_UTR,
  MODE_LABELS,
  ONLINE_METHOD_LABELS,
  ONLINE_METHODS,
  PAYMENT_MODES,
  STAFF_BACKDATE_DAYS,
  validateModeDetails,
  type OnlineMethod,
  type PaymentMode,
} from "@/lib/receipt-rules";
import { daysBetween, isDateKey } from "@/lib/report-range";
import { loadDues, saveReceipt } from "../actions";

type RetailerRow = { id: string; name: string; place: string; active: boolean };
type AccountRow = { id: string; label: string };

function compressImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const MAX_DIM = 1200;
        let width = img.width;
        let height = img.height;
        if (width > height && width > MAX_DIM) {
          height = Math.round((height * MAX_DIM) / width);
          width = MAX_DIM;
        } else if (height > MAX_DIM) {
          width = Math.round((width * MAX_DIM) / height);
          height = MAX_DIM;
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve(e.target?.result as string);
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", 0.72));
      };
      img.onerror = reject;
      img.src = e.target?.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function ReceiptForm({
  retailers,
  initialRetailerId = null,
  accounts,
  admin,
  today,
}: {
  retailers: RetailerRow[];
  /** From `?retailer=`, already checked against `retailers` on the server. */
  initialRetailerId?: string | null;
  /** Switched-on bank accounts an online payment can come into. */
  accounts: AccountRow[];
  /** Admin may pick an older day (with a reason); staff today or up to 2 days back. */
  admin: boolean;
  /** Today in India, "YYYY-MM-DD" (from the server). */
  today: string;
}) {
  const router = useRouter();
  const [retailer, setRetailer] = useState<RetailerRow | null>(retailers.find((r) => r.id === initialRetailerId) ?? null);
  const [pickOpen, setPickOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [digits, setDigits] = useState("");
  const [mode, setMode] = useState<PaymentMode>("cash");
  const [utr, setUtr] = useState("");
  const [note, setNote] = useState("");
  const [method, setMethod] = useState<OnlineMethod | null>(null);
  // Picked for you when there is only one account.
  const [accountId, setAccountId] = useState<string | null>(accounts.length === 1 ? accounts[0].id : null);
  const [payer, setPayer] = useState("");
  const [chequeDate, setChequeDate] = useState(today);
  const [chequeBank, setChequeBank] = useState("");
  const [proofImage, setProofImage] = useState<string | null>(null);
  const [receivedOn, setReceivedOn] = useState(today);
  const [backdateCode, setBackdateCode] = useState<string | null>(null);
  const [backdateNote, setBackdateNote] = useState("");
  // What the picked retailer owes right now (null until loaded).
  const [duesPaise, setDuesPaise] = useState<number | null>(null);
  // Goes away as soon as the retailer, amount, mode or UTR is changed.
  const { error, setError, clearError } = useFormError([
    retailer?.id,
    digits,
    mode,
    utr,
    note,
    method,
    accountId,
    payer,
    chequeDate,
    chequeBank,
    proofImage,
    receivedOn,
    backdateCode,
    backdateNote,
  ]);
  const [loading, start] = useTransition();
  const { pending: saving, run } = useSubmit();
  const pending = loading || saving;

  // The keypad allows paise ("9023.45"); a point typed with nothing after it yet counts as whole rupees.
  const totalPaise = parseRupeesToPaise(digits.replace(/\.$/, "") || "0") ?? 0;
  // Paying more than the dues is fine: the rest stays with the shop as an advance.
  const advancePaise = duesPaise !== null && totalPaise > duesPaise ? totalPaise - duesPaise : 0;

  const online = mode === "online";
  const onlineError = online ? checkOnlineDetails({ onlineMethod: method, bankAccountId: accountId, payerName: payer }) : null;
  const modeError = validateModeDetails(mode, { utr, method });
  // Admin going further back than staff may: a reason is required.
  const older = admin && isDateKey(receivedOn) && daysBetween(receivedOn, today) > STAFF_BACKDATE_DAYS;
  const date = checkReceivedOn(admin ? "admin" : null, receivedOn, today, { code: backdateCode, note: backdateNote });
  const hint = firstMissing([
    [!retailer, "Pick a retailer"],
    [totalPaise <= 0, "Enter the amount"],
    [onlineError !== null, onlineError ?? ""],
    [modeError !== null, modeError ?? ""],
    [!date.ok, date.ok ? "" : date.error],
  ]);
  const canSave = hint === null && !pending;

  function pickRetailer(r: RetailerRow) {
    setRetailer(r);
    setPickOpen(false);
    setDuesPaise(null);
    clearError();
    start(async () => {
      const res = await loadDues(r.id);
      if (res.ok) setDuesPaise(res.duesPaise);
      else setError(res.error, [r.id, digits, mode, utr, note, method, accountId, payer, chequeDate, chequeBank, proofImage, receivedOn, backdateCode, backdateNote]);
    });
  }

  // A prefilled shop loads its dues once, as if it had just been picked.
  useEffect(() => {
    if (!initialRetailerId) return;
    start(async () => {
      const res = await loadDues(initialRetailerId);
      if (res.ok) setDuesPaise(res.duesPaise);
    });
    // Once on open: later picks load their own dues.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const compressed = await compressImage(file);
      if (isSafeProofImage(compressed)) setProofImage(compressed);
      else setError(BAD_PROOF_IMAGE);
    } catch {
      setError("Could not process the selected image. Please try another.");
    }
  }

  function submit() {
    if (!retailer) return;
    clearError();
    run(
      (requestId) =>
        saveReceipt({
          retailerId: retailer.id,
          mode,
          totalPaise,
          utr: online ? utr : "",
          note,
          receivedOn,
          onlineMethod: online ? method : null,
          bankAccountId: online ? accountId : null,
          payerName: online ? payer : "",
          proofImage: proofImage ?? null,
          chequeDate: online && method === "cheque" ? chequeDate : null,
          chequeBank: online && method === "cheque" ? chequeBank : null,
          backdateReasonCode: older ? backdateCode : null,
          backdateNote: older ? backdateNote : "",
          requestId,
        }),
      (res) => {
        if (res.ok) router.push(`/receipts/${res.id}`);
        else setError(res.error);
      },
    );
  }

  const matches = retailers.filter((r) => `${r.name} ${r.place}`.toLowerCase().includes(search.trim().toLowerCase()));

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="New payment" back="/receipts" />

      <div className="flex flex-col gap-1.5">
        <Label>Retailer</Label>
        <button
          type="button"
          onClick={() => setPickOpen(true)}
          className="flex min-h-14 items-center justify-between gap-2 rounded-2xl bg-card px-4 py-3 text-left text-base font-semibold shadow-card ring-1 ring-foreground/6"
        >
          {retailer ? (
            <span className="min-w-0 break-words">
              {retailerMeta(retailer) ? `${retailer.name} · ${retailerMeta(retailer)}` : retailer.name}
            </span>
          ) : (
            <span className="text-muted-foreground">Pick retailer</span>
          )}
          <ChevronDown className="size-5 shrink-0 text-muted-foreground" aria-hidden />
        </button>
      </div>
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
                {retailerMeta(r) && <span className="text-muted-foreground"> · {retailerMeta(r)}</span>}
              </button>
            </li>
          ))}
          {matches.length === 0 && <li className="py-6 text-center text-muted-foreground">No match</li>}
        </ul>
      </Sheet>
      {retailer && duesPaise !== null && (
        <div className="flex items-baseline justify-between rounded-2xl bg-muted p-3">
          <span className="text-sm font-medium">Dues</span>
          <span className="tabular text-lg font-bold">{formatINR(duesPaise)}</span>
        </div>
      )}

      <section className="flex flex-col gap-3">
        <div className="tabular text-center text-4xl font-bold">{formatINR(totalPaise, { hidePaise: true })}</div>
        <Keypad value={digits} onChange={setDigits} decimal />
        {advancePaise > 0 && (
          <p className="text-center text-sm text-muted-foreground">Advance {formatINR(advancePaise)}</p>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex gap-2">
          {PAYMENT_MODES.map((m) => (
            <button key={m} type="button" className={chipClass(mode === m)} onClick={() => setMode(m)}>
              {MODE_LABELS[m]}
            </button>
          ))}
        </div>
        {online && (
          <>
            <div className="flex flex-col gap-2">
              <Label id="method-label">Method</Label>
              <div role="radiogroup" aria-labelledby="method-label" className="flex flex-wrap gap-2">
                {ONLINE_METHODS.map((m) => (
                  <button
                    key={m}
                    type="button"
                    role="radio"
                    aria-checked={method === m}
                    className={chipClass(method === m, "min-w-[4.5rem] px-3")}
                    onClick={() => setMethod(m)}
                  >
                    {ONLINE_METHOD_LABELS[m]}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <Label id="account-label">
                {method === "cheque" ? "Deposit into account (फर्म का बैंक खाता)" : "Into"}
              </Label>
              {accounts.length === 0 ? (
                <div className="flex min-h-12 items-center justify-between gap-2">
                  <span className="text-sm text-muted-foreground">No bank account</span>
                  {admin && (
                    <TextLink href="/bank-accounts" strong>
                      Add
                    </TextLink>
                  )}
                </div>
              ) : (
                <div role="radiogroup" aria-labelledby="account-label" className="flex flex-wrap gap-2">
                  {accounts.map((a) => (
                    <button
                      key={a.id}
                      type="button"
                      role="radio"
                      aria-checked={accountId === a.id}
                      className={chipClass(accountId === a.id)}
                      onClick={() => setAccountId(a.id)}
                    >
                      {a.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {method === "cheque" ? (
              <>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="utr">Cheque Number (चेक नंबर)</Label>
                  <Input
                    id="utr"
                    placeholder="e.g. 000123"
                    value={utr}
                    maxLength={MAX_UTR}
                    autoComplete="off"
                    onChange={(e) => setUtr(e.target.value)}
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="cheque-date">Cheque Date (चेक की तारीख)</Label>
                    <Input
                      id="cheque-date"
                      type="date"
                      value={chequeDate}
                      onChange={(e) => setChequeDate(e.target.value)}
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="cheque-bank">Issuing Bank (बैंक का नाम)</Label>
                    <Input
                      id="cheque-bank"
                      placeholder="e.g. SBI, PNB, HDFC"
                      value={chequeBank}
                      maxLength={80}
                      autoComplete="off"
                      onChange={(e) => setChequeBank(e.target.value)}
                    />
                  </div>
                </div>
              </>
            ) : (
              <div className="flex flex-col gap-2">
                <Label htmlFor="utr">UTR / reference</Label>
                <Input
                  id="utr"
                  placeholder="e.g. 12-digit UTR"
                  value={utr}
                  maxLength={MAX_UTR + 10}
                  autoComplete="off"
                  onChange={(e) => setUtr(e.target.value)}
                />
              </div>
            )}

            <div className="flex flex-col gap-2">
              <Label htmlFor="payer">Payer name (optional)</Label>
              <Input
                id="payer"
                value={payer}
                maxLength={MAX_PAYER_NAME}
                autoComplete="off"
                onChange={(e) => setPayer(e.target.value)}
              />
            </div>
          </>
        )}

        {/* Optional Proof / Cheque Image Upload */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="proof-image-input">
              {method === "cheque"
                ? "Cheque photo (optional)"
                : "Payment screenshot / proof (optional)"}
            </Label>
            {proofImage && (
              <button
                type="button"
                onClick={() => setProofImage(null)}
                className="text-xs font-semibold text-destructive hover:underline"
              >
                Remove photo
              </button>
            )}
          </div>
          {proofImage ? (
            <div className="relative flex items-center gap-3 rounded-2xl bg-card p-2.5 shadow-card ring-1 ring-foreground/6">
              <img
                src={proofImage}
                alt="Payment proof preview"
                className="size-16 rounded-xl object-cover ring-1 ring-border"
              />
              <div className="flex flex-col">
                <span className="text-sm font-semibold text-foreground">
                  {method === "cheque" ? "Cheque photo attached" : "Proof photo attached"}
                </span>
                <span className="text-xs text-muted-foreground">Ready to save</span>
              </div>
            </div>
          ) : (
            <label
              htmlFor="proof-image-input"
              className="flex cursor-pointer items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-muted-foreground/25 bg-muted/30 px-4 py-3.5 text-center text-sm font-medium text-muted-foreground transition-colors hover:border-foreground/30 hover:bg-muted/50"
            >
              <Camera className="size-5 shrink-0 text-muted-foreground" aria-hidden />
              <span>
                {method === "cheque"
                  ? "Take photo or upload cheque (Optional)"
                  : "Upload screenshot / slip (Optional)"}
              </span>
              <input
                id="proof-image-input"
                type="file"
                accept="image/*"
                className="sr-only"
                onChange={handleFileSelect}
              />
            </label>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="note">Note (optional)</Label>
          <Input id="note" value={note} maxLength={MAX_REASON} onChange={(e) => setNote(e.target.value)} />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="received-on">Received on</Label>
          <Input
            id="received-on"
            type="date"
            value={receivedOn}
            max={today}
            min={admin ? undefined : earliestReceivedOn(today)}
            onChange={(e) => setReceivedOn(e.target.value)}
          />
        </div>
        {older && (
          <div className="animate-in-up flex flex-col gap-2">
            <Label>Why the older date?</Label>
            <ReasonPicker
              action="backdate"
              label="Why the older date?"
              code={backdateCode}
              onCodeChange={setBackdateCode}
              note={backdateNote}
              onNoteChange={setBackdateNote}
              showHint={false}
            />
          </div>
        )}
      </section>

      {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
      <PinnedAction>
        <FormHint>{hint}</FormHint>
        <Button type="button" size="lg" disabled={!canSave} onClick={submit}>
          {saving ? "Saving…" : "Save payment"}
        </Button>
      </PinnedAction>
    </div>
  );
}
