import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireActiveSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resolveFolderAccess, resolveFileAccess, atLeast } from "@/lib/permissions";
import { logAction } from "@/lib/audit";

// GET /api/folders/[id] — list folder contents visible to this user, plus breadcrumb.
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await requireActiveSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!session.companyId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const companyId = session.companyId;

  const folder = await prisma.folder.findFirst({
    where: { id: params.id, companyId, deletedAt: null },
  });
  if (!folder) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const level = await resolveFolderAccess(session.userId, companyId, session.role, folder.id);
  if (!atLeast(level, "READ")) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const isAdmin = session.role === "COMPANY_ADMIN";

  const [allSubfolders, allFiles] = await Promise.all([
    prisma.folder.findMany({
      where: { companyId, parentId: folder.id, deletedAt: null },
      orderBy: { createdAt: "asc" },
    }),
    prisma.file.findMany({
      where: {
        companyId, folderId: folder.id, deletedAt: null,
        ...(!isAdmin ? {
          OR: [
            { status: { not: "PENDING_APPROVAL" } },
            { uploadedByUserId: session.userId },
          ],
        } : {}),
      },
      orderBy: { createdAt: "asc" },
      include: { assignedTo: { select: { id: true, name: true } } },
    }),
  ]);

  function serializeFile(f: (typeof allFiles)[number]) {
    return {
      ...f,
      reviewDueDate:  f.reviewDueDate?.toISOString() ?? null,
      assignedToName: f.assignedTo?.name ?? null,
    };
  }

  let subfolders: typeof allSubfolders;
  let serializedFiles: ReturnType<typeof serializeFile>[];

  if (isAdmin) {
    subfolders = allSubfolders;
    serializedFiles = allFiles.map(serializeFile);
  } else {
    const results = await Promise.all([
      Promise.all(
        allSubfolders.map(async (f) => {
          const lvl = await resolveFolderAccess(session.userId, companyId, session.role, f.id);
          return atLeast(lvl, "READ") ? f : null;
        })
      ).then((r) => r.filter((x): x is (typeof allSubfolders)[number] => x !== null)),
      Promise.all(
        allFiles.map(async (f) => {
          const lvl = await resolveFileAccess(session.userId, companyId, session.role, f.id);
          return atLeast(lvl, "READ") ? serializeFile(f) : null;
        })
      ).then((r) => r.filter((x): x is ReturnType<typeof serializeFile> => x !== null)),
    ]);
    [subfolders, serializedFiles] = results;
  }

  // Walk up the tree to build breadcrumb.
  const breadcrumb: { id: string; name: string }[] = [];
  let cur: { id: string; name: string; parentId: string | null } | null = folder;
  while (cur) {
    breadcrumb.unshift({ id: cur.id, name: cur.name });
    if (!cur.parentId) break;
    cur = await prisma.folder.findFirst({
      where: { id: cur.parentId, companyId },
      select: { id: true, name: true, parentId: true },
    });
  }

  return NextResponse.json({ folder, subfolders, files: serializedFiles, breadcrumb });
}

const patchSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  parentId: z.string().nullable().optional(),
});

// PATCH /api/folders/[id] — rename or move (requires MANAGE on this folder).
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await requireActiveSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!session.companyId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const companyId = session.companyId;

  if (session.role === "VIEWER") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const folder = await prisma.folder.findFirst({
    where: { id: params.id, companyId, deletedAt: null },
  });
  if (!folder) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const level = await resolveFolderAccess(session.userId, companyId, session.role, folder.id);
  if (level === "NONE") return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!atLeast(level, "MANAGE")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const { name, parentId } = parsed.data;

  if (parentId !== undefined && parentId !== null) {
    if (parentId === folder.id) {
      return NextResponse.json({ error: "Cannot move folder into itself" }, { status: 400 });
    }
    const target = await prisma.folder.findFirst({
      where: { id: parentId, companyId, deletedAt: null },
    });
    if (!target) return NextResponse.json({ error: "Target folder not found" }, { status: 404 });
  }

  const updated = await prisma.folder.update({
    where: { id: folder.id },
    data: {
      ...(name !== undefined ? { name } : {}),
      ...(parentId !== undefined ? { parentId } : {}),
    },
  });

  await logAction({
    companyId,
    userId: session.userId,
    action: name !== undefined ? "FOLDER_RENAME" : "FOLDER_MOVE",
    resourceType: "FOLDER",
    resourceId: folder.id,
    detail: name ?? `moved to ${parentId ?? "root"}`,
  });

  return NextResponse.json({ folder: updated });
}

// DELETE /api/folders/[id] — soft delete / move to trash (requires MANAGE).
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await requireActiveSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!session.companyId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const companyId = session.companyId;

  if (session.role === "VIEWER") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const folder = await prisma.folder.findFirst({
    where: { id: params.id, companyId, deletedAt: null },
  });
  if (!folder) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const level = await resolveFolderAccess(session.userId, companyId, session.role, folder.id);
  if (level === "NONE") return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!atLeast(level, "MANAGE")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  await prisma.folder.update({
    where: { id: folder.id },
    data: { deletedAt: new Date() },
  });

  await logAction({
    companyId,
    userId: session.userId,
    action: "FOLDER_DELETE",
    resourceType: "FOLDER",
    resourceId: folder.id,
    detail: folder.name,
  });

  return NextResponse.json({ ok: true });
}
