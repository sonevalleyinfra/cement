"use client";

import { useState } from "react";
import { Sheet } from "@/components/app/sheet";
import { Button } from "@/components/ui/button";
import { AdjustmentForm } from "./adjustment-form";
import { OpeningForm } from "./opening-form";

/**
 * Admin's two ledger actions as buttons above the entries, each opening a sheet (like the supplier account).
 * "Opening" is there only until the opening balance is set.
 */
export function LedgerActions({
  retailerId,
  canOpen,
  canAdjust,
}: {
  retailerId: string;
  /** The opening balance is allowed and not set yet. */
  canOpen: boolean;
  canAdjust: boolean;
}) {
  const [open, setOpen] = useState<null | "opening" | "adjustment">(null);
  if (!canOpen && !canAdjust) return null;
  return (
    <>
      <div className={`grid gap-2 ${canOpen && canAdjust ? "grid-cols-2" : "grid-cols-1"}`}>
        {canOpen && (
          <Button variant="outline" onClick={() => setOpen("opening")}>
            Opening
          </Button>
        )}
        {canAdjust && (
          <Button variant="outline" onClick={() => setOpen("adjustment")}>
            Adjustment
          </Button>
        )}
      </div>
      <Sheet
        open={open !== null}
        onOpenChange={(o) => !o && setOpen(null)}
        title={open === "opening" ? "Opening balance" : "Adjustment"}
      >
        {open === "opening" && <OpeningForm key="opening" retailerId={retailerId} onDone={() => setOpen(null)} />}
        {open === "adjustment" && <AdjustmentForm key="adjustment" retailerId={retailerId} onDone={() => setOpen(null)} />}
      </Sheet>
    </>
  );
}
