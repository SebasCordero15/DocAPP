import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import ControlCambiosClient from "./ControlCambiosClient";

export default async function ControlCambiosPage() {
  const session = await getSession();
  if (!session || !session.companyId) redirect("/login");

  const company = await prisma.company.findUnique({
    where: { id: session.companyId },
    select: { name: true, primaryColor: true, accentColor: true, fontFamily: true, logoUrl: true },
  });
  if (!company) redirect("/login");

  return <ControlCambiosClient company={company} userRole={session.role} />;
}
