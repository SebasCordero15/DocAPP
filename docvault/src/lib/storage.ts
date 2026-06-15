import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  CreateBucketCommand,
  HeadBucketCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { randomUUID } from "crypto";

const s3 = new S3Client({
  endpoint: process.env.S3_ENDPOINT!,
  region: process.env.S3_REGION ?? "auto",
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY_ID!,
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!,
  },
  forcePathStyle: true, // required for MinIO path-style URLs
  // Don't add SDK-level checksums to presigned URLs — browsers can't send them.
  requestChecksumCalculation: "WHEN_REQUIRED",
  responseChecksumValidation: "WHEN_REQUIRED",
});

export const BUCKET = process.env.S3_BUCKET ?? "docvault";

// Lazy one-time check: create the bucket if it was never initialised.
// In production / docker-compose the bucket is pre-created by the setup
// container, so this is just a safety net.
let bucketChecked: Promise<void> | null = null;

function ensureBucket(): Promise<void> {
  if (!bucketChecked) {
    bucketChecked = checkBucket().catch((err) => {
      bucketChecked = null;
      throw err;
    });
  }
  return bucketChecked;
}

async function checkBucket() {
  try {
    await s3.send(new HeadBucketCommand({ Bucket: BUCKET }));
  } catch {
    await s3.send(new CreateBucketCommand({ Bucket: BUCKET }));
  }
  // CORS for browser uploads is handled at the MinIO server level via
  // MINIO_API_CORS_ALLOW_ORIGIN in docker-compose.yml.
}

/** Build a storage key scoped to this company so tenants never share a prefix. */
export function makeStorageKey(
  companyId: string,
  folderId: string | null,
  filename: string
): string {
  const safe = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
  return `${companyId}/${folderId ?? "root"}/${randomUUID()}-${safe}`;
}

/** Return a short-lived pre-signed URL for a browser PUT (5 min default). */
export async function presignUpload(
  key: string,
  mimeType: string,
  expiresIn = 300
): Promise<string> {
  await ensureBucket();
  return getSignedUrl(
    s3,
    new PutObjectCommand({ Bucket: BUCKET, Key: key, ContentType: mimeType }),
    { expiresIn }
  );
}

/** Download raw bytes from object storage (server-to-server, no presigning). */
export async function downloadBytes(key: string): Promise<Buffer> {
  await ensureBucket();
  const resp = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
  const chunks: Uint8Array[] = [];
  for await (const chunk of resp.Body as AsyncIterable<Uint8Array>) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

/** Delete an object from storage (used when rejecting a NEW_UPLOAD or REPLACE_FILE request). */
export async function deleteObject(key: string): Promise<void> {
  await ensureBucket();
  await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
}

/** Return a short-lived pre-signed URL for a browser GET / download (5 min default). */
export async function presignDownload(
  key: string,
  filename: string,
  expiresIn = 300
): Promise<string> {
  return getSignedUrl(
    s3,
    new GetObjectCommand({
      Bucket: BUCKET,
      Key: key,
      ResponseContentDisposition: `attachment; filename="${encodeURIComponent(filename)}"`,
    }),
    { expiresIn }
  );
}
