import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireActiveSession } from "@/lib/auth";
import { resolveFileAccess, atLeast } from "@/lib/permissions";
import { makeStorageKey, presignUpload } from "@/lib/storage";

const schema = z.object({
  fileId:   z.string().min(1),
  name:     z.string().min(1).max(500),
  mimeType: z.string().min(1),
  size:     z.number().int().positive().max(50 * 1024 * 1024),
});

// POST /api/change-requests/proposal-upload-url
// Returns a presigned URL so the browser can upload a proposal file to R2.
// The file is stored but NOT registered as a File DB record.
export async function POST(req: NextRequest) {
  const session = await requireActiveSession();
  if (!session || !session.companyId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const { fileId, name, mimeType, size: _size } = parsed.data;

  const level = await resolveFileAccess(session.userId, session.companyId, session.role, fileId);
  if (!atLeast(level, "EDIT")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const storageKey = makeStorageKey(session.companyId, "proposals", name);
  const uploadUrl  = await presignUpload(storageKey, mimeType);

  return NextResponse.json({ uploadUrl, storageKey });
}
