import { redirect } from "next/navigation";
import { requireActiveSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import DashboardClient from "./DashboardClient";
import SuperAdminDashboard from "../superadmin/SuperAdminDashboard";

export default async function DashboardPage() {
  const session = await requireActiveSession();
  if (!session) redirect("/login");

  // ── SUPER_ADMIN: render platform management view ──────────────────────────
  if (session.role === "SUPER_ADMIN") {
    const [totalCompanies, activeCompanies, totalUsers, companies, userCounts, fileStats] =
      await Promise.all([
        prisma.company.count(),
        prisma.company.count({ where: { isActive: true } }),
        prisma.user.count({ where: { companyId: { not: null } } }),
        prisma.company.findMany({
          orderBy: { createdAt: "desc" },
          select: { id: true, name: true, slug: true, plan: true, maxUsers: true, isActive: true, createdAt: true, logoUrl: true },
        }),
        prisma.user.groupBy({
          by: ["companyId"],
          where: { companyId: { not: null }, isActive: true },
          _count: { id: true },
        }),
        prisma.file.groupBy({
          by: ["companyId"],
          where: { deletedAt: null },
          _count: { id: true },
          _sum: { size: true },
        }),
      ]);

    const activeUserCountMap = Object.fromEntries(userCounts.map((r) => [r.companyId as string, r._count.id]));
    const fileCountMap = Object.fromEntries(fileStats.map((r) => [r.companyId, r._count.id]));
    const storageBytesMap = Object.fromEntries(fileStats.map((r) => [r.companyId, r._sum.size ?? 0]));

    return (
      <SuperAdminDashboard
        stats={{ totalCompanies, activeCompanies, totalUsers }}
        companies={companies.map((c) => ({
          ...c,
          createdAt: c.createdAt.toISOString(),
          activeUserCount: activeUserCountMap[c.id] ?? 0,
          fileCount: fileCountMap[c.id] ?? 0,
          storageBytes: storageBytesMap[c.id] ?? 0,
        }))}
      />
    );
  }

  // ── Company users: COMPANY_ADMIN / EDITOR / VIEWER ────────────────────────
  if (!session.companyId) redirect("/login");

  const [company, activeUserCount] = await Promise.all([
    prisma.company.findUnique({
      where: { id: session.companyId },
      select: { name: true, primaryColor: true, accentColor: true, fontFamily: true, maxUsers: true, logoUrl: true },
    }),
    prisma.user.count({ where: { companyId: session.companyId, isActive: true } }),
  ]);
  if (!company) redirect("/login");

  return (
    <DashboardClient
      company={{ name: company.name, primaryColor: company.primaryColor, accentColor: company.accentColor, fontFamily: company.fontFamily, logoUrl: company.logoUrl ?? null }}
      userRole={session.role}
      activeUserCount={activeUserCount}
      maxUsers={company.maxUsers}
    />
  );
}
