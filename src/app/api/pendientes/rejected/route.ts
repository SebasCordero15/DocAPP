import { NextResponse } from "next/server";
import { requireActiveSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET /api/pendientes/rejected
// Returns ChangeRequests rejected by admin and ReviewChains rejected by a reviewer,
// both belonging to the current user (as requester/creator).
export async function GET() {
  const session = await requireActiveSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!session.companyId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { companyId, userId } = session;

  const [rejectedCRs, rejectedChains] = await Promise.all([
    prisma.changeRequest.findMany({
      where: { companyId, requestedByUserId: userId, status: "REJECTED" },
      orderBy: { reviewedAt: "desc" },
      select: {
        id: true,
        type: true,
        status: true,
        createdAt: true,
        reviewedAt: true,
        adminNotes: true,
        file: {
          select: { id: true, name: true, nombreDocumento: true, codigo: true, mimeType: true },
        },
        reviewedBy: { select: { id: true, name: true } },
      },
    }),

    prisma.reviewChain.findMany({
      where: { companyId, createdByUserId: userId, status: "REJECTED" },
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        rejectionNote: true,
        updatedAt: true,
        file: {
          select: { id: true, name: true, nombreDocumento: true, codigo: true, mimeType: true, status: true },
        },
        steps: {
          where: { rejectionNote: { not: null } },
          select: {
            stepOrder: true,
            rejectionNote: true,
            assignedTo: { select: { id: true, name: true } },
          },
          orderBy: { stepOrder: "desc" },
          take: 1,
        },
      },
    }),
  ]);

  return NextResponse.json({
    rejectedCRs: rejectedCRs.map((cr) => ({
      ...cr,
      createdAt:  cr.createdAt.toISOString(),
      reviewedAt: cr.reviewedAt?.toISOString() ?? null,
    })),
    rejectedChains: rejectedChains.map((chain) => ({
      ...chain,
      updatedAt:     chain.updatedAt.toISOString(),
      rejectingStep: chain.steps[0] ?? null,
    })),
  });
}
