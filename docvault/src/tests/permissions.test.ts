/**
 * Integration tests for the permissions engine.
 *
 * These tests run against the real database (DATABASE_URL from .env) using
 * isolated test data that is torn down after each suite.  They prove:
 *
 *   1. A VIEWER with no permissions resolves to NONE everywhere.
 *   2. A VIEWER cannot upload (EDIT check) or download (READ check).
 *   3. Inheritance resolves to the nearest ancestor folder.
 *   4. An explicit file permission overrides the folder permission.
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { prisma } from "@/lib/prisma";
import { resolveFolderAccess, resolveFileAccess, atLeast } from "@/lib/permissions";

// ─── test fixtures ────────────────────────────────────────────────────────────
// Created once for the whole suite; permissions are wiped between tests.
// Folder tree: A (root) → B → C
// File lives in B.

let companyId: string;
let viewerId: string;
let folderAId: string; // root
let folderBId: string; // child of A
let folderCId: string; // child of B
let fileId: string;   // file in B

beforeAll(async () => {
  const slug = `test-perms-${Date.now()}`;

  const company = await prisma.company.create({
    data: { name: "__test__", slug, primaryColor: "#000" },
  });
  companyId = company.id;

  const viewer = await prisma.user.create({
    data: {
      companyId,
      email: `v-${Date.now()}@test.local`,
      name: "Test Viewer",
      passwordHash: "x",
      role: "VIEWER",
    },
  });
  viewerId = viewer.id;

  const folderA = await prisma.folder.create({
    data: { companyId, name: "FolderA" },
  });
  folderAId = folderA.id;

  const folderB = await prisma.folder.create({
    data: { companyId, name: "FolderB", parentId: folderAId },
  });
  folderBId = folderB.id;

  const folderC = await prisma.folder.create({
    data: { companyId, name: "FolderC", parentId: folderBId },
  });
  folderCId = folderC.id;

  const file = await prisma.file.create({
    data: {
      companyId,
      folderId: folderBId,
      name: "test.txt",
      storageKey: `${companyId}/root/test.txt`,
      mimeType: "text/plain",
      size: 42,
    },
  });
  fileId = file.id;
});

afterAll(async () => {
  // Cascade delete removes all related folders, files, permissions, etc.
  await prisma.company.delete({ where: { id: companyId } });
  await prisma.$disconnect();
});

// Wipe all permissions between tests for a clean slate.
afterEach(async () => {
  await prisma.permission.deleteMany({ where: { companyId } });
});

// ─── 1. VIEWER with no permissions ───────────────────────────────────────────

describe("no permissions set", () => {
  it("VIEWER resolves NONE on a root folder", async () => {
    const level = await resolveFolderAccess(viewerId, companyId, "VIEWER", folderAId);
    expect(level).toBe("NONE");
  });

  it("VIEWER cannot upload: EDIT check fails", async () => {
    const level = await resolveFolderAccess(viewerId, companyId, "VIEWER", folderAId);
    expect(atLeast(level, "EDIT")).toBe(false);
  });

  it("VIEWER cannot download: resolveFileAccess → NONE", async () => {
    const level = await resolveFileAccess(viewerId, companyId, "VIEWER", fileId);
    expect(level).toBe("NONE");
    expect(atLeast(level, "READ")).toBe(false);
  });

  it("VIEWER cannot list folder: READ check fails", async () => {
    const level = await resolveFolderAccess(viewerId, companyId, "VIEWER", folderAId);
    expect(atLeast(level, "READ")).toBe(false);
  });
});

// ─── 2. Explicit NONE blocks access ──────────────────────────────────────────

describe("explicit NONE permission", () => {
  it("explicit NONE on a folder returns NONE", async () => {
    await prisma.permission.create({
      data: {
        companyId, userId: viewerId, resourceType: "FOLDER",
        folderId: folderAId, accessLevel: "NONE",
      },
    });
    const level = await resolveFolderAccess(viewerId, companyId, "VIEWER", folderAId);
    expect(level).toBe("NONE");
    expect(atLeast(level, "READ")).toBe(false);
  });

  it("explicit NONE on folderB overrides READ inherited from folderA", async () => {
    await prisma.permission.createMany({
      data: [
        { companyId, userId: viewerId, resourceType: "FOLDER", folderId: folderAId, accessLevel: "READ" },
        { companyId, userId: viewerId, resourceType: "FOLDER", folderId: folderBId, accessLevel: "NONE" },
      ],
    });
    // FolderB itself has explicit NONE → nearest ancestor wins → NONE.
    const level = await resolveFolderAccess(viewerId, companyId, "VIEWER", folderBId);
    expect(level).toBe("NONE");
  });
});

// ─── 3. Inheritance & nearest-ancestor resolution ─────────────────────────────

describe("inheritance", () => {
  it("READ on folderA is inherited by folderB (one level down)", async () => {
    await prisma.permission.create({
      data: {
        companyId, userId: viewerId, resourceType: "FOLDER",
        folderId: folderAId, accessLevel: "READ",
      },
    });
    const level = await resolveFolderAccess(viewerId, companyId, "VIEWER", folderBId);
    expect(level).toBe("READ");
  });

  it("READ on folderA propagates two levels to folderC (deep inheritance)", async () => {
    await prisma.permission.create({
      data: {
        companyId, userId: viewerId, resourceType: "FOLDER",
        folderId: folderAId, accessLevel: "READ",
      },
    });
    const level = await resolveFolderAccess(viewerId, companyId, "VIEWER", folderCId);
    expect(level).toBe("READ");
  });

  it("nearest ancestor wins: explicit EDIT on folderB beats READ from folderA", async () => {
    await prisma.permission.createMany({
      data: [
        { companyId, userId: viewerId, resourceType: "FOLDER", folderId: folderAId, accessLevel: "READ" },
        { companyId, userId: viewerId, resourceType: "FOLDER", folderId: folderBId, accessLevel: "EDIT" },
      ],
    });
    // FolderB has an explicit EDIT → that's the nearest ancestor → returns EDIT.
    const level = await resolveFolderAccess(viewerId, companyId, "VIEWER", folderBId);
    expect(level).toBe("EDIT");
  });

  it("nearest ancestor wins: explicit READ on folderB stops MANAGE from folderA reaching folderC", async () => {
    await prisma.permission.createMany({
      data: [
        { companyId, userId: viewerId, resourceType: "FOLDER", folderId: folderAId, accessLevel: "MANAGE" },
        { companyId, userId: viewerId, resourceType: "FOLDER", folderId: folderBId, accessLevel: "READ" },
      ],
    });
    // FolderC's nearest ancestor with a permission is folderB (READ), not folderA (MANAGE).
    const level = await resolveFolderAccess(viewerId, companyId, "VIEWER", folderCId);
    expect(level).toBe("READ");
  });
});

// ─── 4. Explicit file permission overrides folder ─────────────────────────────

describe("file permission overrides", () => {
  it("explicit file EDIT overrides folder READ", async () => {
    await prisma.permission.createMany({
      data: [
        { companyId, userId: viewerId, resourceType: "FOLDER", folderId: folderBId, accessLevel: "READ" },
        { companyId, userId: viewerId, resourceType: "FILE",   fileId,              accessLevel: "EDIT" },
      ],
    });
    const level = await resolveFileAccess(viewerId, companyId, "VIEWER", fileId);
    expect(level).toBe("EDIT");
  });

  it("explicit file NONE overrides folder READ (explicit deny on file)", async () => {
    await prisma.permission.createMany({
      data: [
        { companyId, userId: viewerId, resourceType: "FOLDER", folderId: folderBId, accessLevel: "READ" },
        { companyId, userId: viewerId, resourceType: "FILE",   fileId,              accessLevel: "NONE" },
      ],
    });
    const level = await resolveFileAccess(viewerId, companyId, "VIEWER", fileId);
    expect(level).toBe("NONE");
    expect(atLeast(level, "READ")).toBe(false);
  });

  it("without an explicit file permission, file inherits from its containing folder", async () => {
    await prisma.permission.create({
      data: {
        companyId, userId: viewerId, resourceType: "FOLDER",
        folderId: folderBId, accessLevel: "EDIT",
      },
    });
    // No file-level permission → falls back to folder.
    const level = await resolveFileAccess(viewerId, companyId, "VIEWER", fileId);
    expect(level).toBe("EDIT");
  });

  it("file inherits through the full ancestor chain (folderA → folderB → file)", async () => {
    await prisma.permission.create({
      data: {
        companyId, userId: viewerId, resourceType: "FOLDER",
        folderId: folderAId, accessLevel: "READ",
      },
    });
    // No permission on folderB or the file itself → walks up to folderA.
    const level = await resolveFileAccess(viewerId, companyId, "VIEWER", fileId);
    expect(level).toBe("READ");
  });
});

// ─── 5. COMPANY_ADMIN shortcut ────────────────────────────────────────────────

describe("COMPANY_ADMIN role", () => {
  it("COMPANY_ADMIN always resolves MANAGE regardless of stored permissions", async () => {
    const folderLevel = await resolveFolderAccess("irrelevant", companyId, "COMPANY_ADMIN", folderAId);
    expect(folderLevel).toBe("MANAGE");

    const fileLevel = await resolveFileAccess("irrelevant", companyId, "COMPANY_ADMIN", fileId);
    expect(fileLevel).toBe("MANAGE");
  });

  it("SUPER_ADMIN always resolves MANAGE regardless of stored permissions", async () => {
    const folderLevel = await resolveFolderAccess("irrelevant", companyId, "SUPER_ADMIN", folderAId);
    expect(folderLevel).toBe("MANAGE");

    const fileLevel = await resolveFileAccess("irrelevant", companyId, "SUPER_ADMIN", fileId);
    expect(fileLevel).toBe("MANAGE");
  });
});
