"use client";

import { useState, useTransition } from "react";
import { ListCard } from "@/components/app/list-card";
import { Sheet } from "@/components/app/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatINR, parseRupeesToPaise } from "@/lib/money";
import { answerHandover, requestHandover } from "./actions";

type Mine = { firmId: string; firmName: string; balancePaise: number; pendingPaise: number; availablePaise: number };
type Collector = { key: string; collector: string; firmName: string; balancePaise: number };
type Request = { id: string; collector: string; firmName: string; amountPaise: number; own: boolean };

export function WalletView({
  mine,
  collectors,
  requests,
  isAccounts,
  readOnly = false,
}: {
  mine: Mine[];
  collectors: Collector[];
  requests: Request[];
  isAccounts: boolean;
  /** Admin's "All firms" view: show numbers, no buttons. */
  readOnly?: boolean;
}) {
  const [open, setOpen] = useState<Mine | null>(null);
  const [amount, setAmount] = useState("");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();

  function submit() {
    if (!open) return;
    const paise = parseRupeesToPaise(amount);
    if (paise === null) return setError("Enter a valid amount.");
    start(async () => {
      const res = await requestHandover({ firmId: open.firmId, amountPaise: paise });
      if (res.ok) {
        setOpen(null);
        setAmount("");
      } else setError(res.error);
    });
  }

  function answer(id: string, confirm: boolean) {
    start(async () => {
      const res = await answerHandover(id, confirm);
      if (!res.ok) setError(res.error);
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-bold">My wallet</h1>
      <ul className="flex flex-col gap-3">
        {mine.map((m, i) => (
          <li key={m.firmId}>
            <ListCard
              index={i}
              title={m.firmName}
              top={m.pendingPaise > 0 ? <span className="text-xs text-muted-foreground">{formatINR(m.pendingPaise)} waiting for confirmation</span> : undefined}
              bottom={
                <>
                  <span className="tabular text-lg font-bold">{formatINR(m.balancePaise)}</span>
                  {!readOnly && (
                  <Button
                    variant="outline"
                    disabled={m.availablePaise <= 0}
                    onClick={() => {
                      setError("");
                      setAmount((m.availablePaise / 100).toFixed(2));
                      setOpen(m);
                    }}
                  >
                    Hand over
                  </Button>
                  )}
                </>
              }
            />
          </li>
        ))}
      </ul>
      {error && !open && <p className="text-sm text-destructive">{error}</p>}

      {isAccounts && (
        <>
          <h2 className="text-lg font-bold">Handovers to confirm</h2>
          {requests.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing waiting.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {requests.map((r, i) => (
                <li key={r.id}>
                  <ListCard
                    index={i}
                    title={`${r.collector} · ${r.firmName}`}
                    bottom={
                      <>
                        <span className="tabular text-lg font-bold">{formatINR(r.amountPaise)}</span>
                        {r.own || readOnly ? (
                          <span className="text-xs text-muted-foreground">{r.own ? "Another person confirms yours" : "View only"}</span>
                        ) : (
                          <div className="flex gap-2">
                            <Button disabled={pending} onClick={() => answer(r.id, true)}>
                              Confirm received
                            </Button>
                            <Button variant="ghost" disabled={pending} onClick={() => answer(r.id, false)}>
                              Reject
                            </Button>
                          </div>
                        )}
                      </>
                    }
                  />
                </li>
              ))}
            </ul>
          )}
          <h2 className="text-lg font-bold">Cash with collectors</h2>
          {collectors.length === 0 ? (
            <p className="text-sm text-muted-foreground">No cash held.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {collectors.map((c, i) => (
                <li key={c.key}>
                  <ListCard
                    index={i}
                    title={c.collector}
                    bottom={
                      <>
                        <span className="text-xs text-muted-foreground">{c.firmName}</span>
                        <span className="tabular text-lg font-bold">{formatINR(c.balancePaise)}</span>
                      </>
                    }
                  />
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      <Sheet open={open !== null} onOpenChange={(o) => !o && setOpen(null)} title={`Hand over cash · ${open?.firmName ?? ""}`}>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="handover">Amount (₹)</Label>
            <Input id="handover" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button disabled={pending} onClick={submit}>
            Hand over
          </Button>
        </div>
      </Sheet>
    </div>
  );
}
