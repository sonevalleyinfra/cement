import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";

// No landing page: signed-out visitors go straight to sign-in.
export default async function Home() {
  const session = await getSession();
  redirect(session ? "/dashboard" : "/sign-in");
}
