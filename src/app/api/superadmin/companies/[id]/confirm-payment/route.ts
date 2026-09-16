import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { requireActiveSession, hashPassword } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logAction } from "@/lib/audit";
import { sendCompanyWelcomeEmail } from "@/lib/email";

function generateTempPassword(): string {
  return randomBytes(12).toString("base64url").slice(0, 16);
}

// POST /api/superadmin/companies/[id]/confirm-payment
// For a CHARGED company still PENDING: generates the COMPANY_ADMIN account
// from the pendingAdmin* fields captured at creation, marks payment as PAID,
// and emails the credentials — mirroring the FREE flow's welcome email.
// Returns the plaintext password exactly once, same convention as reset-password.
export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await requireActiveSession();
  if (!session || session.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const company = await prisma.company.findUnique({ where: { id: params.id } });
  if (!company) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (company.billingMode !== "CHARGED") {
    return NextResponse.json({ error: "Esta empresa no está en modo de cobro" }, { status: 400 });
  }
  if (company.paymentStatus === "PAID") {
    return NextResponse.json({ error: "El pago de esta empresa ya fue confirmado" }, { status: 409 });
  }
  if (!company.pendingAdminName || !company.pendingAdminEmail) {
    return NextResponse.json({ error: "Faltan los datos del administrador pendiente" }, { status: 400 });
  }

  const password = generateTempPassword();
  const passwordHash = await hashPassword(password);

  await prisma.$transaction([
    prisma.user.create({
      data: {
        companyId: company.id,
        name: company.pendingAdminName,
        email: company.pendingAdminEmail,
        passwordHash,
        role: "COMPANY_ADMIN",
        forcePasswordChange: true,
      },
    }),
    prisma.company.update({
      where: { id: company.id },
      data: { paymentStatus: "PAID" },
    }),
  ]);

  await logAction({
    companyId: company.id,
    userId: session.userId,
    action: "COMPANY_PAYMENT_CONFIRMED",
    resourceType: "COMPANY",
    resourceId: company.id,
    detail: `${company.name} — pago confirmado, admin creado: ${company.pendingAdminEmail}`,
  });

  const loginUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/login`;
  const { sent, error: emailError } = await sendCompanyWelcomeEmail({
    to: company.pendingAdminEmail,
    adminName: company.pendingAdminName,
    companyName: company.name,
    companySlug: company.slug,
    password,
    loginUrl,
    maxUsers: company.maxUsers,
  });

  return NextResponse.json({
    adminName: company.pendingAdminName,
    adminEmail: company.pendingAdminEmail,
    password,
    emailSent: sent,
    emailError: emailError ?? null,
  });
}
