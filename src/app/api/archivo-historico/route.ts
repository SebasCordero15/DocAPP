import { NextResponse } from "next/server";
import { requireActiveSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET /api/archivo-historico — returns OBSOLETE files.
// Admins see all. Encargados see only docs where they are the encargado.
export async function GET() {
  const session = await requireActiveSession();
  if (!session || !session.companyId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const isAdmin = session.role === "COMPANY_ADMIN";
  // Non-admin users only see docs where they are the encargado
  const visibilityFilter = isAdmin
    ? {}
    : { encargadoDocumentoId: session.userId };

  const files = await prisma.file.findMany({
    where: { companyId: session.companyId, status: "OBSOLETE", deletedAt: null, ...visibilityFilter },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true, name: true, nombreDocumento: true, codigo: true,
      mimeType: true, size: true, tipoDocumento: true, versionStr: true,
      departamento: true, createdAt: true, updatedAt: true,
      comparisonStorageKey: true, comparisonName: true,
      folder: { select: { id: true, name: true } },
      uploadedBy: { select: { id: true, name: true } },
      lastEditedBy: { select: { id: true, name: true } },
    },
  });

  return NextResponse.json({
    files: files.map((f) => ({
      ...f,
      createdAt: f.createdAt.toISOString(),
      updatedAt: f.updatedAt.toISOString(),
    })),
  });
}
