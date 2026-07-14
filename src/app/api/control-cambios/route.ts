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
  const q            = searchParams.get("q")?.toLowerCase() ?? "";
  const codigoFilter = searchParams.get("codigo")?.toLowerCase() ?? "";
  const nombreFilter = searchParams.get("nombre")?.toLowerCase() ?? "";
  const dateFrom     = searchParams.get("dateFrom");
  const dateTo       = searchParams.get("dateTo");
  const page         = Math.max(1, parseInt(searchParams.get("page") ?? "1") || 1);
  const PAGE_SIZE = 50;

  const dateFilter = dateFrom || dateTo ? {
    createdAt: {
      ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
      ...(dateTo   ? { lte: new Date(new Date(dateTo).getTime() + 86_400_000) } : {}),
    },
  } : {};

  const orDateFilter = dateFrom || dateTo ? {
    finalReviewedAt: {
      ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
      ...(dateTo   ? { lte: new Date(new Date(dateTo).getTime() + 86_400_000) } : {}),
    },
  } : {};

  // Get all audit logs for the company
  const [auditLogs, changeRequests, outgoingApproved] = await Promise.all([
    prisma.auditLog.findMany({
      where: {
        companyId,
        ...dateFilter,
        // Document-only actions (folder ops excluded from version history)
        action: {
          in: [
            "FILE_UPLOAD", "FILE_DELETE", "FILE_REVIEW_COMPLETE", "FILE_REVIEW_UPDATE",
            "FILE_METADATA_UPDATE", "FILE_STATUS_UPDATE", "FILE_OBSOLETE",
            "OUTGOING_REQUEST_RETURNED", "OUTGOING_REQUEST_CORRECTED",
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
        proposedChanges: true,
        createdAt: true, reviewedAt: true,
        file: { select: { id: true, name: true, nombreDocumento: true, codigo: true, versionStr: true } },
        requestedBy: { select: { id: true, name: true } },
        reviewedBy:  { select: { id: true, name: true } },
      },
    }),
    prisma.outgoingRequest.findMany({
      where: {
        companyId,
        status: "APPROVED",
        finalReviewedAt: { not: null },
        ...orDateFilter,
      },
      orderBy: { finalReviewedAt: "desc" },
      select: {
        id: true, type: true, instructions: true, outcomeType: true,
        finalReviewedAt: true, pendingVersionStr: true,
        file:          { select: { id: true, name: true, nombreDocumento: true, codigo: true, versionStr: true } },
        finalReviewer: { select: { id: true, name: true } },
        createdBy:     { select: { id: true, name: true } },
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
    version?: string | null;
    estado?: string;
  };

  const AUDIT_LABELS: Record<string, string> = {
    FILE_UPLOAD:                   "Archivo subido",
    FILE_DELETE:                   "Archivo eliminado",
    FILE_REVIEW_COMPLETE:          "Revisión completada",
    FILE_REVIEW_UPDATE:            "Revisión programada",
    FILE_METADATA_UPDATE:          "Metadatos actualizados",
    FILE_STATUS_UPDATE:            "Estado actualizado",
    FILE_OBSOLETE:                 "Archivado como obsoleto",
    FOLDER_CREATE:                 "Carpeta creada",
    FOLDER_DELETE:                 "Carpeta eliminada",
    FOLDER_RENAME:                 "Carpeta renombrada",
    FOLDER_MOVE:                   "Carpeta movida",
    OUTGOING_REQUEST_RETURNED:     "Entrega devuelta",
    OUTGOING_REQUEST_CORRECTED:    "Entrega corregida y reenviada",
  };

  function resolveLabel(action: string, detail: string | null): string {
    const base = AUDIT_LABELS[action] ?? action;
    if (!detail) return base;
    if (action === "FILE_UPLOAD" && detail.includes("solicitud saliente")) return "Nueva versión subida";
    if (action === "FILE_METADATA_UPDATE" && detail.includes("Corrección aprobada")) return "Corrección aplicada";
    return base;
  }

  // Build a human-readable Spanish description for audit detail strings
  function buildAuditDesc(action: string, detail: string | null): string | null {
    if (!detail) return null;
    // Field diff strings (in Spanish): "Nombre: 'x' → 'y' | Versión: ..." — normalize pipe separators
    if (detail.includes(" → ")) return detail.replace(/ \| /g, " · ");
    // Already Spanish narrative strings
    if (detail.startsWith("Archivado")) return detail;
    // STATUS_UPDATE may have a useful label
    if (action === "FILE_STATUS_UPDATE") return detail;
    // Return/correction events store meaningful detail directly
    if (action === "OUTGOING_REQUEST_RETURNED" || action === "OUTGOING_REQUEST_CORRECTED") return detail;
    return null;
  }

  const FIELD_LABELS_CC: Record<string, string> = {
    nombreDocumento:      "Nombre",
    versionStr:           "Versión",
    codigo:               "Código",
    fechaEmision:         "Fecha de emisión",
    fechaRevision:        "Fecha de revisión",
    fechaActualizacion:   "Fecha de actualización",
    controlCambios:       "Control de cambios",
    encargadoDocumentoId: "Encargado",
    status:               "Estado",
  };

  const STATUS_LABELS: Record<string, string> = {
    DRAFT: "Borrador", IN_REVIEW: "En revisión", REVIEWED: "Revisado",
    PENDING_APPROVAL: "Pendiente de aprobación", OBSOLETE: "Obsoleto",
  };

  function fmtVal(val: unknown): string {
    if (val == null) return "—";
    if (typeof val === "string" && val.match(/^\d{4}-\d{2}-\d{2}/)) {
      return new Date(val).toLocaleDateString("es-CR", { day: "2-digit", month: "2-digit", year: "numeric" });
    }
    if (typeof val === "string" && STATUS_LABELS[val]) return STATUS_LABELS[val];
    return String(val);
  }

  const TIPO_CAMBIO_LABELS: Record<string, string> = {
    REVISION: "Revisión", ACTUALIZACION: "Actualización", CORRECCION: "Corrección",
  };

  function buildCRDetail(cr: { type: string; proposedChanges: unknown; adminNotes: string | null }): string | null {
    const pc = cr.proposedChanges as Record<string, unknown> | null;

    if (cr.type === "EDIT_METADATA" || cr.type === "REVISION_DATE_CHANGE") {
      const before = pc?.before as Record<string, unknown> | undefined;
      const after  = pc?.after  as Record<string, unknown> | undefined;
      if (before && after) {
        const parts = Object.entries(after).map(([k, v]) => {
          const label = FIELD_LABELS_CC[k] ?? k;
          return `${label}: "${fmtVal(before[k])}" → "${fmtVal(v)}"`;
        });
        if (parts.length > 0) {
          const diff = parts.join(" · ");
          return cr.adminNotes ? `${diff} — Nota: ${cr.adminNotes}` : diff;
        }
      }
    }

    if (cr.type === "REVISION_REQUEST") {
      const tipo   = pc?.tipo   as string | undefined;
      const motivo = pc?.motivo as string | undefined;
      const parts: string[] = [];
      if (tipo)   parts.push(`Tipo: ${TIPO_CAMBIO_LABELS[tipo] ?? tipo}`);
      if (motivo) parts.push(motivo.length > 120 ? motivo.slice(0, 117) + "…" : motivo);
      if (cr.adminNotes) parts.push(`Nota admin: ${cr.adminNotes}`);
      return parts.length > 0 ? parts.join(" · ") : null;
    }

    if (cr.type === "DELETE") {
      return cr.adminNotes ? `Nota: ${cr.adminNotes}` : null;
    }

    if (cr.type === "NEW_UPLOAD") {
      const name = pc?.name as string | undefined;
      return name ?? cr.adminNotes ?? null;
    }

    if (cr.type === "REPLACE_FILE") {
      return cr.adminNotes ?? null;
    }

    if (cr.type === "OTHER") {
      const updates = pc?.proposedFileUpdates as Record<string, unknown> | undefined;
      if (updates) {
        const parts = Object.entries(updates).map(([k, v]) => `${FIELD_LABELS_CC[k] ?? k}: ${fmtVal(v)}`);
        const diff = parts.join(" · ");
        return cr.adminNotes ? `${diff} — Nota: ${cr.adminNotes}` : diff;
      }
      return cr.adminNotes ?? null;
    }

    return cr.adminNotes ?? null;
  }

  const CR_TYPE_LABELS: Record<string, string> = {
    NEW_UPLOAD:           "Archivo nuevo",
    EDIT_METADATA:        "Edición de metadatos",
    REPLACE_FILE:         "Reemplazo de archivo",
    DELETE:               "Solicitud de eliminación",
    REVISION_DATE_CHANGE: "Cambio de fecha de revisión",
    OTHER:                "Cambio de documento",
    REVISION_REQUEST:     "Propuesta de revisión",
  };

  // We need to look up file metadata for audit log entries
  const fileIds = auditLogs
    .filter((l) => l.resourceType === "FILE" && l.resourceId)
    .map((l) => l.resourceId as string);
  const uniqueFileIds = [...new Set(fileIds)];

  const fileMap = new Map<string, { name: string; nombreDocumento: string | null; codigo: string | null; versionStr: string | null }>();
  if (uniqueFileIds.length > 0) {
    const files = await prisma.file.findMany({
      where: { id: { in: uniqueFileIds }, companyId },
      select: { id: true, name: true, nombreDocumento: true, codigo: true, versionStr: true },
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
      tipoLabel: resolveLabel(l.action, l.detail),
      documento: file?.nombreDocumento ?? file?.name ?? null,
      codigo: file?.codigo ?? null,
      fileId,
      quien: l.user?.name ?? null,
      fecha: l.createdAt.toISOString(),
      detalle: buildAuditDesc(l.action, l.detail),
      version: fileId ? (fileMap.get(fileId)?.versionStr ?? null) : null,
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
      detalle: buildCRDetail(cr),
      version: cr.file?.versionStr ?? null,
      estado: cr.status,
    });
  }

  // Approved outgoing requests (version change history)
  const OR_TYPE_LABELS: Record<string, string> = {
    ACTUALIZACION: "Actualización aprobada",
    REVISION:      "Revisión aprobada",
    CORRECCION:    "Corrección aprobada",
  };

  for (const or of outgoingApproved) {
    if (!or.finalReviewedAt) continue;
    if (or.file && visibleFileIds && !visibleFileIds.has(or.file.id)) continue;
    if (!or.file && !isAdmin) continue;

    entries.push({
      id: `or-${or.id}`,
      tipo: `OR_${or.type}`,
      tipoLabel: OR_TYPE_LABELS[or.type] ?? or.type,
      documento: or.file?.nombreDocumento ?? or.file?.name ?? null,
      codigo: or.file?.codigo ?? null,
      fileId: or.file?.id ?? null,
      quien: or.finalReviewer?.name ?? or.createdBy?.name ?? null,
      fecha: or.finalReviewedAt.toISOString(),
      detalle: or.instructions ?? null,
      version: or.pendingVersionStr ?? or.file?.versionStr ?? null,
    });
  }

  // Sort by date descending
  entries.sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());

  // Apply search + dedicated filters
  const filtered = entries.filter((e) => {
    if (codigoFilter && !(e.codigo?.toLowerCase().includes(codigoFilter) ?? false)) return false;
    if (nombreFilter && !(e.documento?.toLowerCase().includes(nombreFilter) ?? false)) return false;
    if (q && !(
      (e.documento?.toLowerCase().includes(q) ?? false) ||
      (e.codigo?.toLowerCase().includes(q) ?? false) ||
      e.tipoLabel.toLowerCase().includes(q) ||
      (e.quien?.toLowerCase().includes(q) ?? false) ||
      (e.detalle?.toLowerCase().includes(q) ?? false)
    )) return false;
    return true;
  });

  const total = filtered.length;
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return NextResponse.json({
    entries: paginated,
    total,
    page,
    pageCount: Math.ceil(total / PAGE_SIZE),
  });
}
