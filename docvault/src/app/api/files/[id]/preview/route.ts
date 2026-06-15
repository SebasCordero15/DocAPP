import { NextRequest, NextResponse } from "next/server";
import { requireActiveSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resolveFileAccess, atLeast } from "@/lib/permissions";

// GET /api/files/[id]/preview — returns the stored spreadsheet preview rows.
// Requires at least READ access; inaccessible files return 404 (not 403).
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await requireActiveSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!session.companyId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const companyId = session.companyId;

  const file = await prisma.file.findFirst({
    where: { id: params.id, companyId, deletedAt: null },
    select: { id: true, previewRows: true },
  });
  if (!file) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const level = await resolveFileAccess(session.userId, companyId, session.role, file.id);
  if (!atLeast(level, "READ")) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ rows: file.previewRows ?? null });
}
