import { Phone } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * A 48px ghost button that dials the shop (or `label`, e.g. "Call Ravi" for a driver).
 * Renders nothing unless the phone is 10 digits.
 */
export function CallButton({
  phone,
  shop,
  label,
  className,
}: {
  phone: string;
  shop?: string;
  /** The whole aria-label; defaults to "Call <shop>". */
  label?: string;
  className?: string;
}) {
  if (!/^\d{10}$/.test(phone)) return null;
  return (
    <a
      href={`tel:+91${phone}`}
      aria-label={label ?? `Call ${shop ?? ""}`.trim()}
      className={cn(buttonVariants({ variant: "ghost", size: "icon" }), "shrink-0 text-muted-foreground", className)}
    >
      <Phone className="size-5" strokeWidth={2} aria-hidden />
    </a>
  );
}
