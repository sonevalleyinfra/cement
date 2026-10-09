import { Inbox, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { IconTile, type Tone } from "./icon-tile";

/** A single word or two, with a soft icon. No explanations. */
export function EmptyState({
  title,
  action,
  icon = Inbox,
  tone = "slate",
}: {
  title: string;
  action?: ReactNode;
  icon?: LucideIcon;
  tone?: Tone;
}) {
  return (
    <div className="animate-in-up flex flex-col items-center gap-4 py-16 text-center">
      <IconTile icon={icon} tone={tone} size="lg" className="animate-pop" />
      <p className="text-base font-medium text-muted-foreground">{title}</p>
      {action}
    </div>
  );
}
