import {
  Banknote,
  BadgeCheck,
  CalendarDays,
  ChartColumn,
  ChevronRight,
  ClipboardList,
  History,
  Package,
  Receipt,
  Store,
  TriangleAlert,
  Truck,
  Wallet,
  Warehouse,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { Delta } from "@/components/app/delta";
import { EmptyState } from "@/components/app/empty-state";
import { IconTile, type Tone } from "@/components/app/icon-tile";
import { HintLine } from "@/components/app/hint-line";
import { KeyValue } from "@/components/app/key-value";
import { ListCard } from "@/components/app/list-card";
import { OverdueRow } from "@/components/app/overdue-row";
import { SectionCaption } from "@/components/app/section-caption";
import { Skeleton } from "@/components/app/skeleton";
import { Stat } from "@/components/app/stat";
import { TextLink } from "@/components/app/text-link";
import { buttonVariants } from "@/components/ui/button";
import {
  getAccountsHome,
  getAdminHome,
  getLogisticsHome,
  getMyCash,
  getRetailerHome,
  getSalesHome,
} from "@/lib/home-stats";
import { formatDate } from "@/lib/datetime";
import { NO_LIMIT_FILTER, NO_REP_FILTER } from "@/lib/home-rules";
import { formatINR, formatINRCompact } from "@/lib/money";
import { getCashWithStaff, getOwnerMonth, getOwnerRisk, getOwnerToday, getTopOverdue } from "@/lib/owner-home";
import { cashAgePill, deltaPct, homeWindows, perBagDelta, supplierValue, windowsText, type HomeWindows } from "@/lib/owner-home-rules";
import { ageText, ageTone, coverTone, type Tone as NoteTone } from "@/lib/overdue-rules";
import { getSuppliers } from "@/lib/suppliers";
import { cn } from "@/lib/utils";
import { bagsText, daysText, formatCount, shopsText } from "@/lib/words";

const num = (v: number) => new Intl.NumberFormat("en-IN").format(v);
const money = (p: number) => formatINR(p, { hidePaise: true });

function Cards({ children }: { children: ReactNode }) {
  return <div className="flex flex-col gap-3">{children}</div>;
}

const NOTE_TONE: Record<NoteTone, string> = {
  muted: "text-muted-foreground",
  caution: "text-caution-foreground",
  risk: "text-risk-foreground",
};

/** A 12px line under a card's stats ("Oldest 3 h", "Cover 6 days"). */
type Note = { text: string; tone: NoteTone };

/** "Oldest 3 h" for the longest-waiting item, or nothing when nothing waits. */
function ageNote(oldest: Date | null, now: Date): Note | undefined {
  return oldest ? { text: ageText(oldest, now), tone: ageTone(oldest, now) } : undefined;
}

/** The first card on each home section is featured (brand gradient); the rest get a coloured icon. */
function Card({
  href,
  title,
  stats,
  index,
  icon,
  tone,
  note,
}: {
  href: string;
  title: string;
  stats: { label: string; value: string }[];
  index: number;
  icon: LucideIcon;
  tone: Tone;
  note?: Note;
}) {
  const featured = index === 0;
  const Icon = icon;
  const statRow =
    stats.length > 0 ? (
      <div className="flex w-full flex-wrap gap-x-8 gap-y-2">
        {stats.map((s) => (
          <Stat key={s.label} label={s.label} value={s.value} />
        ))}
      </div>
    ) : undefined;
  // On the gradient card the tone colours would not read, so a warning there is white, bold and has an icon.
  const noteLine = note && (
    <p
      className={cn(
        "tabular flex items-center gap-1 text-xs",
        featured ? (note.tone === "muted" ? "text-muted-foreground" : "font-semibold text-white") : NOTE_TONE[note.tone],
      )}
    >
      {note.tone !== "muted" && <TriangleAlert className="size-4 shrink-0" aria-hidden />}
      {note.text}
    </p>
  );
  return (
    <ListCard
      href={href}
      title={title}
      index={index}
      featured={featured}
      icon={
        featured ? (
          <span aria-hidden className="flex size-10 items-center justify-center rounded-xl bg-white/20 text-white">
            <Icon className="size-5" strokeWidth={2} />
          </span>
        ) : (
          <IconTile icon={icon} tone={tone} />
        )
      }
      bottom={
        noteLine ? (
          <div className="flex w-full flex-col gap-2">
            {statRow}
            {noteLine}
          </div>
        ) : (
          statRow
        )
      }
    />
  );
}

export async function SalesHome({ userId }: { userId: string }) {
  const s = await getSalesHome(userId);
  const numbers = [
    { label: "Today", value: money(s.collectedTodayPaise) },
    { label: "This month", value: money(s.collectedMonthPaise) },
    { label: "Bags (month)", value: formatCount(s.bagsMonth) },
  ];
  return (
    <div className="flex flex-col gap-6">
      {/* The most frequent field job; the cards below are plain, so it is the one highlight. */}
      <Link href="/receipts/new" className={cn(buttonVariants({ size: "lg" }), "w-full")}>
        Record payment
      </Link>
      <div className="flex flex-col gap-2">
        <SectionCaption>My numbers</SectionCaption>
        {/* Same Stat row as the cards below: lakh amounts wrap to a second line instead of truncating. */}
        <div className="flex flex-wrap gap-x-8 gap-y-2 rounded-2xl bg-card p-4 shadow-card ring-1 ring-foreground/6">
          {numbers.map((x) => (
            <Stat key={x.label} label={x.label} value={x.value} />
          ))}
        </div>
      </div>
      <div className="flex flex-col gap-2">
        {/* -my-4 cancels the 48px tap area of "All", so the caption sits 8px above the list like "My numbers". */}
        <div className="-my-4 flex items-center justify-between">
          <SectionCaption>Collect today</SectionCaption>
          <TextLink href="/ledger?show=overdue">All</TextLink>
        </div>
        {s.collect === null ? (
          <div className="flex items-center gap-2">
            <HintLine tone="risk">Couldn&apos;t load</HintLine>
            <TextLink href="/dashboard">Retry</TextLink>
          </div>
        ) : s.collect.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing to collect</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {s.collect.map((r) => (
              <li key={r.retailerId}>
                <OverdueRow row={r} href={`/receipts/new?retailer=${r.retailerId}`} />
              </li>
            ))}
          </ul>
        )}
      </div>
      <Cards>
        <Card index={0} href="/orders?show=rate" title="My orders" icon={ClipboardList} tone="orange" stats={[{ label: "Rate to fill", value: num(s.pendingRate) }, { label: "Today", value: num(s.today) }]} />
        <Card
          index={1}
          href="/ledger"
          title="My shops' dues" icon={Banknote} tone="rose"
          stats={[
            { label: "Retailers", value: num(s.retailersWithDues) },
            { label: "Due", value: money(s.duesPaise) },
          ]}
        />
      </Cards>
    </div>
  );
}

