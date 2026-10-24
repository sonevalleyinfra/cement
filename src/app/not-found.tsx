import { SearchX } from "lucide-react";
import Link from "next/link";
import { EmptyState } from "@/components/app/empty-state";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Any address that does not exist (inside the app or out). */
export default function NotFound() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4">
      <EmptyState
        title="Page not found"
        icon={SearchX}
        action={
          <Link href="/" className={cn(buttonVariants({ variant: "outline" }), "min-w-40")}>
            Home
          </Link>
        }
      />
    </main>
  );
}
