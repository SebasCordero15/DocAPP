import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { randomBytes } from "crypto";
import { requireActiveSession, hashPassword } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logAction } from "@/lib/audit";

const schema = z.object({
  // Optional: admin types a specific password; otherwise one is generated
  customPassword: z.string().min(8).max(100).optional(),
});

function generateTempPassword(): string {
  return randomBytes(12).toString("base64url").slice(0, 16);
}

function isStrongEnough(pw: string): boolean {
  return pw.length >= 8 && /[A-Z]/.test(pw) && /[a-z]/.test(pw) && /[0-9]/.test(pw);
}

// POST /api/admin/users/[id]/reset-password
// Company admin resets one of their users' passwords.
// Returns the plaintext temp password ONCE — never retrievable again.
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await requireActiveSession();
  if (!session || !session.companyId || session.role !== "COMPANY_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const companyId = session.companyId;

  if (params.id === session.userId) {
    return NextResponse.json({ error: "No puedes restablecer tu propia contraseña desde aquí" }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }
  const { customPassword } = parsed.data;

  const target = await prisma.user.findFirst({
    where: { id: params.id, companyId },
    select: { id: true, name: true, email: true },
  });
  if (!target) {
    return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
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
    where: { id: params.id },
    data: { passwordHash, forcePasswordChange: true },
  });

  await logAction({
    companyId,
    userId: session.userId,
    action: "PASSWORD_RESET",
    resourceType: "USER",
    resourceId: params.id,
    detail: `${target.email} — restablecida por admin de empresa`,
  });

  return NextResponse.json({ tempPassword, userName: target.name, userEmail: target.email });
}
