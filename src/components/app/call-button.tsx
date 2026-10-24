import { Phone } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** A 48px ghost button that dials the shop. Renders nothing unless the phone is 10 digits. */
export function CallButton({ phone, shop, className }: { phone: string; shop: string; className?: string }) {
  if (!/^\d{10}$/.test(phone)) return null;
  return (
    <a
      href={`tel:+91${phone}`}
      aria-label={`Call ${shop}`}
      className={cn(buttonVariants({ variant: "ghost", size: "icon" }), "shrink-0 text-muted-foreground", className)}
    >
      <Phone className="size-5" strokeWidth={2} aria-hidden />
    </a>
  );
}
