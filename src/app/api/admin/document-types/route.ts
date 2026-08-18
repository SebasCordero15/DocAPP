import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireActiveSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET /api/admin/document-types — list all document types for this company (any role)
export async function GET() {
  const session = await requireActiveSession();
  if (!session?.companyId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const documentTypes = await prisma.documentTypeOption.findMany({
    where: { companyId: session.companyId },
    orderBy: { name: "asc" },
    select: { id: true, name: true, createdAt: true },
  });

  return NextResponse.json({ documentTypes });
}

const createSchema = z.object({
  name: z.string().min(1).max(100).trim(),
});

// POST /api/admin/document-types — create a document type (admin only)
export async function POST(req: NextRequest) {
  const session = await requireActiveSession();
  if (!session?.companyId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "COMPANY_ADMIN") return NextResponse.json({ error: "Prohibido" }, { status: 403 });

  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Nombre inválido" }, { status: 400 });

  const exists = await prisma.documentTypeOption.findFirst({
    where: { companyId: session.companyId, name: { equals: parsed.data.name, mode: "insensitive" } },
  });
  if (exists) return NextResponse.json({ error: "Ya existe un tipo de documento con ese nombre" }, { status: 409 });

  const docType = await prisma.documentTypeOption.create({
    data: { companyId: session.companyId, name: parsed.data.name },
  });

  return NextResponse.json({ documentType: docType }, { status: 201 });
}