export async function AccountsHome() {
  const s = await getAccountsHome();
  const now = new Date();
  return (
    <Cards>
      <Card index={0} href="/approvals" title="Approvals" icon={BadgeCheck} tone="moss" stats={[{ label: "Waiting", value: num(s.approvals) }]} note={ageNote(s.oldest.approvals, now)} />
      <Card index={1} href="/receipts/review" title="Online" icon={Receipt} tone="teal" stats={[{ label: "To verify", value: num(s.unverifiedOnline) }]} note={ageNote(s.oldest.online, now)} />
      <Card
        index={2}
        href="/wallet"
        title="Cash handovers" icon={Wallet} tone="green"
        stats={[
          { label: "To confirm", value: num(s.handoversToConfirm) },
          { label: "Amount", value: money(s.cashToConfirmPaise) },
        ]}
        note={ageNote(s.oldest.handovers, now)}
      />
    </Cards>
  );
}

export async function LogisticsHome() {
  const now = new Date();
  const s = await getLogisticsHome(now);
  const cover = s.godown.coverDays;
  return (
    <Cards>
      <Card index={0} href="/dispatch" title="Dispatch" icon={Truck} tone="blue" stats={[{ label: "Ready", value: num(s.ready) }, { label: "Partly sent", value: num(s.partly) }]} note={ageNote(s.oldestToDispatch, now)} />
      <Card
        index={1}
        href="/stock"
        title="Godown stock"
        icon={Warehouse}
        tone="blue"
        stats={[{ label: "Bags", value: num(s.godown.bags) }]}
        note={{ text: `Cover ${cover === null ? "—" : daysText(cover)}`, tone: coverTone(cover) }}
      />
      {s.trucks.length === 0 ? (
        <Card index={2} href="/stock" title="Truck stock" icon={Package} tone="blue" stats={[{ label: "Loaded trucks", value: "0" }]} />
      ) : (
        s.trucks.map((t, i) => (
          <Card
            key={t.truck}
            index={i + 2}
            href="/stock"
            title={`Truck ${t.truck}`}
            icon={Truck}
            tone="blue"
            stats={t.products.map((p) => ({ label: p.name, value: `${num(p.bags)} bags` }))}
          />
        ))
      )}
    </Cards>
  );
}

