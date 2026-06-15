import { NextResponse } from "next/server";
import { requireActiveSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isAdminRole } from "@/lib/permissions";

// GET /api/change-requests/counts — pending count for sidebar badge (admin only)
export async function GET() {
  const session = await requireActiveSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!session.companyId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!isAdminRole(session.role)) return NextResponse.json({ pending: 0 });

  const pending = await prisma.changeRequest.count({
    where: { companyId: session.companyId, status: "PENDING" },
  });

  return NextResponse.json({ pending });
}
