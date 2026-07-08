import { NextResponse } from "next/server";
import { requireActiveSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET /api/archivo-historico — returns all OBSOLETE files for this company. Admin-only.
export async function GET() {
  const session = await requireActiveSession();
  if (!session || !session.companyId || session.role !== "COMPANY_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const files = await prisma.file.findMany({
    where: { companyId: session.companyId, status: "OBSOLETE", deletedAt: null },
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
