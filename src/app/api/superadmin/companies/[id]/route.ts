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
      maxStorageMB: company.maxStorageMB,
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

const PLAN_LIMITS: Record<string, { maxUsers: number; maxStorageMB: number }> = {
  BASIC:      { maxUsers: 10,  maxStorageMB: 5120   }, // 5 GB
  PRO:        { maxUsers: 50,  maxStorageMB: 15360  }, // 15 GB
  ENTERPRISE: { maxUsers: 250, maxStorageMB: 30720  }, // 30 GB
};

const COLOR_RE = /^#[0-9a-fA-F]{6}$/;

const patchSchema = z.object({
  // Activation toggle
  isActive: z.boolean().optional(),
  // Plan (auto-updates limits)
  plan: z.enum(["BASIC", "PRO", "ENTERPRISE"]).optional(),
  // Company info
  name: z.string().min(1).max(100).optional(),
  industry: z.enum(["FARMACIA", "ALIMENTOS", "MATERIALES", "SERVICIOS", "OTRO", "LEGAL", "FINANCE", "HEALTHCARE", "REAL_ESTATE", "TECH", "OTHER"]).optional(),
  customDomain: z.string().max(200).nullable().optional(),
  // Branding
  primaryColor:   z.string().regex(COLOR_RE).optional(),
  secondaryColor: z.string().regex(COLOR_RE).optional(),
  accentColor:    z.string().regex(COLOR_RE).optional(),
  fontFamily:     z.string().max(50).optional(),
  // Logo as data: URL (base64) — capped at 700 KB encoded; null = remove
  logoUrl: z.string().max(700_000).nullable().optional(),
});

// PATCH /api/superadmin/companies/[id] — update company info, plan, branding, activation
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
    return NextResponse.json({ error: "Invalid input", details: parsed.error.issues }, { status: 400 });
  }

  const existing = await prisma.company.findUnique({ where: { id: params.id } });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const {
    isActive, plan,
    name, industry, customDomain,
    primaryColor, secondaryColor, accentColor, fontFamily, logoUrl,
  } = parsed.data;

  const newLimits = plan ? PLAN_LIMITS[plan] : undefined;

  const updated = await prisma.company.update({
    where: { id: params.id },
    data: {
      ...(isActive       !== undefined ? { isActive }         : {}),
      ...(plan           !== undefined ? { plan, maxUsers: newLimits!.maxUsers, maxStorageMB: newLimits!.maxStorageMB } : {}),
      ...(name           !== undefined ? { name }             : {}),
      ...(industry       !== undefined ? { industry: industry as Parameters<typeof prisma.company.update>[0]["data"]["industry"] } : {}),
      ...(customDomain   !== undefined ? { customDomain }     : {}),
      ...(primaryColor   !== undefined ? { primaryColor }     : {}),
      ...(secondaryColor !== undefined ? { secondaryColor }   : {}),
      ...(accentColor    !== undefined ? { accentColor }      : {}),
      ...(fontFamily     !== undefined ? { fontFamily }       : {}),
      ...(logoUrl        !== undefined ? { logoUrl }          : {}),
    },
    select: {
      id: true, slug: true, name: true, isActive: true, plan: true,
      maxUsers: true, maxStorageMB: true,
      primaryColor: true, secondaryColor: true, accentColor: true,
      fontFamily: true, logoUrl: true, customDomain: true, industry: true,
    },
  });

  const changes: string[] = [];
  if (isActive     !== undefined) changes.push(isActive ? "activada" : "desactivada");
  if (plan         !== undefined) changes.push(`plan=${plan}`);
  if (name         !== undefined) changes.push(`nombre=${name}`);
  if (industry     !== undefined) changes.push(`industria=${industry}`);
  if (logoUrl      !== undefined) changes.push(logoUrl ? "logo actualizado" : "logo eliminado");
  if (primaryColor !== undefined) changes.push("branding actualizado");

  await logAction({
    companyId: params.id,
    userId: session.userId,
    action: isActive !== undefined
      ? (isActive ? "COMPANY_ACTIVATE" : "COMPANY_DEACTIVATE")
      : "COMPANY_UPDATE",
    resourceType: "COMPANY",
    resourceId: params.id,
    detail: `${existing.name} — ${changes.join(", ")}`,
  });

  return NextResponse.json({ company: updated });
}
