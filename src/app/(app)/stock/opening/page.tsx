import { PageHeader } from "@/components/app/page-header";
import { loadFormData } from "../form-data";
import { StockForm } from "../stock-form";

export default async function Page() {
  const data = await loadFormData("manageStock");
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Opening stock" back="/stock" />
      <StockForm mode="opening" {...data} />
    </div>
  );
}
