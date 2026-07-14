import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireActiveSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logAction } from "@/lib/audit";

const schema = z.object({
  instructions: z.string().min(1, "El cambio a realizar es obligatorio").max(5000),
  // Optional replacement file (for ACTUALIZACION / CORRECCION types)
  storageKey:  z.string().optional().nullable(),
  fileName:    z.string().optional().nullable(),
  mimeType:    z.string().optional().nullable(),
  size:        z.number().int().positive().optional().nullable(),
  versionStr:  z.string().optional().nullable(),
});

// POST /api/outgoing-requests/[id]/correct
// Submitter corrects a RETURNED request and resubmits it for admin approval.
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await requireActiveSession();
  if (!session || !session.companyId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { companyId, userId } = session;

  const outgoing = await prisma.outgoingRequest.findFirst({
    where: { id: params.id, companyId, status: "RETURNED" },
    include: {
      file:  { select: { id: true, name: true, nombreDocumento: true } },
      tasks: { select: { assignedToUserId: true } },
    },
  });

  if (!outgoing) {
    return NextResponse.json({ error: "Solicitud no encontrada o no está devuelta" }, { status: 404 });
  }

  const isAssignee = outgoing.tasks.some((t) => t.assignedToUserId === userId);
  if (!isAssignee) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.errors[0]?.message ?? "Datos inválidos" }, { status: 400 });

  const { instructions, storageKey, fileName, mimeType, size, versionStr } = parsed.data;
  const docName = outgoing.file?.nombreDocumento ?? outgoing.file?.name ?? "Documento";

  const updateData: Record<string, unknown> = {
    instructions,
    status:                "PENDING_APPROVAL",
    finalNotes:            null,
    finalReviewedByUserId: null,
    finalReviewedAt:       null,
  };

  // If a replacement file was uploaded, update the pending file fields
  if (storageKey && fileName && mimeType && size) {
    updateData.pendingStorageKey  = storageKey;
    updateData.pendingFileName    = fileName;
    updateData.pendingMimeType    = mimeType;
    updateData.pendingSize        = size;
    if (versionStr) updateData.pendingVersionStr = versionStr;
    // Ensure outcomeType reflects that a new file is present
    if (outgoing.type === "ACTUALIZACION") updateData.outcomeType = "new_version";
    if (outgoing.type === "CORRECCION")    updateData.outcomeType = "corrected";
  }

  await prisma.outgoingRequest.update({
    where: { id: params.id },
    data: updateData,
  });

  const truncated = instructions.length > 150 ? instructions.slice(0, 147) + "…" : instructions;
  await logAction({
    companyId, userId, action: "OUTGOING_REQUEST_CORRECTED",
    resourceType: "FILE", resourceId: outgoing.fileId,
    detail: truncated,
  });

  return NextResponse.json({ ok: true });
}
