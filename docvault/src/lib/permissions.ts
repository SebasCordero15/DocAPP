import { prisma } from "./prisma";
import { AccessLevel, Role } from "@prisma/client";

// Ordering so we can compare "is X at least Y".
const RANK: Record<AccessLevel, number> = {
  NONE: 0,
  READ: 1,
  EDIT: 2,
  MANAGE: 3,
};

export function atLeast(have: AccessLevel, need: AccessLevel): boolean {
  return RANK[have] >= RANK[need];
}

/** True for roles that have unrestricted MANAGE access within a company. */
export function isAdminRole(role: Role | string): boolean {
  return role === "SUPER_ADMIN" || role === "COMPANY_ADMIN";
}

/**
 * Resolve a user's effective access level on a folder, walking up the
 * folder tree until an explicit permission is found. COMPANY_ADMIN and
 * SUPER_ADMIN always have MANAGE. Everything is scoped to the user's company.
 */
export async function resolveFolderAccess(
  userId: string,
  companyId: string,
  role: Role | string,
  folderId: string | null
): Promise<AccessLevel> {
  if (isAdminRole(role)) return "MANAGE";

  let currentId = folderId;
  // Walk up the chain; the nearest explicit permission wins.
  while (currentId) {
    const perm = await prisma.permission.findFirst({
      where: { companyId, userId, folderId: currentId },
    });
    if (perm) return perm.accessLevel;

    const folder = await prisma.folder.findFirst({
      where: { id: currentId, companyId },
      select: { parentId: true },
    });
    currentId = folder?.parentId ?? null;
  }
  return "NONE";
}

/**
 * Resolve effective access on a file: an explicit file permission
 * overrides; otherwise it inherits from the containing folder.
 */
export async function resolveFileAccess(
  userId: string,
  companyId: string,
  role: Role | string,
  fileId: string
): Promise<AccessLevel> {
  if (isAdminRole(role)) return "MANAGE";

  const file = await prisma.file.findFirst({
    where: { id: fileId, companyId },
    select: { folderId: true },
  });
  if (!file) return "NONE";

  const explicit = await prisma.permission.findFirst({
    where: { companyId, userId, fileId },
  });
  if (explicit) return explicit.accessLevel;

  return resolveFolderAccess(userId, companyId, role, file.folderId);
}

/** Throws if the user lacks the required level on a file. */
export async function requireFileAccess(
  userId: string,
  companyId: string,
  role: Role | string,
  fileId: string,
  need: AccessLevel
): Promise<void> {
  const have = await resolveFileAccess(userId, companyId, role, fileId);
  if (!atLeast(have, need)) {
    throw new Error("FORBIDDEN");
  }
}
