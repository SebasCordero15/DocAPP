import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import CrearDocumentoClient from "./CrearDocumentoClient";

export default async function CrearDocumentoPage() {
  const session = await getSession();
  if (!session || !session.companyId) redirect("/login");
  if (session.role === "VIEWER") redirect("/dashboard");

  const [company, folders, users] = await Promise.all([
    prisma.company.findUnique({
      where: { id: session.companyId },
      select: { name: true, primaryColor: true, accentColor: true, fontFamily: true },
    }),
    prisma.folder.findMany({
      where: { companyId: session.companyId, deletedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true, parentId: true },
    }),
    prisma.user.findMany({
      where: { companyId: session.companyId, isActive: true, role: { not: "SUPER_ADMIN" } },
      orderBy: { name: "asc" },
      select: { id: true, name: true, email: true, role: true },
    }),
  ]);

  if (!company) redirect("/login");

  return <CrearDocumentoClient company={company} folders={folders} users={users} currentUserId={session.userId} />;
}
