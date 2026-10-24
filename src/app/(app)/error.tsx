"use client";

import { CloudOff } from "lucide-react";
import Link from "next/link";
import { EmptyState } from "@/components/app/empty-state";
import { Button, buttonVariants } from "@/components/ui/button";

/** A screen that failed to load: a short line, Retry and Home. Never the error details. */
export default function AppError({ retry }: { error: unknown; retry: () => void }) {
  return (
    <EmptyState
      title="Couldn't load. Check your network."
      icon={CloudOff}
      action={
        <div className="grid w-full grid-cols-2 gap-2">
          <Link href="/" className={buttonVariants({ variant: "outline" })}>
            Home
          </Link>
          <Button onClick={() => retry()}>Retry</Button>
        </div>
      }
    />
  );
}
