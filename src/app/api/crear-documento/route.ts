import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireActiveSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logAction } from "@/lib/audit";
import { downloadBytes } from "@/lib/storage";
import { isSpreadsheet, parsePreview } from "@/lib/parseSpreadsheet";

const schema = z.object({
  // File storage (uploaded first via /api/files/upload-url)
  storageKey:   z.string().min(1),
  name:         z.string().min(1).max(500),
  mimeType:     z.string().min(1),
  size:         z.number().int().positive(),

  // Document metadata
  nombreDocumento: z.string().min(1).max(500),
  departamento:    z.string().min(1).max(200),
  tipoDocumento:   z.enum(["PROCEDIMIENTO", "MANUAL", "INSTRUCTIVO", "FORMATO", "POLITICA", "OTRO"]),
  versionStr:      z.string().max(50).default("v1.0"),
  folderId:        z.string().optional(),

  // Ordered list of reviewer user IDs
  reviewerIds: z.array(z.string()).min(1).max(10),
});

// POST /api/crear-documento — create a new document with a sequential review chain
export async function POST(req: NextRequest) {
  const session = await requireActiveSession();
  if (!session || !session.companyId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.role === "VIEWER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { companyId, userId } = session;

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", details: parsed.error.issues }, { status: 400 });
  }

  const { storageKey, name, mimeType, size, nombreDocumento, departamento, tipoDocumento, versionStr, folderId, reviewerIds } = parsed.data;

  // Validate storage key belongs to this company
  if (!storageKey.startsWith(`${companyId}/`)) {
    return NextResponse.json({ error: "Invalid storage key" }, { status: 400 });
  }

  // Validate all reviewers belong to this company and are active
  const reviewers = await prisma.user.findMany({
    where: { id: { in: reviewerIds }, companyId, isActive: true, role: { not: "SUPER_ADMIN" } },
    select: { id: true, name: true, email: true },
  });
  if (reviewers.length !== reviewerIds.length) {
    return NextResponse.json({ error: "Uno o más revisores no son válidos" }, { status: 400 });
  }

  // Build the ordered reviewer list preserving client order
  const orderedReviewers = reviewerIds.map((id) => reviewers.find((r) => r.id === id)!);

  // Get spreadsheet preview if applicable
  let previewRows: string[][] | null = null;
  if (isSpreadsheet(mimeType)) {
    try {
      const bytes = await downloadBytes(storageKey);
      previewRows = await parsePreview(bytes, mimeType);
    } catch { /* non-fatal */ }
  }

  // Create everything in a transaction
  const result = await prisma.$transaction(async (tx) => {
    // Create file record in IN_REVIEW status
    const file = await tx.file.create({
      data: {
        companyId,
        folderId:        folderId ?? null,
        name,
        storageKey,
        mimeType,
        size,
        nombreDocumento,
        departamento,
        tipoDocumento,
        versionStr,
        status:          "IN_REVIEW",
        uploadedByUserId: userId,
        previewRows:     previewRows ?? undefined,
      },
    });

    // Create review chain
    const chain = await tx.reviewChain.create({
      data: {
        companyId,
        fileId:          file.id,
        status:          "IN_REVIEW",
        currentStep:     1,
        totalSteps:      orderedReviewers.length,
        createdByUserId: userId,
      },
    });

    // Create a DocumentTask for each reviewer (in order)
    const tasks = await Promise.all(
      orderedReviewers.map((reviewer, idx) =>
        tx.documentTask.create({
          data: {
            companyId,
            fileId:          file.id,
            assignedToUserId: reviewer.id,
            assignedByUserId: userId,
            type:            "REVIEW",
            status:          idx === 0 ? "PENDING" : "PENDING",  // all start PENDING; only step 1 is active
            reviewChainId:   chain.id,
            stepOrder:       idx + 1,
          },
        })
      )
    );

    // Notify the first reviewer
    await tx.notification.create({
      data: {
        companyId,
        userId:  orderedReviewers[0].id,
        type:    "REVIEW_ASSIGNED",
        message: `Tienes un documento pendiente de revisión: "${nombreDocumento}"`,
        fileId:  file.id,
      },
    });

    return { file, chain, tasks };
  });

  await logAction({
    companyId,
    userId,
    action: "FILE_UPLOAD",
    resourceType: "FILE",
    resourceId: result.file.id,
    detail: `Creación de documento: ${nombreDocumento} — ${orderedReviewers.length} revisor(es)`,
  });

  return NextResponse.json({ ok: true, fileId: result.file.id });
}
