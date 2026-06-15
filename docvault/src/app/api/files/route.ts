import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireActiveSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resolveFolderAccess, atLeast } from "@/lib/permissions";
import { canBypassApproval, notifyAdminsOfRequest } from "@/lib/changeRequests";
import { logAction } from "@/lib/audit";
import { downloadBytes } from "@/lib/storage";
import { isSpreadsheet, parsePreview } from "@/lib/parseSpreadsheet";

const schema = z.object({
  folderId:   z.string().optional(),
  name:       z.string().min(1).max(500),
  mimeType:   z.string().min(1),
  size:       z.number().int().positive(),
  storageKey: z.string().min(1),
});

// POST /api/files — save file metadata after browser upload to object storage.
export async function POST(req: NextRequest) {
  const session = await requireActiveSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!session.companyId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const companyId = session.companyId;

  if (session.role === "VIEWER") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const { folderId, name, mimeType, size, storageKey } = parsed.data;

  if (!storageKey.startsWith(`${companyId}/`)) {
    return NextResponse.json({ error: "Invalid storage key" }, { status: 400 });
  }

  const level = await resolveFolderAccess(session.userId, companyId, session.role, folderId ?? null);
  if (folderId && level === "NONE") return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!atLeast(level, "EDIT")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const bypass = canBypassApproval(level, session.role);

  // ── EDITOR path: create file as PENDING_APPROVAL + ChangeRequest ──────────
  if (!bypass) {
    const file = await prisma.file.create({
      data: {
        companyId,
        folderId:        folderId ?? null,
        name,
        storageKey,
        mimeType,
        size,
        status:          "PENDING_APPROVAL",
        uploadedByUserId: session.userId,
      },
    });

    // Spreadsheet preview even for pending files so admin can preview content
    if (isSpreadsheet(mimeType)) {
      try {
        const buffer = await downloadBytes(storageKey);
        const previewRows = parsePreview(buffer, mimeType);
        await prisma.file.update({ where: { id: file.id }, data: { previewRows } });
      } catch { /* non-fatal */ }
    }

    const changeRequest = await prisma.changeRequest.create({
      data: {
        companyId,
        type:              "NEW_UPLOAD",
        fileId:            file.id,
        folderId:          folderId ?? null,
        requestedByUserId: session.userId,
        proposedChanges:   { storageKey, name, mimeType, size, folderId: folderId ?? null },
      },
    });

    await Promise.all([
      notifyAdminsOfRequest({ companyId, fileId: file.id, docName: name, type: "NEW_UPLOAD" }),
      logAction({ companyId, userId: session.userId, action: "FILE_UPLOAD_PENDING", resourceType: "FILE", resourceId: file.id, detail: `${name} (${size} bytes)` }),
    ]);

    return NextResponse.json({ file, changeRequest, requiresApproval: true }, { status: 201 });
  }

  // ── MANAGE/Admin path: create file directly (existing behavior) ───────────
  const file = await prisma.file.create({
    data: {
      companyId,
      folderId:        folderId ?? null,
      name,
      storageKey,
      mimeType,
      size,
      uploadedByUserId: session.userId,
    },
  });

  if (isSpreadsheet(mimeType)) {
    try {
      const buffer = await downloadBytes(storageKey);
      const previewRows = parsePreview(buffer, mimeType);
      await prisma.file.update({ where: { id: file.id }, data: { previewRows } });
    } catch { /* non-fatal */ }
  }

  await logAction({ companyId, userId: session.userId, action: "FILE_UPLOAD", resourceType: "FILE", resourceId: file.id, detail: `${name} (${size} bytes)` });

  return NextResponse.json({ file, requiresApproval: false }, { status: 201 });
}
