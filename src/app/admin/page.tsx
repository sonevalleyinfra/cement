import { desc } from "drizzle-orm";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { db } from "@/db";
import { user } from "@/db/schema";
import { formatDateTime } from "@/lib/datetime";
import { requireAdmin } from "@/lib/session";

export default async function AdminPage() {
  await requireAdmin(); // admin-only page: check the role first

  const users = await db
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      emailVerified: user.emailVerified,
      createdAt: user.createdAt,
    })
    .from(user)
    .orderBy(desc(user.createdAt))
    .limit(100);

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-10">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Admin</h1>
        <Link href="/dashboard" className={buttonVariants({ variant: "outline" })}>
          Back to dashboard
        </Link>
      </header>
      <Card>
        <CardHeader>
          <CardTitle>Users ({users.length})</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-muted-foreground">
              <tr>
                <th className="py-2 pr-4 font-medium">Name</th>
                <th className="py-2 pr-4 font-medium">Email</th>
                <th className="py-2 pr-4 font-medium">Role</th>
                <th className="py-2 pr-4 font-medium">Verified</th>
                <th className="py-2 font-medium">Joined (IST)</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-t">
                  <td className="py-2 pr-4">{u.name}</td>
                  <td className="py-2 pr-4">{u.email}</td>
                  <td className="py-2 pr-4">{u.role ?? "user"}</td>
                  <td className="py-2 pr-4">{u.emailVerified ? "Yes" : "No"}</td>
                  <td className="py-2 whitespace-nowrap">{formatDateTime(u.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </main>
  );
}
