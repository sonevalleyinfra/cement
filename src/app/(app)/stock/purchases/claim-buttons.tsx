"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useSubmit } from "@/lib/use-submit";
import { setPurchaseClaim } from "../actions";

/** Moves a purchase's claim forward: "Mark claimed" (from open) and "Mark credited". */
export function ClaimButtons({ purchaseId, status }: { purchaseId: string; status: "open" | "claimed" }) {
  const router = useRouter();
  const { pending, run } = useSubmit();
  const [error, setError] = useState("");
  const next = status === "open" ? (["claimed", "credited"] as const) : (["credited"] as const);

  function move(to: string) {
    setError("");
    run(
      (requestId) => setPurchaseClaim({ purchaseId, status: to, requestId }),
      (res) => (res.ok ? router.refresh() : setError(res.error)),
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex gap-2">
        {next.map((to) => (
          <Button key={to} type="button" size="sm" variant="outline" disabled={pending} onClick={() => move(to)}>
            {to === "claimed" ? "Mark claimed" : "Mark credited"}
          </Button>
        ))}
      </div>
      {error && (
        <p role="status" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
