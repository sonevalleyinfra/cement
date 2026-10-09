import Link from "next/link";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { ForgotPasswordForm } from "./forgot-password-form";

export default function ForgotPasswordPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Forgot your password?</CardTitle>
        <CardDescription>Enter your email and we will send you a reset link.</CardDescription>
      </CardHeader>
      <CardContent>
        <ForgotPasswordForm />
      </CardContent>
      <CardFooter className="text-sm">
        <Link href="/sign-in" className="text-muted-foreground hover:underline">
          Back to sign in
        </Link>
      </CardFooter>
    </Card>
  );
}
