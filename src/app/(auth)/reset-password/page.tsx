import Link from "next/link";
import { FormMessage } from "@/components/form-message";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ResetPasswordForm } from "./reset-password-form";

// The link in the reset email lands here with ?token=... (or ?error=INVALID_TOKEN).
export default async function ResetPasswordPage({ searchParams }: PageProps<"/reset-password">) {
  const { token, error } = await searchParams;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Choose a new password</CardTitle>
      </CardHeader>
      <CardContent>
        {typeof token === "string" && !error ? (
          <ResetPasswordForm token={token} />
        ) : (
          <FormMessage kind="error">
            This reset link is invalid or has expired.{" "}
            <Link href="/forgot-password" className="underline">
              Request a new one
            </Link>
          </FormMessage>
        )}
      </CardContent>
    </Card>
  );
}