/* ---------- Owner Home (admin, v2 C1 + C2) ---------- */

const PANEL = "rounded-2xl bg-card shadow-card ring-1 ring-foreground/6";

/** Shown in place of one section's body when its numbers fail to load; the rest of Home still renders. */
function LoadError() {
  return (
    <div className="flex items-center gap-2">
      <HintLine tone="risk">Couldn&apos;t load</HintLine>
      <TextLink href="/dashboard">Retry</TextLink>
    </div>
  );
}

/** Runs a section's read; null = it failed (logged), so only that section shows "Couldn't load". */
async function load<T>(read: Promise<T>): Promise<T | null> {
  try {
    return await read;
  } catch (error) {
    console.error("Owner Home section failed", error);
    return null;
  }
}

function Section({ caption, children }: { caption?: ReactNode; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      {caption}
      {children}
    </section>
  );
}

async function OwnerToday({ w }: { w: HomeWindows }) {
  const s = await load(getOwnerToday(w));
  if (!s) return <LoadError />;
  return (
    <ListCard
      index={0}
      featured
      href={`/reports/sales?from=${w.today}&to=${w.today}`}
      title="Today"
      icon={
        <span aria-hidden className="flex size-10 items-center justify-center rounded-xl bg-white/20 text-white">
          <CalendarDays className="size-5" strokeWidth={2} />
        </span>
      }
      bottom={
        <div className="flex w-full flex-wrap justify-between gap-x-8 gap-y-2">
          <div className="flex flex-col gap-1">
            <Stat label="Sales" value={money(s.salesPaise)} />
            <span className="tabular text-xs text-white/80">{bagsText(s.bags)}</span>
          </div>
          <div className="flex flex-col gap-1">
            <Stat label="Collected" value={money(s.collected.totalPaise)} />
            <span className="tabular text-xs text-white/80">
              Cash {money(s.collected.cashPaise)} · Online {money(s.collected.onlinePaise)}
            </span>
          </div>
        </div>
      }
    />
  );
}

/** One "This month" row: [label 96px][value][Delta], then the sub line with its own Delta (or none). */
function MonthRow({ label, value, delta, sub, subDelta }: { label: string; value: string; delta: ReactNode; sub: string; subDelta?: ReactNode }) {
  return (
    <div className="grid grid-cols-[96px_1fr_auto] items-baseline gap-x-2 gap-y-1 py-3 first:pt-0 last:pb-0">
      <span className="text-sm">{label}</span>
      <span className="tabular min-w-0 text-xl font-bold wrap-anywhere">{value}</span>
      {delta}
      <span className="col-start-2 tabular min-w-0 text-xs text-muted-foreground wrap-anywhere">{sub}</span>
      {subDelta ?? <span />}
    </div>
  );
}

