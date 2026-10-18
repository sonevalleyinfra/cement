"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ConfirmStep } from "@/components/app/confirm-step";
import { FormHint } from "@/components/app/form-hint";
import { ListCard } from "@/components/app/list-card";
import { PageHeader } from "@/components/app/page-header";
import { Sheet } from "@/components/app/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { firstMissing } from "@/lib/form-rules";
import { formatINR, parseRupeesToPaise } from "@/lib/money";
import { MAX_REASON } from "@/lib/receipt-rules";
import { useFormError } from "@/lib/use-form-error";
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
  // Handing cash over asks "are you sure?" first (confirming = that question is on screen).
  const [confirming, setConfirming] = useState(false);
  // Rejecting a handover asks "are you sure?" first too.
  const [rejecting, setRejecting] = useState(false);
  const { error, setError, clearError } = useFormError([handOpen, amount, answering?.id, received, reason]);
  const [pending, start] = useTransition();
  const handover = useSubmit();

  const handoverPaise = parseRupeesToPaise(amount);
  const handoverHint = firstMissing([[handoverPaise === null || handoverPaise <= 0, "Enter the amount"]]);
  const receivedPaise = parseRupeesToPaise(received);
  const receivedHint = firstMissing([[receivedPaise === null || receivedPaise <= 0, "Enter the amount received"]]);
  const rejectHint = firstMissing([[reason.trim() === "", "Enter a reason to reject"]]);

  function handOver() {
    if (handoverPaise === null || handoverPaise <= 0) return;
    clearError();
    handover.run(
      (requestId) => requestHandover({ amountPaise: handoverPaise, requestId }),
      (res) => {
        if (res.ok) {
          clearError();
          setConfirming(false);
          setHandOpen(false);
          setAmount("");
          router.refresh();
        } else {
          // Back to the amount, with what went wrong.
          setConfirming(false);
          setError(res.error);
        }
      },
    );
  }

  function answer(action: "confirm" | "reject") {
    if (!answering) return;
    clearError();
    start(async () => {
      const res = await answerHandover(
        answering.id,
        action === "confirm" ? { action, amountPaise: receivedPaise ?? 0 } : { action, reason },
      );
      setRejecting(false);
      if (res.ok) {
        clearError();
        setAnswering(null);
        router.refresh();
      } else setError(res.error);
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Cash" />
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
                clearError();
                setConfirming(false);
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
                              clearError();
                              setReceived(rupees(r.amountPaise));
                              setReason("");
                              setRejecting(false);
                              setAnswering(r);
                            }}
                          >
                            Confirm
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
                    bottom={
                      <div className="flex flex-col gap-1">
                        <span className="tabular text-lg font-bold">{formatINR(h.balancePaise)}</span>
                        {h.pendingPaise > 0 && (
                          <span className="text-xs text-muted-foreground">{formatINR(h.pendingPaise)} to confirm</span>
                        )}
                      </div>
                    }
                  />
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      <Sheet open={handOpen} onOpenChange={setHandOpen} title="Hand over cash">
        <div className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">
            <span className="tabular">{formatINR(mine.availablePaise)}</span> available
          </p>
          {confirming && handoverPaise !== null ? (
            <ConfirmStep
              question={`Hand over ${formatINR(handoverPaise)} to the office?`}
              confirmLabel="Hand over"
              onBack={() => setConfirming(false)}
              onConfirm={handOver}
              pending={handover.pending}
            />
          ) : (
            <>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="handover">Amount (₹)</Label>
                <Input id="handover" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <div>
                <FormHint>{handoverHint}</FormHint>
                <Button className="w-full" disabled={handoverHint !== null} onClick={() => setConfirming(true)}>
                  Hand over
                </Button>
              </div>
            </>
          )}
        </div>
      </Sheet>

      <Sheet open={answering !== null} onOpenChange={(o) => !o && setAnswering(null)} title={answering?.collector ?? ""}>
        <div className="flex flex-col gap-3">
          {answering && (
            <p className="text-sm text-muted-foreground">
              <span className="tabular">{formatINR(answering.amountPaise)}</span> handed over
            </p>
          )}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="received">Received (₹)</Label>
            <Input id="received" inputMode="decimal" value={received} onChange={(e) => setReceived(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="reject-reason">Reason for rejecting</Label>
            <Input id="reject-reason" maxLength={MAX_REASON} value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
          {rejecting && answering && rejectHint === null ? (
            <ConfirmStep
              question={`Reject ${formatINR(answering.amountPaise)} from ${answering.collector}?`}
              confirmLabel="Reject"
              destructive
              pending={pending}
              onBack={() => setRejecting(false)}
              onConfirm={() => answer("reject")}
            />
          ) : (
            <div>
              <FormHint>{receivedHint}</FormHint>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  className="w-full"
                  variant="outline"
                  disabled={pending || rejectHint !== null}
                  onClick={() => {
                    clearError();
                    setRejecting(true);
                  }}
                >
                  Reject
                </Button>
                <Button className="w-full" disabled={pending || receivedHint !== null} onClick={() => answer("confirm")}>
                  Confirm
                </Button>
              </div>
            </div>
          )}
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
      </Sheet>
    </div>
  );
}
