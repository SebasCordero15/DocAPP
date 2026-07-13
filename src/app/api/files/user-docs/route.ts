import { NextResponse } from "next/server";
import { requireActiveSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isAdminRole } from "@/lib/permissions";

// GET /api/files/user-docs
// Returns documents where the current user has EDIT or higher access:
//   - uploaded by the user
//   - encargado del documento
//   - explicit file permission EDIT/MANAGE
//   - in a folder where the user has EDIT/MANAGE permission
export async function GET() {
  const session = await requireActiveSession();
  if (!session || !session.companyId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { companyId, userId, role } = session;

  // Admins have access to everything — redirect them away (they don't use these forms)
  if (isAdminRole(role)) return NextResponse.json({ files: [] });

  // Folder IDs where user has explicit EDIT/MANAGE permission
  const folderPerms = await prisma.permission.findMany({
    where: {
      companyId, userId,
      resourceType: "FOLDER",
      accessLevel: { in: ["EDIT", "MANAGE"] },
    },
    select: { folderId: true },
  });
  const editFolderIds = folderPerms.map((p) => p.folderId).filter(Boolean) as string[];

  // File IDs where user has explicit EDIT/MANAGE file-level permission
  const filePerms = await prisma.permission.findMany({
    where: {
      companyId, userId,
      resourceType: "FILE",
      accessLevel: { in: ["EDIT", "MANAGE"] },
    },
    select: { fileId: true },
  });
  const editFileIds = filePerms.map((p) => p.fileId).filter(Boolean) as string[];

  const files = await prisma.file.findMany({
    where: {
      companyId,
      deletedAt: null,
      status: { notIn: ["OBSOLETE"] },
      OR: [
        { uploadedByUserId: userId },
        { encargadoDocumentoId: userId },
        ...(editFolderIds.length > 0 ? [{ folderId: { in: editFolderIds } }] : []),
        ...(editFileIds.length > 0   ? [{ id:       { in: editFileIds   } }] : []),
      ],
    },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      name: true,
      nombreDocumento: true,
      codigo: true,
      versionStr: true,
      mimeType: true,
      status: true,
      folder: { select: { id: true, name: true } },
    },
  });

  return NextResponse.json({ files });
}
