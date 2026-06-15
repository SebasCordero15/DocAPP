import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireActiveSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resolveFileAccess } from "@/lib/permissions";
import { canBypassApproval, notifyAdminsOfRequest } from "@/lib/changeRequests";
import { logAction } from "@/lib/audit";

const patchSchema = z.object({
  status:  z.enum(["PENDING", "IN_PROGRESS", "COMPLETED"]).optional(),
  notes:   z.string().max(2000).optional().nullable(),
  dueDate: z.string().datetime().optional().nullable(),
}).refine((d) => d.status !== undefined || d.notes !== undefined || d.dueDate !== undefined, {
  message: "Provide at least one field to update",
});

const TASK_TYPE_LABELS: Record<string, string> = {
  REVIEW: "Revisión", UPDATE: "Actualización", APPROVE: "Aprobación", OTHER: "Otra tarea",
};

// PATCH /api/tasks/[id]
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await requireActiveSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!session.companyId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const companyId = session.companyId;

  const task = await prisma.documentTask.findFirst({
    where: { id: params.id, companyId },
    include: {
      file: { select: { id: true, name: true, nombreDocumento: true, status: true } },
      assignedTo: { select: { id: true, name: true } },
      assignedBy: { select: { id: true, name: true } },
    },
  });
  if (!task) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const isAssignee = task.assignedToUserId === session.userId;
  const isAssigner = task.assignedByUserId === session.userId;
  if (!isAssignee && !isAssigner) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", details: parsed.error.issues }, { status: 400 });
  }
  const { status, notes, dueDate } = parsed.data;

  const updateData: Record<string, unknown> = {};
  if (notes !== undefined)   updateData.notes   = notes;
  if (dueDate !== undefined) updateData.dueDate = dueDate ? new Date(dueDate) : null;

  const completing = status === "COMPLETED" && task.status !== "COMPLETED";
  if (status !== undefined) {
    updateData.status = status;
    if (completing) updateData.completedAt = new Date();
  }

  const updated = await prisma.documentTask.update({ where: { id: task.id }, data: updateData });

  if (completing) {
    const docName = task.file.nombreDocumento || task.file.name;
    const now     = new Date();

    // Determine the completing user's access level on the file
    const fileLevel = await resolveFileAccess(session.userId, companyId, session.role, task.fileId);
    const bypass    = canBypassApproval(fileLevel, session.role);

    const fileUpdates: Record<string, unknown> = {};
    if (task.type === "REVIEW")  { fileUpdates.fechaRevision    = now; fileUpdates.status = "REVIEWED"; }
    if (task.type === "UPDATE")  { fileUpdates.fechaActualizacion = now; }
    if (task.type === "APPROVE") { fileUpdates.status = "REVIEWED"; }

    if (Object.keys(fileUpdates).length > 0) {
      if (bypass || task.autoApproveOnCompletion) {
        // Apply directly
        await prisma.file.update({ where: { id: task.fileId }, data: fileUpdates });
      } else {
        // EDIT-only user completing without autoApprove → ChangeRequest
        const crType = task.type === "REVIEW" ? "REVISION_DATE_CHANGE" : "OTHER";
        const changeRequest = await prisma.changeRequest.create({
          data: {
            companyId,
            type:              crType,
            fileId:            task.fileId,
            requestedByUserId: session.userId,
            proposedChanges:   { taskId: task.id, taskType: task.type, proposedFileUpdates: fileUpdates } as object,
          },
        });
        await notifyAdminsOfRequest({ companyId, fileId: task.fileId, docName, type: crType });
        await logAction({ companyId, userId: session.userId, action: "CHANGE_REQUEST_CREATED", resourceType: "FILE", resourceId: task.fileId, detail: `${crType} via task completion | ${docName}` });

        // Still notify the assigner that the task was completed (even if approval needed for file update)
        if (task.assignedByUserId !== session.userId) {
          await prisma.notification.create({
            data: {
              companyId,
              userId:  task.assignedByUserId,
              type:    "TASK_COMPLETED",
              message: `${task.assignedTo.name} completó ${TASK_TYPE_LABELS[task.type]} para "${docName}" (cambios pendientes de aprobación)`,
              fileId:  task.fileId,
            },
          });
        }
        await logAction({ companyId, userId: session.userId, action: "TASK_COMPLETED", resourceType: "FILE", resourceId: task.fileId, detail: `${task.type} | ${docName}` });

        return NextResponse.json({
          ...updated,
          dueDate:      updated.dueDate?.toISOString() ?? null,
          completedAt:  updated.completedAt?.toISOString() ?? null,
          changeRequest,
          requiresApproval: true,
        });
      }
    }

    // Notify assigner (direct completion path)
    if (task.assignedByUserId !== session.userId) {
      await prisma.notification.create({
        data: {
          companyId,
          userId:  task.assignedByUserId,
          type:    "TASK_COMPLETED",
          message: `${task.assignedTo.name} completó ${TASK_TYPE_LABELS[task.type]} para "${docName}"`,
          fileId:  task.fileId,
        },
      });
    }

    await logAction({ companyId, userId: session.userId, action: "TASK_COMPLETED", resourceType: "FILE", resourceId: task.fileId, detail: `${task.type} | ${docName}` });
  }

  return NextResponse.json({
    ...updated,
    dueDate:     updated.dueDate?.toISOString() ?? null,
    completedAt: updated.completedAt?.toISOString() ?? null,
  });
}
