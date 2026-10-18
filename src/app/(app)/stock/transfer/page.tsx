import { PageHeader } from "@/components/app/page-header";
import { loadTransferData } from "../form-data";
import { TransferForm } from "./transfer-form";

export default async function Page() {
  const data = await loadTransferData();
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Move bags" back="/stock" />
      <TransferForm {...data} />
    </div>
  );
}
