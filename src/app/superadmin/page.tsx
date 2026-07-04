import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import SuperAdminDashboard from "./SuperAdminDashboard";

export default async function SuperAdminPage() {
  const session = await getSession();
  if (!session || session.role !== "SUPER_ADMIN") redirect("/superadmin/login");

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [
    totalCompanies, activeCompanies, totalUsers,
    companies, archivedCompanies, userCounts, fileStats, lastLoginData, activeUsers30dData,
  ] = await Promise.all([
    prisma.company.count({ where: { deletedAt: null } }),
    prisma.company.count({ where: { isActive: true, deletedAt: null } }),
    prisma.user.count({ where: { companyId: { not: null } } }),
    prisma.company.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: "desc" },
      select: {
        id: true, name: true, slug: true, plan: true, maxUsers: true,
        isActive: true, createdAt: true, logoUrl: true, industry: true,
      },
    }),
    prisma.company.findMany({
      where: { deletedAt: { not: null } },
      orderBy: { deletedAt: "desc" },
      select: {
        id: true, name: true, slug: true, plan: true, maxUsers: true,
        isActive: true, createdAt: true, logoUrl: true, industry: true, deletedAt: true,
      },
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
    // Most recent login per company
    prisma.user.groupBy({
      by: ["companyId"],
      where: { companyId: { not: null }, lastLoginAt: { not: null } },
      _max: { lastLoginAt: true },
    }),
    // Users who logged in within the last 30 days per company
    prisma.user.groupBy({
      by: ["companyId"],
      where: { companyId: { not: null }, lastLoginAt: { gte: thirtyDaysAgo } },
      _count: { id: true },
    }),
  ]);

  const activeUserCountMap = Object.fromEntries(
    userCounts.map((r) => [r.companyId as string, r._count.id])
  );
  const fileCountMap = Object.fromEntries(
    fileStats.map((r) => [r.companyId, r._count.id])
  );
  const storageBytesMap = Object.fromEntries(
    fileStats.map((r) => [r.companyId, r._sum.size ?? 0])
  );
  const lastAccessMap = Object.fromEntries(
    lastLoginData.map((r) => [r.companyId as string, r._max.lastLoginAt?.toISOString() ?? null])
  );
  const activeUsers30dMap = Object.fromEntries(
    activeUsers30dData.map((r) => [r.companyId as string, r._count.id])
  );

  return (
    <SuperAdminDashboard
      stats={{ totalCompanies, activeCompanies, totalUsers }}
      companies={companies.map((c) => ({
        ...c,
        createdAt: c.createdAt.toISOString(),
        activeUserCount: activeUserCountMap[c.id] ?? 0,
        fileCount: fileCountMap[c.id] ?? 0,
        storageBytes: storageBytesMap[c.id] ?? 0,
        lastAccess: lastAccessMap[c.id] ?? null,
        activeUsers30d: activeUsers30dMap[c.id] ?? 0,
      }))}
      archivedCompanies={archivedCompanies.map((c) => ({
        ...c,
        createdAt: c.createdAt.toISOString(),
        deletedAt: c.deletedAt!.toISOString(),
      }))}
    />
  );
}
