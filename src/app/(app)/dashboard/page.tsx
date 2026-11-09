import { Suspense } from "react";
import { EmptyState } from "@/components/app/empty-state";
import { Skeleton } from "@/components/app/skeleton";
import { homeSections, type HomeSection } from "@/lib/home-rules";
import { requireUser } from "@/lib/session";
import {
  SimpleAccountsHome,
  SimpleAdminHome,
  SimpleLogisticsHome,
  SimpleRetailerHome,
  SimpleSalesHome,
} from "./simple-home-sections";

function SectionSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      <Skeleton className="h-28 rounded-3xl" />
      <div className="grid grid-cols-2 gap-2.5">
        <Skeleton className="h-32 rounded-3xl" />
        <Skeleton className="h-32 rounded-3xl" />
      </div>
      <Skeleton className="h-24 rounded-2xl" />
    </div>
  );
}

export default async function DashboardPage() {
  const { user } = await requireUser();
  const sections = homeSections(user.role);

  if (sections.length === 0) return <EmptyState title="Nothing here yet" />;

  const renderSection = (s: HomeSection) => {
    switch (s) {
      case "admin":
        return <SimpleAdminHome />;
      case "sales":
        return <SimpleSalesHome userId={user.id} />;
      case "accounts":
        return <SimpleAccountsHome />;
      case "logistics":
        return <SimpleLogisticsHome />;
      case "retailer":
        return <SimpleRetailerHome userId={user.id} />;
      case "cash":
        return null;
    }
  };

  return (
    <div className="flex flex-col gap-5">
      {sections.map((s) => (
        <Suspense key={s} fallback={<SectionSkeleton />}>
          {renderSection(s)}
        </Suspense>
      ))}
    </div>
  );
}
