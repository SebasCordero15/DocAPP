import { redirect } from "next/navigation";
import { requireActiveSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import PendientesClient from "./PendientesClient";

export default async function PendientesPage() {
  const session = await requireActiveSession();
  if (!session) redirect("/login");
  if (!session.companyId) redirect("/login");

  const company = await prisma.company.findUnique({
    where: { id: session.companyId },
    select: { name: true, primaryColor: true, accentColor: true, fontFamily: true, logoUrl: true },
  });
  if (!company) redirect("/login");

  return (
    <PendientesClient
      company={{
        name: company.name,
        primaryColor: company.primaryColor,
        accentColor: company.accentColor,
        fontFamily: company.fontFamily,
        logoUrl: company.logoUrl ?? null,
      }}
      userRole={session.role}
      userId={session.userId}
    />
  );
}
