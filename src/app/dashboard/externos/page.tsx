import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import ExternosClient from "./ExternosClient";

export default async function ExternosPage() {
  const session = await getSession();
  if (!session || !session.companyId) redirect("/login");

  const company = await prisma.company.findUnique({
    where: { id: session.companyId },
    select: { name: true, primaryColor: true, accentColor: true, fontFamily: true },
  });
  if (!company) redirect("/login");

  return (
    <ExternosClient
      company={company}
      userRole={session.role}
      currentUserId={session.userId}
    />
  );
}
