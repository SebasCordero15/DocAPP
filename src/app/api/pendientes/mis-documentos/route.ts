import { NextResponse } from "next/server";
import { requireActiveSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await requireActiveSession();
  if (!session || !session.companyId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { companyId, userId } = session;

  const files = await prisma.file.findMany({
    where: {
      companyId,
      deletedAt: null,
      status: { notIn: ["OBSOLETE"] },
      OR: [
        { uploadedByUserId: userId },
        { encargadoDocumentoId: userId },
      ],
    },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      name: true,
      nombreDocumento: true,
      codigo: true,
      versionStr: true,
      mimeType: true,
      status: true,
      updatedAt: true,
      createdAt: true,
      folder: { select: { id: true, name: true } },
      uploadedBy: { select: { id: true, name: true } },
      encargadoDocumento: { select: { id: true, name: true } },
      reviewChain: {
        select: {
          id: true,
          status: true,
          currentStep: true,
          totalSteps: true,
          steps: {
            orderBy: { stepOrder: "asc" },
            select: {
              id: true,
              stepOrder: true,
              status: true,
              rejectionNote: true,
              assignedTo: { select: { id: true, name: true } },
            },
          },
        },
      },
    },
  });

  const counts = {
    DRAFT:     files.filter((f) => f.status === "DRAFT").length,
    IN_REVIEW: files.filter((f) => f.status === "IN_REVIEW").length,
    REVIEWED:  files.filter((f) => f.status === "REVIEWED" || f.status === "PENDING_APPROVAL").length,
  };

  return NextResponse.json({
    files: files.map((f) => {
      const chain = f.reviewChain;
      const activeChain = (chain && chain.status === "IN_REVIEW") ? chain : null;
      return {
        ...f,
        updatedAt:   f.updatedAt.toISOString(),
        createdAt:   f.createdAt.toISOString(),
        activeChain,
        reviewChain: undefined,
      };
    }),
    counts,
  });
}
