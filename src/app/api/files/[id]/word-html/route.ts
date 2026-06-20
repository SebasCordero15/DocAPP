import { NextRequest, NextResponse } from "next/server";
import mammoth from "mammoth";
import { requireActiveSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resolveFileAccess, atLeast } from "@/lib/permissions";
import { downloadBytes } from "@/lib/storage";

const WORD_TYPES = new Set([
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
]);

// GET /api/files/[id]/word-html — convert .docx to HTML server-side using mammoth
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

  if (!WORD_TYPES.has(file.mimeType)) {
    return NextResponse.json({ error: "Not a Word document" }, { status: 400 });
  }

  const level = await resolveFileAccess(session.userId, session.companyId, session.role, file.id);
  if (!atLeast(level, "READ")) return NextResponse.json({ error: "Not found" }, { status: 404 });

  try {
    const bytes = await downloadBytes(file.storageKey);
    const result = await mammoth.convertToHtml({ buffer: bytes });
    return NextResponse.json({ html: result.value });
  } catch {
    return NextResponse.json({ error: "No se pudo convertir el documento" }, { status: 500 });
  }
}
