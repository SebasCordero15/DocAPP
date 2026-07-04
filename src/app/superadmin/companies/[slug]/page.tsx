import { notFound, redirect } from "next/navigation";
import { requireActiveSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import CompanyDetail from "./CompanyDetail";

export default async function CompanyDetailPage({ params }: { params: { slug: string } }) {
  const session = await requireActiveSession();
  if (!session || session.role !== "SUPER_ADMIN") redirect("/login");

  const company = await prisma.company.findUnique({
    where: { slug: params.slug },
    include: {
      users: {
        where: { companyId: { not: null } },
        select: {
          id: true, name: true, email: true, role: true,
          isActive: true, lastLoginAt: true, createdAt: true,
          forcePasswordChange: true,
        },
        orderBy: { lastLoginAt: "desc" },
      },
    },
  });

  if (!company) notFound();

  const [fileStats, auditLogs] = await Promise.all([
    prisma.file.aggregate({
      where: { companyId: company.id, deletedAt: null },
      _count: { id: true },
      _sum: { size: true },
    }),
    prisma.auditLog.findMany({
      where: { companyId: company.id },
      orderBy: { createdAt: "desc" },
      take: 25,
      select: {
        id: true, action: true, resourceType: true, resourceId: true,
        detail: true, createdAt: true,
        user: { select: { name: true, email: true } },
      },
    }),
  ]);

  return (
    <CompanyDetail
      company={{
        id: company.id,
        name: company.name,
        slug: company.slug,
        plan: company.plan,
        industry: company.industry,
        isActive: company.isActive,
        logoUrl: company.logoUrl ?? null,
        primaryColor: company.primaryColor,
        secondaryColor: company.secondaryColor,
        accentColor: company.accentColor,
        fontFamily: company.fontFamily,
        maxUsers: company.maxUsers,
        maxStorageMB: (company as { maxStorageMB?: number }).maxStorageMB ?? 2,
        customDomain: company.customDomain ?? null,
        deletedAt: company.deletedAt?.toISOString() ?? null,
        createdAt: company.createdAt.toISOString(),
        updatedAt: company.updatedAt.toISOString(),
        fileCount: fileStats._count.id,
        storageBytes: fileStats._sum.size ?? 0,
        users: company.users.map((u) => ({
          ...u,
          lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
          createdAt: u.createdAt.toISOString(),
        })),
      }}
      auditLogs={auditLogs.map((l) => ({
        ...l,
        createdAt: l.createdAt.toISOString(),
      }))}
    />
  );
}
