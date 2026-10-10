import { Layers } from "lucide-react";
import Link from "next/link";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-8 px-4 py-12">
      <Link href="/sign-in" className="animate-pop flex flex-col items-center gap-3">
        <span className="flex size-14 items-center justify-center rounded-2xl bg-brand-gradient text-white shadow-brand">
          <Layers className="size-7" strokeWidth={2.4} />
        </span>
        <span className="text-2xl font-extrabold tracking-tight">Cement</span>
      </Link>
      <div className="animate-page w-full max-w-sm [animation-delay:80ms] [&>[data-slot=card]]:rounded-3xl [&>[data-slot=card]]:shadow-card [&>[data-slot=card]]:ring-foreground/6">
        {children}
      </div>
    </main>
  );
}