async function OwnerMonth({ w }: { w: HomeWindows }) {
  const s = await load(getOwnerMonth(w));
  if (!s) return <LoadError />;
  return (
    <div className={cn(PANEL, "flex flex-col divide-y divide-border p-4")}>
      <MonthRow
        label="Sales"
        value={money(s.sales.paise)}
        delta={<Delta value={deltaPct(s.sales.paise, s.prevSales.paise)} />}
        sub={bagsText(s.sales.bags)}
        subDelta={<Delta value={deltaPct(s.sales.bags, s.prevSales.bags)} />}
      />
      <MonthRow
        label="Margin"
        value={money(s.margin.paise)}
        delta={<Delta value={deltaPct(s.margin.paise, s.prevMargin.paise)} />}
        sub={s.margin.perBagPaise === null ? "— / bag" : `${money(s.margin.perBagPaise)} / bag`}
        subDelta={<Delta unit="rupees" value={perBagDelta(s.margin.perBagPaise, s.prevMargin.perBagPaise)} />}
      />
      <MonthRow
        label="Collected"
        value={money(s.collected.totalPaise)}
        delta={<Delta value={deltaPct(s.collected.totalPaise, s.prevCollected.totalPaise)} />}
        sub={`Cash ${formatINRCompact(s.collected.cashPaise)} · Online ${formatINRCompact(s.collected.onlinePaise)}`}
      />
    </div>
  );
}

/** A small Risk card: 12px label, 20px value (wraps on a phone), optional 12px caption. */
function RiskCard({ label, value, href, valueClass, caption }: { label: string; value: string; href?: string; valueClass?: string; caption?: string }) {
  const body = (
    <>
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={cn("tabular text-xl leading-tight font-bold wrap-anywhere", valueClass)}>{value}</span>
      {caption && <span className="tabular text-xs text-muted-foreground">{caption}</span>}
    </>
  );
  const classes = cn(PANEL, "flex min-w-0 flex-col gap-1 p-4");
  return href ? (
    <Link href={href} className={cn(classes, "outline-none focus-visible:ring-2 focus-visible:ring-ring")}>
      {body}
    </Link>
  ) : (
    <div className={classes}>{body}</div>
  );
}

async function OwnerRisk({ w, now }: { w: HomeWindows; now: Date }) {
  const s = await load(getOwnerRisk(w, now));
  if (!s) return <LoadError />;
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3">
        <RiskCard label="Outstanding" value={money(s.outstandingPaise)} href="/ledger" />
        <RiskCard
          label="Overdue"
          value={`${s.overduePct}%`}
          href="/ledger?show=overdue"
          valueClass={s.overduePct > 20 ? "text-risk-foreground" : undefined}
        />
        <RiskCard label="DSO" value={s.dso === null ? "—" : daysText(s.dso)} />
        <RiskCard
          label="Stock value"
          value={money(s.stock.valuePaise)}
          href="/stock"
          caption={s.stock.unvaluedBags > 0 ? `${formatCount(s.stock.unvaluedBags)} bags no cost` : undefined}
        />
      </div>
      {s.noLimitShops > 0 && (
        <Link
          href={`/retailers?filter=${NO_LIMIT_FILTER}`}
          className="flex min-h-12 items-center gap-2 rounded-xl bg-caution-soft px-3 text-sm font-semibold text-caution-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <TriangleAlert className="size-4 shrink-0" aria-hidden />
          <span className="flex-1">
            {shopsText(s.noLimitShops)} {s.noLimitShops === 1 ? "has" : "have"} no limit
          </span>
          <ChevronRight className="size-4 shrink-0" aria-hidden />
        </Link>
      )}
    </div>
  );
}

