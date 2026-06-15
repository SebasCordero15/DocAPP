import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { hashPassword, createSession } from "@/lib/auth";
import { logAction } from "@/lib/audit";

// GET /api/invite/[token] — validate token and return company/role info (public)
export async function GET(
  _req: NextRequest,
  { params }: { params: { token: string } }
) {
  const invite = await prisma.userInvite.findUnique({
    where: { token: params.token },
    select: {
      id: true, email: true, role: true, expiresAt: true, usedAt: true,
      company: { select: { name: true, slug: true, logoUrl: true, primaryColor: true } },
    },
  });

  if (!invite) {
    return NextResponse.json({ error: "Invalid invite link" }, { status: 404 });
  }
  if (invite.usedAt) {
    return NextResponse.json({ error: "This invitation has already been used" }, { status: 410 });
  }
  if (invite.expiresAt < new Date()) {
    return NextResponse.json({ error: "This invitation has expired" }, { status: 410 });
  }

  return NextResponse.json({
    email: invite.email,
    role: invite.role,
    expiresAt: invite.expiresAt.toISOString(),
    company: invite.company,
  });
}

const acceptSchema = z.object({
  name: z.string().min(1).max(100),
  password: z.string().min(8).max(128),
});

// POST /api/invite/[token]/accept — create account and sign in (public)
export async function POST(
  req: NextRequest,
  { params }: { params: { token: string } }
) {
  const invite = await prisma.userInvite.findUnique({
    where: { token: params.token },
  });

  if (!invite || invite.usedAt || invite.expiresAt < new Date()) {
    return NextResponse.json({ error: "Invalid or expired invitation" }, { status: 410 });
  }

  const body = await req.json().catch(() => null);
  const parsed = acceptSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", details: parsed.error.issues }, { status: 400 });
  }

  const { name, password } = parsed.data;

  // Guard: email must not already exist in this company (race condition safety)
  const conflict = await prisma.user.findFirst({
    where: { companyId: invite.companyId, email: invite.email },
  });
  if (conflict) {
    return NextResponse.json({ error: "An account with this email already exists" }, { status: 409 });
  }

  const passwordHash = await hashPassword(password);

  const [user] = await prisma.$transaction([
    prisma.user.create({
      data: {
        companyId: invite.companyId,
        email: invite.email,
        name,
        passwordHash,
        role: invite.role,
        forcePasswordChange: false,
      },
    }),
    prisma.userInvite.update({
      where: { id: invite.id },
      data: { usedAt: new Date() },
    }),
  ]);

  await Promise.all([
    createSession({ userId: user.id, companyId: invite.companyId, role: invite.role }),
    logAction({
      companyId: invite.companyId,
      userId: user.id,
      action: "USER_INVITE_ACCEPT",
      resourceType: "USER",
      resourceId: user.id,
      detail: invite.email,
    }),
    prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } }),
  ]);

  return NextResponse.json({ ok: true });
}
