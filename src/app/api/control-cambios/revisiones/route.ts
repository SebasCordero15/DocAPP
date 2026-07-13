import { NextResponse } from "next/server";
import { requireActiveSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isAdminRole } from "@/lib/permissions";

// GET /api/control-cambios/revisiones
// Returns two lists:
//  - programadas: files with fechaRevision >= today
//  - asignadas: active OutgoingRequests of type REVISION
export async function GET() {
  const session = await requireActiveSession();
  if (!session || !session.companyId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { companyId, userId, role } = session;
  const isAdmin = isAdminRole(role);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [programadas, asignadas] = await Promise.all([
    prisma.file.findMany({
      where: {
        companyId,
        deletedAt: null,
        fechaRevision: { gte: today },
        ...(!isAdmin ? {
          OR: [
            { status: "REVIEWED" },
            { uploadedByUserId: userId },
            { encargadoDocumentoId: userId },
          ],
        } : {}),
      },
      orderBy: { fechaRevision: "asc" },
      select: {
        id: true, name: true, codigo: true, nombreDocumento: true,
        fechaRevision: true, versionStr: true,
        encargadoDocumento: { select: { id: true, name: true, email: true } },
        folder: { select: { id: true, name: true } },
      },
    }),

    prisma.outgoingRequest.findMany({
      where: {
        companyId,
        type: { in: ["REVISION", "ACTUALIZACION", "CORRECCION"] },
        status: { in: ["PENDING", "IN_PROGRESS", "PENDING_APPROVAL"] },
        ...(!isAdmin ? {
          tasks: { some: { assignedToUserId: userId } },
        } : {}),
      },
      orderBy: { createdAt: "asc" },
      select: {
        id: true, type: true, status: true, instructions: true,
        currentStep: true, totalSteps: true,
        createdAt: true,
        file: {
          select: {
            id: true, name: true, codigo: true, nombreDocumento: true,
            fechaRevision: true, versionStr: true,
            folder: { select: { id: true, name: true } },
          },
        },
        tasks: {
          select: {
            stepOrder: true, status: true,
            assignedTo: { select: { id: true, name: true } },
          },
          orderBy: { stepOrder: "asc" },
        },
        createdBy: { select: { id: true, name: true } },
      },
    }),
  ]);

  return NextResponse.json({
    programadas: programadas.map((f) => ({
      ...f,
      fechaRevision: f.fechaRevision?.toISOString() ?? null,
    })),
    asignadas: asignadas.map((r) => ({
      ...r,
      createdAt: r.createdAt.toISOString(),
      file: {
        ...r.file,
        fechaRevision: r.file.fechaRevision?.toISOString() ?? null,
      },
    })),
  });
}
