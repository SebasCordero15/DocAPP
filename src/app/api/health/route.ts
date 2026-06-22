import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { S3Client, HeadBucketCommand } from "@aws-sdk/client-s3";

const TIMEOUT_MS = 5000;

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("timeout")), ms)
    ),
  ]);
}

async function checkDatabase(): Promise<{ status: "ok" | "down"; latency_ms: number; error?: string }> {
  const start = Date.now();
  try {
    await withTimeout(prisma.$queryRaw`SELECT 1`, TIMEOUT_MS);
    return { status: "ok", latency_ms: Date.now() - start };
  } catch (e) {
    return { status: "down", latency_ms: Date.now() - start, error: e instanceof Error ? e.message : "unknown" };
  }
}

async function checkStorage(): Promise<{ status: "ok" | "down"; latency_ms: number; error?: string }> {
  const start = Date.now();
  try {
    const s3 = new S3Client({
      endpoint: process.env.S3_ENDPOINT!,
      region: process.env.S3_REGION ?? "auto",
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY_ID!,
        secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!,
      },
      forcePathStyle: false,
      requestChecksumCalculation: "WHEN_REQUIRED",
      responseChecksumValidation: "WHEN_REQUIRED",
    });
    await withTimeout(
      s3.send(new HeadBucketCommand({ Bucket: process.env.S3_BUCKET ?? "docvault" })),
      TIMEOUT_MS
    );
    return { status: "ok", latency_ms: Date.now() - start };
  } catch (e) {
    return { status: "down", latency_ms: Date.now() - start, error: e instanceof Error ? e.message : "unknown" };
  }
}

// GET /api/health — public endpoint, no auth required
// Returns 200 if all services are up, 503 if any are down
export async function GET() {
  const start = Date.now();

  const [db, storage] = await Promise.all([checkDatabase(), checkStorage()]);

  const allOk = db.status === "ok" && storage.status === "ok";
  const anyDown = db.status === "down" || storage.status === "down";

  const overall = allOk ? "ok" : anyDown ? "down" : "degraded";

  const body = {
    status: overall,
    timestamp: new Date().toISOString(),
    version: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "local",
    response_ms: Date.now() - start,
    services: {
      app: { status: "ok" as const, latency_ms: 0 },
      database: db,
      storage,
    },
  };

  return NextResponse.json(body, {
    status: allOk ? 200 : 503,
    headers: { "Cache-Control": "no-store" },
  });
}
