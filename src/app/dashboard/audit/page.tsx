import { redirect } from "next/navigation";
import { requireActiveSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import AuditClient from "./AuditClient";

export default async function AuditPage() {
  const session = await requireActiveSession();
  if (!session) redirect("/login");
  if (session.role !== "COMPANY_ADMIN") redirect("/dashboard");

  const company = await prisma.company.findUnique({
    where: { id: session.companyId! },
    select: { primaryColor: true, fontFamily: true },
  });

  return (
    <AuditClient
      company={{
        primaryColor: company?.primaryColor ?? "#1B3A6B",
        fontFamily: company?.fontFamily ?? "Inter",
      }}
    />
  );
}
