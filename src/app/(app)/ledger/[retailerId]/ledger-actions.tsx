"use client";

import Link from "next/link";
import { useState } from "react";
import { Sheet } from "@/components/app/sheet";
import { Button, buttonVariants } from "@/components/ui/button";
import { formatINR } from "@/lib/money";
import { cn } from "@/lib/utils";
import { AdjustmentForm } from "./adjustment-form";
import { OpeningForm } from "./opening-form";

/**
 * Admin and staff ledger actions above the entries: Collect payment, Opening, and Adjustment.
 */
export function LedgerActions({
  retailerId,
  canOpen,
  canAdjust,
  canCollect,
  duesPaise,
}: {
  retailerId: string;
  canOpen: boolean;
  canAdjust: boolean;
  canCollect?: boolean;
  duesPaise?: number;
}) {
  const [open, setOpen] = useState<null | "opening" | "adjustment">(null);
  if (!canOpen && !canAdjust && !canCollect) return null;
  return (
    <>
      <div className="flex flex-col gap-2">
        {canCollect && duesPaise && duesPaise > 0 ? (
          <Link
            href={`/receipts/new?retailer=${retailerId}`}
            className={cn(buttonVariants({ variant: "default", size: "lg" }), "w-full font-semibold")}
          >
            Collect payment ({formatINR(duesPaise)} due)
          </Link>
        ) : canCollect ? (
          <Link
            href={`/receipts/new?retailer=${retailerId}`}
            className={cn(buttonVariants({ variant: "outline" }), "w-full")}
          >
            Collect payment
          </Link>
        ) : null}
        {(canOpen || canAdjust) && (
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
