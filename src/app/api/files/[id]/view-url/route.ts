import { NextRequest, NextResponse } from "next/server";
import { requireActiveSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resolveFileAccess, atLeast } from "@/lib/permissions";
import { presignView } from "@/lib/storage";
import { logAction } from "@/lib/audit";

// GET /api/files/[id]/view-url — presigned URL with inline disposition for in-browser viewing
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await requireActiveSession();
  if (!session || !session.companyId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const file = await prisma.file.findFirst({
    where: { id: params.id, companyId: session.companyId, deletedAt: null },
    select: { id: true, storageKey: true, mimeType: true },
  });
  if (!file) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let level = await resolveFileAccess(session.userId, session.companyId, session.role, file.id);
  if (!atLeast(level, "READ")) {
    const hasActiveTask = await prisma.documentTask.findFirst({
      where: { fileId: params.id, assignedToUserId: session.userId, status: { not: "COMPLETED" } },
      select: { id: true },
    });
    if (hasActiveTask) level = "READ";
  }
  if (!atLeast(level, "READ")) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const url = await presignView(file.storageKey, file.mimeType);

  await Promise.all([
    logAction({
      companyId: session.companyId,
      userId: session.userId,
      action: "FILE_VIEW",
      resourceType: "FILE",
      resourceId: file.id,
    }),
    prisma.file.update({
      where: { id: file.id },
      data: { lastAccessedAt: new Date(), lastAccessedByUserId: session.userId },
    }),
  ]);

  return NextResponse.json({ url });
}
