import { TextLink } from "@/components/app/text-link";
import { loadFormData } from "../form-data";
import { StockForm } from "../stock-form";

export default async function Page() {
  const data = await loadFormData();
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Purchase</h1>
        <TextLink href="/stock">Back to stock</TextLink>
      </div>
      <StockForm mode="purchase" {...data} />
    </div>
  );
}
