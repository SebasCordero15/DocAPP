import { redirect } from "next/navigation";
import { requireActiveSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import ListadoMaestroClient from "./ListadoMaestroClient";

export default async function ListadoMaestroPage() {
  const session = await requireActiveSession();
  if (!session) redirect("/login");
  if (!session.companyId) redirect("/dashboard");

  const company = await prisma.company.findUnique({
    where: { id: session.companyId },
    select: { name: true, primaryColor: true, logoUrl: true },
  });
  if (!company) redirect("/login");

  return (
    <ListadoMaestroClient
      company={{ name: company.name, primaryColor: company.primaryColor, logoUrl: company.logoUrl ?? null }}
      userRole={session.role}
    />
  );
}
