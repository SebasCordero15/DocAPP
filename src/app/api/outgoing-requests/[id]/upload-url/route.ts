import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireActiveSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { makeStorageKey, presignUpload } from "@/lib/storage";

const schema = z.object({
  name:     z.string().min(1).max(500),
  mimeType: z.string().min(1),
  size:     z.number().int().positive().max(100 * 1024 * 1024),
});

// POST /api/outgoing-requests/[id]/upload-url
// Generates a presigned S3 upload URL for the assignee of the current step.
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await requireActiveSession();
  if (!session || !session.companyId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { companyId, userId } = session;

  const outgoing = await prisma.outgoingRequest.findFirst({
    where: { id: params.id, companyId, status: { in: ["PENDING", "IN_PROGRESS"] } },
    include: {
      file: { select: { id: true, folderId: true, size: true } },
      tasks: { orderBy: { stepOrder: "asc" } },
    },
  });
  if (!outgoing) return NextResponse.json({ error: "Solicitud no encontrada" }, { status: 404 });

  const currentTask = outgoing.tasks.find((t) => t.stepOrder === outgoing.currentStep);
  if (!currentTask || currentTask.assignedToUserId !== userId) {
    return NextResponse.json({ error: "No tienes acceso a esta solicitud" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });

  const { name, mimeType, size } = parsed.data;

  // Enforce storage quota
  const [company, storageStats] = await Promise.all([
    prisma.company.findUnique({ where: { id: companyId }, select: { maxStorageMB: true } }),
    prisma.file.aggregate({ where: { companyId, deletedAt: null }, _sum: { size: true } }),
  ]);
  const usedBytes = storageStats._sum.size ?? 0;
  const maxBytes = ((company?.maxStorageMB ?? 5120) as number) * 1024 * 1024;
  if (usedBytes + size > maxBytes) {
    return NextResponse.json({ error: "Límite de almacenamiento alcanzado" }, { status: 413 });
  }

  const storageKey = makeStorageKey(companyId, outgoing.file.folderId, name);
  const uploadUrl = await presignUpload(storageKey, mimeType);

  return NextResponse.json({ uploadUrl, storageKey });
}
