import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import LoginClient from "./LoginClient";

// Server component: redirect immediately if a valid session already exists.
// This prevents a logged-in user from seeing the login form, which could
// otherwise lead to Router Cache cross-contamination between accounts.
export default async function LoginPage() {
  const session = await getSession();
  if (session) redirect("/dashboard");
  return <LoginClient />;
}
