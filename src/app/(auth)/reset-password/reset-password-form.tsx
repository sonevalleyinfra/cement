"use client";

import Link from "next/link";
import { useState } from "react";
import { FormMessage } from "@/components/form-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";

export function ResetPasswordForm({ token }: { token: string }) {
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const newPassword = String(form.get("password"));
    if (newPassword !== String(form.get("confirm"))) {
      setError("The two passwords do not match.");
      return;
    }
    setPending(true);
    setError(null);

    const { error } = await authClient.resetPassword({ newPassword, token });

    setPending(false);
    if (error) {
      setError(error.message ?? "Could not reset the password. The link may have expired.");
      return;
    }
    setDone(true);
  }

  if (done) {
    return (
      <FormMessage kind="success">
        Your password has been changed.{" "}
        <Link href="/sign-in" className="underline">
          Sign in
        </Link>
      </FormMessage>
    );
  }

  return (
    <form method="post" onSubmit={onSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="password">New password</Label>
        <Input id="password" name="password" type="password" autoComplete="new-password" minLength={8} required />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="confirm">Repeat new password</Label>
        <Input id="confirm" name="confirm" type="password" autoComplete="new-password" minLength={8} required />
      </div>
      <FormMessage kind="error">{error}</FormMessage>
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Set new password"}
      </Button>
    </form>
  );
}
