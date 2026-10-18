import { PageHeader } from "@/components/app/page-header";
import { loadFormData } from "../form-data";
import { StockForm } from "../stock-form";

export default async function Page() {
  const data = await loadFormData();
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Adjust stock" back="/stock" />
      <StockForm mode="adjust" {...data} />
    </div>
  );
}
