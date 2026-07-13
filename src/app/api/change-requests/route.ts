import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireActiveSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isAdminRole, resolveFileAccess, atLeast } from "@/lib/permissions";
import { notifyAdminsOfRequest } from "@/lib/changeRequests";
import { logAction } from "@/lib/audit";

// GET /api/change-requests?view=mine|pending
export async function GET(req: NextRequest) {
  const session = await requireActiveSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!session.companyId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { companyId, userId, role } = session;

  const view = req.nextUrl.searchParams.get("view") ?? "mine";

  if (view === "pending") {
    if (!isAdminRole(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const changeRequests = await prisma.changeRequest.findMany({
      where: { companyId, status: "PENDING" },
      orderBy: { createdAt: "asc" },
      include: {
        file:        { select: { id: true, name: true, nombreDocumento: true, codigo: true, storageKey: true, versionStr: true } },
        requestedBy: { select: { id: true, name: true, email: true } },
      },
    });
    return NextResponse.json({
      changeRequests: changeRequests.map((cr) => ({
        ...cr,
        createdAt:  cr.createdAt.toISOString(),
        reviewedAt: cr.reviewedAt?.toISOString() ?? null,
      })),
    });
  }

  // view=mine — return current user's own requests
  const changeRequests = await prisma.changeRequest.findMany({
    where: { companyId, requestedByUserId: userId },
    orderBy: { createdAt: "desc" },
    include: {
      file: { select: { id: true, name: true, nombreDocumento: true, codigo: true, mimeType: true } },
    },
  });

  return NextResponse.json({
    changeRequests: changeRequests.map((cr) => ({
      ...cr,
      createdAt:  cr.createdAt.toISOString(),
      reviewedAt: cr.reviewedAt?.toISOString() ?? null,
    })),
  });
}

const postSchema = z.object({
  fileId:              z.string().min(1),
  tipo:                z.enum(["REVISION", "ACTUALIZACION", "CORRECCION"]),
  motivo:              z.string().min(1).max(2000),
  proposalStorageKey:  z.string().optional().nullable(),
  proposalFileName:    z.string().optional().nullable(),
});

// POST /api/change-requests — user submits a REVISION_REQUEST
export async function POST(req: NextRequest) {
  const session = await requireActiveSession();
  if (!session || !session.companyId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { companyId, userId, role } = session;

  const body = await req.json().catch(() => null);
  const parsed = postSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const { fileId, tipo, motivo, proposalStorageKey, proposalFileName } = parsed.data;

  const file = await prisma.file.findFirst({
    where: { id: fileId, companyId, deletedAt: null },
  });
  if (!file) return NextResponse.json({ error: "Documento no encontrado" }, { status: 404 });

  // Require EDIT permission on the specific document
  const level = await resolveFileAccess(userId, companyId, role, fileId);
  if (!atLeast(level, "EDIT")) {
    return NextResponse.json(
      { error: "No tienes permisos para solicitar cambios en este documento. Se requiere permiso de edición." },
      { status: 403 }
    );
  }

  const docName = file.nombreDocumento || file.name;

  const cr = await prisma.changeRequest.create({
    data: {
      companyId,
      type:              "REVISION_REQUEST",
      fileId,
      requestedByUserId: userId,
      proposedChanges:   {
        tipo,
        motivo,
        proposalStorageKey: proposalStorageKey ?? null,
        proposalFileName:   proposalFileName   ?? null,
      } as object,
    },
  });

  await Promise.all([
    notifyAdminsOfRequest({ companyId, fileId, docName, type: "REVISION_REQUEST" }),
    logAction({ companyId, userId, action: "CHANGE_REQUEST_CREATED", resourceType: "FILE", resourceId: fileId, detail: `REVISION_REQUEST | ${tipo} | ${docName}` }),
  ]);

  return NextResponse.json({ changeRequest: cr, requiresApproval: true }, { status: 202 });
}
