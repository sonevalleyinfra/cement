import Link from "next/link";
import { loadFormData } from "../form-data";
import { StockForm } from "../stock-form";

export default async function Page() {
  const data = await loadFormData();
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Opening stock</h1>
        <Link href="/stock" className="text-sm text-muted-foreground underline">
          Back to stock
        </Link>
      </div>
      <StockForm mode="opening" {...data} />
    </div>
  );
}
