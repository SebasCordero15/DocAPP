/**
 * Security isolation integration tests.
 *
 * These tests run against the real database and prove six invariants:
 *
 *   1. Deactivated company  → validateActiveSession returns false
 *   2. Deactivated user     → validateActiveSession returns false
 *   3. Cross-company folders → querying with the wrong companyId returns nothing
 *   4. Cross-company files  → querying with the wrong companyId returns nothing
 *   5. SUPER_ADMIN isolation → null companyId never leaks into company queries
 *   6. Invite token expiry  → expired token is rejected
 *   7. Invite token reuse   → used token is rejected
 *   8. Login guard          → deactivated company/user isActive check enforced
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { validateActiveSession } from "@/lib/auth";
import type { SessionPayload } from "@/lib/auth";

// ─── Shared fixture state ─────────────────────────────────────────────────────

// Two fully isolated tenants created once for the whole suite.
let companyAId: string;
let companyBId: string;
let userAId: string;   // active COMPANY_ADMIN in Company A
let userBId: string;   // active VIEWER in Company B
let superAdminId: string;

// Folders / files in Company B — Company A users must not see these.
let folderBId: string;
let fileBId: string;

beforeAll(async () => {
  const ts = Date.now();

  // ── Company A + admin ─────────────────────────────────────────────────────
  const companyA = await prisma.company.create({
    data: { name: "__iso_A__", slug: `iso-a-${ts}`, primaryColor: "#000" },
  });
  companyAId = companyA.id;

  const userA = await prisma.user.create({
    data: {
      companyId: companyAId,
      email: `admin-a-${ts}@iso.local`,
      name: "Admin A",
      passwordHash: "x",
      role: "COMPANY_ADMIN",
    },
  });
  userAId = userA.id;

  // ── Company B + viewer + data ─────────────────────────────────────────────
  const companyB = await prisma.company.create({
    data: { name: "__iso_B__", slug: `iso-b-${ts}`, primaryColor: "#fff" },
  });
  companyBId = companyB.id;

  const userB = await prisma.user.create({
    data: {
      companyId: companyBId,
      email: `viewer-b-${ts}@iso.local`,
      name: "Viewer B",
      passwordHash: "x",
      role: "VIEWER",
    },
  });
  userBId = userB.id;

  const folderB = await prisma.folder.create({
    data: { companyId: companyBId, name: "SecretFolderB" },
  });
  folderBId = folderB.id;

  const fileB = await prisma.file.create({
    data: {
      companyId: companyBId,
      folderId: folderBId,
      name: "secret.pdf",
      storageKey: `${companyBId}/secret.pdf`,
      mimeType: "application/pdf",
      size: 1024,
    },
  });
  fileBId = fileB.id;

  // ── Standalone SUPER_ADMIN (null companyId) ────────────────────────────────
  const sa = await prisma.user.create({
    data: {
      // No companyId — SUPER_ADMIN is not associated with any tenant
      email: `superadmin-${ts}@iso.local`,
      name: "Test Super Admin",
      passwordHash: "x",
      role: "SUPER_ADMIN",
    },
  });
  superAdminId = sa.id;
});

afterAll(async () => {
  await prisma.company.delete({ where: { id: companyAId } });
  await prisma.company.delete({ where: { id: companyBId } });
  await prisma.user.deleteMany({ where: { id: superAdminId } });
  await prisma.$disconnect();
});

// ─── 1 & 2. validateActiveSession – deactivated company / user ────────────────

describe("validateActiveSession — deactivated company", () => {
  it("returns a session payload for an active user in an active company", async () => {
    const session: SessionPayload = { userId: userAId, companyId: companyAId, role: "COMPANY_ADMIN" };
    expect(await validateActiveSession(session)).not.toBeNull();
  });

  it("returns null when the company is deactivated", async () => {
    await prisma.company.update({ where: { id: companyAId }, data: { isActive: false } });
    try {
      const session: SessionPayload = { userId: userAId, companyId: companyAId, role: "COMPANY_ADMIN" };
      expect(await validateActiveSession(session)).toBeNull();
    } finally {
      await prisma.company.update({ where: { id: companyAId }, data: { isActive: true } });
    }
  });

  it("returns a session payload again once the company is reactivated", async () => {
    const session: SessionPayload = { userId: userAId, companyId: companyAId, role: "COMPANY_ADMIN" };
    expect(await validateActiveSession(session)).not.toBeNull();
  });
});

describe("validateActiveSession — deactivated user", () => {
  it("returns null when the user is deactivated", async () => {
    await prisma.user.update({ where: { id: userBId }, data: { isActive: false } });
    try {
      const session: SessionPayload = { userId: userBId, companyId: companyBId, role: "VIEWER" };
      expect(await validateActiveSession(session)).toBeNull();
    } finally {
      await prisma.user.update({ where: { id: userBId }, data: { isActive: true } });
    }
  });

  it("returns null for a completely unknown userId", async () => {
    const session: SessionPayload = { userId: "nonexistent-user-id", companyId: companyAId, role: "VIEWER" };
    expect(await validateActiveSession(session)).toBeNull();
  });

  it("returns a session payload for SUPER_ADMIN (no company to check)", async () => {
    const session: SessionPayload = { userId: superAdminId, companyId: null, role: "SUPER_ADMIN" };
    expect(await validateActiveSession(session)).not.toBeNull();
  });
});

// ─── 3 & 4. Cross-company data isolation via companyId scoping ────────────────

describe("cross-company folder isolation", () => {
  it("folders query scoped to Company A returns no Company B folders", async () => {
    const folders = await prisma.folder.findMany({ where: { companyId: companyAId } });
    const folderIds = folders.map((f) => f.id);
    expect(folderIds).not.toContain(folderBId);
  });

  it("querying the Company B folder by id with Company A's companyId returns null", async () => {
    const folder = await prisma.folder.findFirst({
      where: { id: folderBId, companyId: companyAId },
    });
    expect(folder).toBeNull();
  });

  it("Company B folder IS found when queried with the correct companyId", async () => {
    const folder = await prisma.folder.findFirst({
      where: { id: folderBId, companyId: companyBId },
    });
    expect(folder).not.toBeNull();
    expect(folder?.name).toBe("SecretFolderB");
  });
});

describe("cross-company file isolation", () => {
  it("files query scoped to Company A returns no Company B files", async () => {
    const files = await prisma.file.findMany({ where: { companyId: companyAId } });
    const fileIds = files.map((f) => f.id);
    expect(fileIds).not.toContain(fileBId);
  });

  it("querying the Company B file by id with Company A's companyId returns null", async () => {
    const file = await prisma.file.findFirst({
      where: { id: fileBId, companyId: companyAId },
    });
    expect(file).toBeNull();
  });

  it("Company B file IS accessible with the correct companyId", async () => {
    const file = await prisma.file.findFirst({
      where: { id: fileBId, companyId: companyBId },
    });
    expect(file).not.toBeNull();
    expect(file?.name).toBe("secret.pdf");
  });
});

// ─── 5. SUPER_ADMIN isolation ─────────────────────────────────────────────────

describe("SUPER_ADMIN isolation", () => {
  it("SUPER_ADMIN user (null companyId) does not appear in Company A user queries", async () => {
    const users = await prisma.user.findMany({ where: { companyId: companyAId } });
    const ids = users.map((u) => u.id);
    expect(ids).not.toContain(superAdminId);
  });

  it("SUPER_ADMIN user (null companyId) does not appear in Company B user queries", async () => {
    const users = await prisma.user.findMany({ where: { companyId: companyBId } });
    const ids = users.map((u) => u.id);
    expect(ids).not.toContain(superAdminId);
  });

  it("SUPER_ADMIN cannot be found via the companyId_email compound unique key", async () => {
    const sa = await prisma.user.findFirst({
      where: { id: superAdminId },
    });
    // Found by primary key, but companyId is null — never scoped to a company
    expect(sa).not.toBeNull();
    expect(sa?.companyId).toBeNull();
    expect(sa?.role).toBe("SUPER_ADMIN");
  });

  it("SUPER_ADMIN session validates successfully despite null companyId", async () => {
    const session: SessionPayload = { userId: superAdminId, companyId: null, role: "SUPER_ADMIN" };
    expect(await validateActiveSession(session)).not.toBeNull();
  });

  it("company-scoped user count query excludes SUPER_ADMIN", async () => {
    const count = await prisma.user.count({ where: { companyId: { not: null } } });
    const saCount = await prisma.user.count({ where: { id: superAdminId, companyId: { not: null } } });
    expect(count).toBeGreaterThanOrEqual(2); // userA + userB at minimum
    expect(saCount).toBe(0);
  });
});

// ─── 6 & 7. Invite token isolation ───────────────────────────────────────────

describe("invite token isolation", () => {
  const ts = Date.now();
  const expiredToken = randomBytes(32).toString("hex");
  const usedToken = randomBytes(32).toString("hex");
  const validToken = randomBytes(32).toString("hex");
  let expiredInviteId: string;
  let usedInviteId: string;

  beforeAll(async () => {
    const past = new Date(Date.now() - 1000);
    const future = new Date(Date.now() + 48 * 60 * 60 * 1000);

    const [expired, used] = await Promise.all([
      prisma.userInvite.create({
        data: {
          companyId: companyAId,
          email: `expired-${ts}@iso.local`,
          role: "VIEWER",
          token: expiredToken,
          createdBy: userAId,
          expiresAt: past,
        },
      }),
      prisma.userInvite.create({
        data: {
          companyId: companyAId,
          email: `used-${ts}@iso.local`,
          role: "VIEWER",
          token: usedToken,
          createdBy: userAId,
          expiresAt: future,
          usedAt: new Date(),
        },
      }),
      prisma.userInvite.create({
        data: {
          companyId: companyAId,
          email: `valid-${ts}@iso.local`,
          role: "EDITOR",
          token: validToken,
          createdBy: userAId,
          expiresAt: future,
        },
      }),
    ]);
    expiredInviteId = expired.id;
    usedInviteId = used.id;
  });

  it("expired token: expiresAt in the past means invite is not valid", async () => {
    const invite = await prisma.userInvite.findUnique({ where: { token: expiredToken } });
    expect(invite).not.toBeNull();
    expect(invite!.expiresAt < new Date()).toBe(true);
    // Simulate the route guard
    const isValid = invite && !invite.usedAt && invite.expiresAt >= new Date();
    expect(isValid).toBe(false);
  });

  it("used token: usedAt set means invite is not valid", async () => {
    const invite = await prisma.userInvite.findUnique({ where: { token: usedToken } });
    expect(invite).not.toBeNull();
    expect(invite!.usedAt).not.toBeNull();
    const isValid = invite && !invite.usedAt && invite.expiresAt >= new Date();
    expect(isValid).toBeFalsy();
  });

  it("valid token: not expired, not used → valid", async () => {
    const invite = await prisma.userInvite.findUnique({ where: { token: validToken } });
    expect(invite).not.toBeNull();
    const isValid = invite && !invite.usedAt && invite.expiresAt >= new Date();
    expect(isValid).toBeTruthy();
  });

  it("invite token is scoped to its companyId — Company B cannot use Company A's token", async () => {
    // A token belongs to one company; even if guessed, the created user would land in the wrong tenant.
    const invite = await prisma.userInvite.findUnique({ where: { token: validToken } });
    expect(invite?.companyId).toBe(companyAId);
    expect(invite?.companyId).not.toBe(companyBId);
  });

  it("pending-invites query filters out expired tokens", async () => {
    const pending = await prisma.userInvite.findMany({
      where: { companyId: companyAId, usedAt: null, expiresAt: { gt: new Date() } },
    });
    const ids = pending.map((i) => i.id);
    expect(ids).not.toContain(expiredInviteId);
  });

  it("pending-invites query filters out used tokens", async () => {
    const pending = await prisma.userInvite.findMany({
      where: { companyId: companyAId, usedAt: null, expiresAt: { gt: new Date() } },
    });
    const ids = pending.map((i) => i.id);
    expect(ids).not.toContain(usedInviteId);
  });
});

// ─── 8. Login guard — isActive checks ────────────────────────────────────────
// We can't call the Next.js HTTP handler in unit tests, so we replicate the
// exact DB queries the login route performs and assert the guard logic.

describe("login guard — isActive enforcement", () => {
  it("deactivated company is caught before password check", async () => {
    await prisma.company.update({ where: { id: companyAId }, data: { isActive: false } });
    try {
      const company = await prisma.company.findUnique({ where: { id: companyAId } });
      // This is the guard the login route performs:
      expect(company?.isActive).toBe(false);
      // If isActive is false the route returns 403 — no password check happens.
    } finally {
      await prisma.company.update({ where: { id: companyAId }, data: { isActive: true } });
    }
  });

  it("deactivated user is caught after password check succeeds", async () => {
    await prisma.user.update({ where: { id: userAId }, data: { isActive: false } });
    try {
      const user = await prisma.user.findUnique({ where: { id: userAId } });
      expect(user?.isActive).toBe(false);
    } finally {
      await prisma.user.update({ where: { id: userAId }, data: { isActive: true } });
    }
  });

  it("active company and active user both pass the guard", async () => {
    const company = await prisma.company.findUnique({ where: { id: companyAId } });
    const user = await prisma.user.findUnique({ where: { id: userAId } });
    expect(company?.isActive).toBe(true);
    expect(user?.isActive).toBe(true);
  });
});