async function OwnerTopOverdue({ w }: { w: HomeWindows }) {
  const rows = await load(getTopOverdue(w));
  if (!rows) return <LoadError />;
  return (
    <div className={cn(PANEL, "divide-y divide-border")}>
      {rows.length === 0 ? (
        <p className="flex min-h-14 items-center px-4 text-sm text-muted-foreground">No overdue shops</p>
      ) : (
        rows.map((r) => <OverdueRow key={r.retailerId} row={r} density="compact" href={`/ledger/${r.retailerId}`} />)
      )}
    </div>
  );
}

async function OwnerCash({ now }: { now: Date }) {
  const rows = await load(getCashWithStaff(now));
  if (!rows) return <LoadError />;
  return (
    <div className={cn(PANEL, "divide-y divide-border")}>
      {rows.length === 0 ? (
        <p className="flex min-h-14 items-center px-4 text-sm text-muted-foreground">No cash with staff</p>
      ) : (
        rows.map((p) => {
          const pill = cashAgePill(p.ageDays);
          return (
            <Link
              key={p.personId}
              href="/wallet"
              className="flex min-h-12 items-center gap-3 px-4 py-2 outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="min-w-0 flex-1 text-base font-semibold">{p.name}</span>
              <span className="tabular text-base font-semibold">{money(p.heldPaise)}</span>
              <span
                className={cn(
                  "tabular inline-flex h-6 shrink-0 items-center rounded-full px-2 text-xs font-semibold",
                  pill.tone === "risk" ? "bg-risk-soft text-risk-foreground" : "bg-muted text-muted-foreground",
                )}
              >
                {pill.text}
              </span>
            </Link>
          );
        })
      )}
    </div>
  );
}

async function OwnerTodo({ now }: { now: Date }) {
  const s = await load(getAdminHome());
  if (!s) return <LoadError />;
  return (
    <Cards>
      <Card index={1} href="/approvals" title="Approvals" icon={BadgeCheck} tone="moss" stats={[{ label: "Waiting", value: num(s.approvals) }]} note={ageNote(s.oldest.approvals, now)} />
      <Card index={2} href="/dispatch" title="Dispatch" icon={Truck} tone="blue" stats={[{ label: "To send", value: num(s.toDispatch) }]} note={ageNote(s.oldest.dispatch, now)} />
      <Card index={3} href="/receipts/review" title="Online" icon={Receipt} tone="teal" stats={[{ label: "To verify", value: num(s.unverifiedOnline) }]} note={ageNote(s.oldest.online, now)} />
      {s.shopsWithoutSalesRep > 0 && (
        <Card
          index={4}
          href={`/retailers?filter=${NO_REP_FILTER}`}
          title="Shops"
          icon={Store}
          tone="rose"
          stats={[{ label: "Without sales person", value: num(s.shopsWithoutSalesRep) }]}
        />
      )}
    </Cards>
  );
}

/** All suppliers, one KeyValue row each. Nothing at all (not even the caption) when there are none. */
async function OwnerSuppliers() {
  const rows = await load(getSuppliers());
  if (rows?.length === 0) return null;
  return (
    <Section caption={<SectionCaption>Suppliers</SectionCaption>}>
      {rows === null ? (
        <LoadError />
      ) : (
        <Link href="/suppliers" className={cn(PANEL, "flex flex-col gap-1 px-4 py-3 outline-none focus-visible:ring-2 focus-visible:ring-ring")}>
          {rows.map((r) => (
            <KeyValue key={r.id} label={r.name} value={supplierValue(r)} />
          ))}
        </Link>
      )}
    </Section>
  );
}

/**
 * The owner's Home: numbers first (today, this month, risk), then lists and to-dos. Admin only: the
 * dashboard shows the "admin" section only to admins (`homeSections`). Each section loads and fails on its
 * own (`Suspense` + `load`), with a static placeholder of its final size.
 */
