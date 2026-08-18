import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireActiveSession, hashPassword } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logAction } from "@/lib/audit";
import { sendCompanyWelcomeEmail } from "@/lib/email";

const PLAN_LIMITS: Record<string, { maxUsers: number; maxStorageMB: number }> = {
  BASIC:      { maxUsers: 10,  maxStorageMB: 5120   }, // 5 GB
  PRO:        { maxUsers: 50,  maxStorageMB: 15360  }, // 15 GB
  ENTERPRISE: { maxUsers: 250, maxStorageMB: 30720  }, // 30 GB
};

const schema = z.object({
  name: z.string().min(1).max(100),
  industry: z.enum(["FARMACIA", "ALIMENTOS", "MATERIALES", "SERVICIOS", "OTRO", "LEGAL", "FINANCE", "HEALTHCARE", "REAL_ESTATE", "TECH", "OTHER"]),
  plan: z.enum(["BASIC", "PRO", "ENTERPRISE"]).default("BASIC"),
  maxUsers: z.number().int().min(1).max(10000).default(10),
  primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  secondaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  fontFamily: z.string().max(50).default("Inter"),
  // logoUrl is a data: URL (base64) — capped at 500 KB encoded ≈ ~680 KB base64
  logoUrl: z.string().max(700_000).optional(),
  adminName: z.string().min(1).max(100),
  adminEmail: z.string().email(),
  adminPassword: z.string().min(8).max(100),
});

function isStrongEnough(pw: string): boolean {
  return pw.length >= 8 && /[A-Z]/.test(pw) && /[a-z]/.test(pw) && /[0-9]/.test(pw);
}

function slugify(input: string): string {
  return (
    input
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-{2,}/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 50) || "empresa"
  );
}

async function generateUniqueSlug(name: string): Promise<string> {
  const base = slugify(name);
  let slug = base;
  let n = 2;
  while (await prisma.company.findUnique({ where: { slug } })) {
    slug = `${base}-${n}`;
    n++;
  }
  return slug;
}

// POST /api/superadmin/companies — provision a new tenant + initial admin user.
export async function POST(req: NextRequest) {
  const session = await requireActiveSession();
  if (!session || session.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.issues },
      { status: 400 }
    );
  }

  const {
    name, industry, plan,
    primaryColor, secondaryColor, accentColor, fontFamily, logoUrl,
    adminName, adminEmail, adminPassword,
  } = parsed.data;

  if (!isStrongEnough(adminPassword)) {
    return NextResponse.json(
      { error: "La contraseña debe tener al menos 8 caracteres, una mayúscula, una minúscula y un número", field: "adminPassword" },
      { status: 400 }
    );
  }

  const slug = await generateUniqueSlug(name);
  const passwordHash = await hashPassword(adminPassword);
  const planLimits = PLAN_LIMITS[plan] ?? PLAN_LIMITS.BASIC;

  let company: Awaited<ReturnType<typeof prisma.company.create>>;
  try {
    company = await prisma.company.create({
      data: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        name, slug, industry: industry as any, plan,
        maxUsers: planLimits.maxUsers,
        maxStorageMB: planLimits.maxStorageMB,
        primaryColor, secondaryColor, accentColor, fontFamily,
        logoUrl: logoUrl ?? null,
        users: {
          create: {
            name: adminName,
            email: adminEmail,
            passwordHash,
            role: "COMPANY_ADMIN",
            forcePasswordChange: false,
          },
        },
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[company create error]", msg);
    return NextResponse.json({ error: "Failed to create company" }, { status: 500 });
  }

  await logAction({
    companyId: company.id,
    userId: session.userId,
    action: "COMPANY_CREATE",
    resourceType: "COMPANY",
    resourceId: company.id,
    detail: `${name} (${slug}) — admin: ${adminEmail}`,
  });

  const loginUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/login`;
  const { sent, error: emailError } = await sendCompanyWelcomeEmail({
    to: adminEmail,
    adminName,
    companyName: name,
    companySlug: slug,
    password: adminPassword,
    loginUrl,
  });

  return NextResponse.json(
    {
      company: { id: company.id, slug: company.slug },
      emailSent: sent,
      emailError: emailError ?? null,
    },
    { status: 201 }
  );
}
