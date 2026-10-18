import {
  BadgeCheck,
  BookOpen,
  ChartColumn,
  ChevronRight,
  Factory,
  History,
  KeyRound,
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
import { SectionCaption } from "@/components/app/section-caption";
import { Button } from "@/components/ui/button";
import { moreGroups } from "@/lib/nav-rules";
import { requireUser } from "@/lib/session";
import { signOut } from "../dashboard/actions";

const looks: Record<string, { icon: LucideIcon; tone: Tone }> = {
  "/receipts": { icon: Receipt, tone: "teal" },
  "/wallet": { icon: Wallet, tone: "green" },
  "/ledger": { icon: BookOpen, tone: "rose" },
  "/suppliers": { icon: Factory, tone: "amber" },
  "/approvals": { icon: BadgeCheck, tone: "violet" },
  "/stock": { icon: Package, tone: "blue" },
  "/dispatch": { icon: Truck, tone: "blue" },
  "/godowns": { icon: Warehouse, tone: "blue" },
  "/catalogue": { icon: Tags, tone: "blue" },
  "/users": { icon: Users, tone: "violet" },
  "/reports": { icon: ChartColumn, tone: "orange" },
  "/activity": { icon: History, tone: "slate" },
  "/reports/books": { icon: ShieldCheck, tone: "slate" },
  "/account": { icon: KeyRound, tone: "orange" },
};

const delay = (i: number) => ({ animationDelay: `${Math.min(i, 6) * 30}ms` });

export default async function MorePage() {
  const { user } = await requireUser();
  let i = 0;
  return (
    <div className="flex flex-col gap-6">
      {moreGroups(user.role).map((g) => (
        <section key={g.title} className="flex flex-col gap-2">
          <SectionCaption>{g.title}</SectionCaption>
          <ul className="flex flex-col gap-3">
            {g.rows.map((r) => {
              const look = looks[r.href];
              return (
                <li key={r.href} className="animate-in-up" style={delay(i++)}>
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
              <li className="animate-in-up" style={delay(i++)}>
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
  );
}
