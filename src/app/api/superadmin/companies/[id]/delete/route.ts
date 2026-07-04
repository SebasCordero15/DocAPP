import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireActiveSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logAction } from "@/lib/audit";

const schema = z.object({
  confirmName: z.string().min(1),
});

// POST /api/superadmin/companies/[id]/delete
// Soft-delete: sets deletedAt + isActive=false.
// The company and all its data remain in the DB and can be restored.
// Requires typing the company name to confirm.
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await requireActiveSession();
  if (!session || session.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }

  const company = await prisma.company.findUnique({
    where: { id: params.id },
    select: { id: true, name: true, slug: true, deletedAt: true },
  });
  if (!company) {
    return NextResponse.json({ error: "Empresa no encontrada" }, { status: 404 });
  }
  if (company.deletedAt) {
    return NextResponse.json({ error: "La empresa ya está archivada" }, { status: 409 });
  }
  if (parsed.data.confirmName !== company.name) {
    return NextResponse.json(
      { error: "El nombre de confirmación no coincide con el nombre de la empresa" },
      { status: 400 }
    );
  }

  // Log BEFORE the destructive operation so the audit record is tied to the company
  await logAction({
    companyId: params.id,
    userId: session.userId,
    action: "COMPANY_DELETED",
    resourceType: "COMPANY",
    resourceId: params.id,
    detail: `${company.name} (${company.slug}) — archivada por super admin`,
  });

  // Soft delete: stamp deletedAt and deactivate. All data stays intact.
  await prisma.company.update({
    where: { id: params.id },
    data: { deletedAt: new Date(), isActive: false },
  });

  return NextResponse.json({ ok: true, archived: true, companyName: company.name });
}

// DELETE /api/superadmin/companies/[id]/delete  (restore)
// Clears deletedAt and re-activates the company.
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await requireActiveSession();
  if (!session || session.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const company = await prisma.company.findUnique({
    where: { id: params.id },
    select: { id: true, name: true, slug: true, deletedAt: true },
  });
  if (!company) {
    return NextResponse.json({ error: "Empresa no encontrada" }, { status: 404 });
  }
  if (!company.deletedAt) {
    return NextResponse.json({ error: "La empresa no está archivada" }, { status: 409 });
  }

  await prisma.company.update({
    where: { id: params.id },
    data: { deletedAt: null, isActive: true },
  });

  await logAction({
    companyId: params.id,
    userId: session.userId,
    action: "COMPANY_RESTORED",
    resourceType: "COMPANY",
    resourceId: params.id,
    detail: `${company.name} (${company.slug}) — restaurada por super admin`,
  });

  return NextResponse.json({ ok: true, restored: true, companyName: company.name });
}
