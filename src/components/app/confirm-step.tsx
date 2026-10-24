import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";

/**
 * The "are you sure" step for an action that cannot be undone easily (handover, turn off, reject, cancel).
 * A short question and two buttons: Back and the action. Shown in place of the form's own button.
 * `children` (optional) goes between the question and the buttons (a caption, a ReasonPicker);
 * `confirmDisabled` keeps the action off until that part is ready.
 */
export function ConfirmStep({
  question,
  confirmLabel,
  onConfirm,
  onBack,
  pending = false,
  destructive = false,
  confirmDisabled = false,
  children,
}: {
  question: string;
  confirmLabel: string;
  onConfirm: () => void;
  onBack: () => void;
  pending?: boolean;
  destructive?: boolean;
  confirmDisabled?: boolean;
  children?: ReactNode;
}) {
  return (
    <div className="animate-in-up flex flex-col gap-3">
      <p className="text-base font-semibold" role="alert">
        {question}
      </p>
      {children}
      <div className="grid grid-cols-2 gap-2">
        <Button variant="outline" onClick={onBack} disabled={pending}>
          Back
        </Button>
        <Button variant={destructive ? "destructive" : "default"} onClick={onConfirm} disabled={pending || confirmDisabled}>
          {pending ? "Saving…" : confirmLabel}
        </Button>
      </div>
    </div>
  );
}
