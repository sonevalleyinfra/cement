"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ListCard } from "@/components/app/list-card";
import { Sheet } from "@/components/app/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatINR, parseRupeesToPaise } from "@/lib/money";
import { MAX_REASON } from "@/lib/receipt-rules";
import { useSubmit } from "@/lib/use-submit";
import { answerHandover, requestHandover } from "./actions";

type Mine = { balancePaise: number; pendingPaise: number; availablePaise: number };
type Holder = { id: string; name: string; balancePaise: number; pendingPaise: number };
type Request = { id: string; collector: string; amountPaise: number; own: boolean };

const rupees = (paise: number) => (paise / 100).toFixed(2);

export function WalletView({
  mine,
  holders,
  requests,
  isAccounts,
}: {
  mine: Mine;
  holders: Holder[];
  requests: Request[];
  isAccounts: boolean;
}) {
  const router = useRouter();
  const [handOpen, setHandOpen] = useState(false);
  const [amount, setAmount] = useState("");
  // The handover request accounts are answering (null = sheet closed).
  const [answering, setAnswering] = useState<Request | null>(null);
  const [received, setReceived] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const handover = useSubmit();

  function handOver() {
    const paise = parseRupeesToPaise(amount);
    if (paise === null || paise <= 0) return setError("Enter the amount.");
    setError("");
    handover.run(
      (requestId) => requestHandover({ amountPaise: paise, requestId }),
      (res) => {
        if (res.ok) {
          setHandOpen(false);
          setAmount("");
          router.refresh();
        } else setError(res.error);
      },
    );
  }

  function answer(action: "confirm" | "reject") {
    if (!answering) return;
    setError("");
    const paise = parseRupeesToPaise(received);
    if (action === "confirm" && (paise === null || paise <= 0)) return setError("Enter the amount received.");
    start(async () => {
      const res = await answerHandover(
        answering.id,
        action === "confirm" ? { action, amountPaise: paise ?? 0 } : { action, reason },
      );
      if (res.ok) {
        setAnswering(null);
        router.refresh();
      } else setError(res.error);
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-bold">Cash</h1>
      <ListCard
        index={0}
        title="My cash held"
        top={
          mine.pendingPaise > 0 ? (
            <span className="text-xs text-muted-foreground">{formatINR(mine.pendingPaise)} waiting for accounts</span>
          ) : undefined
        }
        bottom={
          <>
            <span className="tabular text-2xl font-bold">{formatINR(mine.balancePaise)}</span>
            <Button
              variant="outline"
              disabled={mine.availablePaise <= 0}
              onClick={() => {
                setError("");
                setAmount(rupees(mine.availablePaise));
                setHandOpen(true);
              }}
            >
              Hand over
            </Button>
          </>
        }
      />

      {isAccounts && (
        <>
          <h2 className="text-lg font-bold">To confirm</h2>
          {requests.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing waiting.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {requests.map((r, i) => (
                <li key={r.id}>
                  <ListCard
                    index={i}
                    title={r.collector}
                    bottom={
                      <>
                        <span className="tabular text-lg font-bold">{formatINR(r.amountPaise)}</span>
                        {r.own ? (
                          <span className="text-xs text-muted-foreground">Another person confirms yours</span>
                        ) : (
                          <Button
                            disabled={pending}
                            onClick={() => {
                              setError("");
                              setReceived(rupees(r.amountPaise));
                              setReason("");
                              setAnswering(r);
                            }}
                          >
                            Received
                          </Button>
                        )}
                      </>
                    }
                  />
                </li>
              ))}
            </ul>
          )}
          <h2 className="text-lg font-bold">Cash held by staff</h2>
          {holders.length === 0 ? (
            <p className="text-sm text-muted-foreground">No cash held.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {holders.map((h, i) => (
                <li key={h.id}>
                  <ListCard
                    index={i}
                    title={h.name}
                    top={
                      h.pendingPaise > 0 ? (
                        <span className="text-xs text-muted-foreground">{formatINR(h.pendingPaise)} to confirm</span>
                      ) : undefined
                    }
                    bottom={<span className="tabular text-lg font-bold">{formatINR(h.balancePaise)}</span>}
                  />
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      <Sheet open={handOpen} onOpenChange={setHandOpen} title="Hand over cash">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="handover">Amount (₹)</Label>
            <Input id="handover" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button disabled={handover.pending} onClick={handOver}>
            Hand over
          </Button>
        </div>
      </Sheet>

      <Sheet open={answering !== null} onOpenChange={(o) => !o && setAnswering(null)} title={answering?.collector ?? ""}>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="received">Received (₹)</Label>
            <Input id="received" inputMode="decimal" value={received} onChange={(e) => setReceived(e.target.value)} />
          </div>
          <Button disabled={pending} onClick={() => answer("confirm")}>
            Received
          </Button>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="reject-reason">Reason</Label>
            <Input id="reject-reason" maxLength={MAX_REASON} value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
          <Button variant="outline" disabled={pending || reason.trim() === ""} onClick={() => answer("reject")}>
            Reject
          </Button>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
      </Sheet>
    </div>
  );
}
