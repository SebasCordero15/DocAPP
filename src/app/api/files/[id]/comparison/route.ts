import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireActiveSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resolveFileAccess, atLeast } from "@/lib/permissions";
import { makeStorageKey, presignUpload, presignDownload } from "@/lib/storage";
import { logAction } from "@/lib/audit";

// GET /api/files/[id]/comparison — returns presigned download URL for the comparison doc.
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await requireActiveSession();
  if (!session || !session.companyId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const file = await prisma.file.findFirst({
    where: { id: params.id, companyId: session.companyId, deletedAt: null },
    select: { id: true, comparisonStorageKey: true, comparisonName: true },
  });
  if (!file) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const level = await resolveFileAccess(session.userId, session.companyId, session.role, file.id);
  if (!atLeast(level, "READ")) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (!file.comparisonStorageKey) return NextResponse.json({ error: "No comparison document" }, { status: 404 });

  const url = await presignDownload(file.comparisonStorageKey, file.comparisonName ?? "comparativa");
  return NextResponse.json({ url, name: file.comparisonName });
}

const uploadUrlSchema = z.object({
  name:     z.string().min(1).max(500),
  mimeType: z.string().min(1),
  size:     z.number().int().positive().max(50 * 1024 * 1024), // 50 MB cap for comparison docs
});

// POST /api/files/[id]/comparison — step 1: get presigned upload URL.
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await requireActiveSession();
  if (!session || !session.companyId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role === "VIEWER") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const file = await prisma.file.findFirst({
    where: { id: params.id, companyId: session.companyId, deletedAt: null },
    select: { id: true },
  });
  if (!file) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const level = await resolveFileAccess(session.userId, session.companyId, session.role, file.id);
  if (!atLeast(level, "MANAGE")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => null);
  const parsed = uploadUrlSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const { name, mimeType, size } = parsed.data;

  const storageKey = makeStorageKey(session.companyId, null, `comparison_${name}`);
  const uploadUrl  = await presignUpload(storageKey, mimeType);

  return NextResponse.json({ uploadUrl, storageKey, size });
}

const saveSchema = z.object({
  storageKey: z.string().min(1),
  name:       z.string().min(1).max(500),
});

// PATCH /api/files/[id]/comparison — step 2: save key after upload.
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await requireActiveSession();
  if (!session || !session.companyId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role === "VIEWER") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const file = await prisma.file.findFirst({
    where: { id: params.id, companyId: session.companyId, deletedAt: null },
    select: { id: true, nombreDocumento: true, name: true },
  });
  if (!file) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const level = await resolveFileAccess(session.userId, session.companyId, session.role, file.id);
  if (!atLeast(level, "MANAGE")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => null);
  const parsed = saveSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  if (!parsed.data.storageKey.startsWith(`${session.companyId}/`)) {
    return NextResponse.json({ error: "Invalid storage key" }, { status: 400 });
  }

  await prisma.file.update({
    where: { id: file.id },
    data: { comparisonStorageKey: parsed.data.storageKey, comparisonName: parsed.data.name },
  });

  await logAction({
    companyId: session.companyId,
    userId: session.userId,
    action: "FILE_COMPARISON_UPLOAD",
    resourceType: "FILE",
    resourceId: file.id,
    detail: `Comparativa adjuntada: ${parsed.data.name} → ${file.nombreDocumento || file.name}`,
  });

  return NextResponse.json({ ok: true });
}

// DELETE /api/files/[id]/comparison — remove comparison doc (admin only).
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await requireActiveSession();
  if (!session || !session.companyId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "COMPANY_ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const file = await prisma.file.findFirst({
    where: { id: params.id, companyId: session.companyId, deletedAt: null },
    select: { id: true },
  });
  if (!file) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.file.update({
    where: { id: file.id },
    data: { comparisonStorageKey: null, comparisonName: null },
  });

  return NextResponse.json({ ok: true });
}
