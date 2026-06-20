import { NextResponse } from "next/server";
import { requireActiveSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET /api/tasks/counts — lightweight counts for bell badge + login panel
export async function GET() {
  const session = await requireActiveSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!session.companyId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const companyId = session.companyId;
  const now = new Date();

  const [pendientes, atrasadas, myPendingCR, top5] = await Promise.all([
    prisma.documentTask.count({
      where: {
        companyId,
        assignedToUserId: session.userId,
        status: { not: "COMPLETED" },
      },
    }),
    prisma.documentTask.count({
      where: {
        companyId,
        assignedToUserId: session.userId,
        status: { not: "COMPLETED" },
        dueDate: { lt: now },
      },
    }),
    prisma.changeRequest.count({
      where: {
        companyId,
        requestedByUserId: session.userId,
        status: "PENDING",
      },
    }),
    prisma.documentTask.findMany({
      where: {
        companyId,
        assignedToUserId: session.userId,
        status: { not: "COMPLETED" },
      },
      orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
      take: 5,
      select: {
        id: true,
        type: true,
        dueDate: true,
        file: { select: { id: true, name: true, nombreDocumento: true } },
      },
    }),
  ]);

  return NextResponse.json({
    pendientes,
    atrasadas,
    myPendingCR,
    top5: top5.map((t) => ({
      id: t.id,
      type: t.type,
      dueDate: t.dueDate?.toISOString() ?? null,
      docName: t.file.nombreDocumento || t.file.name,
      fileId: t.file.id,
    })),
  });
}
