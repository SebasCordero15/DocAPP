import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { requireActiveSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import DashboardShellClient from "./DashboardShellClient";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await requireActiveSession();
  if (!session) redirect("/login");

  // SUPER_ADMIN has no company — skip shell, let page.tsx handle it
  if (!session.companyId) return <>{children}</>;

  const [company, activeUserCount, currentUser] = await Promise.all([
    prisma.company.findUnique({
      where: { id: session.companyId },
      select: { name: true, primaryColor: true, fontFamily: true, logoUrl: true, maxUsers: true },
    }),
    prisma.user.count({ where: { companyId: session.companyId, isActive: true } }),
    prisma.user.findUnique({
      where: { id: session.userId },
      select: { forcePasswordChange: true },
    }),
  ]);
  if (!company) redirect("/login");

  // Enforce password change — redirect unless already on the change-password page
  const pathname = headers().get("x-pathname") ?? headers().get("x-invoke-path") ?? "";
  const onChangePasswordPage = pathname.includes("cambiar-contrasena");
  if (currentUser?.forcePasswordChange && !onChangePasswordPage) {
    redirect("/dashboard/cambiar-contrasena");
  }

  return (
    <DashboardShellClient
      company={{ ...company, logoUrl: company.logoUrl ?? null }}
      userRole={session.role}
      activeUserCount={activeUserCount}
      maxUsers={company.maxUsers}
      forcePasswordChange={currentUser?.forcePasswordChange ?? false}
    >
      {children}
    </DashboardShellClient>
  );
}
