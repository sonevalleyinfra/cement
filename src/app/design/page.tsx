import { BadgeCheck, Banknote, CalendarDays, Package, Receipt, Wallet } from "lucide-react";
import { notFound } from "next/navigation";
import type { NavItem } from "@/components/app/bottom-nav";
import { AppShell, AppTitle } from "@/components/app/app-shell";
import { DataTable } from "@/components/app/data-table";
import { chipClass } from "@/components/app/chip";
import { EmptyState } from "@/components/app/empty-state";
import { FormHint } from "@/components/app/form-hint";
import { IconTile } from "@/components/app/icon-tile";
import { ListCard } from "@/components/app/list-card";
import { PageHeader } from "@/components/app/page-header";
import { PinnedAction } from "@/components/app/pinned-action";
import { FilterSelect, RangeForm } from "@/components/app/range-form";
import { SectionCaption } from "@/components/app/section-caption";
import { ListSkeleton } from "@/components/app/skeleton";
import { Stat } from "@/components/app/stat";
import { StatusChip } from "@/components/app/status-chip";
import { TextLink } from "@/components/app/text-link";
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
    <AppShell nav={nav} headerLeft={<AppTitle />}>
      <h2 className="mb-3 text-sm font-medium text-muted-foreground">Page header</h2>
      <div className="flex flex-col gap-4">
        <PageHeader
          title="Payments"
          action={
            <TextLink href="/design" strong>
              New payment
            </TextLink>
          }
        />
        <PageHeader title="Sharma Traders" back="/design" action={<StatusChip status="approved" />}>
          Trade OPC 43 · 120 bags
        </PageHeader>
      </div>

      <div className="mt-8 grid grid-cols-2 gap-4 py-2">
        <Stat label="Today" value="240 bags" />
        <Stat label="Sales" value={formatINRCompact(18_450_000_00)} />
      </div>

      <div className="mt-4 flex flex-col gap-3">
        <SectionCaption>Overview</SectionCaption>
        <ListCard
          featured
          index={0}
          href="/design"
          title="Today"
          icon={
            <span className="flex size-10 items-center justify-center rounded-xl bg-white/20 text-white">
              <CalendarDays className="size-5" />
            </span>
          }
          bottom={<Stat label="Orders" value="6" />}
        />
        <ListCard
          index={1}
          href="/design"
          title="Dues"
          icon={<IconTile icon={Banknote} tone="rose" />}
          bottom={<Stat label="Outstanding" value={formatINR(5_150_000, { hidePaise: true })} />}
        />
        <div className="flex gap-2 px-1">
          <IconTile icon={CalendarDays} tone="orange" />
          <IconTile icon={Banknote} tone="rose" />
          <IconTile icon={Package} tone="blue" />
          <IconTile icon={Wallet} tone="green" />
          <IconTile icon={BadgeCheck} tone="violet" />
          <IconTile icon={Receipt} tone="teal" />
        </div>
        <ListCard
          index={2}
          href="/design"
          top={
            <>
              <StatusChip status="placed" />
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
          index={3}
          top={
            <>
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
          index={4}
          top={
            <>
              <StatusChip status="dispatched" />
            </>
          }
          title="Verma & Sons"
          bottom={<Stat label="Bags" value="40" />}
        />
        <div className="flex flex-wrap gap-2 px-1">
          <StatusChip status="rejected" />
          <StatusChip status="partly_dispatched" />
          <StatusChip status="cancelled" />
        </div>
      </div>

      <h2 className="mt-8 mb-3 text-sm font-medium text-muted-foreground">Filters (reports, activity)</h2>
      <RangeForm from="2026-10-01" to="2026-10-10">
        <FilterSelect name="type" label="Type" value="" options={[{ value: "", label: "All" }, { value: "orders", label: "Orders" }]} />
      </RangeForm>

      <h2 className="mt-8 mb-3 text-sm font-medium text-muted-foreground">Table (reports)</h2>
      <DataTable
        columns={[{ label: "Product" }, { label: "Bags" }, { label: "Value" }]}
        rows={[
          ["Prism Trade OPC 43", "240", formatINR(8_400_000, { hidePaise: true })],
          ["Prism Non-trade PPC", "60", formatINR(1_920_000, { hidePaise: true })],
        ]}
        total={["Total", "300", formatINR(10_320_000, { hidePaise: true })]}
      />

      <h2 className="mt-8 mb-3 text-sm font-medium text-muted-foreground">Table, stacked (many number columns)</h2>
      <DataTable
        stacked
        columns={[{ label: "Product" }, { label: "Bags" }, { label: "Sales" }, { label: "Profit" }]}
        rows={[
          ["Trade OPC 43", "240", formatINR(8_400_000), formatINR(1_200_000)],
          ["Non-trade PPC 53", "60", formatINR(1_920_000), "–"],
        ]}
        total={["Total", "300", formatINR(10_320_000), formatINR(1_200_000)]}
      />

      <h2 className="mt-8 mb-3 text-sm font-medium text-muted-foreground">Chips, text link, hint</h2>
      <div className="flex flex-wrap items-center gap-2">
        <span className={chipClass(true)}>Open</span>
        <span className={chipClass(false)}>All</span>
        <TextLink href="/design" strong>
          New payment
        </TextLink>
      </div>
      <div className="mt-3">
        <FormHint>Enter the amount</FormHint>
        <Button disabled className="w-full">
          Save payment
        </Button>
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
