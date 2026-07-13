import { requireActiveSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { isAdminRole } from "@/lib/permissions";
import SolicitarCambioClient from "./SolicitarCambioClient";

export default async function SolicitarCambioPage() {
  const session = await requireActiveSession();
  if (!session) redirect("/login");
  if (isAdminRole(session.role)) redirect("/dashboard");
  if (session.role === "VIEWER") redirect("/dashboard");

  const company = await prisma.company.findUnique({
    where: { id: session.companyId! },
    select: { name: true, primaryColor: true, accentColor: true, fontFamily: true, logoUrl: true },
  });
  if (!company) redirect("/login");

  return <SolicitarCambioClient company={company} />;
}
