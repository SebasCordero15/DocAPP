import { NextRequest, NextResponse } from "next/server";
import { requireActiveSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isAdminRole } from "@/lib/permissions";
import { presignDownload } from "@/lib/storage";

// GET /api/change-requests/[id]/proposal-url
// Returns a presigned download URL for the proposal file attached to a REVISION_REQUEST.
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await requireActiveSession();
  if (!session || !session.companyId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdminRole(session.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const cr = await prisma.changeRequest.findFirst({
    where: { id: params.id, companyId: session.companyId, type: "REVISION_REQUEST" },
  });
  if (!cr) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const pc = cr.proposedChanges as Record<string, unknown>;
  const storageKey = pc.proposalStorageKey as string | undefined;
  if (!storageKey) return NextResponse.json({ error: "No proposal file attached" }, { status: 404 });

  const fileName = (pc.proposalFileName as string | undefined) ?? "propuesta";
  const url = await presignDownload(storageKey, fileName);
  return NextResponse.json({ url, fileName });
}
