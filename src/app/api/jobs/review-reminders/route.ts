import { NextRequest, NextResponse } from "next/server";
import { runReviewReminders } from "@/lib/reviewReminders";

function checkAuth(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true; // dev: no secret set, allow
  const auth = req.headers.get("authorization");
  return auth === `Bearer ${secret}`;
}

// GET /api/jobs/review-reminders — called by Vercel Cron (sends GET with Authorization header)
export async function GET(req: NextRequest) {
  if (!checkAuth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const asOf = new Date();
  console.log(`[review-reminders] Running as of ${asOf.toISOString()}`);
  const result = await runReviewReminders(asOf);
  console.log(`[review-reminders] Done:`, result);
  return NextResponse.json({ ok: true, asOf: asOf.toISOString(), ...result });
}

// POST /api/jobs/review-reminders — manual trigger with optional { asOf } body
export async function POST(req: NextRequest) {
  if (!checkAuth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({})) as { asOf?: string };
  const asOf = body.asOf ? new Date(body.asOf) : new Date();
  if (isNaN(asOf.getTime())) return NextResponse.json({ error: "Invalid asOf date" }, { status: 400 });
  console.log(`[review-reminders] Running as of ${asOf.toISOString()}`);
  const result = await runReviewReminders(asOf);
  console.log(`[review-reminders] Done:`, result);
  return NextResponse.json({ ok: true, asOf: asOf.toISOString(), ...result });
}
