import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireActiveSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logAction } from "@/lib/audit";
import { notifyAdminsOfRequest } from "@/lib/changeRequests";

const schema = z.object({
  action:       z.enum(["APPROVE", "REJECT", "RETURN_TO_PREVIOUS"]),
  notes:        z.string().max(2000).optional(),
});

// POST /api/review-chain/[id] — reviewer approves/rejects their step
// [id] is the DocumentTask id (the reviewer's specific step)
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await requireActiveSession();
  if (!session || !session.companyId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { companyId, userId } = session;

  const task = await prisma.documentTask.findFirst({
    where: { id: params.id, companyId, assignedToUserId: userId, status: { in: ["PENDING", "IN_PROGRESS"] } },
    include: {
      reviewChain: {
        include: {
          steps: { orderBy: { stepOrder: "asc" } },
          file:  { select: { id: true, nombreDocumento: true, name: true } },
        },
      },
    },
  });
  if (!task) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!task.reviewChain) return NextResponse.json({ error: "No review chain" }, { status: 400 });

  const chain  = task.reviewChain;
  const file   = chain.file;
  const docName = file.nombreDocumento || file.name;

  // Only the current step can act
  if (task.stepOrder !== chain.currentStep) {
    return NextResponse.json({ error: "No es tu turno de revisar" }, { status: 400 });
  }

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const { action, notes } = parsed.data;

  if ((action === "REJECT" || action === "RETURN_TO_PREVIOUS") && !notes?.trim()) {
    return NextResponse.json({ error: "Se requiere una nota para rechazar o devolver" }, { status: 400 });
  }

  const now = new Date();

  if (action === "APPROVE") {
    await prisma.$transaction(async (tx) => {
      // Mark this step as completed
      await tx.documentTask.update({
        where: { id: task.id },
        data: { status: "COMPLETED", completedAt: now, notes: notes ?? null },
      });

      const nextStep = chain.currentStep + 1;
      if (nextStep <= chain.totalSteps) {
        // Advance to next step
        await tx.reviewChain.update({
          where: { id: chain.id },
          data: { currentStep: nextStep },
        });
        // Notify next reviewer
        const nextTask = chain.steps.find((s) => s.stepOrder === nextStep);
        if (nextTask) {
          await tx.notification.create({
            data: {
              companyId,
              userId:  nextTask.assignedToUserId,
              type:    "REVIEW_ASSIGNED",
              message: `Tienes un documento pendiente de revisión: "${docName}"`,
              fileId:  file.id,
            },
          });
        }
      } else {
        // All steps completed — mark chain done and send to admin for final approval
        await tx.reviewChain.update({
          where: { id: chain.id },
          data: { status: "COMPLETED" },
        });
        await tx.file.update({
          where: { id: file.id },
          data: { status: "PENDING_APPROVAL" },
        });
        // Create a ChangeRequest for admin final approval
        await tx.changeRequest.create({
          data: {
            companyId,
            type:             "NEW_UPLOAD",
            status:           "PENDING",
            fileId:           file.id,
            requestedByUserId: chain.createdByUserId,
            proposedChanges:  { name: file.name, reviewChainCompleted: true },
          },
        });
        // Notify admins
        await notifyAdminsOfRequest({ companyId, fileId: file.id, docName, type: "NEW_UPLOAD" });
      }
    });

    await logAction({
      companyId, userId, action: "FILE_REVIEW_COMPLETE",
      resourceType: "FILE", resourceId: file.id,
      detail: `Paso ${task.stepOrder}/${chain.totalSteps} aprobado — ${docName}`,
    });

    return NextResponse.json({ ok: true, action: "APPROVED", step: task.stepOrder, total: chain.totalSteps });
  }

  if (action === "REJECT") {
    // Reject the entire chain — return to creator
    await prisma.$transaction(async (tx) => {
      await tx.documentTask.update({
        where: { id: task.id },
        data: { status: "COMPLETED", completedAt: now, notes, rejectionNote: notes },
      });
      await tx.reviewChain.update({
        where: { id: chain.id },
        data: { status: "REJECTED", rejectionNote: notes ?? null },
      });
      await tx.file.update({
        where: { id: file.id },
        data: { status: "DRAFT" },
      });
      // Notify creator
      await tx.notification.create({
        data: {
          companyId,
          userId:  chain.createdByUserId,
          type:    "REVIEW_REJECTED",
          message: `Tu documento "${docName}" fue rechazado por ${session.role}. Motivo: ${notes}`,
          fileId:  file.id,
        },
      });
    });

    await logAction({
      companyId, userId, action: "FILE_REVIEW_UPDATE",
      resourceType: "FILE", resourceId: file.id,
      detail: `Paso ${task.stepOrder} rechazado — ${docName} — ${notes}`,
    });

    return NextResponse.json({ ok: true, action: "REJECTED" });
  }

  if (action === "RETURN_TO_PREVIOUS") {
    if (task.stepOrder === 1) {
      return NextResponse.json({ error: "Este es el primer paso, no hay revisor anterior" }, { status: 400 });
    }
    await prisma.$transaction(async (tx) => {
      await tx.documentTask.update({
        where: { id: task.id },
        data: { status: "PENDING", notes: null },
      });
      const prevStep = chain.currentStep - 1;
      const prevTask = chain.steps.find((s) => s.stepOrder === prevStep);
      if (prevTask) {
        await tx.documentTask.update({
          where: { id: prevTask.id },
          data: { status: "PENDING", completedAt: null },
        });
        await tx.notification.create({
          data: {
            companyId,
            userId:  prevTask.assignedToUserId,
            type:    "REVIEW_RETURNED",
            message: `El documento "${docName}" fue devuelto para tu revisión. Nota: ${notes}`,
            fileId:  file.id,
          },
        });
      }
      await tx.reviewChain.update({
        where: { id: chain.id },
        data: { currentStep: prevStep },
      });
    });

    await logAction({
      companyId, userId, action: "FILE_REVIEW_UPDATE",
      resourceType: "FILE", resourceId: file.id,
      detail: `Paso ${task.stepOrder} devuelto al paso ${task.stepOrder - 1} — ${docName}`,
    });

    return NextResponse.json({ ok: true, action: "RETURNED" });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
