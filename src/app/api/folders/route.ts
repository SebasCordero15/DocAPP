import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireActiveSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resolveFolderAccess, resolveFileAccess, atLeast } from "@/lib/permissions";
import { logAction } from "@/lib/audit";

// GET /api/folders — list root-level folders (and root-level files) accessible to this user.
export async function GET() {
  const session = await requireActiveSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!session.companyId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const companyId = session.companyId;

  const isAdmin = session.role === "COMPANY_ADMIN";

  const [allFolders, allFiles] = await Promise.all([
    prisma.folder.findMany({
      where: { companyId, parentId: null, deletedAt: null },
      orderBy: { createdAt: "asc" },
    }),
    prisma.file.findMany({
      where: {
        companyId, folderId: null, deletedAt: null,
        // Non-admins: only show fully approved files, own uploads, or active task assignments
        ...(!isAdmin ? {
          OR: [
            { status: "REVIEWED" },
            { uploadedByUserId: session.userId },
            { tasks: { some: { assignedToUserId: session.userId, status: { not: "COMPLETED" } } } },
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

  if (isAdmin) {
    return NextResponse.json({ folders: allFolders, files: allFiles.map(serializeFile) });
  }

  // Non-admins: filter each item by their effective permission.
  const [folders, files] = await Promise.all([
    Promise.all(
      allFolders.map(async (f) => {
        const lvl = await resolveFolderAccess(session.userId, companyId, session.role, f.id);
        return atLeast(lvl, "READ") ? f : null;
      })
    ).then((r) => r.filter(Boolean)),
    Promise.all(
      allFiles.map(async (f) => {
        const lvl = await resolveFileAccess(session.userId, companyId, session.role, f.id);
        return atLeast(lvl, "READ") ? serializeFile(f) : null;
      })
    ).then((r) => r.filter(Boolean)),
  ]);

  return NextResponse.json({ folders, files });
}

const createSchema = z.object({
  name: z.string().min(1).max(255),
  parentId: z.string().optional(),
});

// POST /api/folders — create a folder.
// Root folders (no parentId) require COMPANY_ADMIN. Subfolders require EDIT+ on the parent.
export async function POST(req: NextRequest) {
  const session = await requireActiveSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!session.companyId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const companyId = session.companyId;

  if (session.role === "VIEWER") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const { name, parentId } = parsed.data;

  if (parentId) {
    const parent = await prisma.folder.findFirst({
      where: { id: parentId, companyId, deletedAt: null },
    });
    if (!parent) return NextResponse.json({ error: "Parent folder not found" }, { status: 404 });

    const level = await resolveFolderAccess(session.userId, companyId, session.role, parentId);
    if (level === "NONE") return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (!atLeast(level, "EDIT")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  } else {
    if (session.role !== "COMPANY_ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const folder = await prisma.folder.create({
    data: { companyId, name, parentId: parentId ?? null },
  });

  await logAction({
    companyId,
    userId: session.userId,
    action: "FOLDER_CREATE",
    resourceType: "FOLDER",
    resourceId: folder.id,
    detail: name,
  });

  return NextResponse.json({ folder }, { status: 201 });
}
