import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireActiveSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET /api/superadmin/industries — list all industries (platform-wide, not per-company)
export async function GET() {
  const session = await requireActiveSession();
  if (!session || session.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const industries = await prisma.industryOption.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true, createdAt: true },
  });

  return NextResponse.json({ industries });
}

const createSchema = z.object({
  name: z.string().min(1).max(100).trim(),
});

// POST /api/superadmin/industries — create a new industry option
export async function POST(req: NextRequest) {
  const session = await requireActiveSession();
  if (!session || session.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Nombre inválido" }, { status: 400 });

  const exists = await prisma.industryOption.findFirst({
    where: { name: { equals: parsed.data.name, mode: "insensitive" } },
  });
  if (exists) return NextResponse.json({ error: "Ya existe una industria con ese nombre" }, { status: 409 });

  const industry = await prisma.industryOption.create({
    data: { name: parsed.data.name },
  });

  return NextResponse.json({ industry }, { status: 201 });
}
