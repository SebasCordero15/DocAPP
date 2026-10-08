import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireActiveSession, hashPassword } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logAction } from "@/lib/audit";
import { checkUserLimit } from "@/lib/userLimit";
import { sendUserWelcomeEmail } from "@/lib/email";

const MAX_ADMINS_PER_COMPANY = 5;
const MAX_COMPANIES_PER_EMAIL = 15;

const schema = z.object({
  name:     z.string().min(1).max(100),
  email:    z.string().email(),
  role:     z.enum(["COMPANY_ADMIN", "EDITOR", "VIEWER"]).default("COMPANY_ADMIN"),
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

// POST /api/superadmin/companies/[id]/users
// Lets the super admin add a user (typically a COMPANY_ADMIN) to a company
// directly, without going through that company's own admin invite flow.
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await requireActiveSession();
  if (!session || session.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const companyId = params.id;

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

  const company = await prisma.company.findUnique({ where: { id: companyId }, select: { id: true, name: true } });
  if (!company) {
    return NextResponse.json({ error: "Empresa no encontrada" }, { status: 404 });
  }

  // Duplicate email within this company
  const existing = await prisma.user.findFirst({ where: { companyId, email } });
  if (existing) {
    return NextResponse.json({ error: "Ya existe un usuario con ese correo en esta empresa" }, { status: 409 });
  }

  // Plan user limit
  const { allowed, current, max } = await checkUserLimit(companyId);
  if (!allowed) {
    return NextResponse.json(
      { error: `Límite de ${max} usuarios alcanzado para esta empresa.`, current, max },
      { status: 403 }
    );
  }

  // Admin-per-company cap
  if (role === "COMPANY_ADMIN") {
    const adminCount = await prisma.user.count({
      where: { companyId, role: "COMPANY_ADMIN", isActive: true },
    });
    if (adminCount >= MAX_ADMINS_PER_COMPANY) {
      return NextResponse.json(
        { error: `Esta empresa ya tiene el máximo de ${MAX_ADMINS_PER_COMPANY} administradores.` },
        { status: 403 }
      );
    }
  }

  // Safety net: how many companies is this email already a member of?
  const companyCount = await prisma.user.findMany({
    where: { email, role: { not: "SUPER_ADMIN" } },
    select: { companyId: true },
    distinct: ["companyId"],
  });
  if (companyCount.length >= MAX_COMPANIES_PER_EMAIL) {
    return NextResponse.json(
      { error: `Este correo ya está asociado a ${MAX_COMPANIES_PER_EMAIL} empresas, el máximo permitido.` },
      { status: 403 }
    );
  }

  const passwordHash = await hashPassword(password);

  const user = await prisma.user.create({
    data: { companyId, name, email, role, passwordHash, forcePasswordChange: false },
    select: { id: true, name: true, email: true, role: true, isActive: true, createdAt: true, forcePasswordChange: true, lastLoginAt: true },
  });

  await logAction({
    companyId,
    userId: session.userId,
    action: "USER_CREATE_DIRECT",
    resourceType: "USER",
    resourceId: user.id,
    detail: `${email} como ${role} — creado por super admin`,
  });

  const loginUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/login`;
  const { sent, error: emailError } = await sendUserWelcomeEmail({
    to: email,
    userName: name,
    companyName: company.name,
    role: ROLE_LABELS[role] ?? role,
    password,
    loginUrl,
  });

  return NextResponse.json(
    {
      user: { ...user, lastLoginAt: null, createdAt: user.createdAt.toISOString() },
      password,
      emailSent: sent,
      emailError: emailError ?? null,
    },
    { status: 201 }
  );
}
