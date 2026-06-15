import { redirect } from "next/navigation";
import { requireActiveSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import PermissionsClient from "./PermissionsClient";

export default async function PermissionsPage() {
  const session = await requireActiveSession();
  if (!session) redirect("/login");
  if (!session.companyId || session.role !== "COMPANY_ADMIN") redirect("/dashboard");

  const company = await prisma.company.findUnique({
    where: { id: session.companyId },
    select: { name: true, primaryColor: true },
  });
  if (!company) redirect("/login");

  return (
    <PermissionsClient
      company={{ name: company.name, primaryColor: company.primaryColor }}
    />
  );
}
