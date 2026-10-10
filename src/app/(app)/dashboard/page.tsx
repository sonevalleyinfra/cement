import { Suspense } from "react";
import { EmptyState } from "@/components/app/empty-state";
import { Skeleton } from "@/components/app/skeleton";
import { homeSections, type HomeSection } from "@/lib/home-rules";
import { requireUser } from "@/lib/session";
import { AccountsHome, AdminHome, LogisticsHome, MyCashHome, RetailerHome, SalesHome } from "./home-sections";

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
  const sections = homeSections(user.role);

  if (sections.length === 0) return <EmptyState title="Nothing here yet" />;

  const render = (s: HomeSection) => {
    switch (s) {
      case "admin":
        return <AdminHome />;
      case "sales":
        return <SalesHome userId={user.id} />;
      case "accounts":
        return <AccountsHome />;
      case "logistics":
        return <LogisticsHome />;
      case "retailer":
        return <RetailerHome userId={user.id} />;
      case "cash":
        return <MyCashHome userId={user.id} />;
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
