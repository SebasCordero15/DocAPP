import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireActiveSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logAction } from "@/lib/audit";

const patchSchema = z.object({
  name:     z.string().min(1).max(100).optional(),
  role:     z.enum(["COMPANY_ADMIN", "EDITOR", "VIEWER"]).optional(),
  isActive: z.boolean().optional(),
}).refine((d) => d.name !== undefined || d.role !== undefined || d.isActive !== undefined, {
  message: "Provide at least one field to update",
});

// PATCH /api/admin/users/[id] — update role or isActive (COMPANY_ADMIN only)
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await requireActiveSession();
  if (!session || !session.companyId || session.role !== "COMPANY_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const companyId = session.companyId;

  if (params.id === session.userId) {
    return NextResponse.json({ error: "Cannot modify your own account" }, { status: 400 });
  }

  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const target = await prisma.user.findFirst({
    where: { id: params.id, companyId },
    select: { id: true, name: true, email: true, role: true, isActive: true },
  });
  if (!target) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { name, role, isActive } = parsed.data;

  const updated = await prisma.user.update({
    where: { id: params.id },
    data: {
      ...(name     !== undefined ? { name }     : {}),
      ...(role     !== undefined ? { role }     : {}),
      ...(isActive !== undefined ? { isActive } : {}),
    },
    select: { id: true, name: true, email: true, role: true, isActive: true, forcePasswordChange: true, lastLoginAt: true, createdAt: true },
  });

  const changes: string[] = [];
  if (name     !== undefined && name     !== target.name)     changes.push(`name: ${name}`);
  if (role     !== undefined && role     !== target.role)     changes.push(`role: ${target.role}→${role}`);
  if (isActive !== undefined && isActive !== target.isActive) changes.push(`isActive: ${target.isActive}→${isActive}`);

  await logAction({
    companyId,
    userId: session.userId,
    action: "USER_UPDATE",
    resourceType: "USER",
    resourceId: params.id,
    detail: `${target.email} — ${changes.join(", ")}`,
  });

  return NextResponse.json({
    user: {
      ...updated,
      lastLoginAt: (updated as { lastLoginAt?: Date | null }).lastLoginAt?.toISOString() ?? null,
      createdAt:   (updated as { createdAt?: Date }).createdAt?.toISOString() ?? new Date().toISOString(),
    },
  });
}

// DELETE /api/admin/users/[id] — revoke a pending invite by id
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await requireActiveSession();
  if (!session || !session.companyId || session.role !== "COMPANY_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const companyId = session.companyId;

  // params.id here is the UserInvite id passed as query ?inviteId=
  const url = new URL(req.url);
  const inviteId = url.searchParams.get("inviteId");
  if (!inviteId) {
    return NextResponse.json({ error: "inviteId required" }, { status: 400 });
  }

  const invite = await prisma.userInvite.findFirst({
    where: { id: inviteId, companyId, usedAt: null },
  });
  if (!invite) {
    return NextResponse.json({ error: "Invite not found" }, { status: 404 });
  }

  await prisma.userInvite.delete({ where: { id: inviteId } });

  await logAction({
    companyId,
    userId: session.userId,
    action: "INVITE_REVOKE",
    resourceType: "USER",
    resourceId: inviteId,
    detail: invite.email,
  });

  return NextResponse.json({ ok: true });
}
