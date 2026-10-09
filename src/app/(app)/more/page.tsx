import Link from "next/link";
import { Button } from "@/components/ui/button";
import { hasAnyRole, hasRole, isAdmin } from "@/lib/roles";
import { requireUser } from "@/lib/session";
import { signOut } from "../dashboard/actions";

const rowClass =
  "flex w-full items-center justify-between rounded-2xl bg-card p-4 text-left text-base font-semibold ring-1 ring-foreground/8";

export default async function MorePage() {
  const { user } = await requireUser();
  return (
    <ul className="flex flex-col gap-3">
      {isAdmin(user.role) && (
        <li>
          <Link href="/users" className={rowClass}>
            Users
          </Link>
        </li>
      )}
      {hasAnyRole(user.role, ["accounts"]) && (
        <li>
          <Link href="/approvals" className={rowClass}>
            Approvals
          </Link>
        </li>
      )}
      <li>
        <Link href="/stock" className={rowClass}>
          Stock
        </Link>
      </li>
      {hasAnyRole(user.role, ["logistics"]) && (
        <li>
          <Link href="/dispatch" className={rowClass}>
            Dispatch
          </Link>
        </li>
      )}
      {(hasAnyRole(user.role, ["accounts", "sales"]) || hasRole(user.role, "retailer")) && (
        <li>
          <Link href="/ledger" className={rowClass}>
            Ledger
          </Link>
        </li>
      )}
      {hasAnyRole(user.role, ["accounts", "sales"]) && (
        <li>
          <Link href="/receipts" className={rowClass}>
            Receipts
          </Link>
        </li>
      )}
      {hasAnyRole(user.role, ["accounts", "sales"]) && (
        <li>
          <Link href="/wallet" className={rowClass}>
            Wallet
          </Link>
        </li>
      )}
      <li>
        <Link href="/vehicles" className={rowClass}>
          Vehicles
        </Link>
      </li>
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
