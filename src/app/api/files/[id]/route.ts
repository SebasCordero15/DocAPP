import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireActiveSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resolveFileAccess, atLeast } from "@/lib/permissions";
import { canBypassApproval, notifyAdminsOfRequest } from "@/lib/changeRequests";
import { logAction } from "@/lib/audit";

// Fields whose change requires admin approval when made by an EDIT-only user.
const CONTENT_FIELDS = [
  "status", "codigo", "nombreDocumento", "versionStr",
  "fechaEmision", "fechaRevision", "fechaActualizacion",
  "controlCambios", "encargadoDocumentoId",
] as const;

const patchSchema = z.object({
  // Scheduling — always applied immediately regardless of permission level
  reviewDueDate:      z.string().datetime().optional().nullable(),
  reviewIntervalDays: z.number().int().min(1).max(3650).optional().nullable(),
  assignedToId:       z.string().optional().nullable(),
  completeReview:     z.boolean().optional(),
  // Content — require approval when user has only EDIT
  status:               z.enum(["DRAFT", "IN_REVIEW", "REVIEWED"]).optional(),
  codigo:               z.string().max(100).optional().nullable(),
  nombreDocumento:      z.string().max(300).optional().nullable(),
  versionStr:           z.string().max(50).optional().nullable(),
  fechaEmision:         z.string().datetime().optional().nullable(),
  fechaRevision:        z.string().datetime().optional().nullable(),
  fechaActualizacion:   z.string().datetime().optional().nullable(),
  controlCambios:       z.string().max(5000).optional().nullable(),
  encargadoDocumentoId: z.string().optional().nullable(),
}).refine(
  (d) => Object.values(d).some((v) => v !== undefined),
  { message: "Provide at least one field to update" }
);

