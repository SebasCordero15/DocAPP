import { NextRequest, NextResponse } from "next/server";
import { requireActiveSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isAdminRole } from "@/lib/permissions";

// GET /api/change-requests?view=mine|pending
export async function GET(req: NextRequest) {
  const session = await requireActiveSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!session.companyId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { companyId, userId, role } = session;

  const view = req.nextUrl.searchParams.get("view") ?? "mine";

  if (view === "pending") {
    if (!isAdminRole(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const changeRequests = await prisma.changeRequest.findMany({
      where: { companyId, status: "PENDING" },
      orderBy: { createdAt: "asc" },
      include: {
        file:        { select: { id: true, name: true, nombreDocumento: true, codigo: true, storageKey: true } },
        requestedBy: { select: { id: true, name: true, email: true } },
      },
    });
    return NextResponse.json({
      changeRequests: changeRequests.map((cr) => ({
        ...cr,
        createdAt:  cr.createdAt.toISOString(),
        reviewedAt: cr.reviewedAt?.toISOString() ?? null,
      })),
    });
  }

  // view=mine — return current user's own requests
  const changeRequests = await prisma.changeRequest.findMany({
    where: { companyId, requestedByUserId: userId },
    orderBy: { createdAt: "desc" },
    include: {
      file: { select: { id: true, name: true, nombreDocumento: true, codigo: true } },
    },
  });

  return NextResponse.json({
    changeRequests: changeRequests.map((cr) => ({
      ...cr,
      createdAt:  cr.createdAt.toISOString(),
      reviewedAt: cr.reviewedAt?.toISOString() ?? null,
    })),
  });
}
