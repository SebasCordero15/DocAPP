import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireActiveSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resolveFileAccess, atLeast, isAdminRole } from "@/lib/permissions";
import { logAction } from "@/lib/audit";

const createSchema = z.object({
  fileId:           z.string().min(1),
  type:             z.enum(["ACTUALIZACION", "REVISION", "CORRECCION"]),
  instructions:     z.string().max(5000).optional().nullable(),
  correctionFields: z.object({
    nombre:   z.boolean().default(false),
    contenido: z.boolean().default(false),
    area:     z.boolean().default(false),
    carpeta:  z.boolean().default(false),
    otro:     z.string().max(500).nullable().optional(),
  }).optional().nullable(),
  assigneeIds: z.array(z.string().min(1)).min(1).max(10),
  dueDate:     z.string().datetime().optional().nullable(),
});

// POST /api/outgoing-requests — admin creates an outgoing request
export async function POST(req: NextRequest) {
  const session = await requireActiveSession();
  if (!session || !session.companyId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdminRole(session.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { companyId, userId } = session;

  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos", details: parsed.error.issues }, { status: 400 });

  const { fileId, type, instructions, correctionFields, assigneeIds, dueDate } = parsed.data;

  if (type === "CORRECCION" && !instructions?.trim()) {
    return NextResponse.json({ error: "Las instrucciones son obligatorias para una corrección" }, { status: 400 });
  }
  if (type === "CORRECCION" && correctionFields) {
    const anyChecked = correctionFields.nombre || correctionFields.contenido || correctionFields.area || correctionFields.carpeta || correctionFields.otro?.trim();
    if (!anyChecked) return NextResponse.json({ error: "Debes especificar qué corregir" }, { status: 400 });
  }

  const file = await prisma.file.findFirst({
    where: { id: fileId, companyId, deletedAt: null, status: "REVIEWED" },
    select: { id: true, name: true, nombreDocumento: true, folderId: true },
  });
  if (!file) return NextResponse.json({ error: "Documento no encontrado o no está aprobado" }, { status: 404 });

  // Check assignees are valid active company users
  const assignees = await prisma.user.findMany({
    where: { id: { in: assigneeIds }, companyId, isActive: true },
    select: { id: true, name: true },
  });
  if (assignees.length !== assigneeIds.length) {
    return NextResponse.json({ error: "Uno o más asignados no son válidos" }, { status: 400 });
  }
  const orderedAssignees = assigneeIds.map((id) => assignees.find((u) => u.id === id)!);

  // Check edit permissions per assignee — warn but don't block
  const permissionWarnings: { userId: string; name: string; currentLevel: string }[] = [];
  for (const a of orderedAssignees) {
    const level = await resolveFileAccess(a.id, companyId, "EDITOR", fileId);
    if (!atLeast(level, "EDIT")) {
      permissionWarnings.push({ userId: a.id, name: a.name, currentLevel: level });
    }
  }

  const docName = file.nombreDocumento || file.name;
  const taskType = type === "REVISION" ? "REVIEW" : type === "ACTUALIZACION" ? "UPDATE" : "OTHER";
  const dueDateParsed = dueDate ? new Date(dueDate) : null;

  const result = await prisma.$transaction(async (tx) => {
    const outgoing = await tx.outgoingRequest.create({
      data: {
        companyId,
        fileId,
        type,
        status:           "PENDING",
        instructions:     instructions ?? null,
        correctionFields: correctionFields ?? undefined,
        currentStep:      1,
        totalSteps:       orderedAssignees.length,
        createdByUserId:  userId,
      },
    });

    const tasks = await Promise.all(
      orderedAssignees.map((assignee, idx) =>
        tx.documentTask.create({
          data: {
            companyId,
            fileId,
            assignedToUserId:  assignee.id,
            assignedByUserId:  userId,
            type:              taskType as "REVIEW" | "UPDATE" | "OTHER",
            status:            "PENDING",
            dueDate:           dueDateParsed,
            outgoingRequestId: outgoing.id,
            stepOrder:         idx + 1,
          },
        })
      )
    );

    const typeLabel = type === "ACTUALIZACION" ? "actualización" : type === "REVISION" ? "revisión" : "corrección";
    await tx.notification.create({
      data: {
        companyId,
        userId:  orderedAssignees[0].id,
        type:    "OUTGOING_REQUEST_ASSIGNED",
        message: `El administrador te solicitó una ${typeLabel} del documento "${docName}"`,
        fileId,
      },
    });

    return { outgoing, tasks };
  });

  await logAction({
    companyId, userId, action: "OUTGOING_REQUEST_CREATED",
    resourceType: "FILE", resourceId: fileId,
    detail: `${type} → ${orderedAssignees.map((a) => a.name).join(", ")} | ${docName}`,
  });

  return NextResponse.json({ outgoingRequest: result.outgoing, permissionWarnings }, { status: 201 });
}

// GET /api/outgoing-requests — admin lists all outgoing requests
export async function GET(req: NextRequest) {
  const session = await requireActiveSession();
  if (!session || !session.companyId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdminRole(session.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { companyId } = session;
  const statusFilter = req.nextUrl.searchParams.get("status");

  const where: Record<string, unknown> = { companyId };
  if (statusFilter) {
    where.status = statusFilter;
  }

  const outgoing = await prisma.outgoingRequest.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      file:         { select: { id: true, name: true, nombreDocumento: true, codigo: true, mimeType: true, versionStr: true } },
      createdBy:    { select: { id: true, name: true } },
      finalReviewer: { select: { id: true, name: true } },
      tasks: {
        select: {
          id: true, stepOrder: true, status: true,
          assignedTo: { select: { id: true, name: true, email: true } },
        },
        orderBy: { stepOrder: "asc" },
      },
    },
  });

  return NextResponse.json({
    outgoingRequests: outgoing.map((o) => ({
      ...o,
      createdAt:      o.createdAt.toISOString(),
      updatedAt:      o.updatedAt.toISOString(),
      finalReviewedAt: o.finalReviewedAt?.toISOString() ?? null,
    })),
  });
}
