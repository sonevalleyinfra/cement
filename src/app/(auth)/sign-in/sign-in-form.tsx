"use client";

import { TextLink } from "@/components/app/text-link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { FormMessage } from "@/components/form-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";

export function SignInForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending(true);
    setError(null);

    const { error } = await authClient.signIn.email({
      email: String(form.get("email")),
      password: String(form.get("password")),
      callbackURL: "/dashboard", // used by the verification link if the email is not verified yet
    });

    setPending(false);
    if (error) {
      setError(
        error.status === 403
          ? "Please verify your email first. We just sent you a new verification link."
          : (error.message ?? "Could not sign in."),
      );
      return;
    }
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <form method="post" onSubmit={onSubmit} onInput={() => setError(null)} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </div>
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="password">Password</Label>
          <TextLink href="/forgot-password">Forgot password?</TextLink>
        </div>
        <Input id="password" name="password" type="password" autoComplete="current-password" required />
      </div>
      <FormMessage kind="error">{error}</FormMessage>
      <Button type="submit" disabled={pending}>
        {pending ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}
