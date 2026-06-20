import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireActiveSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logAction } from "@/lib/audit";

// GET /api/superadmin/companies/[id] — full company detail with stats
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await requireActiveSession();
  if (!session || session.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const company = await prisma.company.findUnique({
    where: { id: params.id },
    include: {
      users: {
        where: { companyId: params.id },
        select: {
          id: true, name: true, email: true, role: true,
          isActive: true, lastLoginAt: true, createdAt: true,
          forcePasswordChange: true,
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!company) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const [fileStats, auditLogs] = await Promise.all([
    prisma.file.aggregate({
      where: { companyId: params.id, deletedAt: null },
      _count: { id: true },
      _sum: { size: true },
    }),
    prisma.auditLog.findMany({
      where: { companyId: params.id },
      orderBy: { createdAt: "desc" },
      take: 25,
      select: {
        id: true, action: true, resourceType: true, resourceId: true,
        detail: true, createdAt: true,
        user: { select: { name: true, email: true } },
      },
    }),
  ]);

  return NextResponse.json({
    company: {
      ...company,
      userCount: company.users.length,
      fileCount: fileStats._count.id,
      storageBytes: fileStats._sum.size ?? 0,
      users: company.users.map((u) => ({
        ...u,
        lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
        createdAt: u.createdAt.toISOString(),
      })),
    },
    auditLogs: auditLogs.map((l) => ({
      ...l,
      createdAt: l.createdAt.toISOString(),
    })),
  });
}

const PLAN_LIMITS: Record<string, number> = { BASIC: 10, PRO: 50, ENTERPRISE: 250 };

const patchSchema = z.object({
  isActive: z.boolean().optional(),
  plan: z.enum(["BASIC", "PRO", "ENTERPRISE"]).optional(),
}).refine((d) => d.isActive !== undefined || d.plan !== undefined, {
  message: "Provide at least one of isActive or plan",
});

// PATCH /api/superadmin/companies/[id] — update isActive and/or maxUsers
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await requireActiveSession();
  if (!session || session.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const existing = await prisma.company.findUnique({ where: { id: params.id } });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { isActive, plan } = parsed.data;
  const newMaxUsers = plan ? PLAN_LIMITS[plan] : undefined;

  const updated = await prisma.company.update({
    where: { id: params.id },
    data: {
      ...(isActive !== undefined ? { isActive } : {}),
      ...(plan !== undefined ? { plan, maxUsers: newMaxUsers } : {}),
    },
    select: { id: true, slug: true, name: true, isActive: true, plan: true, maxUsers: true },
  });

  const changes: string[] = [];
  if (isActive !== undefined) changes.push(isActive ? "COMPANY_ACTIVATE" : "COMPANY_DEACTIVATE");
  if (plan !== undefined) changes.push(`plan=${plan} (maxUsers=${newMaxUsers})`);

  await logAction({
    companyId: params.id,
    userId: session.userId,
    action: isActive !== undefined ? (isActive ? "COMPANY_ACTIVATE" : "COMPANY_DEACTIVATE") : "COMPANY_UPDATE",
    resourceType: "COMPANY",
    resourceId: params.id,
    detail: `${existing.name} — ${changes.join(", ")}`,
  });

  return NextResponse.json({ company: updated });
}
