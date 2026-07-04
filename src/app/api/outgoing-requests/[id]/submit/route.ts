import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireActiveSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isAdminRole } from "@/lib/permissions";
import { logAction } from "@/lib/audit";
import { deleteObject } from "@/lib/storage";

const schema = z.object({
  outcomeType: z.enum(["no_changes", "new_version", "corrected"]),
  // Filled when outcomeType = new_version or corrected (if contenido = true)
  storageKey:  z.string().optional().nullable(),
  fileName:    z.string().max(500).optional().nullable(),
  mimeType:    z.string().optional().nullable(),
  size:        z.number().int().positive().optional().nullable(),
  versionStr:  z.string().max(50).optional().nullable(),
  // For corrected: updated metadata
  metadata: z.object({
    nombreDocumento: z.string().max(500).optional().nullable(),
    departamento:    z.string().max(200).optional().nullable(),
    folderId:        z.string().optional().nullable(),
  }).optional().nullable(),
});

// POST /api/outgoing-requests/[id]/submit
// Current-step assignee submits their response.
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await requireActiveSession();
  if (!session || !session.companyId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { companyId, userId } = session;

  const outgoing = await prisma.outgoingRequest.findFirst({
    where: { id: params.id, companyId, status: { in: ["PENDING", "IN_PROGRESS"] } },
    include: {
      file:  { select: { id: true, name: true, nombreDocumento: true, folderId: true, version: true, versionStr: true, storageKey: true } },
      tasks: { orderBy: { stepOrder: "asc" } },
      createdBy: { select: { id: true, name: true } },
    },
  });
  if (!outgoing) return NextResponse.json({ error: "Solicitud no encontrada" }, { status: 404 });

  const currentTask = outgoing.tasks.find((t) => t.stepOrder === outgoing.currentStep);
  if (!currentTask || currentTask.assignedToUserId !== userId) {
    return NextResponse.json({ error: "No es tu turno en esta solicitud" }, { status: 403 });
  }
  if (currentTask.status === "COMPLETED") {
    return NextResponse.json({ error: "Ya completaste esta tarea" }, { status: 409 });
  }

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos", details: parsed.error.issues }, { status: 400 });

  const { outcomeType, storageKey, fileName, mimeType, size, versionStr, metadata } = parsed.data;
  const { file } = outgoing;
  const docName = file.nombreDocumento || file.name;
  const now = new Date();

  // Validate required fields
  if (outcomeType === "new_version" && !storageKey) {
    return NextResponse.json({ error: "Se requiere el archivo para una nueva versión" }, { status: 400 });
  }
  if (outcomeType === "corrected") {
    const corrFields = outgoing.correctionFields as { nombre?: boolean; contenido?: boolean; area?: boolean; carpeta?: boolean; otro?: string | null } | null;
    if (corrFields?.contenido && !storageKey) {
      return NextResponse.json({ error: "Se requiere el archivo para la corrección de contenido" }, { status: 400 });
    }
  }

  const isLastStep = outgoing.currentStep === outgoing.totalSteps;

  await prisma.$transaction(async (tx) => {
    // Mark current task as completed
    await tx.documentTask.update({
      where: { id: currentTask.id },
      data: { status: "COMPLETED", completedAt: now },
    });

    if (!isLastStep) {
      // Save step 1 outcome and advance to step 2
      const nextTask = outgoing.tasks.find((t) => t.stepOrder === outgoing.currentStep + 1);

      await tx.outgoingRequest.update({
        where: { id: outgoing.id },
        data: {
          status:           "IN_PROGRESS",
          currentStep:      outgoing.currentStep + 1,
          step1OutcomeType: outcomeType,
          step1StorageKey:  storageKey ?? null,
          step1VersionStr:  versionStr ?? null,
        },
      });

      if (nextTask) {
        const typeLabel = outgoing.type === "ACTUALIZACION" ? "actualización" : outgoing.type === "REVISION" ? "revisión" : "corrección";
        await tx.notification.create({
          data: {
            companyId,
            userId:  nextTask.assignedToUserId,
            type:    "OUTGOING_REQUEST_ASSIGNED",
            message: `Te corresponde revisar el paso 2 de la ${typeLabel} del documento "${docName}"`,
            fileId:  outgoing.fileId,
          },
        });
      }
    } else {
      // Last step — move to PENDING_APPROVAL, store pending result
      // If step 2 declined file from step 1, delete orphan from S3
      if (outgoing.totalSteps === 2 && outgoing.step1StorageKey && storageKey && storageKey !== outgoing.step1StorageKey) {
        await deleteObject(outgoing.step1StorageKey).catch(() => {});
      }

      await tx.outgoingRequest.update({
        where: { id: outgoing.id },
        data: {
          status:           "PENDING_APPROVAL",
          outcomeType,
          pendingStorageKey: storageKey ?? null,
          pendingFileName:   fileName ?? null,
          pendingMimeType:   mimeType ?? null,
          pendingSize:       size ?? null,
          pendingVersionStr: versionStr ?? null,
          pendingMetadata:   metadata ?? undefined,
        },
      });

      // Notify admin (creator)
      const typeLabel = outgoing.type === "ACTUALIZACION" ? "actualización" : outgoing.type === "REVISION" ? "revisión" : "corrección";
      await tx.notification.create({
        data: {
          companyId,
          userId:  outgoing.createdByUserId,
          type:    "OUTGOING_REQUEST_PENDING_APPROVAL",
          message: `La ${typeLabel} de "${docName}" está lista para tu revisión`,
          fileId:  outgoing.fileId,
        },
      });
    }
  });

  await logAction({
    companyId, userId, action: "OUTGOING_REQUEST_SUBMITTED",
    resourceType: "FILE", resourceId: outgoing.fileId,
    detail: `step ${outgoing.currentStep}/${outgoing.totalSteps} | ${outcomeType} | ${docName}`,
  });

  return NextResponse.json({ ok: true, isLastStep });
}
