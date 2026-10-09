import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { verifyPassword, createSession } from "@/lib/auth";
import { logAction } from "@/lib/audit";

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  // Supplied on the second request when the same email+password combo
  // matches more than one company (see "multiple matches" below).
  companyId: z.string().optional(),
});

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }
  const { email, password, companyId } = parsed.data;

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
    return NextResponse.json({ ok: true, role: "SUPER_ADMIN" });
  }

  // Company user — resolve company from email (no slug needed)
  const matches = await prisma.user.findMany({
    where: { email, role: { not: "SUPER_ADMIN" } },
    include: { company: true },
    // Select forcePasswordChange so we can signal the client
  });

  if (matches.length === 0) {
    return NextResponse.json({ error: "Credenciales inválidas" }, { status: 401 });
  }

  // This email has an account in more than one company (common for an admin
  // who manages several client businesses). Disambiguate by password first —
  // each company's account usually has its own password, so normally only
  // one will verify and we can log straight in.
  let user = matches[0];
  if (matches.length > 1) {
    // If the client already told us which company (second request after
    // picking from the list below), go straight to that one.
    if (companyId) {
      const picked = matches.find((m) => m.companyId === companyId);
      if (!picked) {
        return NextResponse.json({ error: "Credenciales inválidas" }, { status: 401 });
      }
      user = picked;
    } else {
      const verifiedMatches = [];
      for (const m of matches) {
        if (await verifyPassword(password, m.passwordHash)) verifiedMatches.push(m);
      }
      if (verifiedMatches.length === 0) {
        return NextResponse.json({ error: "Credenciales inválidas" }, { status: 401 });
      }
      if (verifiedMatches.length === 1) {
        user = verifiedMatches[0];
      } else {
        // Genuinely ambiguous (same password reused across companies) — let
        // the user pick which workspace to enter.
        return NextResponse.json({
          needsCompanySelection: true,
          companies: verifiedMatches.map((m) => ({
            id: m.companyId!,
            name: m.company?.name ?? "Empresa",
            industry: m.company?.industry ?? null,
            logoUrl: m.company?.logoUrl ?? null,
            primaryColor: m.company?.primaryColor ?? "#1B3A6B",
          })),
        });
      }
    }
  }

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

  return NextResponse.json({ ok: true, role: user.role, forcePasswordChange: user.forcePasswordChange });
}
