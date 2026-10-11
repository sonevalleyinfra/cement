import { Button } from "@/components/ui/button";

/**
 * The "are you sure" step for an action that cannot be undone easily (handover, turn off, reject, cancel).
 * A short question and two buttons: Back and the action. Shown in place of the form's own button.
 */
export function ConfirmStep({
  question,
  confirmLabel,
  onConfirm,
  onBack,
  pending = false,
  destructive = false,
}: {
  question: string;
  confirmLabel: string;
  onConfirm: () => void;
  onBack: () => void;
  pending?: boolean;
  destructive?: boolean;
}) {
  return (
    <div className="animate-in-up flex flex-col gap-3">
      <p className="text-base font-semibold" role="alert">
        {question}
      </p>
      <div className="grid grid-cols-2 gap-2">
        <Button variant="outline" onClick={onBack} disabled={pending}>
          Back
        </Button>
        <Button variant={destructive ? "destructive" : "default"} onClick={onConfirm} disabled={pending}>
          {pending ? "Saving…" : confirmLabel}
        </Button>
      </div>
    </div>
  );
}
