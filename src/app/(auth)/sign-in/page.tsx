import Link from "next/link";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { SignInForm } from "./sign-in-form";

export default function SignInPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Sign in</CardTitle>
        <CardDescription>Welcome back.</CardDescription>
      </CardHeader>
      <CardContent>
        <SignInForm />
      </CardContent>
      <CardFooter className="text-sm text-muted-foreground">
        No account yet?&nbsp;
        <Link href="/sign-up" className="text-foreground hover:underline">
          Create one
        </Link>
      </CardFooter>
    </Card>
  );
}
