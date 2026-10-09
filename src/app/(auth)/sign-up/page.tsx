import Link from "next/link";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { SignUpForm } from "./sign-up-form";

export default function SignUpPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Create an account</CardTitle>
        <CardDescription>We will email you a link to verify your address.</CardDescription>
      </CardHeader>
      <CardContent>
        <SignUpForm />
      </CardContent>
      <CardFooter className="text-sm text-muted-foreground">
        Already have an account?&nbsp;
        <Link href="/sign-in" className="text-foreground hover:underline">
          Sign in
        </Link>
      </CardFooter>
    </Card>
  );
}
