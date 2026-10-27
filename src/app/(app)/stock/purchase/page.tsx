import { PageHeader } from "@/components/app/page-header";
import { TextLink } from "@/components/app/text-link";
import { loadFormData } from "../form-data";
import { StockForm } from "../stock-form";

export default async function Page() {
  const data = await loadFormData("recordPurchase");
  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Purchase"
        back="/stock"
        action={
          <TextLink href="/stock/purchases" strong>
            Purchases
          </TextLink>
        }
      />
      <StockForm mode="purchase" {...data} />
    </div>
  );
}
