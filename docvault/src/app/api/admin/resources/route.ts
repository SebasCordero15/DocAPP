import { NextResponse } from "next/server";
import { requireActiveSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET /api/admin/resources
// Returns all non-deleted folders and files for this company so the permissions
// UI can show a full resource selector. Admin-only.
export async function GET() {
  const session = await requireActiveSession();
  if (!session || !session.companyId || session.role !== "COMPANY_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const [folders, files] = await Promise.all([
    prisma.folder.findMany({
      where: { companyId: session.companyId!, deletedAt: null },
      select: { id: true, name: true, parentId: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.file.findMany({
      where: { companyId: session.companyId!, deletedAt: null },
      select: { id: true, name: true, folderId: true, mimeType: true },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  return NextResponse.json({ folders, files });
}
