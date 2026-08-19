import { prisma } from "./prisma";
import { sendWeeklyReportEmail } from "./email";

export interface WeeklyReportResult {
  companiesProcessed: number;
  emailsSent: number;
  errors: string[];
}

function fmtPeriod(from: Date, to: Date): string {
  const opts: Intl.DateTimeFormatOptions = { day: "2-digit", month: "short" };
  const fromStr = from.toLocaleDateString("es-CR", opts);
  const toStr = to.toLocaleDateString("es-CR", { ...opts, year: "numeric" });
  return `${fromStr} – ${toStr}`;
}

// Runs the weekly report digest: for every active company, compute the
// past-week activity + current document-health snapshot, and email every
// COMPANY_ADMIN of that company.
export async function runWeeklyReport(asOf: Date = new Date()): Promise<WeeklyReportResult> {
  const result: WeeklyReportResult = { companiesProcessed: 0, emailsSent: 0, errors: [] };

  const periodStart = new Date(asOf.getTime() - 7 * 24 * 60 * 60 * 1000);
  const weekFromNow  = new Date(asOf.getTime() + 7 * 24 * 60 * 60 * 1000);
  const periodLabel  = fmtPeriod(periodStart, asOf);
  const baseUrl      = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const reportUrl    = `${baseUrl}/dashboard/reportes`;

  const companies = await prisma.company.findMany({
    where: { isActive: true, deletedAt: null },
    select: { id: true, name: true },
  });

  for (const company of companies) {
    result.companiesProcessed++;
    try {
      const [auditLogs, changeRequests, docs, admins] = await Promise.all([
        prisma.auditLog.findMany({
          where: {
            companyId: company.id,
            createdAt: { gte: periodStart, lte: asOf },
            action: { in: ["FILE_UPLOAD", "FILE_DELETE", "FILE_REVIEW_COMPLETE", "FILE_REVIEW_UPDATE"] },
          },
          select: { action: true },
        }),
        prisma.changeRequest.findMany({
          where: { companyId: company.id, createdAt: { gte: periodStart, lte: asOf } },
          select: { status: true },
        }),
        prisma.file.findMany({
          where: {
            companyId: company.id,
            deletedAt: null,
            OR: [{ folderId: null }, { folder: { isExternal: false } }],
          },
          select: { status: true, fechaRevision: true, reviewDueDate: true },
        }),
        prisma.user.findMany({
          where: { companyId: company.id, role: "COMPANY_ADMIN", isActive: true },
          select: { id: true, name: true, email: true },
        }),
      ]);

      if (admins.length === 0) continue;

      const dueDateOf = (d: (typeof docs)[number]) => d.fechaRevision ?? d.reviewDueDate;
      const documentosVencidos = docs.filter((d) => {
        const due = dueDateOf(d);
        return due && due < asOf && d.status !== "OBSOLETE";
      }).length;
      const porRevisarSemana = docs.filter((d) => {
        const due = dueDateOf(d);
        return due && due >= asOf && due <= weekFromNow && d.status !== "OBSOLETE";
      }).length;

      const stats = {
        subidas:       auditLogs.filter((l) => l.action === "FILE_UPLOAD").length,
        eliminaciones: auditLogs.filter((l) => l.action === "FILE_DELETE").length,
        revisiones:    auditLogs.filter((l) => l.action.startsWith("FILE_REVIEW")).length,
        aprobadas:     changeRequests.filter((cr) => cr.status === "APPROVED").length,
        rechazadas:    changeRequests.filter((cr) => cr.status === "REJECTED").length,
        pendientes:    changeRequests.filter((cr) => cr.status === "PENDING").length,
      };

      for (const admin of admins) {
        const { sent, error } = await sendWeeklyReportEmail({
          to: admin.email,
          adminName: admin.name,
          companyName: company.name,
          periodLabel,
          ...stats,
          totalDocumentos: docs.length,
          documentosVencidos,
          porRevisarSemana,
          reportUrl,
        });
        if (sent) result.emailsSent++;
        else if (error) result.errors.push(`email(${admin.email}): ${error}`);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      result.errors.push(`company(${company.id}): ${msg}`);
    }
  }

  return result;
}
