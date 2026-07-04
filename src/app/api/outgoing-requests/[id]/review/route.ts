import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireActiveSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isAdminRole } from "@/lib/permissions";
import { logAction } from "@/lib/audit";
import { deleteObject } from "@/lib/storage";

const schema = z.object({
  decision: z.enum(["APPROVED", "REJECTED"]),
  notes:    z.string().max(2000).optional().nullable(),
  // Override version label (admin can adjust before approving)
  versionStr: z.string().optional().nullable(),
});

// POST /api/outgoing-requests/[id]/review
// Admin gives final approval or rejection.
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await requireActiveSession();
  if (!session || !session.companyId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdminRole(session.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { companyId, userId } = session;

  const outgoing = await prisma.outgoingRequest.findFirst({
    where: { id: params.id, companyId, status: "PENDING_APPROVAL" },
    include: {
      file: {
        select: {
          id: true, name: true, nombreDocumento: true,
          storageKey: true, versionStr: true, version: true, mimeType: true, size: true,
          previousStorageKey: true, previousVersionStr: true, previousVersion: true,
          folderId: true, departamento: true,
        },
      },
      tasks: {
        select: { assignedToUserId: true, stepOrder: true },
        orderBy: { stepOrder: "asc" },
      },
    },
  });
  if (!outgoing) return NextResponse.json({ error: "Solicitud no encontrada o no está pendiente de aprobación" }, { status: 404 });

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });

  const { decision, notes, versionStr: adminVersionStr } = parsed.data;
  const { file } = outgoing;
  const docName = file.nombreDocumento || file.name;
  const now = new Date();

  if (decision === "REJECTED") {
    await prisma.$transaction(async (tx) => {
      await tx.outgoingRequest.update({
        where: { id: params.id },
        data: {
          status:                "REJECTED",
          finalNotes:            notes ?? null,
          finalReviewedByUserId: userId,
          finalReviewedAt:       now,
        },
      });

      // Delete pending file from S3 if any
      if (outgoing.pendingStorageKey) {
        await deleteObject(outgoing.pendingStorageKey).catch(() => {});
      }

      // Notify last assignee
      const lastTask = outgoing.tasks[outgoing.tasks.length - 1];
      if (lastTask) {
        await tx.notification.create({
          data: {
            companyId,
            userId:  lastTask.assignedToUserId,
            type:    "OUTGOING_REQUEST_REJECTED",
            message: `Tu entrega para "${docName}" fue rechazada. ${notes ?? ""}`.trim(),
            fileId:  outgoing.fileId,
          },
        });
      }
    });

    await logAction({
      companyId, userId, action: "OUTGOING_REQUEST_REJECTED",
      resourceType: "FILE", resourceId: outgoing.fileId,
      detail: docName,
    });

    return NextResponse.json({ ok: true });
  }

  // APPROVED — apply changes to the file
  const outcomeType = outgoing.outcomeType;
  const fileUpdateData: Record<string, unknown> = {
    updatedAt: now,
    fechaActualizacion: now,
  };

  let oldStorageKeyToDelete: string | null = null;

  if (outcomeType === "no_changes") {
    // Nothing to change on the file itself — just mark approved
  } else if (outcomeType === "new_version" || (outcomeType === "corrected" && outgoing.pendingStorageKey)) {
    // Version swap: current → previous, pending → current
    const newVersionStr = adminVersionStr ?? outgoing.pendingVersionStr ?? file.versionStr;
    const newVersionNum = (file.version ?? 1) + 1;

    // Old "previous" version gets deleted from S3
    if (file.previousStorageKey) {
      oldStorageKeyToDelete = file.previousStorageKey;
    }

    fileUpdateData.storageKey          = outgoing.pendingStorageKey;
    fileUpdateData.name                = outgoing.pendingFileName ?? file.name;
    fileUpdateData.mimeType            = outgoing.pendingMimeType ?? file.mimeType;
    fileUpdateData.size                = outgoing.pendingSize ?? file.size;
    fileUpdateData.versionStr          = newVersionStr;
    fileUpdateData.version             = newVersionNum;
    fileUpdateData.previousStorageKey  = file.storageKey;
    fileUpdateData.previousVersionStr  = file.versionStr;
    fileUpdateData.previousVersion     = file.version;
  }

  if (outcomeType === "corrected") {
    const meta = outgoing.pendingMetadata as { nombreDocumento?: string; departamento?: string; folderId?: string } | null;
    if (meta) {
      if (meta.nombreDocumento != null) fileUpdateData.nombreDocumento = meta.nombreDocumento;
      if (meta.departamento    != null) fileUpdateData.departamento    = meta.departamento;
      if (meta.folderId        != null) fileUpdateData.folderId        = meta.folderId;
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.file.update({ where: { id: outgoing.fileId }, data: fileUpdateData });

    await tx.outgoingRequest.update({
      where: { id: params.id },
      data: {
        status:                "APPROVED",
        finalNotes:            notes ?? null,
        finalReviewedByUserId: userId,
        finalReviewedAt:       now,
      },
    });

    // Notify all assignees
    const typeLabel =
      outgoing.type === "ACTUALIZACION" ? "actualización"
      : outgoing.type === "REVISION"    ? "revisión"
      : "corrección";
    const uniqueUserIds = [...new Set(outgoing.tasks.map((t) => t.assignedToUserId))];
    await tx.notification.createMany({
      data: uniqueUserIds.map((uid) => ({
        companyId,
        userId:  uid,
        type:    "OUTGOING_REQUEST_APPROVED",
        message: `Tu entrega para la ${typeLabel} de "${docName}" fue aprobada`,
        fileId:  outgoing.fileId,
      })),
      skipDuplicates: true,
    });
  });

  // Delete old previous version from S3 outside transaction
  if (oldStorageKeyToDelete) {
    await deleteObject(oldStorageKeyToDelete).catch(() => {});
  }

  await logAction({
    companyId, userId, action: "OUTGOING_REQUEST_APPROVED",
    resourceType: "FILE", resourceId: outgoing.fileId,
    detail: `${outcomeType} | ${docName}`,
  });

  // Log a control-de-cambios-visible event for actual file changes
  if (outcomeType === "new_version" || (outcomeType === "corrected" && outgoing.pendingStorageKey)) {
    const newVer = adminVersionStr ?? outgoing.pendingVersionStr ?? file.versionStr;
    await logAction({
      companyId, userId, action: "FILE_UPLOAD",
      resourceType: "FILE", resourceId: outgoing.fileId,
      detail: `Nueva versión ${file.versionStr ?? "—"} → ${newVer ?? "—"} | ${docName} (solicitud saliente)`,
    });
  } else if (outcomeType === "corrected") {
    const meta = outgoing.pendingMetadata as { nombreDocumento?: string; departamento?: string; folderId?: string } | null;
    const corrFields = outgoing.correctionFields as Record<string, boolean | string | null> | null;
    const camposCambiados = [
      corrFields?.nombre    && "nombre",
      corrFields?.contenido && "contenido",
      corrFields?.area      && "área",
      corrFields?.carpeta   && "carpeta",
      corrFields?.otro      && `otro: ${corrFields.otro}`,
    ].filter(Boolean).join(", ");
    await logAction({
      companyId, userId, action: "FILE_METADATA_UPDATE",
      resourceType: "FILE", resourceId: outgoing.fileId,
      detail: `Corrección aprobada (${camposCambiados || "metadatos"}) | ${docName}`,
    });
  }

  return NextResponse.json({ ok: true });
}
