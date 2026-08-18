import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireActiveSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const patchSchema = z.object({ name: z.string().min(1).max(100).trim() });

// PATCH /api/admin/document-types/[id] — rename
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await requireActiveSession();
  if (!session?.companyId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "COMPANY_ADMIN") return NextResponse.json({ error: "Prohibido" }, { status: 403 });

  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Nombre inválido" }, { status: 400 });

  const docType = await prisma.documentTypeOption.findFirst({
    where: { id: params.id, companyId: session.companyId },
  });
  if (!docType) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

  const dup = await prisma.documentTypeOption.findFirst({
    where: { companyId: session.companyId, name: { equals: parsed.data.name, mode: "insensitive" }, NOT: { id: params.id } },
  });
  if (dup) return NextResponse.json({ error: "Ya existe un tipo de documento con ese nombre" }, { status: 409 });

  const updated = await prisma.documentTypeOption.update({
    where: { id: params.id },
    data: { name: parsed.data.name },
  });

  return NextResponse.json({ documentType: updated });
}

// DELETE /api/admin/document-types/[id]
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await requireActiveSession();
  if (!session?.companyId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "COMPANY_ADMIN") return NextResponse.json({ error: "Prohibido" }, { status: 403 });

  const docType = await prisma.documentTypeOption.findFirst({
    where: { id: params.id, companyId: session.companyId },
  });
  if (!docType) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

  // Check if any files use this document type name
  const usageCount = await prisma.file.count({
    where: { companyId: session.companyId, tipoDocumento: docType.name, deletedAt: null },
  });

  if (usageCount > 0) {
    return NextResponse.json(
      { error: `Este tipo de documento está en uso por ${usageCount} documento(s). Reasigna esos documentos antes de eliminarlo.`, usageCount },
      { status: 409 }
    );
  }

  await prisma.documentTypeOption.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
