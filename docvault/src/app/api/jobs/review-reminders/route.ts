import { NextRequest, NextResponse } from "next/server";
import { runReviewReminders } from "@/lib/reviewReminders";

// POST /api/jobs/review-reminders
// Auth: Authorization: Bearer <CRON_SECRET>  (or open in dev when CRON_SECRET is unset)
// Body: { asOf?: string }  — ISO date string; omit to use current time (for testing pass any date)
export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const body = await req.json().catch(() => ({})) as { asOf?: string };
  const asOf = body.asOf ? new Date(body.asOf) : new Date();

  if (isNaN(asOf.getTime())) {
    return NextResponse.json({ error: "Invalid asOf date" }, { status: 400 });
  }

  console.log(`[review-reminders] Running as of ${asOf.toISOString()}`);
  const result = await runReviewReminders(asOf);
  console.log(`[review-reminders] Done:`, result);

  return NextResponse.json({ ok: true, asOf: asOf.toISOString(), ...result });
}
