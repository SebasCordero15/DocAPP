import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { verifyPassword, createSession } from "@/lib/auth";
import { logAction } from "@/lib/audit";

const schema = z.object({
  companySlug: z.string().min(1).optional(),
  email: z.string().email(),
  password: z.string().min(1),
});

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }
  const { companySlug, email, password } = parsed.data;

  // Check for platform-level access first (role detected by email lookup, no slug needed)
  const superAdmin = await prisma.user.findFirst({
    where: { email, role: "SUPER_ADMIN" },
  });
  if (superAdmin) {
    if (!(await verifyPassword(password, superAdmin.passwordHash))) {
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    }
    if (!superAdmin.isActive) {
      return NextResponse.json({ error: "This account has been deactivated" }, { status: 403 });
    }
    await createSession({ userId: superAdmin.id, companyId: null, role: "SUPER_ADMIN" });
    await Promise.all([
      prisma.user.update({ where: { id: superAdmin.id }, data: { lastLoginAt: new Date() } }),
      logAction({ companyId: null, userId: superAdmin.id, action: "LOGIN" }),
    ]);
    return NextResponse.json({ ok: true });
  }

  // Company user path — slug required
  if (!companySlug) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }

  const company = await prisma.company.findUnique({ where: { slug: companySlug } });
  if (!company) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }
  if (!company.isActive) {
    return NextResponse.json({ error: "This company account has been deactivated" }, { status: 403 });
  }

  const user = await prisma.user.findUnique({
    where: { companyId_email: { companyId: company.id, email } },
  });
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }
  if (!user.isActive) {
    return NextResponse.json({ error: "Your account has been deactivated" }, { status: 403 });
  }

  await createSession({ userId: user.id, companyId: company.id, role: user.role });
  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  await logAction({ companyId: company.id, userId: user.id, action: "LOGIN" });

  return NextResponse.json({ ok: true, role: user.role });
}
