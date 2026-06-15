import { redirect } from "next/navigation";
import { requireActiveSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import TeamClient from "./TeamClient";

export default async function TeamPage() {
  const session = await requireActiveSession();
  if (!session || !session.companyId || session.role !== "COMPANY_ADMIN") {
    redirect("/dashboard");
  }
  const companyId = session.companyId;

  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { name: true, primaryColor: true },
  });

  return (
    <TeamClient
      currentUserId={session.userId}
      company={{ name: company?.name ?? "", primaryColor: company?.primaryColor ?? "#2563eb" }}
    />
  );
}
