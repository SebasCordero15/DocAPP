import { NextRequest, NextResponse } from "next/server";
import { requireActiveSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resolveFileAccess, atLeast } from "@/lib/permissions";
import { presignDownload } from "@/lib/storage";
import { logAction } from "@/lib/audit";

// GET /api/files/[id]/download-url
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
  });
  if (!file) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let level = await resolveFileAccess(session.userId, companyId, session.role, file.id);
  if (!atLeast(level, "READ")) {
    // Task assignees can access files in their active tasks even without folder permission
    const hasActiveTask = await prisma.documentTask.findFirst({
      where: { fileId: params.id, assignedToUserId: session.userId, status: { not: "COMPLETED" } },
      select: { id: true },
    });
    if (hasActiveTask) level = "READ";
  }
  if (!atLeast(level, "READ")) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const url = await presignDownload(file.storageKey, file.name);

  await logAction({
    companyId,
    userId: session.userId,
    action: "FILE_DOWNLOAD",
    resourceType: "FILE",
    resourceId: file.id,
    detail: file.name,
  });

  return NextResponse.json({ url });
}
