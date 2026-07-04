import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { randomBytes } from "crypto";
import { requireActiveSession, hashPassword } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logAction } from "@/lib/audit";
import { checkUserLimit } from "@/lib/userLimit";

const schema = z.object({
  name:  z.string().min(1).max(100),
  email: z.string().email(),
  role:  z.enum(["COMPANY_ADMIN", "EDITOR", "VIEWER"]).default("VIEWER"),
});

function generateTempPassword(): string {
  return randomBytes(12).toString("base64url").slice(0, 16);
}

// POST /api/admin/users/create-direct
// Creates a user immediately with a hashed temp password (no invite link needed).
// The plaintext password is returned ONCE so the admin can share it manually.
export async function POST(req: NextRequest) {
  const session = await requireActiveSession();
  if (!session || !session.companyId || session.role !== "COMPANY_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const companyId = session.companyId;

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos", details: parsed.error.issues }, { status: 400 });
  }
  const { name, email, role } = parsed.data;

  // Check for duplicate email within company
  const existing = await prisma.user.findFirst({ where: { companyId, email } });
  if (existing) {
    return NextResponse.json({ error: "Ya existe un usuario con ese correo en esta empresa" }, { status: 409 });
  }

  // Enforce plan user limit
  const { allowed, current, max } = await checkUserLimit(companyId);
  if (!allowed) {
    return NextResponse.json(
      { error: `Límite de ${max} usuarios alcanzado. Contacta a soporte para actualizar el plan.`, current, max },
      { status: 403 }
    );
  }

  const tempPassword = generateTempPassword();
  const passwordHash = await hashPassword(tempPassword);

  const user = await prisma.user.create({
    data: {
      companyId,
      name,
      email,
      role,
      passwordHash,
      forcePasswordChange: true,
    },
    select: { id: true, name: true, email: true, role: true, isActive: true, createdAt: true, forcePasswordChange: true, lastLoginAt: true },
  });

  await logAction({
    companyId,
    userId: session.userId,
    action: "USER_CREATE_DIRECT",
    resourceType: "USER",
    resourceId: user.id,
    detail: `${email} como ${role} — creación directa con contraseña temporal`,
  });

  return NextResponse.json(
    {
      user: { ...user, lastLoginAt: null, createdAt: user.createdAt.toISOString() },
      tempPassword, // plaintext shown ONCE — not stored anywhere in plaintext
    },
    { status: 201 }
  );
}
