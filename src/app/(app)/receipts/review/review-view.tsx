"use client";

import { useState, useTransition } from "react";
import { EmptyState } from "@/components/app/empty-state";
import { ListCard } from "@/components/app/list-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatINR } from "@/lib/money";
import { ReverseForm } from "../[id]/reverse-form";
import { setChequeStatus, verifyOnline } from "./actions";

type Row = {
  id: string;
  no: number;
  retailer: string;
  mode: string;
  totalPaise: number;
  utr: string | null;
  chequeNumber: string | null;
  chequeDate: string | null;
  bankName: string | null;
  date: string;
};

function OnlineCard({ r, index, canReverse }: { r: Row; index: number; canReverse: boolean }) {
  const [utr, setUtr] = useState("");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  return (
    <ListCard
      index={index}
      title={r.retailer}
      top={<span className="text-xs text-muted-foreground">#{r.no} · {r.date}</span>}
      bottom={
        <div className="flex w-full flex-col gap-2">
          <div className="flex items-end justify-between">
            <span className="text-xs text-muted-foreground">Recorded UTR: <span className="tabular">{r.utr}</span></span>
            <span className="tabular text-lg font-bold">{formatINR(r.totalPaise)}</span>
          </div>
          <div className="flex gap-2">
            <Input value={utr} onChange={(e) => setUtr(e.target.value)} placeholder="UTR on bank statement" autoComplete="off" />
            <Button
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const res = await verifyOnline(r.id, utr);
                  if (!res.ok) setError(res.error);
                })
              }
            >
              Verify
            </Button>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          {canReverse && <ReverseForm receiptId={r.id} label="Not received" />}
        </div>
      }
    />
  );
}

function ChequeCard({ r, index }: { r: Row; index: number }) {
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  function go(to: "cleared" | "bounced") {
    if (to === "bounced" && !window.confirm("Mark this cheque as bounced? The retailer's dues come back.")) return;
    start(async () => {
      const res = await setChequeStatus(r.id, to);
      if (!res.ok) setError(res.error);
    });
  }
  return (
    <ListCard
      index={index}
      title={r.retailer}
      top={<span className="text-xs text-muted-foreground">#{r.no} · {r.date}</span>}
      bottom={
        <div className="flex w-full flex-col gap-2">
          <div className="flex items-end justify-between">
            <span className="text-xs text-muted-foreground">
              No. {r.chequeNumber} · {r.bankName} · dated {r.chequeDate}
            </span>
            <span className="tabular text-lg font-bold">{formatINR(r.totalPaise)}</span>
          </div>
          <div className="flex gap-2">
            <Button disabled={pending} onClick={() => go("cleared")}>
              Cleared
            </Button>
            <Button variant="outline" disabled={pending} onClick={() => go("bounced")}>
              Bounced
            </Button>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
      }
    />
  );
}

export function ReviewView({ rows, canReverse }: { rows: Row[]; canReverse: boolean }) {
  const online = rows.filter((r) => r.mode === "online");
  const cheques = rows.filter((r) => r.mode === "cheque");
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-bold">Verify payments</h1>
      <h2 className="text-lg font-bold">Online, not yet verified</h2>
      {online.length === 0 ? (
        <EmptyState title="Nothing to verify" />
      ) : (
        <ul className="flex flex-col gap-3">
          {online.map((r, i) => (
            <li key={r.id}>
              <OnlineCard r={r} index={i} canReverse={canReverse} />
            </li>
          ))}
        </ul>
      )}
      <h2 className="text-lg font-bold">Cheques pending</h2>
      {cheques.length === 0 ? (
        <EmptyState title="No pending cheques" />
      ) : (
        <ul className="flex flex-col gap-3">
          {cheques.map((r, i) => (
            <li key={r.id}>
              <ChequeCard r={r} index={i} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
