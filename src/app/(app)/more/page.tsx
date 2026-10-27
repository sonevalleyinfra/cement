import {
  BadgeCheck,
  BookOpen,
  ChartColumn,
  ChevronRight,
  Factory,
  History,
  KeyRound,
  Landmark,
  MapPin,
  Package,
  Receipt,
  ShieldCheck,
  Tags,
  Truck,
  Warehouse,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { IconTile, type Tone } from "@/components/app/icon-tile";
import { PageHeader } from "@/components/app/page-header";
import { SectionCaption } from "@/components/app/section-caption";
import { Button } from "@/components/ui/button";
import { stagger } from "@/lib/motion";
import { moreGroups } from "@/lib/nav-rules";
import { parseRoles, type Role } from "@/lib/roles";
import { requireUser } from "@/lib/session";
import { cn } from "@/lib/utils";
import { signOut } from "../dashboard/actions";

const looks: Record<string, { icon: LucideIcon; tone: Tone }> = {
  "/receipts": { icon: Receipt, tone: "teal" },
  "/wallet": { icon: Wallet, tone: "green" },
  "/ledger": { icon: BookOpen, tone: "rose" },
  "/suppliers": { icon: Factory, tone: "amber" },
  "/bank-accounts": { icon: Landmark, tone: "teal" },
  "/approvals": { icon: BadgeCheck, tone: "moss" },
  "/stock": { icon: Package, tone: "blue" },
  "/dispatch": { icon: Truck, tone: "blue" },
  "/godowns": { icon: Warehouse, tone: "blue" },
  "/catalogue": { icon: Tags, tone: "blue" },
  "/users": { icon: Users, tone: "slate" },
  "/areas": { icon: MapPin, tone: "slate" },
  "/reports": { icon: ChartColumn, tone: "orange" },
  "/activity": { icon: History, tone: "slate" },
  "/reports/books": { icon: ShieldCheck, tone: "slate" },
  "/account": { icon: KeyRound, tone: "orange" },
};

const ROLE_DETAILS: Record<
  Role,
  { label: string; chip: string; description: string; duties: string[] }
> = {
  admin: {
    label: "Admin",
    chip: "bg-purple-100 text-purple-800 dark:bg-purple-950/60 dark:text-purple-300 ring-purple-600/20",
    description: "Owner / Full Management",
    duties: [
      "Cement rates & credit limits",
      "High-value order approvals",
      "Factory purchases & supplier accounts",
      "Staff users, godowns & catalogue",
      "Company reports & audit logs",
    ],
  },
  sales: {
    label: "Sales",
    chip: "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 ring-amber-600/20",
    description: "Field Sales & Collections",
    duties: [
      "Place retailer cement orders",
      "Fill bag rates for assigned shops",
      "Track shop dues & collections",
      "Collect field cash & UPI payments",
    ],
  },
  logistics: {
    label: "Logistics",
    chip: "bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300 ring-blue-600/20",
    description: "Dispatch & Stock Operations",
    duties: [
      "Dispatch orders to vehicles / sites",
      "Record incoming factory purchases",
      "Track transit shortage & damage claims",
      "Transfer bags between godowns & trucks",
    ],
  },
  accounts: {
    label: "Accounts",
    chip: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 ring-emerald-600/20",
    description: "Finance & Verification",
    duties: [
      "Approve credit orders",
      "Verify online bank / QR payments",
      "Confirm staff cash handovers",
      "Retailer ledger reconciliation",
    ],
  },
  retailer: {
    label: "Retailer",
    chip: "bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300 ring-rose-600/20",
    description: "Shop / Customer Account",
    duties: [
      "Place direct cement orders",
      "Track order dispatch & delivery status",
      "Check ledger dues & statements",
    ],
  },
};

export default async function MorePage() {
  const { user } = await requireUser();
  const roles = parseRoles(user.role);
  let i = 0;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="More" />

      {/* Account Info & Role Overview */}
      <div className="rounded-2xl bg-card p-4 shadow-card ring-1 ring-foreground/6">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary font-bold text-lg select-none">
              {user.name ? user.name.charAt(0).toUpperCase() : "U"}
            </div>
            <div className="flex flex-col min-w-0">
              <span className="font-bold text-base leading-tight truncate">{user.name}</span>
              <span className="text-xs text-muted-foreground truncate">{user.email}</span>
            </div>
          </div>
          <div className="flex flex-wrap justify-end gap-1.5 shrink-0">
            {roles.length === 0 ? (
              <span className="inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 text-xs font-semibold text-muted-foreground ring-1 ring-foreground/10">
                No Role
              </span>
            ) : (
              roles.map((r) => {
                const info = ROLE_DETAILS[r];
                return (
                  <span
                    key={r}
                    className={cn(
                      "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1",
                      info?.chip ?? "bg-muted text-foreground ring-foreground/10"
                    )}
                  >
                    {info?.label ?? r}
                  </span>
                );
              })
            )}
          </div>
        </div>

        {/* Roles Responsibilities summary */}
        <div className="mt-3 border-t border-foreground/6 pt-3">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
            Role Responsibility / ज़िम्मेदारी:
          </p>
          <div className="flex flex-col gap-1.5">
            {roles.length === 0 ? (
              <p className="text-xs text-muted-foreground">No specific responsibilities assigned.</p>
            ) : (
              roles.map((r) => {
                const info = ROLE_DETAILS[r];
                if (!info) return null;
                return (
                  <div key={r} className="text-xs text-foreground/85 leading-relaxed">
                    <span className="font-semibold text-foreground">{info.label}:</span>{" "}
                    <span className="text-muted-foreground">{info.duties.join(" · ")}</span>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-6">
        {moreGroups(user.role).map((g) => (
          <section key={g.title} className="flex flex-col gap-2">
            <SectionCaption>{g.title}</SectionCaption>
            <ul className="flex flex-col gap-3">
              {g.rows.map((r) => {
                const look = looks[r.href];
                return (
                  <li key={r.href} className="animate-in-up" style={stagger(i++)}>
                    <Link
                      href={r.href}
                      className="group flex w-full items-center gap-3 rounded-2xl bg-card p-3 pr-4 text-left text-base font-semibold shadow-card ring-1 ring-foreground/6 transition-[transform,box-shadow] duration-200 ease-out hover:-translate-y-0.5 hover:shadow-card-hover active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <IconTile icon={look.icon} tone={look.tone} />
                      <span className="flex-1">{r.label}</span>
                      <ChevronRight
                        aria-hidden
                        className="size-5 text-muted-foreground/60 transition-transform duration-200 group-hover:translate-x-0.5"
                      />
                    </Link>
                  </li>
                );
              })}
              {g.title === "Account" && (
                <li className="animate-in-up" style={stagger(i++)}>
                  <form action={signOut}>
                    <Button type="submit" variant="outline" className="w-full">
                      Sign out
                    </Button>
                  </form>
                </li>
              )}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
