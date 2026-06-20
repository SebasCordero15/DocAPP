import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { requireActiveSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resolveFileAccess, atLeast } from "@/lib/permissions";
import { downloadBytes } from "@/lib/storage";
import { isSpreadsheet } from "@/lib/parseSpreadsheet";

// GET /api/files/[id]/excel-html — parse spreadsheet server-side and return full HTML table
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await requireActiveSession();
  if (!session || !session.companyId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const file = await prisma.file.findFirst({
    where: { id: params.id, companyId: session.companyId, deletedAt: null },
    select: { id: true, storageKey: true, mimeType: true },
  });
  if (!file) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const level = await resolveFileAccess(session.userId, session.companyId, session.role, file.id);
  if (!atLeast(level, "READ")) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (!isSpreadsheet(file.mimeType)) {
    return NextResponse.json({ error: "Not a spreadsheet" }, { status: 400 });
  }

  try {
    const bytes = await downloadBytes(file.storageKey);
    const wb = XLSX.read(bytes, { type: "buffer" });
    const sheets: { name: string; html: string }[] = wb.SheetNames.map((name) => ({
      name,
      html: XLSX.utils.sheet_to_html(wb.Sheets[name], { id: `sheet-${name}` }),
    }));
    return NextResponse.json({ sheets });
  } catch {
    return NextResponse.json({ error: "No se pudo leer el archivo" }, { status: 500 });
  }
}
