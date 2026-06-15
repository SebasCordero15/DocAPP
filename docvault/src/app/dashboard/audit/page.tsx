import { redirect } from "next/navigation";
import { requireActiveSession } from "@/lib/auth";
import AuditClient from "./AuditClient";

export default async function AuditPage() {
  const session = await requireActiveSession();
  if (!session) redirect("/login");
  if (session.role !== "COMPANY_ADMIN") redirect("/dashboard");
  return <AuditClient />;
}
