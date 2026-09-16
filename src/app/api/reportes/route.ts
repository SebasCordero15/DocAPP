import { NextRequest, NextResponse } from "next/server";
import { requireActiveSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET /api/reportes — company-wide reporting dashboard for company admins.
//
// Sections returned:
//   summary      — legacy change-request activity counters for the period
//   docMetrics   — document health (overdue, due-soon, breakdowns, compliance)
//   aprobaciones — approval-flow visibility: what's stuck waiting on someone,
//                  who resolved what and how fast (bottleneck detection),
//                  plus a 12-month turnaround trend
//   cambios      — unified change/version history (change requests, approved
//                  outgoing requests = version bumps, direct deletions and
//                  obsolete archiving) — one export covers "qué cambió,
//                  quién, cuándo y por qué" for any document
//   activityLog  — raw per-user audit trail
//   tendenciaMensual — trailing 12-month activity counts, for period comparison
//
// This module is self-contained and intentionally does not share logic with
// the separate Archivo Histórico / Control de Cambios pages.
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

  const now = new Date();

  const dateFilter = dateFrom || dateTo ? {
    createdAt: {
      ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
      ...(dateTo   ? { lte: new Date(new Date(dateTo).getTime() + 86_400_000) } : {}),
    },
  } : {};

  // Same date bounds, usable in JS against any Date field (not just createdAt) —
  // needed for "pendientes" (never date-filtered) vs "historial" (filtered by
  // resolution date, not creation date) which prisma-level dateFilter can't express.
  function inRange(d: Date | null | undefined): boolean {
    if (!d) return false;
    if (dateFrom && d < new Date(dateFrom)) return false;
    if (dateTo && d > new Date(new Date(dateTo).getTime() + 86_400_000)) return false;
    return true;
  }

  // Shared "which documents" scope — applied to File queries directly, and
  // via the `file` relation to ChangeRequest/DocumentTask so every section
  // of the report respects the same folder/department/type/encargado filters.
  const fileScope = {
    ...(folderId ? { folderId } : {}),
    ...(departamento ? { departamento } : {}),
    ...(tipoDocumento ? { tipoDocumento } : {}),
    ...(encargadoId ? { encargadoDocumentoId: encargadoId } : {}),
  };
  const hasFileScope = Object.keys(fileScope).length > 0;

  const [auditLogs, changeRequestsAll, reviewTasksAll, outgoingApprovedAll, users, folders, departments, documentTypes, auditLogsTrend] = await Promise.all([
    prisma.auditLog.findMany({
      where: {
        companyId,
        ...dateFilter,
        ...(userId ? { userId } : {}),
        action: {
          in: [
            "FILE_UPLOAD", "FILE_DELETE", "FILE_OBSOLETE", "FILE_REVIEW_COMPLETE",
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
    // Not date-filtered at the query level — "pendientes" needs to see every
    // outstanding request regardless of when it was created; date bounds are
    // applied per-section in JS via inRange() below.
    prisma.changeRequest.findMany({
      where: {
        companyId,
        ...(userId ? { requestedByUserId: userId } : {}),
        ...(hasFileScope ? { file: { is: fileScope } } : {}),
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true, type: true, status: true, adminNotes: true, createdAt: true, reviewedAt: true,
        file: { select: { id: true, name: true, nombreDocumento: true, codigo: true, departamento: true } },
        requestedBy: { select: { id: true, name: true, email: true } },
        reviewedBy:  { select: { id: true, name: true } },
      },
    }),
    // Sequential review-chain steps (Crear Documento / revisión de pares) —
    // the closest thing this app has to a per-step "approval" with a
    // measurable start (createdAt) and end (completedAt).
    prisma.documentTask.findMany({
      where: {
        companyId,
        reviewChainId: { not: null },
        ...(userId ? { assignedToUserId: userId } : {}),
        ...(hasFileScope ? { file: { is: fileScope } } : {}),
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true, status: true, stepOrder: true, createdAt: true, completedAt: true,
        assignedTo: { select: { id: true, name: true } },
        file: { select: { id: true, name: true, nombreDocumento: true, codigo: true, departamento: true } },
      },
    }),
    // Approved outgoing requests = version history (ACTUALIZACION/REVISION/CORRECCION).
    prisma.outgoingRequest.findMany({
      where: {
        companyId,
        status: "APPROVED",
        finalReviewedAt: { not: null },
        ...(userId ? { createdByUserId: userId } : {}),
        ...(hasFileScope ? { file: { is: fileScope } } : {}),
      },
      select: {
        id: true, type: true, instructions: true, finalReviewedAt: true, pendingVersionStr: true,
        file: { select: { id: true, name: true, nombreDocumento: true, codigo: true } },
        createdBy: { select: { id: true, name: true } },
        finalReviewer: { select: { id: true, name: true } },
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
    // Trailing 12 months, independent of the dateFrom/dateTo filter — powers
    // the "tendencia mensual" / period-over-period comparison panel.
    prisma.auditLog.findMany({
      where: {
        companyId,
        createdAt: { gte: new Date(now.getFullYear(), now.getMonth() - 11, 1) },
        action: { in: ["FILE_UPLOAD", "FILE_DELETE", "FILE_REVIEW_COMPLETE", "FILE_REVIEW_UPDATE"] },
      },
      select: { action: true, createdAt: true },
    }),
  ]);

  // ── Legacy summary counters (activity in the selected period) ──────────────
  const changeRequestsInRange = changeRequestsAll.filter((cr) => inRange(cr.createdAt));
  const summary = {
    subidas:    auditLogs.filter((l) => l.action === "FILE_UPLOAD").length,
    eliminaciones: auditLogs.filter((l) => l.action === "FILE_DELETE").length,
    revisiones: auditLogs.filter((l) => l.action.startsWith("FILE_REVIEW")).length,
    aprobadas:  changeRequestsInRange.filter((cr) => cr.status === "APPROVED").length,
    rechazadas: changeRequestsInRange.filter((cr) => cr.status === "REJECTED").length,
    pendientes: changeRequestsAll.filter((cr) => cr.status === "PENDING").length,
  };

  // ── Cambios: unified change/version history ─────────────────────────────────
  // One row shape for four different sources, so a single table/export answers
  // "qué cambió, versión, quién y por qué" for any document:
  //   - ChangeRequest   → editor-requested changes (approved/rejected/pending)
  //   - OutgoingRequest → admin-initiated version bumps ("historial de versiones")
  //   - FILE_DELETE     → direct admin deletion (no approval step)
  //   - FILE_OBSOLETE   → archived as obsolete (no approval step)
  interface CambioRow {
    fecha: string;
    tipo: string;
    documento: string;
    codigo: string;
    version: string;
    motivo: string;
    solicitante: string;
    decididoPor: string;
    estado: string;
  }

  const cambiosCR: CambioRow[] = changeRequestsInRange.map((cr) => ({
    fecha: cr.createdAt.toISOString(),
    tipo: cr.type,
    documento: cr.file?.nombreDocumento ?? cr.file?.name ?? "—",
    codigo: cr.file?.codigo ?? "—",
    version: "—",
    motivo: cr.adminNotes ?? "—",
    solicitante: cr.requestedBy.name,
    decididoPor: cr.reviewedBy?.name ?? "—",
    estado: cr.status,
  }));

  const cambiosOUT: CambioRow[] = outgoingApprovedAll
    .filter((or) => inRange(or.finalReviewedAt))
    .map((or) => ({
      fecha: or.finalReviewedAt!.toISOString(),
      tipo: `OUT_${or.type}`,
      documento: or.file.nombreDocumento ?? or.file.name,
      codigo: or.file.codigo ?? "—",
      version: or.pendingVersionStr ?? "—",
      motivo: or.instructions ?? "—",
      solicitante: or.createdBy.name,
      decididoPor: or.finalReviewer?.name ?? "—",
      estado: "APPROVED",
    }));

  // FILE_DELETE / FILE_OBSOLETE audit entries reference a file that may no
  // longer match the current doc-health query (soft-deleted, or filtered out
  // by department/type) — look those files up directly by id so the row
  // still shows a real código/nombre, and so structural filters still apply.
  const deleteObsoleteLogs = auditLogs.filter((l) => l.action === "FILE_DELETE" || l.action === "FILE_OBSOLETE");
  const extraFileIds = [...new Set(deleteObsoleteLogs.map((l) => l.resourceId).filter((x): x is string => !!x))];
  const extraFiles = extraFileIds.length
    ? await prisma.file.findMany({
        where: { id: { in: extraFileIds }, companyId },
        select: { id: true, codigo: true, nombreDocumento: true, name: true, departamento: true, tipoDocumento: true, folderId: true, encargadoDocumentoId: true },
      })
    : [];
  const extraFileMap = new Map(extraFiles.map((f) => [f.id, f]));

  function matchesFileScope(f: { departamento: string | null; tipoDocumento: string | null; folderId: string | null; encargadoDocumentoId: string | null } | undefined): boolean {
    if (!hasFileScope) return true;
    if (!f) return false;
    if (departamento && f.departamento !== departamento) return false;
    if (tipoDocumento && f.tipoDocumento !== tipoDocumento) return false;
    if (folderId && f.folderId !== folderId) return false;
    if (encargadoId && f.encargadoDocumentoId !== encargadoId) return false;
    return true;
  }

  const cambiosDeleteObsolete: CambioRow[] = deleteObsoleteLogs
    .map((l): CambioRow | null => {
      const f = l.resourceId ? extraFileMap.get(l.resourceId) : undefined;
      if (!matchesFileScope(f)) return null;
      const isObsolete = l.action === "FILE_OBSOLETE";
      return {
        fecha: l.createdAt.toISOString(),
        tipo: l.action,
        documento: f?.nombreDocumento ?? f?.name ?? l.detail ?? "—",
        codigo: f?.codigo ?? "—",
        version: "—",
        motivo: isObsolete ? (l.detail ?? "—") : "Eliminación directa por administrador",
        solicitante: l.user?.name ?? "—",
        decididoPor: "—",
        estado: "—",
      };
    })
    .filter((r): r is CambioRow => r !== null);

  const cambios = [...cambiosCR, ...cambiosOUT, ...cambiosDeleteObsolete]
    .sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());

  // ── Document-health metrics ─────────────────────────────────────────────────
  const weekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const docWhere = {
    companyId,
    deletedAt: null,
    OR: [{ folderId: null }, { folder: { isExternal: false } }],
    ...fileScope,
  };

  const docs = await prisma.file.findMany({
    where: docWhere,
    select: {
      id: true, status: true, departamento: true, tipoDocumento: true,
      fechaRevision: true, reviewDueDate: true,
      codigo: true, nombreDocumento: true, name: true,
      folder: { select: { name: true } },
      encargadoDocumento: { select: { id: true, name: true } },
    },
    orderBy: { nombreDocumento: "asc" },
  });

  const dueDateOf = (d: (typeof docs)[number]) => d.fechaRevision ?? d.reviewDueDate;

  // Full per-document detail — powers every drill-down table (overdue, due
  // this week, by status/department/type) and its Excel export, so an
  // auditor can always see exactly which documents make up a number.
  const documentos = docs.map((d) => {
    const due = dueDateOf(d);
    const diasParaVencer = due ? Math.ceil((due.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)) : null;
    return {
      id: d.id,
      codigo: d.codigo ?? "—",
      nombre: d.nombreDocumento ?? d.name,
      carpeta: d.folder?.name ?? "—",
      departamento: d.departamento ?? "—",
      tipoDocumento: d.tipoDocumento ?? "—",
      status: d.status,
      encargado: d.encargadoDocumento?.name ?? "—",
      fechaVencimiento: due ? due.toISOString() : null,
      diasParaVencer,
      estaVencido: due ? due < now && d.status !== "OBSOLETE" : false,
    };
  });

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

  // Compliance ("cumplimiento documental") — of the documents that actually
  // carry a due date, what share are currently not overdue. This is a
  // present-day snapshot: the app does not keep a historical log of due
  // dates, so a genuine "% on time per past month/quarter/year" cannot be
  // reconstructed retroactively. Reported as "cumplimiento actual" in the UI
  // rather than implying a period breakdown that doesn't exist yet.
  const docsConVencimiento = docs.filter((d) => dueDateOf(d) && d.status !== "OBSOLETE");
  const cumplimientoGeneral = docsConVencimiento.length
    ? Math.round((docsConVencimiento.filter((d) => (dueDateOf(d) as Date) >= now).length / docsConVencimiento.length) * 100)
    : 100;
  const cumplimientoPorDepartamento = (() => {
    const m = new Map<string, { total: number; ok: number }>();
    for (const d of docsConVencimiento) {
      const label = d.departamento ?? "—";
      const e = m.get(label) ?? { total: 0, ok: 0 };
      e.total++;
      if ((dueDateOf(d) as Date) >= now) e.ok++;
      m.set(label, e);
    }
    return [...m.entries()]
      .map(([label, { total, ok }]) => ({ label, total, pct: total ? Math.round((ok / total) * 100) : 100 }))
      .sort((a, b) => a.pct - b.pct);
  })();

  // Activity per user in the selected period, broken down by action type
  // (from audit logs, independent of document filters) so each number is
  // traceable to something concrete instead of one opaque total.
  interface UserActivity {
    userId: string;
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
      userId: log.user.id, name: log.user.name, subidas: 0, eliminaciones: 0, revisiones: 0, aprobadas: 0, rechazadas: 0, total: 0,
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

  // Full activity log detail — powers the "Actividad" tab and its export,
  // and lets a click on a user's row in the activity breakdown drill down
  // into exactly what they did.
  const activityLog = auditLogs.map((l) => ({
    id: l.id,
    fecha: l.createdAt.toISOString(),
    usuarioId: l.user?.id ?? null,
    usuario: l.user?.name ?? "—",
    accion: l.action,
    detalle: l.detail ?? "—",
  }));

  // ── Aprobaciones: pendientes / historial / tiempos ──────────────────────────
  function daysBetween(a: Date, b: Date): number {
    return Math.round((b.getTime() - a.getTime()) / 86_400_000);
  }

  interface PendingApproval {
    id: string; documento: string; codigo: string; tipo: string;
    esperandoDe: string; desde: string; diasEsperando: number;
  }
  const pendientesCR: PendingApproval[] = changeRequestsAll
    .filter((cr) => cr.status === "PENDING")
    .map((cr) => ({
      id: `cr-${cr.id}`,
      documento: cr.file?.nombreDocumento ?? cr.file?.name ?? "—",
      codigo: cr.file?.codigo ?? "—",
      tipo: cr.type,
      esperandoDe: "Admin",
      desde: cr.createdAt.toISOString(),
      diasEsperando: daysBetween(cr.createdAt, now),
    }));
  const pendientesChain: PendingApproval[] = reviewTasksAll
    .filter((t) => t.status === "PENDING" || t.status === "IN_PROGRESS")
    .map((t) => ({
      id: `task-${t.id}`,
      documento: t.file.nombreDocumento ?? t.file.name,
      codigo: t.file.codigo ?? "—",
      tipo: "REVIEW_STEP",
      esperandoDe: t.assignedTo.name,
      desde: t.createdAt.toISOString(),
      diasEsperando: daysBetween(t.createdAt, now),
    }));
  const aprobacionesPendientes = [...pendientesCR, ...pendientesChain]
    .sort((a, b) => b.diasEsperando - a.diasEsperando);

  interface ResolvedApproval {
    id: string; documento: string; codigo: string; tipo: string; departamento: string;
    resultado: string; decididoPor: string; fecha: string; diasQueTomo: number;
  }
  // Built once, unfiltered by date — the "historial" tab view filters this
  // to the selected period, while the monthly trend (tendenciaTiempos below)
  // buckets the same underlying data across the trailing 12 months regardless
  // of what date range is currently selected, exactly like tendenciaMensual.
  const historialCRAll: ResolvedApproval[] = changeRequestsAll
    .filter((cr) => cr.status !== "PENDING" && cr.reviewedAt)
    .map((cr) => ({
      id: `cr-${cr.id}`,
      documento: cr.file?.nombreDocumento ?? cr.file?.name ?? "—",
      codigo: cr.file?.codigo ?? "—",
      tipo: cr.type,
      departamento: cr.file?.departamento ?? "—",
      resultado: cr.status,
      decididoPor: cr.reviewedBy?.name ?? "—",
      fecha: cr.reviewedAt!.toISOString(),
      diasQueTomo: daysBetween(cr.createdAt, cr.reviewedAt!),
    }));
  const historialChainAll: ResolvedApproval[] = reviewTasksAll
    .filter((t) => t.status === "COMPLETED" && t.completedAt)
    .map((t) => ({
      id: `task-${t.id}`,
      documento: t.file.nombreDocumento ?? t.file.name,
      codigo: t.file.codigo ?? "—",
      tipo: "REVIEW_STEP",
      departamento: t.file.departamento ?? "—",
      resultado: "COMPLETED",
      decididoPor: t.assignedTo.name,
      fecha: t.completedAt!.toISOString(),
      diasQueTomo: daysBetween(t.createdAt, t.completedAt!),
    }));
  const aprobacionesHistorialAll = [...historialCRAll, ...historialChainAll];
  const aprobacionesHistorial = aprobacionesHistorialAll
    .filter((r) => inRange(new Date(r.fecha)))
    .sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());

  function aggregateTiempos(rows: ResolvedApproval[], key: "decididoPor" | "departamento") {
    const m = new Map<string, { count: number; totalDias: number }>();
    for (const r of rows) {
      const label = r[key];
      const e = m.get(label) ?? { count: 0, totalDias: 0 };
      e.count++; e.totalDias += r.diasQueTomo;
      m.set(label, e);
    }
    return [...m.entries()]
      .map(([label, { count, totalDias }]) => ({ label, count, promedioDias: Math.round((totalDias / count) * 10) / 10 }))
      .sort((a, b) => b.promedioDias - a.promedioDias);
  }
  const tiemposPorUsuario = aggregateTiempos(aprobacionesHistorial, "decididoPor");
  const tiemposPorDepartamento = aggregateTiempos(aprobacionesHistorial, "departamento");

  // ── Tendencia mensual (trailing 12 months — enough to compare quarters and
  // a full year, not just the immediately preceding month) ───────────────────
  function monthKey(d: Date) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; }
  const months: string[] = [];
  for (let i = 11; i >= 0; i--) months.push(monthKey(new Date(now.getFullYear(), now.getMonth() - i, 1)));

  const trendBuckets = {
    subidas: Object.fromEntries(months.map((m) => [m, 0])),
    eliminaciones: Object.fromEntries(months.map((m) => [m, 0])),
    revisiones: Object.fromEntries(months.map((m) => [m, 0])),
    aprobadas: Object.fromEntries(months.map((m) => [m, 0])),
    rechazadas: Object.fromEntries(months.map((m) => [m, 0])),
  } as Record<"subidas" | "eliminaciones" | "revisiones" | "aprobadas" | "rechazadas", Record<string, number>>;

  for (const l of auditLogsTrend) {
    const mk = monthKey(l.createdAt);
    if (!(mk in trendBuckets.subidas)) continue;
    if (l.action === "FILE_UPLOAD") trendBuckets.subidas[mk]++;
    else if (l.action === "FILE_DELETE") trendBuckets.eliminaciones[mk]++;
    else if (l.action.startsWith("FILE_REVIEW")) trendBuckets.revisiones[mk]++;
  }
  for (const cr of changeRequestsAll) {
    if (!cr.reviewedAt) continue;
    const mk = monthKey(cr.reviewedAt);
    if (!(mk in trendBuckets.aprobadas)) continue;
    if (cr.status === "APPROVED") trendBuckets.aprobadas[mk]++;
    else if (cr.status === "REJECTED") trendBuckets.rechazadas[mk]++;
  }
  const tendenciaMensual = months.map((mk) => ({
    mes: mk,
    subidas: trendBuckets.subidas[mk],
    eliminaciones: trendBuckets.eliminaciones[mk],
    revisiones: trendBuckets.revisiones[mk],
    aprobadas: trendBuckets.aprobadas[mk],
    rechazadas: trendBuckets.rechazadas[mk],
  }));

  // Monthly average approval turnaround ("tiempos históricos de aprobación
  // por período") — same aprobacionesHistorialAll data, bucketed by month.
  const tiemposTrendBuckets = Object.fromEntries(months.map((m) => [m, { count: 0, totalDias: 0 }])) as Record<string, { count: number; totalDias: number }>;
  for (const r of aprobacionesHistorialAll) {
    const mk = monthKey(new Date(r.fecha));
    if (!(mk in tiemposTrendBuckets)) continue;
    tiemposTrendBuckets[mk].count++;
    tiemposTrendBuckets[mk].totalDias += r.diasQueTomo;
  }
  // totalDias (not just the rounded average) travels with each month so the
  // client can roll months up into quarters/years with a correctly weighted
  // average, instead of averaging already-rounded monthly averages.
  const tendenciaTiempos = months.map((mk) => ({
    mes: mk,
    casos: tiemposTrendBuckets[mk].count,
    totalDias: tiemposTrendBuckets[mk].totalDias,
    promedioDias: tiemposTrendBuckets[mk].count ? Math.round((tiemposTrendBuckets[mk].totalDias / tiemposTrendBuckets[mk].count) * 10) / 10 : null,
  }));

  return NextResponse.json({
    summary,
    cambios,
    users,
    filters: { folders, departments, documentTypes },
    activityLog,
    docMetrics: {
      totalDocumentos: docs.length,
      documentosVencidos,
      porRevisarSemana,
      porEstado,
      porDepartamento,
      porTipo,
      actividadUsuarios,
      documentos,
      cumplimientoGeneral,
      cumplimientoPorDepartamento,
    },
    aprobaciones: {
      pendientes: aprobacionesPendientes,
      historial: aprobacionesHistorial,
      tiemposPorUsuario,
      tiemposPorDepartamento,
      tendenciaTiempos,
    },
    tendenciaMensual,
  });
}
