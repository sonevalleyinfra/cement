import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateTime } from "@/lib/datetime";
import { formatINR, formatINRCompact } from "@/lib/money";
import { isAdmin } from "@/lib/roles";
import { requireUser } from "@/lib/session";
import { signOut } from "./actions";
import { ChangePasswordForm } from "./change-password-form";
import { UpdateNameForm } from "./update-name-form";

export default async function DashboardPage() {
  const { user } = await requireUser(); // protected page: check the session first

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-10">
      <header className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <div className="flex gap-2">
          {isAdmin(user.role) && (
            <Link href="/admin" className={buttonVariants({ variant: "outline" })}>
              Admin
            </Link>
          )}
          <form action={signOut}>
            <Button type="submit" variant="ghost">
              Sign out
            </Button>
          </form>
        </div>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Hello, {user.name}</CardTitle>
          <CardDescription>
            {user.email} · member since {formatDateTime(user.createdAt)} IST
          </CardDescription>
        </CardHeader>
        <CardContent>
          <UpdateNameForm currentName={user.name} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Change password</CardTitle>
          <CardDescription>At least 8 characters. You stay signed in here; other devices are signed out.</CardDescription>
        </CardHeader>
        <CardContent>
          <ChangePasswordForm />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>India formatting</CardTitle>
          <CardDescription>Money is stored as integer paise and formatted with lakh/crore grouping.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-1 font-mono text-sm">
          <span>formatINR(12345678) → {formatINR(12345678)}</span>
          <span>formatINRCompact(1500000000) → {formatINRCompact(1500000000)}</span>
          <span>formatDateTime(now) → {formatDateTime(new Date())}</span>
        </CardContent>
      </Card>
    </main>
  );
}
