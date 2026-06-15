import { NextResponse } from "next/server";
import { requireActiveSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET /api/admin/users — list all users + pending invites + limit info for the company
export async function GET() {
  const session = await requireActiveSession();
  if (!session || !session.companyId || session.role !== "COMPANY_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const companyId = session.companyId;

  const [users, invites, company] = await Promise.all([
    prisma.user.findMany({
      where: { companyId },
      select: {
        id: true, name: true, email: true, role: true,
        isActive: true, lastLoginAt: true, createdAt: true,
        forcePasswordChange: true,
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.userInvite.findMany({
      where: { companyId, usedAt: null, expiresAt: { gt: new Date() } },
      select: { id: true, email: true, role: true, expiresAt: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.company.findUnique({ where: { id: companyId }, select: { maxUsers: true } }),
  ]);

  const activeUserCount = users.filter((u) => u.isActive).length;

  return NextResponse.json({
    users: users.map((u) => ({
      ...u,
      lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
      createdAt: u.createdAt.toISOString(),
    })),
    invites: invites.map((i) => ({
      ...i,
      expiresAt: i.expiresAt.toISOString(),
      createdAt: i.createdAt.toISOString(),
    })),
    maxUsers: company?.maxUsers ?? 10,
    activeUserCount,
  });
}
