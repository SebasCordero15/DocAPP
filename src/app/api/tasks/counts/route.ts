import { NextResponse } from "next/server";
import { requireActiveSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";

// GET /api/tasks/counts — lightweight counts for bell badge + login panel
export async function GET() {
  const session = await requireActiveSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!session.companyId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const companyId = session.companyId;
  const now = new Date();

  const baseTaskWhere: Prisma.DocumentTaskWhereInput = {
    companyId,
    assignedToUserId: session.userId,
    status: { not: "COMPLETED" },
    NOT: { outgoingRequest: { status: "CANCELLED" } },
  };

  const [pendientes, atrasadas, myPendingCR, returnedOutgoing, top5] = await Promise.all([
    prisma.documentTask.count({ where: baseTaskWhere }),
    prisma.documentTask.count({
      where: { ...baseTaskWhere, dueDate: { lt: now } },
    }),
    prisma.changeRequest.count({
      where: {
        companyId,
        requestedByUserId: session.userId,
        status: "PENDING",
      },
    }),
    // RETURNED outgoing requests the user must correct
    prisma.outgoingRequest.count({
      where: {
        companyId,
        status: "RETURNED",
        tasks: { some: { assignedToUserId: session.userId } },
      },
    }),
    prisma.documentTask.findMany({
      where: baseTaskWhere,
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
    returnedOutgoing,
    top5: top5.map((t) => ({
      id: t.id,
      type: t.type,
      dueDate: t.dueDate?.toISOString() ?? null,
      docName: t.file.nombreDocumento || t.file.name,
      fileId: t.file.id,
    })),
  });
}
