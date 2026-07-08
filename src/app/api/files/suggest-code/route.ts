import { NextRequest, NextResponse } from "next/server";
import { requireActiveSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const PREFIX: Record<string, string> = {
  PROCEDIMIENTO: "PR",
  MANUAL:        "MA",
  INSTRUCTIVO:   "IN",
  FORMATO:       "FO",
  POLITICA:      "PO",
  OTRO:          "OT",
};

// GET /api/files/suggest-code?tipo=MANUAL
// Returns the next available code for the given document type, e.g. "MA-003"
export async function GET(req: NextRequest) {
  const session = await requireActiveSession();
  if (!session?.companyId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const tipo = req.nextUrl.searchParams.get("tipo") ?? "";
  const prefix = PREFIX[tipo];
  if (!prefix) return NextResponse.json({ error: "Tipo inválido" }, { status: 400 });

  // Find all codes for this company that start with this prefix
  const files = await prisma.file.findMany({
    where: {
      companyId: session.companyId,
      codigo: { startsWith: `${prefix}-` },
      deletedAt: null,
    },
    select: { codigo: true },
  });

  // Extract the numeric part and find the max
  let max = 0;
  for (const f of files) {
    const parts = f.codigo?.split("-") ?? [];
    const num = parseInt(parts[parts.length - 1] ?? "0", 10);
    if (!isNaN(num) && num > max) max = num;
  }

  const next = max + 1;
  const suggested = `${prefix}-${String(next).padStart(3, "0")}`;

  return NextResponse.json({ suggested, prefix, next });
}
