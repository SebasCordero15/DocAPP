import { NextRequest, NextResponse } from "next/server";
import { requireActiveSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logAction } from "@/lib/audit";
import { sendPaymentLinkEmail } from "@/lib/email";

// POST /api/superadmin/companies/[id]/resend-payment-link
// Re-sends the same payment-link email for a CHARGED company still PENDING —
// for when the client says it never arrived, or asks for it again.
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
  if (company.billingMode !== "CHARGED" || company.paymentStatus !== "PENDING") {
    return NextResponse.json({ error: "Esta empresa no tiene un pago pendiente" }, { status: 400 });
  }
  if (!company.paymentLink || !company.pendingAdminName || !company.pendingAdminEmail) {
    return NextResponse.json({ error: "Faltan los datos del link de pago" }, { status: 400 });
  }

  const { sent, error: emailError } = await sendPaymentLinkEmail({
    to: company.pendingAdminEmail,
    contactName: company.pendingAdminName,
    companyName: company.name,
    paymentLink: company.paymentLink,
  });

  await logAction({
    companyId: company.id,
    userId: session.userId,
    action: "COMPANY_PAYMENT_LINK_RESENT",
    resourceType: "COMPANY",
    resourceId: company.id,
    detail: `${company.name} — link de pago reenviado a ${company.pendingAdminEmail}`,
  });

  return NextResponse.json({ sent, error: emailError ?? null });
}
