import { PageHeader } from "@/components/app/page-header";
import { loadTransferData } from "../form-data";
import { TransferForm } from "./transfer-form";

export default async function Page({
  searchParams,
}: {
  searchParams?: Promise<{ from?: string; to?: string }>;
}) {
  const data = await loadTransferData();
  const sp = searchParams ? await searchParams : {};
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Transfer bags" back="/stock" />
      <TransferForm {...data} initialFrom={sp?.from} initialTo={sp?.to} />
    </div>
  );
}
