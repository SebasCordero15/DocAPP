import { NextRequest, NextResponse } from "next/server";
import { requireActiveSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET /api/admin/audit — audit log for the company, COMPANY_ADMIN only
// Query params: userId, action, dateFrom (ISO), dateTo (ISO), page (default 1)
export async function GET(req: NextRequest) {
  const session = await requireActiveSession();
  if (!session || !session.companyId || session.role !== "COMPANY_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const companyId = session.companyId;

  const { searchParams } = new URL(req.url);
  const userId   = searchParams.get("userId") || undefined;
  const action   = searchParams.get("action") || undefined;
  const dateFrom = searchParams.get("dateFrom");
  const dateTo   = searchParams.get("dateTo");
  const page     = Math.max(1, parseInt(searchParams.get("page") ?? "1") || 1);
  const PAGE_SIZE = 50;

  const where = {
    companyId,
    ...(userId ? { userId } : {}),
    ...(action ? { action: { contains: action, mode: "insensitive" as const } } : {}),
    ...(dateFrom || dateTo ? {
      createdAt: {
        ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
        ...(dateTo   ? { lte: new Date(new Date(dateTo).getTime() + 86_400_000) } : {}),
      },
    } : {}),
  };

  const [logs, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true, action: true, resourceType: true, resourceId: true,
        detail: true, createdAt: true,
        user: { select: { id: true, name: true, email: true } },
      },
    }),
    prisma.auditLog.count({ where }),
  ]);

  const users = await prisma.user.findMany({
    where: { companyId },
    select: { id: true, name: true, email: true },
    orderBy: { name: "asc" },
  });

  return NextResponse.json({
    logs: logs.map((l) => ({ ...l, createdAt: l.createdAt.toISOString() })),
    total,
    page,
    pageSize: PAGE_SIZE,
    pageCount: Math.ceil(total / PAGE_SIZE),
    users,
  });
}
