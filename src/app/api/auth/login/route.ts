import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { verifyPassword, createSession } from "@/lib/auth";
import { logAction } from "@/lib/audit";

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }
  const { email, password } = parsed.data;

  // Platform-level super admin (no company association)
  const superAdmin = await prisma.user.findFirst({
    where: { email, role: "SUPER_ADMIN" },
  });
  if (superAdmin) {
    if (!(await verifyPassword(password, superAdmin.passwordHash))) {
      return NextResponse.json({ error: "Credenciales inválidas" }, { status: 401 });
    }
    if (!superAdmin.isActive) {
      return NextResponse.json({ error: "Esta cuenta ha sido desactivada" }, { status: 403 });
    }
    await createSession({ userId: superAdmin.id, companyId: null, role: "SUPER_ADMIN" });
    await Promise.all([
      prisma.user.update({ where: { id: superAdmin.id }, data: { lastLoginAt: new Date() } }),
      logAction({ companyId: null, userId: superAdmin.id, action: "LOGIN" }),
    ]);
    return NextResponse.json({ ok: true });
  }

  // Company user — resolve company from email (no slug needed)
  const matches = await prisma.user.findMany({
    where: { email, role: { not: "SUPER_ADMIN" } },
    include: { company: true },
  });

  if (matches.length === 0) {
    return NextResponse.json({ error: "Credenciales inválidas" }, { status: 401 });
  }

  // Rare case: same email in multiple companies — return informative error
  if (matches.length > 1) {
    return NextResponse.json(
      { error: "Hay múltiples cuentas con este correo. Contacta a tu administrador." },
      { status: 401 }
    );
  }

  const user = matches[0];
  if (!(await verifyPassword(password, user.passwordHash))) {
    return NextResponse.json({ error: "Credenciales inválidas" }, { status: 401 });
  }
  if (!user.isActive) {
    return NextResponse.json({ error: "Tu cuenta ha sido desactivada" }, { status: 403 });
  }
  if (!user.company?.isActive) {
    return NextResponse.json({ error: "La empresa ha sido desactivada" }, { status: 403 });
  }

  await createSession({ userId: user.id, companyId: user.companyId!, role: user.role });
  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  await logAction({ companyId: user.companyId, userId: user.id, action: "LOGIN" });

  return NextResponse.json({ ok: true, role: user.role });
}
