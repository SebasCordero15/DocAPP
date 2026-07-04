import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireActiveSession, hashPassword, verifyPassword } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logAction } from "@/lib/audit";

const schema = z.object({
  currentPassword: z.string().min(1),
  newPassword:     z.string().min(8).max(100),
}).refine(
  (d) => {
    const pw = d.newPassword;
    return /[A-Z]/.test(pw) && /[a-z]/.test(pw) && /[0-9]/.test(pw);
  },
  { message: "La nueva contraseña debe tener al menos 8 caracteres, una mayúscula, una minúscula y un número", path: ["newPassword"] }
);

// POST /api/auth/change-password
// Used when forcePasswordChange=true — user must set a new password before continuing.
// Also available for voluntary password changes.
export async function POST(req: NextRequest) {
  const session = await requireActiveSession();
  if (!session) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Datos inválidos" }, { status: 400 });
  }
  const { currentPassword, newPassword } = parsed.data;

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { id: true, passwordHash: true, companyId: true, email: true },
  });
  if (!user) {
    return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
  }

  const valid = await verifyPassword(currentPassword, user.passwordHash);
  if (!valid) {
    return NextResponse.json({ error: "La contraseña actual es incorrecta" }, { status: 401 });
  }

  if (currentPassword === newPassword) {
    return NextResponse.json({ error: "La nueva contraseña no puede ser igual a la actual" }, { status: 400 });
  }

  const newHash = await hashPassword(newPassword);
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: newHash, forcePasswordChange: false },
  });

  await logAction({
    companyId: user.companyId,
    userId: user.id,
    action: "PASSWORD_CHANGE",
    resourceType: "USER",
    resourceId: user.id,
    detail: user.email,
  });

  return NextResponse.json({ ok: true });
}
