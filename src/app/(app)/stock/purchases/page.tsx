import { CallButton } from "@/components/app/call-button";
import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { ReverseSheet } from "@/components/app/reverse-sheet";
import { formatDate } from "@/lib/datetime";
import { formatINR } from "@/lib/money";
import { can, rolesFor } from "@/lib/permissions";
import { CLAIM_LABELS, claimValuePaise, isClaimStatus } from "@/lib/purchase-rules";
import { getPurchases } from "@/lib/purchases";
import { requireRole } from "@/lib/session";
import { formatCount } from "@/lib/words";
import { ClaimButtons } from "./claim-buttons";

export default async function Page() {
  const { user } = await requireRole(...rolesFor("recordPurchase"));
  const rows = await getPurchases();
  const canReverse = can(user.role, "reverseStock");
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Purchases" back="/stock/purchase" />
      {rows.length === 0 ? (
        <EmptyState title="No purchases yet" />
      ) : (
        <ul className="flex flex-col gap-3">
          {rows.map((r) => {
            const lost = r.shortBags + r.burstBags;
            const unitCost = r.unitCostPaise ?? 0;
            const left = r.receivedBags - r.reversedBags;
            return (
              <li key={r.id} className="flex flex-col gap-1 rounded-2xl bg-card p-4 shadow-card ring-1 ring-foreground/6">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="min-w-0 font-semibold [overflow-wrap:anywhere]">{r.productName}</span>
                  <span className="tabular shrink-0 font-bold">
                    {formatCount(r.receivedBags)} of {formatCount(r.billedBags)} bags
                  </span>
                </div>
                <p className="text-sm text-muted-foreground [overflow-wrap:anywhere]">
                  Invoice {r.invoiceNo} · {formatDate(r.invoiceDate)} · {r.placeName}
                </p>
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span className="min-w-0 [overflow-wrap:anywhere]">
                    <span className="tabular">{r.truckNumber}</span> · {r.driverName}
                  </span>
                  <CallButton phone={r.driverPhone} label={`Call ${r.driverName}`} className="-my-2 -mr-2" />
                </div>
                <p className="tabular text-sm text-muted-foreground">
                  Cost {formatINR(unitCost)} · Landed {formatINR(r.landedUnitCostPaise)} per bag
                </p>
                {lost > 0 && (
                  <div className="flex flex-col gap-2 pt-1">
                    <p className="tabular text-sm">
                      Short {formatCount(r.shortBags)} · Damage {formatCount(r.burstBags)} · Claim{" "}
                      {formatINR(claimValuePaise(lost, unitCost))}
                    </p>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold">
                        {isClaimStatus(r.claimStatus) ? CLAIM_LABELS[r.claimStatus] : r.claimStatus}
                      </span>
                      {(r.claimStatus === "open" || r.claimStatus === "claimed") && (
                        <ClaimButtons purchaseId={r.id} status={r.claimStatus} />
                      )}
                    </div>
                  </div>
                )}
                {(r.reversedBags > 0 || (canReverse && left > 0 && r.unitCostPaise !== null)) && (
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <span className="tabular font-semibold">{r.reversedBags > 0 ? `Reversed ${formatCount(r.reversedBags)} bags` : ""}</span>
                    {canReverse && left > 0 && r.unitCostPaise !== null && (
                      <ReverseSheet left={left} target={{ kind: "purchase", id: r.movementId, placeName: r.placeName }} />
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
