import { Suspense } from "react";
import { PageHeader } from "@/components/app/page-header";
import { Skeleton } from "@/components/app/skeleton";
import { requireAdmin } from "@/lib/session";
import { BusinessOverview } from "../dashboard/simple-home-sections";

/** The owner's detail screen behind Home: month, accounts, risk, overdue shops, staff cash, suppliers. */
export default async function BusinessPage() {
  await requireAdmin();
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Business overview" back="/dashboard" />
      <Suspense fallback={<Skeleton className="h-64 rounded-3xl" />}>
        <BusinessOverview />
      </Suspense>
    </div>
  );
}
