import { NextResponse } from "next/server";
import { requireActiveSession } from "@/lib/auth";

// GET /api/auth/me — returns the current session payload from a fresh DB lookup.
// Returns 401 if there is no valid session.
// Used by the client to verify which account is currently active without
// relying on any client-side state that might be stale across logins.
export async function GET() {
  const session = await requireActiveSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json({
    userId: session.userId,
    companyId: session.companyId,
    role: session.role,
  });
}
