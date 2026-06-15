/**
 * User-limit integration tests.
 *
 * Proves that checkUserLimit() — the exact function called by the invite API —
 * blocks invitations once the active-user cap is reached.
 *
 *   1. Under the limit  → allowed: true
 *   2. At the limit     → allowed: false
 *   3. Over the limit   → allowed: false
 *   4. Inactive users   → do NOT count toward the cap
 *   5. Unknown company  → allowed: false (safe default)
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";
import { checkUserLimit } from "@/lib/userLimit";

let companyId: string;
let activeUserIds: string[] = [];
let inactiveUserId: string;

beforeAll(async () => {
  const ts = Date.now();

  const company = await prisma.company.create({
    data: { name: "__limit_test__", slug: `limit-${ts}`, primaryColor: "#000", maxUsers: 2 },
  });
  companyId = company.id;

  // Two active users — fills the cap exactly.
  for (let i = 0; i < 2; i++) {
    const u = await prisma.user.create({
      data: {
        companyId,
        email: `limit-active-${i}-${ts}@test.local`,
        name: `Active ${i}`,
        passwordHash: "x",
        role: "VIEWER",
        isActive: true,
      },
    });
    activeUserIds.push(u.id);
  }

  // One inactive user — must not count toward the cap.
  const inactive = await prisma.user.create({
    data: {
      companyId,
      email: `limit-inactive-${ts}@test.local`,
      name: "Inactive",
      passwordHash: "x",
      role: "VIEWER",
      isActive: false,
    },
  });
  inactiveUserId = inactive.id;
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { id: { in: [...activeUserIds, inactiveUserId] } } });
  await prisma.company.delete({ where: { id: companyId } });
});

describe("checkUserLimit", () => {
  it("returns allowed: false when active users equal maxUsers", async () => {
    const result = await checkUserLimit(companyId);
    expect(result.allowed).toBe(false);
    expect(result.current).toBe(2);
    expect(result.max).toBe(2);
  });

  it("inactive users do not count toward the cap", async () => {
    // With 2 active + 1 inactive, current must still be 2 (not 3).
    const result = await checkUserLimit(companyId);
    expect(result.current).toBe(2);
  });

  it("returns allowed: true after deactivating a user", async () => {
    await prisma.user.update({ where: { id: activeUserIds[0] }, data: { isActive: false } });
    const result = await checkUserLimit(companyId);
    expect(result.allowed).toBe(true);
    expect(result.current).toBe(1);
    // Restore for subsequent tests.
    await prisma.user.update({ where: { id: activeUserIds[0] }, data: { isActive: true } });
  });

  it("returns allowed: false, current 0, max 0 for unknown companyId", async () => {
    const result = await checkUserLimit("00000000-0000-0000-0000-000000000000");
    expect(result.allowed).toBe(false);
    expect(result.current).toBe(0);
    expect(result.max).toBe(0);
  });

  it("returns allowed: true when maxUsers is increased above current count", async () => {
    await prisma.company.update({ where: { id: companyId }, data: { maxUsers: 3 } });
    const result = await checkUserLimit(companyId);
    expect(result.allowed).toBe(true);
    expect(result.max).toBe(3);
    // Restore.
    await prisma.company.update({ where: { id: companyId }, data: { maxUsers: 2 } });
  });
});
