import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireActiveSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resolveFolderAccess, atLeast } from "@/lib/permissions";
import { logAction } from "@/lib/audit";

// GET /api/externos — returns external folders + their files, filtered by user permissions.
export async function GET() {
  const session = await requireActiveSession();
  if (!session || !session.companyId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { companyId, userId, role } = session;
  const isAdmin = role === "COMPANY_ADMIN";

  const allFolders = await prisma.folder.findMany({
    where: { companyId, isExternal: true, deletedAt: null },
    orderBy: { name: "asc" },
    select: { id: true, name: true, parentId: true, isExternal: true },
  });

  // Filter folders by user permissions
  let visibleFolders: typeof allFolders;
  if (isAdmin) {
    visibleFolders = allFolders;
  } else {
    const results = await Promise.all(
      allFolders.map(async (f) => {
        const lvl = await resolveFolderAccess(userId, companyId, role, f.id);
        return atLeast(lvl, "READ") ? f : null;
      })
    );
    visibleFolders = results.filter((f): f is (typeof allFolders)[number] => f !== null);
  }

  const visibleFolderIds = visibleFolders.map((f) => f.id);

  const files = visibleFolderIds.length === 0 ? [] : await prisma.file.findMany({
    where: {
      companyId,
      folderId: { in: visibleFolderIds },
      deletedAt: null,
      ...(!isAdmin ? { status: "REVIEWED" } : {}),
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true, name: true, nombreDocumento: true, folderId: true,
      mimeType: true, size: true, tipoDocumento: true, versionStr: true,
      status: true, createdAt: true, uploadedByUserId: true,
      uploadedBy: { select: { id: true, name: true } },
    },
  });

  return NextResponse.json({
    folders: visibleFolders,
    files: files.map((f) => ({ ...f, createdAt: f.createdAt.toISOString() })),
  });
}

const createSchema = z.object({
  name: z.string().min(1).max(255),
});

// POST /api/externos — admin creates a new external folder.
export async function POST(req: NextRequest) {
  const session = await requireActiveSession();
  if (!session || !session.companyId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "COMPANY_ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { companyId, userId } = session;

  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const folder = await prisma.folder.create({
    data: { companyId, name: parsed.data.name, isExternal: true },
  });

  await logAction({
    companyId,
    userId,
    action: "FOLDER_CREATE",
    resourceType: "FOLDER",
    resourceId: folder.id,
    detail: `Carpeta externa: ${parsed.data.name}`,
  });

  return NextResponse.json({ folder }, { status: 201 });
}
