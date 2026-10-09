import { redirect } from "next/navigation";

// Public sign-up is off: the admin creates every user.
export default function SignUpPage() {
  redirect("/sign-in");
}
