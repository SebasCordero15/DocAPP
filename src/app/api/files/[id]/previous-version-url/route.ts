import { NextRequest, NextResponse } from "next/server";
import { requireActiveSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isAdminRole } from "@/lib/permissions";
import { presignDownload } from "@/lib/storage";

// GET /api/files/[id]/previous-version-url
// Returns a presigned download URL for the previous version of a file.
// Only accessible to admins.
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await requireActiveSession();
  if (!session || !session.companyId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdminRole(session.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { companyId } = session;

  const file = await prisma.file.findFirst({
    where: { id: params.id, companyId, deletedAt: null },
    select: { id: true, name: true, previousStorageKey: true, previousVersionStr: true, previousVersion: true },
  });
  if (!file) return NextResponse.json({ error: "Archivo no encontrado" }, { status: 404 });
  if (!file.previousStorageKey) return NextResponse.json({ error: "No hay versión anterior disponible" }, { status: 404 });

  const url = await presignDownload(file.previousStorageKey, file.name);
  return NextResponse.json({
    url,
    previousVersionStr: file.previousVersionStr,
    previousVersion:    file.previousVersion,
  });
}
