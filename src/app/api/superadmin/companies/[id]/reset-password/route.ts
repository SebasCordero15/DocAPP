import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { randomBytes } from "crypto";
import { requireActiveSession, hashPassword } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logAction } from "@/lib/audit";

const schema = z.object({
  // userId to reset (must be the company admin of this company)
  userId: z.string().min(1),
  // Optional: super admin supplies a specific password; otherwise one is generated
  customPassword: z.string().min(8).max(100).optional(),
});

function generateTempPassword(): string {
  return randomBytes(12).toString("base64url").slice(0, 16);
}

function isStrongEnough(pw: string): boolean {
  return pw.length >= 8 && /[A-Z]/.test(pw) && /[a-z]/.test(pw) && /[0-9]/.test(pw);
}

// POST /api/superadmin/companies/[id]/reset-password
// Resets the target user's password and flags forcePasswordChange=true.
// Returns the plaintext temp password exactly once — never stored in DB.
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await requireActiveSession();
  if (!session || session.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }

  const { userId, customPassword } = parsed.data;

  // Verify the target user belongs to this company
  const target = await prisma.user.findFirst({
    where: { id: userId, companyId: params.id },
    select: { id: true, name: true, email: true, role: true },
  });
  if (!target) {
    return NextResponse.json({ error: "Usuario no encontrado en esta empresa" }, { status: 404 });
  }

  if (customPassword && !isStrongEnough(customPassword)) {
    return NextResponse.json(
      { error: "La contraseña debe tener al menos 8 caracteres, una mayúscula, una minúscula y un número" },
      { status: 400 }
    );
  }

  const tempPassword = customPassword ?? generateTempPassword();
  const passwordHash = await hashPassword(tempPassword);

  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash, forcePasswordChange: true },
  });

  await logAction({
    companyId: params.id,
    userId: session.userId,
    action: "PASSWORD_RESET",
    resourceType: "USER",
    resourceId: userId,
    detail: `${target.email} — restablecida por super admin`,
  });

  // Return the plaintext password ONCE — it is NOT stored anywhere in plaintext
  return NextResponse.json({ tempPassword, userName: target.name, userEmail: target.email });
}
