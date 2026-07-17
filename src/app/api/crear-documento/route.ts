import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { requireActiveSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logAction } from "@/lib/audit";
import { downloadBytes } from "@/lib/storage";
import { isSpreadsheet, parsePreview } from "@/lib/parseSpreadsheet";

const PREFIX: Record<string, string> = {
  PROCEDIMIENTO: "PR", MANUAL: "MA", INSTRUCTIVO: "IN",
  FORMATO: "FO", POLITICA: "PO", OTRO: "OT",
};

async function suggestNextCode(companyId: string, tipoDocumento: string): Promise<string> {
  const prefix = PREFIX[tipoDocumento] ?? "OT";
  const existing = await prisma.file.findMany({
    where: { companyId, codigo: { startsWith: `${prefix}-` } },
    select: { codigo: true },
  });
  let max = 0;
  for (const f of existing) {
    const n = parseInt((f.codigo ?? "").split("-").pop() ?? "0", 10);
    if (!isNaN(n) && n > max) max = n;
  }
  return `${prefix}-${String(max + 1).padStart(3, "0")}`;
}

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
  codigo:          z.string().max(50).optional().nullable(),

  // Ordered list of reviewer user IDs (empty = external folder direct upload)
  reviewerIds: z.array(z.string()).max(10).default([]),
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

  const { storageKey, name, mimeType, size, nombreDocumento, departamento, tipoDocumento, versionStr, folderId, reviewerIds, codigo } = parsed.data;

  // Validate storage key belongs to this company
  if (!storageKey.startsWith(`${companyId}/`)) {
    return NextResponse.json({ error: "Invalid storage key" }, { status: 400 });
  }

  // Check if target folder is external (bypasses review chain)
  let isExternalFolder = false;
  if (folderId) {
    const folder = await prisma.folder.findFirst({
      where: { id: folderId, companyId, deletedAt: null },
      select: { isExternal: true },
    });
    if (!folder) return NextResponse.json({ error: "Carpeta no encontrada" }, { status: 404 });
    isExternalFolder = folder.isExternal;
  }

  // Validate reviewers (required unless external folder)
  if (!isExternalFolder && reviewerIds.length === 0) {
    return NextResponse.json({ error: "Se requiere al menos un revisor" }, { status: 400 });
  }

  let reviewers: { id: string; name: string; email: string }[] = [];
  if (!isExternalFolder && reviewerIds.length > 0) {
    reviewers = await prisma.user.findMany({
      where: { id: { in: reviewerIds }, companyId, isActive: true, role: { not: "SUPER_ADMIN" } },
      select: { id: true, name: true, email: true },
    });
    if (reviewers.length !== reviewerIds.length) {
      return NextResponse.json({ error: "Uno o más revisores no son válidos" }, { status: 400 });
    }
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
  // eslint-disable-next-line prefer-const
  let result!: { file: { id: string }; chain: { id: string } | null; tasks: { id: string }[] };
  try {
    result = await prisma.$transaction(async (tx) => {
      if (isExternalFolder) {
        // External folder: skip review chain, go directly to REVIEWED
        const file = await tx.file.create({
          data: {
            companyId,
            folderId:         folderId ?? null,
            name,
            storageKey,
            mimeType,
            size,
            nombreDocumento,
            departamento,
            tipoDocumento,
            versionStr,
            codigo:           codigo?.trim() || null,
            status:           "REVIEWED",
            uploadedByUserId: userId,
            fechaEmision:     new Date(),
            previewRows:      previewRows ?? undefined,
          },
        });
        return { file, chain: null, tasks: [] };
      }

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
          codigo:          codigo?.trim() || null,
          status:          "IN_REVIEW",
          uploadedByUserId: userId,
          fechaEmision:    new Date(),
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
              status:          "PENDING",
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
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      const suggested = await suggestNextCode(companyId, tipoDocumento);
      return NextResponse.json(
        { error: `El código "${codigo?.trim()}" ya está en uso. Siguiente disponible: ${suggested}` },
        { status: 409 }
      );
    }
    throw err;
  }

  await logAction({
    companyId,
    userId,
    action: "FILE_UPLOAD",
    resourceType: "FILE",
    resourceId: result.file.id,
    detail: isExternalFolder
      ? `Subida directa (carpeta externa): ${nombreDocumento}`
      : `Creación de documento: ${nombreDocumento} — ${orderedReviewers.length} revisor(es)`,
  });

  return NextResponse.json({ ok: true, fileId: result.file.id });
}
