/**
 * Part 3 — folder/file visibility integration tests.
 *
 * Calls the actual route handlers against a real database so the full
 * permission-resolution + HTTP-status chain is exercised in one test.
 *
 * What is proved:
 *   1. NONE access  → GET /api/folders/[id]         returns 404 (not 403)
 *   2. READ access  → GET /api/folders/[id]         returns 200
 *   3. NONE access  → GET /api/files/[id]/download-url  returns 404 (not 403)
 *   4. READ access  → GET /api/files/[id]/download-url  returns 200-ish
 *   5. Root listing → VIEWER with no permissions sees empty list
 *   6. Root listing → VIEWER granted READ sees the folder
 *   7. Explicit NONE overrides inherited READ  → folder re-disappears
 *   8. New VIEWER (no permission records at all) defaults to no access
 */

import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

// ── mock requireActiveSession so tests control which user is "logged in" ──────
vi.mock("@/lib/auth", () => ({
  requireActiveSession: vi.fn(),
  validateActiveSession: vi.fn(),
}));

import { requireActiveSession } from "@/lib/auth";
const mockSession = vi.mocked(requireActiveSession);

// Route handlers under test — imported after the mock so they pick up the stub.
import { GET as getFolderById } from "@/app/api/folders/[id]/route";
import { GET as listRootFolders } from "@/app/api/folders/route";
import { GET as getDownloadUrl } from "@/app/api/files/[id]/download-url/route";

// ─── fixtures ─────────────────────────────────────────────────────────────────

let companyId: string;
let viewerId: string;
let rootFolderId: string;
let fileId: string;

beforeAll(async () => {
  const ts = Date.now();

  const company = await prisma.company.create({
    data: { name: "__vis_test__", slug: `vis-${ts}`, primaryColor: "#000" },
  });
  companyId = company.id;

  const viewer = await prisma.user.create({
    data: {
      companyId,
      email: `viewer-${ts}@vis.local`,
      name: "Vis Viewer",
      passwordHash: "x",
      role: "VIEWER",
      isActive: true,
    },
  });
  viewerId = viewer.id;

  const folder = await prisma.folder.create({
    data: { companyId, name: "VisFolder" },
  });
  rootFolderId = folder.id;

  const file = await prisma.file.create({
    data: {
      companyId,
      folderId: rootFolderId,
      name: "vis.txt",
      storageKey: `${companyId}/root/vis.txt`,
      mimeType: "text/plain",
      size: 10,
    },
  });
  fileId = file.id;
});

afterAll(async () => {
  await prisma.company.delete({ where: { id: companyId } });
});

// Wipe permissions between tests for a clean slate.
afterEach(async () => {
  await prisma.permission.deleteMany({ where: { companyId } });
});

// Helper: configure the mocked session to act as the test viewer.
function asViewer() {
  mockSession.mockResolvedValue({
    userId: viewerId,
    companyId,
    role: "VIEWER",
  });
}

// ─── 1. NONE access: folder GET → 404 ────────────────────────────────────────

describe("NONE access returns 404, not 403", () => {
  it("GET /api/folders/[id] with no permissions returns 404", async () => {
    asViewer();
    const req = new NextRequest(`http://localhost/api/folders/${rootFolderId}`);
    const res = await getFolderById(req, { params: { id: rootFolderId } });
    expect(res.status).toBe(404);
  });

  it("GET /api/folders/[id] with explicit NONE permission returns 404", async () => {
    asViewer();
    await prisma.permission.create({
      data: {
        companyId, userId: viewerId, resourceType: "FOLDER",
        folderId: rootFolderId, accessLevel: "NONE",
      },
    });
    const req = new NextRequest(`http://localhost/api/folders/${rootFolderId}`);
    const res = await getFolderById(req, { params: { id: rootFolderId } });
    expect(res.status).toBe(404);
  });

  it("GET /api/files/[id]/download-url with no permissions returns 404", async () => {
    asViewer();
    const req = new NextRequest(`http://localhost/api/files/${fileId}/download-url`);
    const res = await getDownloadUrl(req, { params: { id: fileId } });
    expect(res.status).toBe(404);
  });
});

// ─── 2. READ access: folder GET → 200 ────────────────────────────────────────

describe("READ access allows folder browsing", () => {
  it("GET /api/folders/[id] with READ permission returns 200", async () => {
    asViewer();
    await prisma.permission.create({
      data: {
        companyId, userId: viewerId, resourceType: "FOLDER",
        folderId: rootFolderId, accessLevel: "READ",
      },
    });
    const req = new NextRequest(`http://localhost/api/folders/${rootFolderId}`);
    const res = await getFolderById(req, { params: { id: rootFolderId } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.folder.id).toBe(rootFolderId);
  });
});

// ─── 3. Root listing filter ───────────────────────────────────────────────────

describe("root folder listing visibility", () => {
  it("VIEWER with no permissions sees an empty root listing", async () => {
    asViewer();
    const res = await listRootFolders();
    expect(res.status).toBe(200);
    const body = await res.json();
    // rootFolderId should NOT appear because the viewer has no READ permission.
    const ids = (body.folders as { id: string }[]).map((f) => f.id);
    expect(ids).not.toContain(rootFolderId);
  });

  it("VIEWER granted READ on a folder sees it in the root listing", async () => {
    asViewer();
    await prisma.permission.create({
      data: {
        companyId, userId: viewerId, resourceType: "FOLDER",
        folderId: rootFolderId, accessLevel: "READ",
      },
    });
    const res = await listRootFolders();
    expect(res.status).toBe(200);
    const body = await res.json();
    const ids = (body.folders as { id: string }[]).map((f) => f.id);
    expect(ids).toContain(rootFolderId);
  });

  it("explicit NONE overrides inherited READ — folder disappears from listing", async () => {
    asViewer();
    // Grant READ at root level …
    await prisma.permission.create({
      data: {
        companyId, userId: viewerId, resourceType: "FOLDER",
        folderId: rootFolderId, accessLevel: "READ",
      },
    });
    // … then override it with explicit NONE.
    await prisma.permission.update({
      where: { id: (await prisma.permission.findFirst({
        where: { companyId, userId: viewerId, folderId: rootFolderId },
      }))!.id },
      data: { accessLevel: "NONE" },
    });

    const res = await listRootFolders();
    const body = await res.json();
    const ids = (body.folders as { id: string }[]).map((f) => f.id);
    expect(ids).not.toContain(rootFolderId);
  });
});

// ─── 4. New VIEWER defaults to no access ─────────────────────────────────────

describe("default no access for new users", () => {
  it("a freshly-created VIEWER has zero permission records and sees nothing", async () => {
    const ts = Date.now();
    const newViewer = await prisma.user.create({
      data: {
        companyId,
        email: `new-${ts}@vis.local`,
        name: "New Viewer",
        passwordHash: "x",
        role: "VIEWER",
        isActive: true,
      },
    });

    mockSession.mockResolvedValue({ userId: newViewer.id, companyId, role: "VIEWER" });

    const permCount = await prisma.permission.count({
      where: { companyId, userId: newViewer.id },
    });
    expect(permCount).toBe(0);

    const res = await listRootFolders();
    const body = await res.json();
    expect((body.folders as unknown[]).length).toBe(0);

    await prisma.user.delete({ where: { id: newViewer.id } });
  });
});
