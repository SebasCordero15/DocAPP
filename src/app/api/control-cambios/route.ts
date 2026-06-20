import { NextRequest, NextResponse } from "next/server";
import { requireActiveSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET /api/control-cambios — chronological change log for the company
// Aggregates AuditLog + ChangeRequest history visible to the current user
export async function GET(req: NextRequest) {
  const session = await requireActiveSession();
  if (!session || !session.companyId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { companyId, userId, role } = session;
  const isAdmin = role === "COMPANY_ADMIN";

  const { searchParams } = new URL(req.url);
  const q        = searchParams.get("q")?.toLowerCase() ?? "";
  const dateFrom = searchParams.get("dateFrom");
  const dateTo   = searchParams.get("dateTo");
  const page     = Math.max(1, parseInt(searchParams.get("page") ?? "1") || 1);
  const PAGE_SIZE = 50;

  const dateFilter = dateFrom || dateTo ? {
    createdAt: {
      ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
      ...(dateTo   ? { lte: new Date(new Date(dateTo).getTime() + 86_400_000) } : {}),
    },
  } : {};

  // Get all audit logs for the company
  const [auditLogs, changeRequests] = await Promise.all([
    prisma.auditLog.findMany({
      where: {
        companyId,
        ...dateFilter,
        // Only include file/folder related actions for change log
        action: {
          in: [
            "FILE_UPLOAD", "FILE_DELETE", "FILE_REVIEW_COMPLETE", "FILE_REVIEW_UPDATE",
            "FILE_METADATA_UPDATE", "FILE_STATUS_UPDATE",
            "FOLDER_CREATE", "FOLDER_DELETE", "FOLDER_RENAME", "FOLDER_MOVE",
            "CHANGE_REQUEST_APPROVED", "CHANGE_REQUEST_REJECTED",
          ],
        },
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true, action: true, resourceType: true, resourceId: true,
        detail: true, createdAt: true,
        user: { select: { id: true, name: true, email: true } },
      },
    }),
    prisma.changeRequest.findMany({
      where: {
        companyId,
        status: { in: ["APPROVED", "REJECTED"] },
        ...dateFilter,
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true, type: true, status: true, adminNotes: true,
        createdAt: true, reviewedAt: true,
        file: { select: { id: true, name: true, nombreDocumento: true, codigo: true } },
        requestedBy: { select: { id: true, name: true } },
        reviewedBy:  { select: { id: true, name: true } },
      },
    }),
  ]);

  // Get all files visible to this user (for permission filtering)
  let visibleFileIds: Set<string> | null = null;
  if (!isAdmin) {
    // For non-admins, we filter to only files they have READ+ access on
    // Simple approach: get files uploaded by user OR assigned to user
    const userFiles = await prisma.file.findMany({
      where: {
        companyId,
        deletedAt: null,
        OR: [
          { uploadedByUserId: userId },
          { assignedToId: userId },
          { encargadoDocumentoId: userId },
        ],
      },
      select: { id: true },
    });
    // Also get files in folders with explicit permissions
    const filePermissions = await prisma.permission.findMany({
      where: { companyId, userId, resourceType: "FILE" },
      select: { fileId: true },
    });
    visibleFileIds = new Set([
      ...userFiles.map((f) => f.id),
      ...filePermissions.map((p) => p.fileId).filter(Boolean) as string[],
    ]);
  }

  // Build unified entries
  type Entry = {
    id: string;
    tipo: string;
    tipoLabel: string;
    documento: string | null;
    codigo: string | null;
    fileId: string | null;
    quien: string | null;
    fecha: string;
    detalle: string | null;
    estado?: string;
  };

  const AUDIT_LABELS: Record<string, string> = {
    FILE_UPLOAD:              "Subida de archivo",
    FILE_DELETE:              "Eliminación de archivo",
    FILE_REVIEW_COMPLETE:     "Revisión completada",
    FILE_REVIEW_UPDATE:       "Actualización de revisión",
    FILE_METADATA_UPDATE:     "Actualización de metadatos",
    FILE_STATUS_UPDATE:       "Cambio de estado",
    FOLDER_CREATE:            "Carpeta creada",
    FOLDER_DELETE:            "Carpeta eliminada",
    FOLDER_RENAME:            "Carpeta renombrada",
    FOLDER_MOVE:              "Carpeta movida",
    CHANGE_REQUEST_APPROVED:  "Solicitud aprobada",
    CHANGE_REQUEST_REJECTED:  "Solicitud rechazada",
  };

  const CR_TYPE_LABELS: Record<string, string> = {
    NEW_UPLOAD:           "Nueva subida",
    EDIT_METADATA:        "Edición de metadatos",
    REPLACE_FILE:         "Reemplazo de archivo",
    DELETE:               "Eliminación",
    REVISION_DATE_CHANGE: "Cambio de fecha de revisión",
    OTHER:                "Cambio de documento",
  };

  // We need to look up file metadata for audit log entries
  const fileIds = auditLogs
    .filter((l) => l.resourceType === "FILE" && l.resourceId)
    .map((l) => l.resourceId as string);
  const uniqueFileIds = [...new Set(fileIds)];

  const fileMap = new Map<string, { name: string; nombreDocumento: string | null; codigo: string | null }>();
  if (uniqueFileIds.length > 0) {
    const files = await prisma.file.findMany({
      where: { id: { in: uniqueFileIds }, companyId },
      select: { id: true, name: true, nombreDocumento: true, codigo: true },
    });
    for (const f of files) fileMap.set(f.id, f);
  }

  const entries: Entry[] = [];

  // Audit log entries
  for (const l of auditLogs) {
    const fileId = l.resourceType === "FILE" ? l.resourceId : null;
    if (fileId && visibleFileIds && !visibleFileIds.has(fileId)) continue;
    const file = fileId ? fileMap.get(fileId) : null;

    entries.push({
      id: `audit-${l.id}`,
      tipo: l.action,
      tipoLabel: AUDIT_LABELS[l.action] ?? l.action,
      documento: file?.nombreDocumento ?? file?.name ?? l.detail ?? null,
      codigo: file?.codigo ?? null,
      fileId,
      quien: l.user?.name ?? null,
      fecha: l.createdAt.toISOString(),
      detalle: l.detail,
    });
  }

  // Change request history entries
  for (const cr of changeRequests) {
    if (cr.file && visibleFileIds && !visibleFileIds.has(cr.file.id)) continue;
    if (!cr.file && !isAdmin) continue;

    entries.push({
      id: `cr-${cr.id}`,
      tipo: `CR_${cr.type}`,
      tipoLabel: CR_TYPE_LABELS[cr.type] ?? cr.type,
      documento: cr.file?.nombreDocumento ?? cr.file?.name ?? null,
      codigo: cr.file?.codigo ?? null,
      fileId: cr.file?.id ?? null,
      quien: cr.requestedBy.name,
      fecha: cr.createdAt.toISOString(),
      detalle: cr.adminNotes,
      estado: cr.status,
    });
  }

  // Sort by date descending
  entries.sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());

  // Apply search filter
  const filtered = q
    ? entries.filter((e) =>
        (e.documento?.toLowerCase().includes(q) ?? false) ||
        (e.codigo?.toLowerCase().includes(q) ?? false) ||
        (e.tipoLabel.toLowerCase().includes(q)) ||
        (e.quien?.toLowerCase().includes(q) ?? false)
      )
    : entries;

  const total = filtered.length;
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return NextResponse.json({
    entries: paginated,
    total,
    page,
    pageCount: Math.ceil(total / PAGE_SIZE),
  });
}
