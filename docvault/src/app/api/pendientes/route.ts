import { NextRequest, NextResponse } from "next/server";
import { requireActiveSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isAdminRole } from "@/lib/permissions";

// GET /api/pendientes?tab=en_revision|borrador|revisados|atrasadas
export async function GET(req: NextRequest) {
  const session = await requireActiveSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!session.companyId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const companyId = session.companyId;
  const now = new Date();

  const tab = req.nextUrl.searchParams.get("tab") ?? "en_revision";
  const isAdmin = isAdminRole(session.role);
  const encargadoFilter = isAdmin ? {} : { encargadoDocumentoId: session.userId };

  let statusFilter: object;
  switch (tab) {
    case "borrador":
      statusFilter = { status: "DRAFT" as const };
      break;
    case "revisados":
      statusFilter = { status: "REVIEWED" as const };
      break;
    case "atrasadas":
      statusFilter = { fechaRevision: { lt: now }, status: { not: "REVIEWED" as const } };
      break;
    default: // en_revision
      statusFilter = { status: "IN_REVIEW" as const };
  }

  const files = await prisma.file.findMany({
    where: { companyId, deletedAt: null, ...statusFilter, ...encargadoFilter },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      name: true,
      codigo: true,
      nombreDocumento: true,
      versionStr: true,
      fechaRevision: true,
      fechaEmision: true,
      status: true,
      mimeType: true,
      storageKey: true,
      encargadoDocumento: { select: { id: true, name: true, email: true } },
      folder: { select: { id: true, name: true } },
    },
  });

  return NextResponse.json({
    files: files.map((f) => ({
      ...f,
      fechaRevision: f.fechaRevision?.toISOString() ?? null,
      fechaEmision: f.fechaEmision?.toISOString() ?? null,
      isOverdue: f.fechaRevision ? f.fechaRevision < now && f.status !== "REVIEWED" : false,
    })),
  });
}
