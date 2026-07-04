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

  // Forward the pathname so server layouts can detect the current route reliably
  // without depending on Vercel-specific headers like x-invoke-path.
  const reqHeaders = new Headers(req.headers);
  reqHeaders.set("x-pathname", pathname);

  function next() {
    return NextResponse.next({ request: { headers: reqHeaders } });
  }

  // ── Super admin pages (/superadmin/*) ─────────────────────────────────────
  if (pathname.startsWith("/superadmin")) {
    const session = await getJwtPayload(req);
    if (!session || session.role !== "SUPER_ADMIN") {
      return NextResponse.redirect(new URL("/login", req.url));
    }
    return next();
  }

  // ── Dashboard (all roles) ──────────────────────────────────────────────────
  if (pathname.startsWith("/dashboard")) {
    const session = await getJwtPayload(req);
    if (!session) {
      return NextResponse.redirect(new URL("/login", req.url));
    }
    return next();
  }

  // ── Super admin API ────────────────────────────────────────────────────────
  if (
    pathname.startsWith("/api/superadmin") &&
    pathname !== "/api/superadmin/login"
  ) {
    const session = await getJwtPayload(req);
    if (!session) return jsonUnauthorized();
    if (session.role !== "SUPER_ADMIN") return jsonForbidden();
    return next();
  }

  // ── Company admin API ─────────────────────────────────────────────────────
  if (pathname.startsWith("/api/admin")) {
    const session = await getJwtPayload(req);
    if (!session) return jsonUnauthorized();
    if (!session.companyId) return jsonForbidden("Super admin cannot access company routes");
    return next();
  }

  // ── Company data API (files, folders) ─────────────────────────────────────
  if (pathname.startsWith("/api/files") || pathname.startsWith("/api/folders")) {
    const session = await getJwtPayload(req);
    if (!session) return jsonUnauthorized();
    if (session.role === "SUPER_ADMIN" || !session.companyId) {
      return jsonForbidden("Super admin cannot access company file data");
    }
    return next();
  }

  return next();
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
