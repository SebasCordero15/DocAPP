import { requireActiveSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { isAdminRole } from "@/lib/permissions";
import EliminarDocumentoClient from "./EliminarDocumentoClient";

export default async function EliminarDocumentoPage() {
  const session = await requireActiveSession();
  if (!session) redirect("/login");
  // Admins delete directly from the document list; this page is for non-admins
  if (isAdminRole(session.role)) redirect("/dashboard");

  const company = await prisma.company.findUnique({
    where: { id: session.companyId! },
    select: { name: true, primaryColor: true, accentColor: true, fontFamily: true, logoUrl: true },
  });
  if (!company) redirect("/login");

  return <EliminarDocumentoClient company={company} />;
}
