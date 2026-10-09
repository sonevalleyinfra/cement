import Link from "next/link";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 px-4 py-12">
      <Link href="/" className="text-sm font-medium text-muted-foreground hover:text-foreground">
        App Factory
      </Link>
      <div className="w-full max-w-sm">{children}</div>
    </main>
  );
}
