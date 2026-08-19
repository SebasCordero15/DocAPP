import { NextRequest, NextResponse } from "next/server";
import { requireActiveSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET /api/reportes — company-wide reporting dashboard for company admins.
// Returns change-request activity stats (legacy) + document-health metrics
// (overdue, due this week, breakdowns by status/department/type/user).
export async function GET(req: NextRequest) {
  const session = await requireActiveSession();
  if (!session || !session.companyId || session.role !== "COMPANY_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { companyId } = session;
  const { searchParams } = new URL(req.url);
  const dateFrom      = searchParams.get("dateFrom");
  const dateTo        = searchParams.get("dateTo");
  const userId        = searchParams.get("userId") || undefined;
  const folderId      = searchParams.get("folderId") || undefined;
  const departamento  = searchParams.get("departamento") || undefined;
  const tipoDocumento = searchParams.get("tipoDocumento") || undefined;
  const encargadoId   = searchParams.get("encargadoId") || undefined;

  const dateFilter = dateFrom || dateTo ? {
    createdAt: {
      ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
      ...(dateTo   ? { lte: new Date(new Date(dateTo).getTime() + 86_400_000) } : {}),
    },
  } : {};

  const [auditLogs, changeRequests, users, folders, departments, documentTypes] = await Promise.all([
    prisma.auditLog.findMany({
      where: {
        companyId,
        ...dateFilter,
        ...(userId ? { userId } : {}),
        action: {
          in: [
            "FILE_UPLOAD", "FILE_DELETE", "FILE_REVIEW_COMPLETE",
            "FILE_REVIEW_UPDATE", "FILE_METADATA_UPDATE",
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
        ...dateFilter,
        ...(userId ? { requestedByUserId: userId } : {}),
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true, type: true, status: true, adminNotes: true, createdAt: true, reviewedAt: true,
        file: { select: { id: true, name: true, nombreDocumento: true, codigo: true } },
        requestedBy: { select: { id: true, name: true, email: true } },
        reviewedBy:  { select: { id: true, name: true } },
      },
    }),
    prisma.user.findMany({
      where: { companyId },
      select: { id: true, name: true, email: true },
      orderBy: { name: "asc" },
    }),
    prisma.folder.findMany({
      where: { companyId, deletedAt: null, isExternal: false },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.department.findMany({
      where: { companyId },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.documentTypeOption.findMany({
      where: { companyId },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  // Summary counts (activity in the selected period)
  const summary = {
    subidas:    auditLogs.filter((l) => l.action === "FILE_UPLOAD").length,
    eliminaciones: auditLogs.filter((l) => l.action === "FILE_DELETE").length,
    revisiones: auditLogs.filter((l) => l.action.startsWith("FILE_REVIEW")).length,
    aprobadas:  changeRequests.filter((cr) => cr.status === "APPROVED").length,
    rechazadas: changeRequests.filter((cr) => cr.status === "REJECTED").length,
    pendientes: changeRequests.filter((cr) => cr.status === "PENDING").length,
  };

  // Detail rows (for export)
  const details = changeRequests.map((cr) => ({
    fecha:       cr.createdAt.toISOString(),
    tipo:        cr.type,
    documento:   cr.file?.nombreDocumento ?? cr.file?.name ?? "—",
    codigo:      cr.file?.codigo ?? "—",
    solicitadoPor: cr.requestedBy.name,
    estado:      cr.status,
    revisadoPor: cr.reviewedBy?.name ?? "—",
    fechaRevision: cr.reviewedAt?.toISOString() ?? "—",
    notas:       cr.adminNotes ?? "—",
  }));

  // ── Document-health metrics ─────────────────────────────────────────────────
  const now = new Date();
  const weekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const docWhere = {
    companyId,
    deletedAt: null,
    OR: [{ folderId: null }, { folder: { isExternal: false } }],
    ...(folderId ? { folderId } : {}),
    ...(departamento ? { departamento } : {}),
    ...(tipoDocumento ? { tipoDocumento } : {}),
    ...(encargadoId ? { encargadoDocumentoId: encargadoId } : {}),
  };

  const docs = await prisma.file.findMany({
    where: docWhere,
    select: {
      id: true, status: true, departamento: true, tipoDocumento: true,
      fechaRevision: true, reviewDueDate: true,
      encargadoDocumento: { select: { id: true, name: true } },
    },
  });

  const dueDateOf = (d: (typeof docs)[number]) => d.fechaRevision ?? d.reviewDueDate;

  const documentosVencidos = docs.filter((d) => {
    const due = dueDateOf(d);
    return due && due < now && d.status !== "OBSOLETE";
  }).length;

  const porRevisarSemana = docs.filter((d) => {
    const due = dueDateOf(d);
    return due && due >= now && due <= weekFromNow && d.status !== "OBSOLETE";
  }).length;

  function countBy(rows: (typeof docs), key: "status" | "departamento" | "tipoDocumento") {
    const counts = new Map<string, number>();
    for (const row of rows) {
      const raw = row[key];
      const label = raw ?? "—";
      counts.set(label, (counts.get(label) ?? 0) + 1);
    }
    return [...counts.entries()]
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count);
  }

  const porEstado       = countBy(docs, "status");
  const porDepartamento = countBy(docs, "departamento").slice(0, 8);
  const porTipo         = countBy(docs, "tipoDocumento").slice(0, 8);

  // Activity per user in the selected period, broken down by action type
  // (from audit logs, independent of document filters) so each number is
  // traceable to something concrete instead of one opaque total.
  interface UserActivity {
    name: string;
    subidas: number;
    eliminaciones: number;
    revisiones: number;
    aprobadas: number;
    rechazadas: number;
    total: number;
  }
  const activityCounts = new Map<string, UserActivity>();
  for (const log of auditLogs) {
    if (!log.user) continue;
    const entry = activityCounts.get(log.user.id) ?? {
      name: log.user.name, subidas: 0, eliminaciones: 0, revisiones: 0, aprobadas: 0, rechazadas: 0, total: 0,
    };
    if (log.action === "FILE_UPLOAD") entry.subidas++;
    else if (log.action === "FILE_DELETE") entry.eliminaciones++;
    else if (log.action.startsWith("FILE_REVIEW")) entry.revisiones++;
    else if (log.action === "CHANGE_REQUEST_APPROVED") entry.aprobadas++;
    else if (log.action === "CHANGE_REQUEST_REJECTED") entry.rechazadas++;
    entry.total++;
    activityCounts.set(log.user.id, entry);
  }
  const actividadUsuarios = [...activityCounts.values()]
    .sort((a, b) => b.total - a.total)
    .slice(0, 8);

  return NextResponse.json({
    summary,
    details,
    users,
    total: details.length,
    filters: { folders, departments, documentTypes },
    docMetrics: {
      totalDocumentos: docs.length,
      documentosVencidos,
      porRevisarSemana,
      porEstado,
      porDepartamento,
      porTipo,
      actividadUsuarios,
    },
  });
}
