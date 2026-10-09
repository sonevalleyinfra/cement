import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { getSession } from "@/lib/session";

export default async function Home() {
  const session = await getSession();

  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center gap-6 px-4 py-16">
      <h1 className="text-3xl font-semibold tracking-tight">App Factory</h1>
      <p className="text-muted-foreground">
        Next.js + Postgres + Better Auth starter, ready to deploy on Coolify.
      </p>
      <div className="flex gap-3">
        {session ? (
          <Link href="/dashboard" className={buttonVariants()}>
            Go to dashboard
          </Link>
        ) : (
          <Link href="/sign-in" className={buttonVariants()}>
            Sign in
          </Link>
        )}
      </div>
    </main>
  );
}
