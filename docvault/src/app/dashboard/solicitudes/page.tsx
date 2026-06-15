import { requireActiveSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { isAdminRole } from "@/lib/permissions";
import SolicitudesClient from "./SolicitudesClient";

export default async function SolicitudesPage() {
  const session = await requireActiveSession();
  if (!session) redirect("/login");
  if (!isAdminRole(session.role)) redirect("/dashboard");

  const company = await prisma.company.findUnique({
    where: { id: session.companyId! },
    select: { name: true, primaryColor: true, accentColor: true, fontFamily: true, logoUrl: true },
  });
  if (!company) redirect("/login");

  return <SolicitudesClient company={company} userRole={session.role} />;
}
