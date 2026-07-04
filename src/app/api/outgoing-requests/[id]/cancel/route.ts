import { NextRequest, NextResponse } from "next/server";
import { requireActiveSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isAdminRole } from "@/lib/permissions";
import { logAction } from "@/lib/audit";
import { deleteObject } from "@/lib/storage";

// POST /api/outgoing-requests/[id]/cancel
// Admin cancels an outgoing request that is not yet approved/rejected.
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await requireActiveSession();
  if (!session || !session.companyId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdminRole(session.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { companyId, userId } = session;

  const outgoing = await prisma.outgoingRequest.findFirst({
    where: {
      id: params.id, companyId,
      status: { in: ["PENDING", "IN_PROGRESS", "PENDING_APPROVAL"] },
    },
    include: {
      file:  { select: { id: true, name: true, nombreDocumento: true } },
      tasks: { select: { assignedToUserId: true } },
    },
  });
  if (!outgoing) return NextResponse.json({ error: "Solicitud no encontrada o ya finalizada" }, { status: 404 });

  const docName = outgoing.file.nombreDocumento || outgoing.file.name;

  await prisma.$transaction(async (tx) => {
    await tx.outgoingRequest.update({
      where: { id: outgoing.id },
      data: { status: "CANCELLED" },
    });

    // Notify all involved assignees
    const uniqueUserIds = [...new Set(outgoing.tasks.map((t) => t.assignedToUserId))];
    if (uniqueUserIds.length > 0) {
      const typeLabel =
        outgoing.type === "ACTUALIZACION" ? "actualización"
        : outgoing.type === "REVISION"    ? "revisión"
        : "corrección";
      await tx.notification.createMany({
        data: uniqueUserIds.map((uid) => ({
          companyId,
          userId:  uid,
          type:    "OUTGOING_REQUEST_CANCELLED",
          message: `La solicitud de ${typeLabel} para "${docName}" fue cancelada`,
          fileId:  outgoing.fileId,
        })),
        skipDuplicates: true,
      });
    }
  });

  // Delete pending file from S3 immediately (outside transaction — non-fatal)
  if (outgoing.pendingStorageKey) {
    await deleteObject(outgoing.pendingStorageKey).catch(() => {});
  }
  if (outgoing.step1StorageKey) {
    await deleteObject(outgoing.step1StorageKey).catch(() => {});
  }

  await logAction({
    companyId, userId, action: "OUTGOING_REQUEST_CANCELLED",
    resourceType: "FILE", resourceId: outgoing.fileId,
    detail: docName,
  });

  return NextResponse.json({ ok: true });
}
