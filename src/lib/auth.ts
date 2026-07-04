import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { prisma } from "./prisma";

const SECRET = new TextEncoder().encode(
  process.env.AUTH_SECRET || "dev-only-secret-change-me"
);
const COOKIE = "docvault_session";

export interface SessionPayload {
  userId: string;
  companyId: string | null; // null for SUPER_ADMIN (no company)
  role: "SUPER_ADMIN" | "COMPANY_ADMIN" | "EDITOR" | "VIEWER";
  [key: string]: unknown;
}

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 12);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export async function createSession(payload: SessionPayload): Promise<void> {
  // Explicitly destroy any existing session before issuing a new one.
  // This ensures a stale token can never coexist with a fresh one.
  destroySession();

  const token = await new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(SECRET);

  cookies().set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
}

export async function getSession(): Promise<SessionPayload | null> {
  const token = cookies().get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, SECRET);
    return payload as SessionPayload;
  } catch {
    return null;
  }
}

export function destroySession(): void {
  cookies().delete(COOKIE);
}

// Pure DB check: verifies the user is still active and returns fresh role/companyId.
// Extracted so it can be called directly in tests without a cookies context.
export async function validateActiveSession(
  session: SessionPayload
): Promise<SessionPayload | null> {
  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: {
      isActive: true,
      role: true,
      companyId: true,
      company: { select: { isActive: true, deletedAt: true } },
    },
  });
  if (!user || !user.isActive) return null;
  if (user.company && (!user.company.isActive || user.company.deletedAt)) return null;

  // Return a fresh payload with role/companyId from DB, not from the JWT.
  // This ensures role changes and company moves take effect immediately.
  return {
    ...session,
    role: user.role as SessionPayload["role"],
    companyId: user.companyId,
  };
}

// Validates the JWT signature, then re-reads role/companyId/isActive from DB.
// Every protected route handler must use this — never trust the JWT payload alone.
export async function requireActiveSession(): Promise<SessionPayload | null> {
  const session = await getSession();
  if (!session) return null;
  return validateActiveSession(session);
}
