import { NextResponse } from "next/server";
import { requireActiveSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET /api/files/next-codigo — returns the next available DOC-XXX code for the company
export async function GET() {
  const session = await requireActiveSession();
  if (!session || !session.companyId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.role !== "COMPANY_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const companyId = session.companyId;

  // Find the highest existing DOC-NNN code for this company
  const files = await prisma.file.findMany({
    where: {
      companyId,
      codigo: { not: null },
    },
    select: { codigo: true },
  });

  let maxNum = 0;
  for (const f of files) {
    const match = f.codigo?.match(/^DOC-(\d+)$/);
    if (match) {
      const n = parseInt(match[1], 10);
      if (n > maxNum) maxNum = n;
    }
  }

  const next = `DOC-${String(maxNum + 1).padStart(3, "0")}`;
  return NextResponse.json({ codigo: next });
}