export function AdminHome() {
  const now = new Date();
  const w = homeWindows(now);
  return (
    <div className="flex flex-col gap-6">
      <Suspense fallback={<Skeleton className="h-36 rounded-2xl" />}>
        <OwnerToday w={w} />
      </Suspense>
      <Section
        caption={
          <SectionCaption>
            This month · <span className="font-medium">{windowsText(w)}</span>
          </SectionCaption>
        }
      >
        <Suspense fallback={<Skeleton className="h-48 rounded-2xl" />}>
          <OwnerMonth w={w} />
        </Suspense>
      </Section>
      <Section caption={<SectionCaption>Risk</SectionCaption>}>
        <Suspense fallback={<Skeleton className="h-44 rounded-2xl" />}>
          <OwnerRisk w={w} now={now} />
        </Suspense>
      </Section>
      <Section
        caption={
          // -my-4 cancels the 48px tap area of "All", so the caption sits 8px above the list.
          <div className="-my-4 flex items-center justify-between">
            <SectionCaption>Top overdue</SectionCaption>
            <TextLink href="/ledger?show=overdue">All</TextLink>
          </div>
        }
      >
        <Suspense fallback={<Skeleton className="h-42 rounded-2xl" />}>
          <OwnerTopOverdue w={w} />
        </Suspense>
      </Section>
      <Section caption={<SectionCaption>Cash with staff</SectionCaption>}>
        <Suspense fallback={<Skeleton className="h-24 rounded-2xl" />}>
          <OwnerCash now={now} />
        </Suspense>
      </Section>
      <Section caption={<SectionCaption>To do</SectionCaption>}>
        <Suspense fallback={<Skeleton className="h-72 rounded-2xl" />}>
          <OwnerTodo now={now} />
        </Suspense>
      </Section>
      <Suspense fallback={<Skeleton className="h-24 rounded-2xl" />}>
        <OwnerSuppliers />
      </Suspense>
      <Cards>
        <Card index={5} href="/reports" title="Reports" icon={ChartColumn} tone="orange" stats={[]} />
        <Card index={6} href="/activity" title="Activity" icon={History} tone="slate" stats={[]} />
      </Cards>
    </div>
  );
}

export async function RetailerHome({ userId }: { userId: string }) {
  const s = await getRetailerHome(userId);
  if (!s) return <EmptyState title="No shop linked" />;
  return (
    <Cards>
      {/* The first thing a shop does (spec section 10 lists "new order" first); the cards below are plain, so it is the one highlight. */}
      <Link href="/orders/new" className={cn(buttonVariants({ size: "lg" }), "w-full")}>
        New order
      </Link>
      <Card index={1} href="/orders?show=open" title="My orders" icon={ClipboardList} tone="orange" stats={[{ label: "Open", value: num(s.openOrders) }]} />
      <Card
        index={2}
        href="/ledger"
        title="My dues" icon={Banknote} tone="rose"
        stats={[{ label: s.balancePaise < 0 ? "Advance" : "Due", value: money(Math.abs(s.balancePaise)) }]}
      />
      <Card
        index={3}
        href="/receipts"
        title="My payments" icon={Receipt} tone="teal"
        stats={
          s.lastPayment
            ? [
                { label: "Last", value: money(s.lastPayment.totalPaise) },
                { label: "On", value: formatDate(s.lastPayment.createdAt) },
              ]
            : [{ label: "Last", value: "None" }]
        }
      />
    </Cards>
  );
}

/** "My cash held": shown once on every staff member's home. */
export async function MyCashHome({ userId }: { userId: string }) {
  const s = await getMyCash(userId);
  const stats = [{ label: "Held", value: money(s.heldPaise) }];
  if (s.pendingPaise > 0) stats.push({ label: "Waiting", value: money(s.pendingPaise) });
  return (
    <Cards>
      <Card index={1} href="/wallet" title="My cash" icon={Wallet} tone="green" stats={stats} />
    </Cards>
  );
}
