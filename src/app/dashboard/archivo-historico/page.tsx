import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import ArchivoHistoricoClient from "./ArchivoHistoricoClient";

export default async function ArchivoHistoricoPage() {
  const session = await getSession();
  if (!session || !session.companyId) redirect("/login");
  if (session.role !== "COMPANY_ADMIN") redirect("/dashboard");

  const company = await prisma.company.findUnique({
    where: { id: session.companyId },
    select: { name: true, primaryColor: true, accentColor: true, fontFamily: true },
  });
  if (!company) redirect("/login");

  return <ArchivoHistoricoClient company={company} />;
}
