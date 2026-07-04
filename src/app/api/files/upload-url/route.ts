import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireActiveSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resolveFolderAccess, atLeast } from "@/lib/permissions";
import { makeStorageKey, presignUpload } from "@/lib/storage";

const schema = z.object({
  folderId: z.string().optional(),
  name: z.string().min(1).max(500),
  mimeType: z.string().min(1),
  size: z.number().int().positive().max(100 * 1024 * 1024), // 100 MB cap
});

// POST /api/files/upload-url
// Returns a short-lived pre-signed PUT URL so the browser can upload directly
// to object storage.
export async function POST(req: NextRequest) {
  const session = await requireActiveSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!session.companyId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const companyId = session.companyId;

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const { folderId, name, mimeType, size } = parsed.data;

  // Enforce storage quota
  const [company, storageStats] = await Promise.all([
    prisma.company.findUnique({ where: { id: companyId }, select: { maxStorageMB: true } }),
    prisma.file.aggregate({ where: { companyId, deletedAt: null }, _sum: { size: true } }),
  ]);
  const usedBytes = storageStats._sum.size ?? 0;
  const maxBytes = ((company?.maxStorageMB ?? 5120) as number) * 1024 * 1024;
  if (usedBytes + size > maxBytes) {
    return NextResponse.json(
      { error: "Has alcanzado el límite de almacenamiento de tu plan. Contacta al administrador para actualizar tu plan." },
      { status: 413 }
    );
  }

  if (folderId) {
    const folder = await prisma.folder.findFirst({
      where: { id: folderId, companyId, deletedAt: null },
    });
    if (!folder) return NextResponse.json({ error: "Folder not found" }, { status: 404 });
  }

  if (folderId) {
    const level = await resolveFolderAccess(session.userId, companyId, session.role, folderId);
    if (level === "NONE") return NextResponse.json({ error: "Folder not found" }, { status: 404 });
    if (!atLeast(level, "EDIT")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  } else if (session.role === "VIEWER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const storageKey = makeStorageKey(companyId, folderId ?? null, name);
  const uploadUrl = await presignUpload(storageKey, mimeType);

  return NextResponse.json({ uploadUrl, storageKey });
}
