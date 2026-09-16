import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireActiveSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const patchSchema = z.object({ name: z.string().min(1).max(100).trim() });

// PATCH /api/superadmin/industries/[id] — rename
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await requireActiveSession();
  if (!session || session.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Nombre inválido" }, { status: 400 });

  const industry = await prisma.industryOption.findUnique({ where: { id: params.id } });
  if (!industry) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

  const dup = await prisma.industryOption.findFirst({
    where: { name: { equals: parsed.data.name, mode: "insensitive" }, NOT: { id: params.id } },
  });
  if (dup) return NextResponse.json({ error: "Ya existe una industria con ese nombre" }, { status: 409 });

  // Companies currently using this industry follow the rename automatically
  // (industry is matched by name, same pattern as departamento/tipoDocumento).
  const [updated] = await prisma.$transaction([
    prisma.industryOption.update({ where: { id: params.id }, data: { name: parsed.data.name } }),
    prisma.company.updateMany({ where: { industry: industry.name }, data: { industry: parsed.data.name } }),
  ]);

  return NextResponse.json({ industry: updated });
}

// DELETE /api/superadmin/industries/[id]
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await requireActiveSession();
  if (!session || session.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const industry = await prisma.industryOption.findUnique({ where: { id: params.id } });
  if (!industry) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

  const usageCount = await prisma.company.count({ where: { industry: industry.name } });
  if (usageCount > 0) {
    return NextResponse.json(
      { error: `Esta industria está en uso por ${usageCount} empresa(s). Reasígnalas antes de eliminarla.`, usageCount },
      { status: 409 }
    );
  }

  await prisma.industryOption.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
