import { NextResponse } from "next/server";
import { requireActiveSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isAdminRole } from "@/lib/permissions";

// GET /api/pendientes/counts — lightweight counts for bell/login panel
export async function GET() {
  const session = await requireActiveSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!session.companyId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const companyId = session.companyId;
  const now = new Date();

  const isAdmin = isAdminRole(session.role);
  const encargadoFilter = isAdmin ? {} : { encargadoDocumentoId: session.userId };

  const [enRevision, borrador, revisados, atrasadas] = await Promise.all([
    prisma.file.count({
      where: { companyId, deletedAt: null, status: "IN_REVIEW", ...encargadoFilter },
    }),
    prisma.file.count({
      where: { companyId, deletedAt: null, status: "DRAFT", ...encargadoFilter },
    }),
    prisma.file.count({
      where: { companyId, deletedAt: null, status: "REVIEWED", ...encargadoFilter },
    }),
    prisma.file.count({
      where: {
        companyId,
        deletedAt: null,
        fechaRevision: { lt: now },
        status: { not: "REVIEWED" },
        ...encargadoFilter,
      },
    }),
  ]);

  return NextResponse.json({ enRevision, borrador, revisados, atrasadas });
}
