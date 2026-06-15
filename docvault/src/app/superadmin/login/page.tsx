import { redirect } from "next/navigation";

// The platform admin login has moved to the unified /login page (Platform Admin tab).
export default function SuperAdminLoginRedirect() {
  redirect("/login");
}
