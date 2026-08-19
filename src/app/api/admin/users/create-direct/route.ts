import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireActiveSession, hashPassword } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logAction } from "@/lib/audit";
import { checkUserLimit } from "@/lib/userLimit";
import { sendUserWelcomeEmail } from "@/lib/email";

const schema = z.object({
  name:     z.string().min(1).max(100),
  email:    z.string().email(),
  role:     z.enum(["COMPANY_ADMIN", "EDITOR", "VIEWER"]).default("VIEWER"),
  password: z.string().min(8).max(100),
});

const ROLE_LABELS: Record<string, string> = {
  COMPANY_ADMIN: "Administrador de empresa",
  EDITOR: "Editor",
  VIEWER: "Lector",
};

function isStrongEnough(pw: string): boolean {
  return pw.length >= 8 && /[A-Z]/.test(pw) && /[a-z]/.test(pw) && /[0-9]/.test(pw);
}

// POST /api/admin/users/create-direct
// Creates a user immediately with a password the admin assigns and emails them
// their credentials (no invite link needed).
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
  const { name, email, role, password } = parsed.data;

  if (!isStrongEnough(password)) {
    return NextResponse.json(
      { error: "La contraseña debe tener al menos 8 caracteres, una mayúscula, una minúscula y un número" },
      { status: 400 }
    );
  }

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

  const passwordHash = await hashPassword(password);

  const user = await prisma.user.create({
    data: {
      companyId,
      name,
      email,
      role,
      passwordHash,
      forcePasswordChange: false,
    },
    select: { id: true, name: true, email: true, role: true, isActive: true, createdAt: true, forcePasswordChange: true, lastLoginAt: true },
  });

  await logAction({
    companyId,
    userId: session.userId,
    action: "USER_CREATE_DIRECT",
    resourceType: "USER",
    resourceId: user.id,
    detail: `${email} como ${role} — creación directa con contraseña asignada`,
  });

  const company = await prisma.company.findUnique({ where: { id: companyId }, select: { name: true } });
  const loginUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/login`;
  const { sent, error: emailError } = await sendUserWelcomeEmail({
    to: email,
    userName: name,
    companyName: company?.name ?? "",
    role: ROLE_LABELS[role] ?? role,
    password,
    loginUrl,
  });

  return NextResponse.json(
    {
      user: { ...user, lastLoginAt: null, createdAt: user.createdAt.toISOString() },
      password, // plaintext echoed back ONCE — not stored anywhere in plaintext
      emailSent: sent,
      emailError: emailError ?? null,
    },
    { status: 201 }
  );
}
