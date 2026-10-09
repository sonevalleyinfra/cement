import { Suspense } from "react";
import { EmptyState } from "@/components/app/empty-state";
import { getFirmSelection } from "@/components/app/firm-switcher";
import { Skeleton } from "@/components/app/skeleton";
import { homeSections, type HomeSection } from "@/lib/home-rules";
import { requireUser } from "@/lib/session";
import { AccountsHome, AdminHome, LogisticsHome, RetailerHome, SalesHome } from "./home-sections";

function SectionSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      <Skeleton className="h-24 rounded-2xl" />
      <Skeleton className="h-24 rounded-2xl" />
    </div>
  );
}

export default async function DashboardPage() {
  const { user } = await requireUser();
  const { selection, firms } = await getFirmSelection();
  const sections = homeSections(user.role);
  // One firm, or every firm for admin's read-only "All firms" view.
  const scope = selection.mode === "firm" ? [selection.firmId] : selection.mode === "all" ? firms.map((f) => f.id) : [];

  if (sections.length === 0) return <EmptyState title="Nothing here yet" />;

  const render = (s: HomeSection) => {
    switch (s) {
      case "admin":
        return <AdminHome firmIds={scope} />;
      case "sales":
        return <SalesHome userId={user.id} firmIds={scope} />;
      case "accounts":
        return <AccountsHome firmIds={scope} />;
      case "logistics":
        return <LogisticsHome user={{ id: user.id, role: user.role }} firmIds={scope} />;
      case "retailer":
        return <RetailerHome userId={user.id} />;
    }
  };

  return (
    <div className="flex flex-col gap-6">
      {sections.map((s) => (
        <Suspense key={s} fallback={<SectionSkeleton />}>
          {render(s)}
        </Suspense>
      ))}
    </div>
  );
}
