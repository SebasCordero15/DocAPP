import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireActiveSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isAdminRole } from "@/lib/permissions";
import { notifyRequesterOfReview } from "@/lib/changeRequests";
import { deleteObject } from "@/lib/storage";
import { logAction } from "@/lib/audit";

const DATE_FIELDS = new Set(["fechaEmision", "fechaRevision", "fechaActualizacion"]);

const schema = z.object({
  action:           z.enum(["APPROVE", "REJECT"]),
  adminNotes:       z.string().max(2000).optional().nullable(),
  assignedCodigo:   z.string().max(50).optional().nullable(),
  adminVersionStr:  z.string().max(50).optional().nullable(),
});

// POST /api/change-requests/[id]/review — admin approve or reject a ChangeRequest
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await requireActiveSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!session.companyId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!isAdminRole(session.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { companyId, userId } = session;

  const cr = await prisma.changeRequest.findFirst({
    where: { id: params.id, companyId, status: "PENDING" },
    include: {
      file:        true,
      requestedBy: { select: { id: true, name: true } },
    },
  });
  if (!cr) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const { action, adminNotes, assignedCodigo, adminVersionStr } = parsed.data;

  if (action === "REJECT" && !adminNotes?.trim()) {
    return NextResponse.json({ error: "adminNotes is required for rejection" }, { status: 400 });
  }

  const pc   = cr.proposedChanges as Record<string, unknown>;
  const now  = new Date();
  const docName = cr.file?.nombreDocumento || cr.file?.name || "Documento";

  // ── APPROVE ────────────────────────────────────────────────────────────────
  if (action === "APPROVE") {
    if (cr.fileId) {
      if (cr.type === "NEW_UPLOAD") {
        // If admin assigns a código, validate uniqueness first
        if (assignedCodigo) {
          const existing = await prisma.file.findFirst({
            where: { companyId, codigo: assignedCodigo, id: { not: cr.fileId } },
          });
          if (existing) {
            return NextResponse.json({ error: `El código "${assignedCodigo}" ya está en uso.` }, { status: 409 });
          }
        }
        await prisma.file.update({
          where: { id: cr.fileId },
          data: {
            status: "REVIEWED",
            ...(assignedCodigo ? { codigo: assignedCodigo } : {}),
            ...(adminVersionStr?.trim() ? { versionStr: adminVersionStr.trim() } : {}),
          },
        });

      } else if (cr.type === "EDIT_METADATA" || cr.type === "REVISION_DATE_CHANGE") {
        const after = pc.after as Record<string, unknown> | undefined;
        if (after) {
          const updateData: Record<string, unknown> = {};
          for (const [k, v] of Object.entries(after)) {
            updateData[k] = DATE_FIELDS.has(k) && typeof v === "string" ? new Date(v) : v;
          }
          if (adminVersionStr?.trim()) updateData.versionStr = adminVersionStr.trim();
          await prisma.file.update({ where: { id: cr.fileId }, data: updateData });
        } else if (adminVersionStr?.trim()) {
          await prisma.file.update({ where: { id: cr.fileId }, data: { versionStr: adminVersionStr.trim() } });
        }

      } else if (cr.type === "DELETE") {
        await prisma.file.update({ where: { id: cr.fileId }, data: { deletedAt: now } });

      } else if (cr.type === "OTHER") {
        const updates = pc.proposedFileUpdates as Record<string, unknown> | undefined;
        if (updates || adminVersionStr?.trim()) {
          const updateData: Record<string, unknown> = {};
          if (updates) {
            for (const [k, v] of Object.entries(updates)) {
              updateData[k] = DATE_FIELDS.has(k) && typeof v === "string" ? new Date(v) : v;
            }
          }
          if (adminVersionStr?.trim()) updateData.versionStr = adminVersionStr.trim();
          await prisma.file.update({ where: { id: cr.fileId }, data: updateData });
        }
      }
    }

    await prisma.changeRequest.update({
      where: { id: cr.id },
      data: { status: "APPROVED", reviewedByUserId: userId, reviewedAt: now, adminNotes: adminNotes ?? null },
    });

    await notifyRequesterOfReview({
      companyId, requestedByUserId: cr.requestedByUserId,
      fileId: cr.fileId, docName, type: cr.type, approved: true, adminNotes,
    });

    await logAction({
      companyId, userId, action: "CHANGE_REQUEST_APPROVED",
      resourceType: "FILE", resourceId: cr.fileId ?? cr.id,
      detail: `${cr.type} | ${docName}`,
    });

    return NextResponse.json({ ok: true, action: "APPROVED" });
  }

  // ── REJECT ─────────────────────────────────────────────────────────────────
  let notifyFileId: string | null = cr.fileId;

  if (cr.type === "NEW_UPLOAD" && cr.fileId) {
    const storageKey = pc.storageKey as string | undefined;
    // Delete file record first — this nulls cr.fileId in DB via onDelete:SetNull
    await prisma.file.delete({ where: { id: cr.fileId } });
    if (storageKey) { try { await deleteObject(storageKey); } catch { /* non-fatal */ } }
    notifyFileId = null; // file is gone, don't link notification to it
  } else if (cr.type === "REPLACE_FILE") {
    const newKey = pc.newStorageKey as string | undefined;
    if (newKey) { try { await deleteObject(newKey); } catch { /* non-fatal */ } }
  }

  await prisma.changeRequest.update({
    where: { id: cr.id },
    data: { status: "REJECTED", reviewedByUserId: userId, reviewedAt: now, adminNotes: adminNotes ?? null },
  });

  await notifyRequesterOfReview({
    companyId, requestedByUserId: cr.requestedByUserId,
    fileId: notifyFileId, docName, type: cr.type, approved: false, adminNotes,
  });

  await logAction({
    companyId, userId, action: "CHANGE_REQUEST_REJECTED",
    resourceType: "FILE", resourceId: cr.fileId ?? cr.id,
    detail: `${cr.type} | ${docName} | ${adminNotes}`,
  });

  return NextResponse.json({ ok: true, action: "REJECTED" });
}
