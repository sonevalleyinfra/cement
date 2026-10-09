import Link from "next/link";
import { Button } from "@/components/ui/button";
import { can } from "@/lib/permissions";
import { requireUser } from "@/lib/session";
import { signOut } from "../dashboard/actions";

const rowClass =
  "flex w-full items-center justify-between rounded-2xl bg-card p-4 text-left text-base font-semibold ring-1 ring-foreground/8";

export default async function MorePage() {
  const { user } = await requireUser();
  return (
    <ul className="flex flex-col gap-3">
      {can(user.role, "manageUsers") && (
        <li>
          <Link href="/users" className={rowClass}>
            Users
          </Link>
        </li>
      )}
      {can(user.role, "viewApprovals") && (
        <li>
          <Link href="/approvals" className={rowClass}>
            Approvals
          </Link>
        </li>
      )}
      {can(user.role, "viewStock") && (
        <li>
          <Link href="/stock" className={rowClass}>
            Stock
          </Link>
        </li>
      )}
      {can(user.role, "dispatch") && (
        <li>
          <Link href="/dispatch" className={rowClass}>
            Dispatch
          </Link>
        </li>
      )}
      {can(user.role, "viewLedger") && (
        <li>
          <Link href="/ledger" className={rowClass}>
            Ledger
          </Link>
        </li>
      )}
      {can(user.role, "viewReceipts") && (
        <li>
          <Link href="/receipts" className={rowClass}>
            Receipts
          </Link>
        </li>
      )}
      {can(user.role, "useWallet") && (
        <li>
          <Link href="/wallet" className={rowClass}>
            Wallet
          </Link>
        </li>
      )}
      {can(user.role, "viewVehicles") && (
        <li>
          <Link href="/vehicles" className={rowClass}>
            Vehicles
          </Link>
        </li>
      )}
      <li>
        <Link href="/account" className={rowClass}>
          Change password
        </Link>
      </li>
      <li>
        <form action={signOut}>
          <Button type="submit" variant="outline" className="w-full">
            Sign out
          </Button>
        </form>
      </li>
    </ul>
  );
}
