import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireActiveSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logAction } from "@/lib/audit";

const schema = z.object({
  fileId:     z.string().min(1),
  assigneeId: z.string().min(1),
  message:    z.string().max(2000).optional().nullable(),
});

// POST /api/peer-review-requests — any company user can ask another to review a doc
export async function POST(req: NextRequest) {
  const session = await requireActiveSession();
  if (!session || !session.companyId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { companyId, userId } = session;

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos", details: parsed.error.issues }, { status: 400 });

  const { fileId, assigneeId, message } = parsed.data;

  if (assigneeId === userId) {
    return NextResponse.json({ error: "No puedes asignarte una revisión a ti mismo" }, { status: 400 });
  }

  const [file, assignee] = await Promise.all([
    prisma.file.findFirst({
      where: { id: fileId, companyId, deletedAt: null },
      select: { id: true, name: true, nombreDocumento: true },
    }),
    prisma.user.findFirst({
      where: { id: assigneeId, companyId, isActive: true },
      select: { id: true, name: true },
    }),
  ]);

  if (!file)     return NextResponse.json({ error: "Documento no encontrado" }, { status: 404 });
  if (!assignee) return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });

  const docName = file.nombreDocumento || file.name;

  const requester = await prisma.user.findFirst({
    where: { id: userId },
    select: { name: true },
  });

  await prisma.$transaction(async (tx) => {
    await tx.documentTask.create({
      data: {
        companyId,
        fileId,
        assignedToUserId: assigneeId,
        assignedByUserId: userId,
        type:   "REVIEW",
        status: "PENDING",
        notes:  message ?? null,
      },
    });

    await tx.notification.create({
      data: {
        companyId,
        userId:  assigneeId,
        type:    "TASK_ASSIGNED",
        message: `${requester?.name ?? "Un colega"} te pidió revisar "${docName}"${message ? `: ${message}` : ""}`,
        fileId,
      },
    });
  });

  await logAction({
    companyId, userId, action: "FILE_REVIEW_UPDATE",
    resourceType: "FILE", resourceId: fileId,
    detail: `Solicitud de revisión a ${assignee.name} | ${docName}`,
  });

  return NextResponse.json({ ok: true }, { status: 201 });
}
