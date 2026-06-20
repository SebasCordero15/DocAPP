import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { randomBytes } from "crypto";
import { requireActiveSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logAction } from "@/lib/audit";
import { checkUserLimit } from "@/lib/userLimit";

const schema = z.object({
  email: z.string().email(),
  role: z.enum(["COMPANY_ADMIN", "EDITOR", "VIEWER"]).default("VIEWER"),
});

async function sendInviteEmail(p: {
  to: string;
  companyName: string;
  inviteUrl: string;
  role: string;
  expiresAt: Date;
}) {
  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  if (!RESEND_API_KEY) return { sent: false };

  const { Resend } = await import("resend");
  const resend = new Resend(RESEND_API_KEY);
  const FROM = process.env.EMAIL_FROM ?? "KE-Control <onboarding@resend.dev>";
  const expires = p.expiresAt.toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

  const { error } = await resend.emails.send({
    from: FROM,
    to: p.to,
    subject: `You've been invited to ${p.companyName} on KE-Control`,
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto">
        <h2>You're invited to ${p.companyName}</h2>
        <p>You've been invited as <strong>${p.role}</strong>.</p>
        <p>
          <a href="${p.inviteUrl}" style="background:#2563eb;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;display:inline-block;font-weight:bold">
            Accept invitation
          </a>
        </p>
        <p style="color:#64748b;font-size:13px">This link expires ${expires}. If you didn't expect this, you can ignore this email.</p>
      </div>
    `,
  });

  return { sent: !error, error: error?.message };
}

// POST /api/admin/users/invite — create a 48 h invite token
export async function POST(req: NextRequest) {
  const session = await requireActiveSession();
  if (!session || !session.companyId || session.role !== "COMPANY_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const companyId = session.companyId;

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const { email, role } = parsed.data;

  // Block if a user with that email already exists in the company.
  const existing = await prisma.user.findFirst({ where: { companyId, email } });
  if (existing) {
    return NextResponse.json({ error: "A user with that email already exists in this company" }, { status: 409 });
  }

  // Enforce the per-company user limit.
  const { allowed, current, max } = await checkUserLimit(companyId);
  if (!allowed) {
    return NextResponse.json(
      { error: `You have reached your plan limit of ${max} users. Contact support to upgrade.`, current, max },
      { status: 403 }
    );
  }

  // Expire any previous pending invite for this email so there's only one active at a time.
  await prisma.userInvite.deleteMany({
    where: { companyId, email, usedAt: null },
  });

  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);

  const invite = await prisma.userInvite.create({
    data: { companyId, email, role, token, createdBy: session.userId, expiresAt },
  });

  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { name: true },
  });

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const inviteUrl = `${baseUrl}/invite/${token}`;

  const { sent, error: emailError } = await sendInviteEmail({
    to: email,
    companyName: company?.name ?? "your company",
    inviteUrl,
    role,
    expiresAt,
  });

  await logAction({
    companyId,
    userId: session.userId,
    action: "USER_INVITE",
    resourceType: "USER",
    resourceId: invite.id,
    detail: `${email} as ${role}`,
  });

  return NextResponse.json({
    invite: { id: invite.id, email, role, expiresAt: invite.expiresAt.toISOString() },
    inviteUrl,
    emailSent: sent,
    emailError: emailError ?? null,
  }, { status: 201 });
}
