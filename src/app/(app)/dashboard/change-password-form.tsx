"use client";

import { useState } from "react";
import { FormMessage } from "@/components/form-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";
import { checkNewPassword, MIN_PASSWORD_LENGTH } from "@/lib/password-rules";

export function ChangePasswordForm() {
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const currentPassword = String(form.get("currentPassword"));
    const newPassword = String(form.get("newPassword"));
    setSuccess(null);

    const problem = checkNewPassword({ current: currentPassword, next: newPassword, confirm: String(form.get("confirm")) });
    if (problem) {
      setError(problem);
      return;
    }
    setPending(true);
    setError(null);

    // Signs out every other device, so an old password cannot keep a session alive.
    const { error } = await authClient.changePassword({ currentPassword, newPassword, revokeOtherSessions: true });

    setPending(false);
    if (error) {
      setError(
        error.code === "INVALID_PASSWORD"
          ? "Your current password is wrong."
          : (error.message ?? "Could not change the password. Please try again."),
      );
      return;
    }
    formElement.reset();
    setSuccess("Your password has been changed. Other devices have been signed out.");
  }

  return (
    <form
      method="post"
      onSubmit={onSubmit}
      onInput={() => {
        setError(null);
        setSuccess(null);
      }}
      className="flex flex-col gap-4"
    >
      <div className="flex flex-col gap-2">
        <Label htmlFor="currentPassword">Current password</Label>
        <Input id="currentPassword" name="currentPassword" type="password" autoComplete="current-password" required />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="newPassword">New password</Label>
        <Input
          id="newPassword"
          name="newPassword"
          type="password"
          autoComplete="new-password"
          minLength={MIN_PASSWORD_LENGTH}
          required
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="confirm">Repeat new password</Label>
        <Input
          id="confirm"
          name="confirm"
          type="password"
          autoComplete="new-password"
          minLength={MIN_PASSWORD_LENGTH}
          required
        />
      </div>
      <FormMessage kind="error">{error}</FormMessage>
      <FormMessage kind="success">{success}</FormMessage>
      <Button type="submit" variant="outline" disabled={pending} className="w-full">
        {pending ? "Saving…" : "Save"}
      </Button>
    </form>
  );
}
