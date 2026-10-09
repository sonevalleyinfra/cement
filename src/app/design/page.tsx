import { notFound } from "next/navigation";
import type { NavItem } from "@/components/app/bottom-nav";
import { AppShell } from "@/components/app/app-shell";
import { EmptyState } from "@/components/app/empty-state";
import { FirmChip } from "@/components/app/firm-chip";
import { ListCard } from "@/components/app/list-card";
import { PinnedAction } from "@/components/app/pinned-action";
import { ListSkeleton } from "@/components/app/skeleton";
import { Stat } from "@/components/app/stat";
import { StatusChip } from "@/components/app/status-chip";
import { Button } from "@/components/ui/button";
import { formatINR, formatINRCompact } from "@/lib/money";
import { DemoControls } from "./demo-controls";

const nav: NavItem[] = [
  { href: "/design", label: "Home", icon: "home" },
  { href: "/design/orders", label: "Orders", icon: "orders" },
  { href: "/design/stock", label: "Stock", icon: "stock" },
  { href: "/design/money", label: "Money", icon: "money" },
];

/** Component gallery for development only. Not shown in production. */
export default function DesignPage() {
  if (process.env.NODE_ENV === "production") notFound();

  return (
    <AppShell title="Orders" nav={nav} headerRight={<FirmChip name="Firm A" slot="a" />}>
      <div className="grid grid-cols-2 gap-4 py-2">
        <Stat label="Today" value="240 bags" />
        <Stat label="Sales" value={formatINRCompact(18_450_000_00)} />
      </div>

      <div className="mt-4 flex flex-col gap-3">
        <ListCard
          index={0}
          href="/design"
          top={
            <>
              <FirmChip name="Firm A" slot="a" />
              <StatusChip status="pending" />
            </>
          }
          title="Sharma Traders"
          bottom={
            <>
              <Stat label="Bags" value="120" />
              <Stat label="Amount" value={formatINR(4_680_000, { hidePaise: true })} className="text-right" />
            </>
          }
        />
        <ListCard
          index={1}
          top={
            <>
              <FirmChip name="Firm B" slot="b" />
              <StatusChip status="approved" />
            </>
          }
          title="Gupta Building Supply"
          bottom={
            <>
              <Stat label="Bags" value="80" />
              <Stat label="Amount" value={formatINR(3_120_000, { hidePaise: true })} className="text-right" />
            </>
          }
        />
        <ListCard
          index={2}
          top={
            <>
              <FirmChip name="Firm C" slot="c" />
              <StatusChip status="dispatched" />
            </>
          }
          title="Verma & Sons"
          bottom={<Stat label="Bags" value="40" />}
        />
        <div className="flex gap-4 px-1">
          <StatusChip status="rejected" />
          <StatusChip status="delivered" />
        </div>
      </div>

      <h2 className="mt-8 mb-3 text-sm font-medium text-muted-foreground">Loading</h2>
      <ListSkeleton rows={2} />

      <h2 className="mt-8 mb-1 text-sm font-medium text-muted-foreground">Empty</h2>
      <EmptyState title="No orders" action={<Button variant="outline">New order</Button>} />

      <DemoControls />

      <PinnedAction>
        <Button size="lg">New order</Button>
      </PinnedAction>
    </AppShell>
  );
}
