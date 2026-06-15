import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireActiveSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resolveFileAccess, atLeast, isAdminRole } from "@/lib/permissions";
import { logAction } from "@/lib/audit";

const TASK_TYPE_LABELS: Record<string, string> = {
  REVIEW: "Revisión",
  UPDATE: "Actualización",
  APPROVE: "Aprobación",
  OTHER: "Otra tarea",
};

const createSchema = z.object({
  fileId:                  z.string().min(1),
  assignedToUserId:        z.string().min(1),
  type:                    z.enum(["REVIEW", "UPDATE", "APPROVE", "OTHER"]),
  dueDate:                 z.string().datetime().optional().nullable(),
  notes:                   z.string().max(2000).optional().nullable(),
  autoApproveOnCompletion: z.boolean().optional().default(false),
});

// POST /api/tasks — create a task (requires MANAGE on file or COMPANY_ADMIN)
export async function POST(req: NextRequest) {
  const session = await requireActiveSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!session.companyId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const companyId = session.companyId;

  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", details: parsed.error.issues }, { status: 400 });
  }
  const { fileId, assignedToUserId, type, dueDate, notes, autoApproveOnCompletion } = parsed.data;

  // Verify file belongs to this company
  const file = await prisma.file.findFirst({
    where: { id: fileId, companyId, deletedAt: null },
    select: { id: true, name: true, nombreDocumento: true, status: true },
  });
  if (!file) return NextResponse.json({ error: "File not found" }, { status: 404 });

  // Requester must have MANAGE on this file (or be admin)
  const level = await resolveFileAccess(session.userId, companyId, session.role, fileId);
  if (!atLeast(level, "MANAGE")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Assignee must be an active user in the same company
  const assignee = await prisma.user.findFirst({
    where: { id: assignedToUserId, companyId, isActive: true },
    select: { id: true, name: true },
  });
  if (!assignee) return NextResponse.json({ error: "Assigned user not found" }, { status: 400 });

  // Warn (but don't block) if a duplicate active task of the same type exists
  const existing = await prisma.documentTask.findFirst({
    where: { fileId, type, status: { not: "COMPLETED" } },
  });

  const docName = file.nombreDocumento || file.name;

  // Create the task
  const task = await prisma.documentTask.create({
    data: {
      companyId,
      fileId,
      assignedToUserId,
      assignedByUserId:        session.userId,
      type,
      dueDate:                 dueDate ? new Date(dueDate) : null,
      notes:                   notes ?? null,
      autoApproveOnCompletion: autoApproveOnCompletion ?? false,
    },
  });

  // Auto-set file status to IN_REVIEW when a REVIEW task is assigned
  const fileUpdates: Record<string, unknown> = {};
  if (type === "REVIEW" && file.status !== "IN_REVIEW") {
    fileUpdates.status = "IN_REVIEW";
  }
  if (Object.keys(fileUpdates).length > 0) {
    await prisma.file.update({ where: { id: fileId }, data: fileUpdates });
  }

  // Notify the assignee
  await prisma.notification.create({
    data: {
      companyId,
      userId: assignedToUserId,
      type: "TASK_ASSIGNED",
      message: `Se te asignó ${TASK_TYPE_LABELS[type]} para "${docName}"`,
      fileId,
    },
  });

  await logAction({
    companyId,
    userId: session.userId,
    action: "TASK_ASSIGNED",
    resourceType: "FILE",
    resourceId: fileId,
    detail: `${type} → ${assignee.name} | ${docName}`,
  });

  return NextResponse.json({
    task: { ...task, dueDate: task.dueDate?.toISOString() ?? null },
    duplicateWarning: existing ? "An active task of this type already exists for this file." : null,
  }, { status: 201 });
}

// GET /api/tasks?view=mine|team&status=&type=&assignedToUserId=
export async function GET(req: NextRequest) {
  const session = await requireActiveSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!session.companyId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const companyId = session.companyId;

  const { searchParams } = req.nextUrl;
  const view = searchParams.get("view") ?? "mine";
  const statusFilter = searchParams.get("status");
  const typeFilter = searchParams.get("type");
  const assignedToFilter = searchParams.get("assignedToUserId");

  // Only admins can view team tasks
  if (view === "team" && !isAdminRole(session.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const where: Record<string, unknown> = { companyId };

  if (view === "mine") {
    where.assignedToUserId = session.userId;
    where.status = { not: "COMPLETED" };
  } else {
    // team view — admins can filter
    if (statusFilter) where.status = statusFilter;
    else where.status = { not: "COMPLETED" }; // default: open tasks
    if (typeFilter) where.type = typeFilter;
    if (assignedToFilter) where.assignedToUserId = assignedToFilter;
  }

  const tasks = await prisma.documentTask.findMany({
    where,
    orderBy: [
      { dueDate: "asc" },
      { createdAt: "desc" },
    ],
    select: {
      id: true,
      type: true,
      status: true,
      dueDate: true,
      notes: true,
      createdAt: true,
      completedAt: true,
      file: {
        select: {
          id: true,
          name: true,
          nombreDocumento: true,
          codigo: true,
          versionStr: true,
          mimeType: true,
          status: true,
          folder: { select: { id: true, name: true } },
        },
      },
      assignedTo: { select: { id: true, name: true, email: true } },
      assignedBy: { select: { id: true, name: true, email: true } },
    },
  });

  const now = new Date();
  return NextResponse.json({
    tasks: tasks.map((t) => ({
      ...t,
      dueDate: t.dueDate?.toISOString() ?? null,
      completedAt: t.completedAt?.toISOString() ?? null,
      createdAt: t.createdAt.toISOString(),
      isOverdue: t.dueDate ? t.dueDate < now && t.status !== "COMPLETED" : false,
    })),
  });
}
