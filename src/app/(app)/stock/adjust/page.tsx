import Link from "next/link";
import { EmptyState } from "@/components/app/empty-state";
import { loadFormData } from "../form-data";
import { StockForm } from "../stock-form";

export default async function Page() {
  const data = await loadFormData("adjust");
  if (!data) return <EmptyState title="Pick one firm first" />;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Adjust stock</h1>
        <Link href="/stock" className="text-sm text-muted-foreground underline">
          Back to stock
        </Link>
      </div>
      <StockForm mode="adjust" {...data} />
    </div>
  );
}
