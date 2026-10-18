import { Users } from "lucide-react";
import { EmptyState } from "@/components/app/empty-state";
import { IconTile } from "@/components/app/icon-tile";
import { ListCard } from "@/components/app/list-card";
import { Stat } from "@/components/app/stat";
import { rolesFor } from "@/lib/permissions";
import { param, reportRange } from "@/lib/report-range";
import { getStaffReport } from "@/lib/reports";
import { requireRole } from "@/lib/session";
import { money, num, ReportFrame } from "../report-frame";

export default async function StaffReportPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireRole(...rolesFor("viewReports"));
  const sp = await searchParams;
  const range = reportRange({ from: param(sp.from), to: param(sp.to) });
  const lines = await getStaffReport(range);
  return (
    <ReportFrame title="Staff activity" range={range}>
      {lines.length === 0 ? (
        <EmptyState title="Nothing done" icon={Users} tone="slate" />
      ) : (
        <div className="flex flex-col gap-3">
          {lines.map((l, i) => (
            <ListCard
              key={l.personId}
              index={i}
              title={l.name}
              icon={<IconTile icon={Users} tone="slate" />}
              bottom={
                <div className="grid w-full grid-cols-2 gap-x-4 gap-y-3 [overflow-wrap:anywhere] [&>*]:min-w-0">
                  <Stat label="Orders placed" value={num(l.ordersPlaced)} />
                  <Stat label="Approved / rejected" value={`${num(l.approved)} / ${num(l.rejected)}`} />
                  <Stat label="Dispatches" value={num(l.dispatches)} />
                  <Stat label="Bags sent" value={num(l.dispatchedBags)} />
                  <Stat label="Payments" value={num(l.payments)} />
                  <Stat label="Collected" value={money(l.paymentsPaise)} />
                  <Stat label="Cash held now" value={money(l.cashHeldPaise)} />
                </div>
              }
            />
          ))}
        </div>
      )}
    </ReportFrame>
  );
}