// PATCH /api/files/[id]
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await requireActiveSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!session.companyId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const companyId = session.companyId;

  if (session.role === "VIEWER") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const file = await prisma.file.findFirst({
    where: { id: params.id, companyId, deletedAt: null },
  });
  if (!file) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const level = await resolveFileAccess(session.userId, companyId, session.role, file.id);
  if (level === "NONE") return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!atLeast(level, "EDIT")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", details: parsed.error.issues }, { status: 400 });
  }

  const {
    reviewDueDate, reviewIntervalDays, assignedToId, completeReview,
    status, codigo, nombreDocumento, versionStr,
    fechaEmision, fechaRevision, fechaActualizacion,
    controlCambios, encargadoDocumentoId,
  } = parsed.data;

  // Validate relational fields regardless of bypass
  if (assignedToId) {
    const exists = await prisma.user.findFirst({ where: { id: assignedToId, companyId, isActive: true } });
    if (!exists) return NextResponse.json({ error: "Assigned user not found" }, { status: 400 });
  }
  if (encargadoDocumentoId) {
    const exists = await prisma.user.findFirst({ where: { id: encargadoDocumentoId, companyId, isActive: true } });
    if (!exists) return NextResponse.json({ error: "Encargado user not found" }, { status: 400 });
  }

  const bypass = canBypassApproval(level, session.role);

  // Identify which content fields are being changed
  const contentPayload: Record<string, unknown> = {};
  for (const f of CONTENT_FIELDS) {
    if (parsed.data[f] !== undefined) contentPayload[f] = parsed.data[f];
  }
  const hasContentChanges = Object.keys(contentPayload).length > 0;

  // ── EDITOR path with content changes → ChangeRequest ─────────────────────
  if (!bypass && hasContentChanges) {
    const docName = file.nombreDocumento || file.name;

    // Snapshot "before" values for only the fields being changed
    const before: Record<string, unknown> = {};
    for (const f of CONTENT_FIELDS) {
      if (parsed.data[f] !== undefined) {
        before[f] = (file as Record<string, unknown>)[f] ?? null;
      }
    }

    const isOnlyFechaRevision =
      Object.keys(contentPayload).length === 1 && contentPayload.fechaRevision !== undefined;

    const crType = isOnlyFechaRevision ? "REVISION_DATE_CHANGE" : "EDIT_METADATA";

    const changeRequest = await prisma.changeRequest.create({
      data: {
        companyId,
        type:              crType,
        fileId:            file.id,
        requestedByUserId: session.userId,
        proposedChanges:   { before, after: contentPayload } as object,
      },
    });

    // Still apply any scheduling fields immediately
    const schedulingUpdate: Record<string, unknown> = {};
    let nextDueDate: Date | null | undefined;
    if (completeReview) {
      const intervalDays = reviewIntervalDays ?? file.reviewIntervalDays;
      nextDueDate = intervalDays ? new Date(Date.now() + intervalDays * 86_400_000) : null;
    } else if (reviewDueDate !== undefined) {
      nextDueDate = reviewDueDate ? new Date(reviewDueDate) : null;
    }
    if (nextDueDate !== undefined)    schedulingUpdate.reviewDueDate    = nextDueDate;
    if (reviewIntervalDays !== undefined) schedulingUpdate.reviewIntervalDays = reviewIntervalDays;
    if (assignedToId !== undefined)   schedulingUpdate.assignedToId    = assignedToId;

    if (Object.keys(schedulingUpdate).length > 0) {
      await prisma.file.update({ where: { id: file.id }, data: schedulingUpdate });
    }

    await Promise.all([
      notifyAdminsOfRequest({ companyId, fileId: file.id, docName, type: crType }),
      logAction({ companyId, userId: session.userId, action: "CHANGE_REQUEST_CREATED", resourceType: "FILE", resourceId: file.id, detail: `${crType} | ${docName}` }),
    ]);

    return NextResponse.json({ changeRequest, requiresApproval: true }, { status: 202 });
  }

  // ── MANAGE/Admin path (or scheduling-only EDIT): apply directly ───────────
  let nextDueDate: Date | null | undefined;
  if (completeReview) {
    const intervalDays = reviewIntervalDays ?? file.reviewIntervalDays;
    nextDueDate = intervalDays ? new Date(Date.now() + intervalDays * 86_400_000) : null;
  } else if (reviewDueDate !== undefined) {
    nextDueDate = reviewDueDate ? new Date(reviewDueDate) : null;
  }

  const updateData: Record<string, unknown> = {};
  if (nextDueDate !== undefined)         updateData.reviewDueDate       = nextDueDate;
  if (reviewIntervalDays !== undefined)  updateData.reviewIntervalDays  = reviewIntervalDays;
  if (assignedToId !== undefined)        updateData.assignedToId        = assignedToId;
  if (status !== undefined)             updateData.status               = status;
  if (codigo !== undefined)             updateData.codigo               = codigo;
  if (nombreDocumento !== undefined)    updateData.nombreDocumento      = nombreDocumento;
  if (versionStr !== undefined)         updateData.versionStr           = versionStr;
  if (fechaEmision !== undefined)       updateData.fechaEmision         = fechaEmision ? new Date(fechaEmision) : null;
  if (fechaRevision !== undefined)      updateData.fechaRevision        = fechaRevision ? new Date(fechaRevision) : null;
  if (fechaActualizacion !== undefined) updateData.fechaActualizacion   = fechaActualizacion ? new Date(fechaActualizacion) : null;
  if (controlCambios !== undefined)     updateData.controlCambios       = controlCambios;
  if (encargadoDocumentoId !== undefined) updateData.encargadoDocumentoId = encargadoDocumentoId;

  const updated = await prisma.file.update({
    where: { id: file.id },
    data: updateData,
    select: {
      id: true, reviewDueDate: true, reviewIntervalDays: true,
      assignedToId: true, assignedTo: { select: { id: true, name: true, email: true } },
    },
  });

  const action = completeReview ? "FILE_REVIEW_COMPLETE" : "FILE_REVIEW_UPDATE";
  await logAction({ companyId, userId: session.userId, action, resourceType: "FILE", resourceId: file.id, detail: file.name });

  return NextResponse.json({ ...updated, reviewDueDate: updated.reviewDueDate?.toISOString() ?? null });
}

// DELETE /api/files/[id]
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await requireActiveSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!session.companyId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const companyId = session.companyId;

  if (session.role === "VIEWER") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const file = await prisma.file.findFirst({
    where: { id: params.id, companyId, deletedAt: null },
  });
  if (!file) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const level = await resolveFileAccess(session.userId, companyId, session.role, file.id);
  if (level === "NONE") return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!atLeast(level, "EDIT")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const bypass = canBypassApproval(level, session.role);

  // ── EDITOR path: create ChangeRequest, do NOT delete ─────────────────────
  if (!bypass) {
    const docName = file.nombreDocumento || file.name;
    const changeRequest = await prisma.changeRequest.create({
      data: {
        companyId,
        type:              "DELETE",
        fileId:            file.id,
        requestedByUserId: session.userId,
        proposedChanges:   { fileName: file.name, storageKey: file.storageKey },
      },
    });

    await Promise.all([
      notifyAdminsOfRequest({ companyId, fileId: file.id, docName, type: "DELETE" }),
      logAction({ companyId, userId: session.userId, action: "CHANGE_REQUEST_CREATED", resourceType: "FILE", resourceId: file.id, detail: `DELETE | ${docName}` }),
    ]);

    return NextResponse.json({ changeRequest, requiresApproval: true }, { status: 202 });
  }

  // ── MANAGE/Admin path: soft delete immediately ────────────────────────────
  await prisma.file.update({
    where: { id: file.id },
    data: { deletedAt: new Date() },
  });

  await logAction({ companyId, userId: session.userId, action: "FILE_DELETE", resourceType: "FILE", resourceId: file.id, detail: file.name });

  return NextResponse.json({ ok: true });
}
