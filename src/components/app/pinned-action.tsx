import type { ReactNode } from "react";

/** Holds the one primary button, pinned above the bottom nav (or the screen edge). */
export function PinnedAction({ children }: { children: ReactNode }) {
  return (
    <div className="sticky bottom-[calc(4rem+env(safe-area-inset-bottom))] z-10 -mx-4 mt-6 bg-background px-4 py-3 [&>*]:w-full">
      {children}
    </div>
  );
}
