import type { ReactNode } from "react";

/**
 * Says what is missing when a primary button is switched off ("Enter the amount"). Put it just above
 * the button. Renders nothing when there is no hint. Find the hint with `firstMissing` (lib/form-rules.ts).
 */
export function FormHint({ children }: { children?: ReactNode }) {
  if (!children) return null;
  return (
    <p role="status" className="mb-2 text-center text-sm text-muted-foreground">
      {children}
    </p>
  );
}
