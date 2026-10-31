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
      <Skeleton className="h-28 rounded-2xl" />
      <Skeleton className="h-20 rounded-2xl" />
      <Skeleton className="h-20 rounded-2xl" />
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
        // For sales and admin, cash handovers & staff cash are already primary actions in their simple hero cards
        if (user.role?.includes("sales") || user.role?.includes("admin")) return null;
        return <MyCashHome userId={user.id} />;
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
