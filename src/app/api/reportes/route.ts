import { NextRequest, NextResponse } from "next/server";
import { requireActiveSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET /api/reportes — change report summary for company admin
// Returns counts by category + detailed rows for export
export async function GET(req: NextRequest) {
  const session = await requireActiveSession();
  if (!session || !session.companyId || session.role !== "COMPANY_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { companyId } = session;
  const { searchParams } = new URL(req.url);
  const dateFrom = searchParams.get("dateFrom");
  const dateTo   = searchParams.get("dateTo");
  const userId   = searchParams.get("userId") || undefined;

  const dateFilter = dateFrom || dateTo ? {
    createdAt: {
      ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
      ...(dateTo   ? { lte: new Date(new Date(dateTo).getTime() + 86_400_000) } : {}),
    },
  } : {};

  const [auditLogs, changeRequests, users] = await Promise.all([
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
  ]);

  // Summary counts
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

  return NextResponse.json({ summary, details, users, total: details.length });
}
