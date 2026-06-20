import { NextRequest, NextResponse } from "next/server";
import { requireActiveSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET /api/notifications — returns last 30 notifications + unread count for current user
export async function GET() {
  const session = await requireActiveSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [notifications, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where: { userId: session.userId },
      orderBy: { createdAt: "desc" },
      take: 30,
      select: {
        id: true, type: true, message: true, read: true, createdAt: true,
        fileId: true,
      },
    }),
    prisma.notification.count({ where: { userId: session.userId, read: false } }),
  ]);

  return NextResponse.json({
    notifications: notifications.map((n) => ({
      ...n,
      createdAt: n.createdAt.toISOString(),
    })),
    unreadCount,
  });
}

// PATCH /api/notifications — mark notifications as read
// Body: { ids?: string[] }  — omit ids to mark all read
export async function PATCH(req: NextRequest) {
  const session = await requireActiveSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({})) as { ids?: string[] };

  await prisma.notification.updateMany({
    where: {
      userId: session.userId,
      ...(body.ids?.length ? { id: { in: body.ids } } : {}),
    },
    data: { read: true },
  });

  return NextResponse.json({ ok: true });
}
