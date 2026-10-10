import Link from "next/link";
import { loadTransferData } from "../form-data";
import { TransferForm } from "./transfer-form";

export default async function Page() {
  const data = await loadTransferData();
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Move bags</h1>
        <Link href="/stock" className="text-sm text-muted-foreground underline">
          Back to stock
        </Link>
      </div>
      <TransferForm {...data} />
    </div>
  );
}
