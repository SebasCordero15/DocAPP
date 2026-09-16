import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireActiveSession, hashPassword } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logAction } from "@/lib/audit";
import { sendCompanyWelcomeEmail, sendPaymentLinkEmail } from "@/lib/email";

// Users included per plan — Enterprise is the ceiling for the self-service
// picker; a specific company needing more than 50 is a manual follow-up
// (no override field yet), not something exposed in this wizard.
const PLAN_LIMITS: Record<string, { maxUsers: number; maxStorageMB: number }> = {
  BASIC:      { maxUsers: 10,  maxStorageMB: 5120   }, // 5 GB
  PRO:        { maxUsers: 30,  maxStorageMB: 15360  }, // 15 GB
  ENTERPRISE: { maxUsers: 50,  maxStorageMB: 30720  }, // 30 GB
};

const baseSchema = z.object({
  name: z.string().min(1).max(100),
  industry: z.string().min(1).max(100),
  plan: z.enum(["BASIC", "PRO", "ENTERPRISE"]).default("BASIC"),
  primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  secondaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  fontFamily: z.string().max(50).default("Inter"),
  // logoUrl is a data: URL (base64) — capped at 500 KB encoded ≈ ~680 KB base64
  logoUrl: z.string().max(700_000).optional(),
  adminName: z.string().min(1).max(100),
  adminEmail: z.string().email(),
  // Billing gate — decided by the superadmin at creation time.
  //   FREE:    admin user + credentials are created right away (unchanged flow).
  //   CHARGED: no user is created yet; a payment link is emailed instead, and
  //            credentials are generated later via /confirm-payment.
  billingMode: z.enum(["FREE", "CHARGED"]).default("FREE"),
  adminPassword: z.string().min(8).max(100).optional(),
  paymentLink: z.string().url().max(500).optional(),
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

// POST /api/superadmin/companies — provision a new tenant.
// FREE: tenant + initial COMPANY_ADMIN created immediately, welcome email sent.
// CHARGED: tenant created pending payment, no user yet, payment-link email sent.
export async function POST(req: NextRequest) {
  const session = await requireActiveSession();
  if (!session || session.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const parsed = baseSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.issues },
      { status: 400 }
    );
  }

  const {
    name, industry, plan,
    primaryColor, secondaryColor, accentColor, fontFamily, logoUrl,
    adminName, adminEmail, billingMode, adminPassword, paymentLink,
  } = parsed.data;

  if (billingMode === "CHARGED") {
    if (!paymentLink) {
      return NextResponse.json({ error: "El link de pago es obligatorio para una empresa que se cobra", field: "paymentLink" }, { status: 400 });
    }
  } else {
    if (!adminPassword || !isStrongEnough(adminPassword)) {
      return NextResponse.json(
        { error: "La contraseña debe tener al menos 8 caracteres, una mayúscula, una minúscula y un número", field: "adminPassword" },
        { status: 400 }
      );
    }
  }

  const slug = await generateUniqueSlug(name);
  const planLimits = PLAN_LIMITS[plan] ?? PLAN_LIMITS.BASIC;

  let company: Awaited<ReturnType<typeof prisma.company.create>>;
  try {
    company = await prisma.company.create({
      data: {
        name, slug, industry, plan,
        maxUsers: planLimits.maxUsers,
        maxStorageMB: planLimits.maxStorageMB,
        primaryColor, secondaryColor, accentColor, fontFamily,
        logoUrl: logoUrl ?? null,
        billingMode,
        ...(billingMode === "CHARGED"
          ? {
              paymentStatus: "PENDING",
              paymentLink,
              pendingAdminName: adminName,
              pendingAdminEmail: adminEmail,
            }
          : {
              users: {
                create: {
                  name: adminName,
                  email: adminEmail,
                  passwordHash: await hashPassword(adminPassword!),
                  role: "COMPANY_ADMIN",
                  forcePasswordChange: false,
                },
              },
            }),
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
    detail: billingMode === "CHARGED"
      ? `${name} (${slug}) — pendiente de pago — admin propuesto: ${adminEmail}`
      : `${name} (${slug}) — admin: ${adminEmail}`,
  });

  if (billingMode === "CHARGED") {
    const { sent, error: emailError } = await sendPaymentLinkEmail({
      to: adminEmail,
      contactName: adminName,
      companyName: name,
      paymentLink: paymentLink!,
    });
    return NextResponse.json(
      { company: { id: company.id, slug: company.slug }, emailSent: sent, emailError: emailError ?? null },
      { status: 201 }
    );
  }

  const loginUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/login`;
  const { sent, error: emailError } = await sendCompanyWelcomeEmail({
    to: adminEmail,
    adminName,
    companyName: name,
    companySlug: slug,
    password: adminPassword!,
    loginUrl,
    maxUsers: planLimits.maxUsers,
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
