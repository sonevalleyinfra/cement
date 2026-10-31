import { Suspense } from "react";
import { EmptyState } from "@/components/app/empty-state";
import { Skeleton } from "@/components/app/skeleton";
import { homeSections, type HomeSection } from "@/lib/home-rules";
import { requireUser } from "@/lib/session";
import { AccountsHome, AdminHome, LogisticsHome, MyCashHome, RetailerHome, SalesHome } from "./home-sections";
import {
  SimpleAccountsHome,
  SimpleAdminHome,
  SimpleLogisticsHome,
  SimpleRetailerHome,
  SimpleSalesHome,
} from "./simple-home-sections";
import { DashboardViewToggle } from "./view-toggle";

function SectionSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      <Skeleton className="h-28 rounded-3xl" />
      <div className="grid grid-cols-3 gap-2.5">
        <Skeleton className="h-32 rounded-3xl" />
        <Skeleton className="h-32 rounded-3xl" />
        <Skeleton className="h-32 rounded-3xl" />
      </div>
      <Skeleton className="h-24 rounded-2xl" />
    </div>
  );
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams?: Promise<{ view?: string }>;
}) {
  const { user } = await requireUser();
  const sp = searchParams ? await searchParams : {};
  const view = sp.view === "detailed" ? "detailed" : "simple";
  const sections = homeSections(user.role);

  if (sections.length === 0) return <EmptyState title="Nothing here yet" />;

  const renderSimple = (s: HomeSection) => {
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
        // In simple mode, role home already integrates cash/handover seamlessly
        return null;
    }
  };

  const renderDetailed = (s: HomeSection) => {
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
    <div className="flex flex-col gap-4">
      {/* 1-Click Toggle between Simple Action View and Detailed Business View */}
      <DashboardViewToggle view={view} />

      <div className="flex flex-col gap-6">
        {sections.map((s) => (
          <Suspense key={s} fallback={<SectionSkeleton />}>
            {view === "simple" ? renderSimple(s) : renderDetailed(s)}
          </Suspense>
        ))}
      </div>
    </div>
  );
}
