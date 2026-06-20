import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

const SECRET = new TextEncoder().encode(
  process.env.AUTH_SECRET || "dev-only-secret-change-me"
);
const COOKIE = "docvault_session";

interface SessionPayload {
  userId: string;
  companyId: string | null;
  role: "SUPER_ADMIN" | "COMPANY_ADMIN" | "EDITOR" | "VIEWER";
}

async function getJwtPayload(req: NextRequest): Promise<SessionPayload | null> {
  const token = req.cookies.get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, SECRET);
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}

function jsonUnauthorized(message = "Unauthorized") {
  return NextResponse.json({ error: message }, { status: 401 });
}

function jsonForbidden(message = "Forbidden") {
  return NextResponse.json({ error: message }, { status: 403 });
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // ── Super admin pages (/superadmin/*) ─────────────────────────────────────
  // /superadmin/login now redirects to /login (handled by the page itself).
  // All other /superadmin/* pages still require a SUPER_ADMIN JWT.
  if (pathname.startsWith("/superadmin")) {
    const session = await getJwtPayload(req);
    if (!session || session.role !== "SUPER_ADMIN") {
      return NextResponse.redirect(new URL("/login", req.url));
    }
    return NextResponse.next();
  }

  // ── Dashboard (all roles) ──────────────────────────────────────────────────
  // Every authenticated user lands here; the page itself renders the correct view.
  if (pathname.startsWith("/dashboard")) {
    const session = await getJwtPayload(req);
    if (!session) {
      return NextResponse.redirect(new URL("/login", req.url));
    }
    return NextResponse.next();
  }

  // ── Super admin API ────────────────────────────────────────────────────────
  // /api/superadmin/login is public; everything else requires SUPER_ADMIN JWT
  if (
    pathname.startsWith("/api/superadmin") &&
    pathname !== "/api/superadmin/login"
  ) {
    const session = await getJwtPayload(req);
    if (!session) return jsonUnauthorized();
    if (session.role !== "SUPER_ADMIN") return jsonForbidden();
    return NextResponse.next();
  }

  // ── Company admin API ─────────────────────────────────────────────────────
  if (pathname.startsWith("/api/admin")) {
    const session = await getJwtPayload(req);
    if (!session) return jsonUnauthorized();
    if (!session.companyId) return jsonForbidden("Super admin cannot access company routes");
    return NextResponse.next();
  }

  // ── Company data API (files, folders) ─────────────────────────────────────
  // Require any authenticated session with a companyId
  if (pathname.startsWith("/api/files") || pathname.startsWith("/api/folders")) {
    const session = await getJwtPayload(req);
    if (!session) return jsonUnauthorized();
    // SUPER_ADMIN is explicitly blocked from company data — metadata only
    if (session.role === "SUPER_ADMIN" || !session.companyId) {
      return jsonForbidden("Super admin cannot access company file data");
    }
    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/superadmin/:path*",
    "/dashboard/:path*",
    "/api/superadmin/:path*",
    "/api/admin/:path*",
    "/api/files/:path*",
    "/api/folders/:path*",
  ],
};
