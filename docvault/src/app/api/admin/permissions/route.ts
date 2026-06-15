import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireActiveSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resolveFolderAccess, resolveFileAccess } from "@/lib/permissions";
import { logAction } from "@/lib/audit";
import type { AccessLevel } from "@prisma/client";

// Walk the folder tree from folderId upward and return a human-readable label
// indicating which folder is the source of the user's access.
async function findInheritanceSource(
  userId: string,
  companyId: string,
  folderId: string | null
): Promise<string> {
  let currentId = folderId;
  while (currentId) {
    const perm = await prisma.permission.findFirst({
      where: { companyId, userId, folderId: currentId, fileId: null },
    });
    if (perm) {
      const folder = await prisma.folder.findUnique({
        where: { id: currentId },
        select: { name: true },
      });
      return `folder:${folder?.name ?? currentId}`;
    }
    const folder = await prisma.folder.findFirst({
      where: { id: currentId, companyId },
      select: { parentId: true },
    });
    currentId = folder?.parentId ?? null;
  }
  return "none";
}

// GET /api/admin/permissions?folderId=xxx  OR  ?fileId=xxx
// Returns every company user with their explicit permission (if any) on this
// resource, their resolved effective access, and where that access comes from.
export async function GET(req: NextRequest) {
  const session = await requireActiveSession();
  if (!session || !session.companyId || session.role !== "COMPANY_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const companyId = session.companyId;

  const { searchParams } = new URL(req.url);
  const folderId = searchParams.get("folderId") ?? undefined;
  const fileId = searchParams.get("fileId") ?? undefined;

  if (!folderId && !fileId) {
    return NextResponse.json({ error: "folderId or fileId required" }, { status: 400 });
  }

  if (folderId) {
    const folder = await prisma.folder.findFirst({
      where: { id: folderId, companyId, deletedAt: null },
    });
    if (!folder) return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (fileId) {
    const file = await prisma.file.findFirst({
      where: { id: fileId, companyId, deletedAt: null },
    });
    if (!file) return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const users = await prisma.user.findMany({
    where: { companyId },
    orderBy: [{ role: "asc" }, { name: "asc" }],
  });

  const entries = await Promise.all(
    users.map(async (user) => {
      const explicitRecord = await prisma.permission.findFirst({
        where: {
          companyId,
          userId: user.id,
          ...(folderId
            ? { folderId, fileId: null }
            : { fileId, folderId: null }),
        },
      });
      const explicit: AccessLevel | null = explicitRecord?.accessLevel ?? null;

      let effective: AccessLevel;
      let source: string;

      if (user.role === "COMPANY_ADMIN") {
        effective = "MANAGE";
        source = "admin";
      } else if (folderId) {
        effective = await resolveFolderAccess(user.id, companyId, user.role, folderId);
        source = explicitRecord
          ? "direct"
          : effective !== "NONE"
          ? await findInheritanceSource(user.id, companyId, folderId)
          : "none";
      } else {
        effective = await resolveFileAccess(user.id, companyId, user.role, fileId!);
        if (explicitRecord) {
          source = "direct";
        } else if (effective !== "NONE") {
          const file = await prisma.file.findUnique({
            where: { id: fileId! },
            select: { folderId: true },
          });
          source = await findInheritanceSource(user.id, companyId, file?.folderId ?? null);
        } else {
          source = "none";
        }
      }

      return {
        user: { id: user.id, name: user.name, email: user.email, role: user.role },
        explicit,
        effective,
        source,
      };
    })
  );

  return NextResponse.json({ entries });
}

const putSchema = z.object({
  userId: z.string(),
  folderId: z.string().optional(),
  fileId: z.string().optional(),
  // "INHERIT" means remove the explicit record so inheritance takes over.
  accessLevel: z.enum(["INHERIT", "NONE", "READ", "EDIT", "MANAGE"]),
});

// PUT /api/admin/permissions
// Set or clear a user's explicit permission on a folder or file.
export async function PUT(req: NextRequest) {
  const session = await requireActiveSession();
  if (!session || !session.companyId || session.role !== "COMPANY_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const companyId = session.companyId;

  const body = await req.json().catch(() => null);
  const parsed = putSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const { userId, folderId, fileId, accessLevel } = parsed.data;

  if (!folderId && !fileId) {
    return NextResponse.json({ error: "folderId or fileId required" }, { status: 400 });
  }

  const targetUser = await prisma.user.findFirst({
    where: { id: userId, companyId },
  });
  if (!targetUser) return NextResponse.json({ error: "User not found" }, { status: 404 });

  if (folderId) {
    const folder = await prisma.folder.findFirst({
      where: { id: folderId, companyId, deletedAt: null },
    });
    if (!folder) return NextResponse.json({ error: "Folder not found" }, { status: 404 });
  }
  if (fileId) {
    const file = await prisma.file.findFirst({
      where: { id: fileId, companyId, deletedAt: null },
    });
    if (!file) return NextResponse.json({ error: "File not found" }, { status: 404 });
  }

  const resourceType = folderId ? "FOLDER" : "FILE";
  const resourceId = folderId ?? fileId!;
  const whereClause = {
    companyId,
    userId,
    ...(folderId ? { folderId, fileId: null } : { fileId, folderId: null }),
  };

  if (accessLevel === "INHERIT") {
    await prisma.permission.deleteMany({ where: whereClause });
  } else {
    const existing = await prisma.permission.findFirst({ where: whereClause });
    if (existing) {
      await prisma.permission.update({
        where: { id: existing.id },
        data: { accessLevel },
      });
    } else {
      await prisma.permission.create({
        data: {
          companyId,
          userId,
          resourceType,
          folderId: folderId ?? null,
          fileId: fileId ?? null,
          accessLevel,
        },
      });
    }
  }

  await logAction({
    companyId,
    userId: session.userId,
    action: "PERMISSION_CHANGE",
    resourceType,
    resourceId,
    detail: `${targetUser.email} → ${accessLevel} on ${resourceType.toLowerCase()} ${resourceId}`,
  });

  return NextResponse.json({ ok: true });
}
