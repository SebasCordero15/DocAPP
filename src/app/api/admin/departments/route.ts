import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireActiveSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET /api/admin/departments — list all departments for this company (any role)
export async function GET() {
  const session = await requireActiveSession();
  if (!session?.companyId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const departments = await prisma.department.findMany({
    where: { companyId: session.companyId },
    orderBy: { name: "asc" },
    select: { id: true, name: true, createdAt: true },
  });

  return NextResponse.json({ departments });
}

const createSchema = z.object({
  name: z.string().min(1).max(100).trim(),
});

// POST /api/admin/departments — create a department (admin only)
export async function POST(req: NextRequest) {
  const session = await requireActiveSession();
  if (!session?.companyId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "COMPANY_ADMIN") return NextResponse.json({ error: "Prohibido" }, { status: 403 });

  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Nombre inválido" }, { status: 400 });

  const exists = await prisma.department.findFirst({
    where: { companyId: session.companyId, name: { equals: parsed.data.name, mode: "insensitive" } },
  });
  if (exists) return NextResponse.json({ error: "Ya existe un departamento con ese nombre" }, { status: 409 });

  const dept = await prisma.department.create({
    data: { companyId: session.companyId, name: parsed.data.name },
  });

  return NextResponse.json({ department: dept }, { status: 201 });
}
