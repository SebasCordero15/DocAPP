import { prisma } from "./prisma";
import { sendReviewReminderEmail } from "./email";

type Window = "overdue" | "1d" | "7d" | "30d";

function getWindow(daysUntilDue: number): Window | null {
  if (daysUntilDue <= 0)  return "overdue";
  if (daysUntilDue <= 1)  return "1d";
  if (daysUntilDue <= 7)  return "7d";
  if (daysUntilDue <= 30) return "30d";
  return null;
}

function daysLabel(days: number): string {
  if (days <= 0) return "hoy (vencida)";
  if (days < 1)  return "hoy";
  const d = Math.ceil(days);
  return `en ${d} día${d !== 1 ? "s" : ""}`;
}

export interface ReminderResult {
  filesScanned: number;
  notificationsSent: number;
  emailsSent: number;
  errors: string[];
}

export async function runReviewReminders(asOf: Date = new Date()): Promise<ReminderResult> {
  const result: ReminderResult = { filesScanned: 0, notificationsSent: 0, emailsSent: 0, errors: [] };

  const windowStart = new Date(asOf.getTime() - 24 * 60 * 60 * 1000);
  const windowEnd   = new Date(asOf.getTime() + 30 * 24 * 60 * 60 * 1000 + 60_000);

  // Check both fechaRevision (Control de Cambios date) and reviewDueDate (legacy scheduling)
  const files = await prisma.file.findMany({
    where: {
      deletedAt: null,
      status: { not: "OBSOLETE" },
      OR: [
        { fechaRevision: { gte: windowStart, lte: windowEnd } },
        { reviewDueDate: { gte: windowStart, lte: windowEnd } },
      ],
    },
    include: {
      company: { select: { id: true, name: true } },
      assignedTo: { select: { id: true, name: true, email: true } },
    },
  });

  result.filesScanned = files.length;

  for (const file of files) {
    // Prefer fechaRevision; fall back to reviewDueDate
    const dueDate = file.fechaRevision ?? file.reviewDueDate;
    if (!dueDate) continue;

    const dueDateStr    = dueDate.toISOString().slice(0, 10);
    const daysUntilDue  = (dueDate.getTime() - asOf.getTime()) / (24 * 60 * 60 * 1000);
    const window        = getWindow(daysUntilDue);
    if (!window) continue;

    const companyId = file.companyId;
    const loginUrl  = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    const docName   = (file as { nombreDocumento?: string | null }).nombreDocumento || file.name;

    const admins = await prisma.user.findMany({
      where:  { companyId, role: "COMPANY_ADMIN", isActive: true },
      select: { id: true, name: true, email: true },
    });

    const recipients: Array<{ id: string; name: string; email: string }> = [];
    if (file.assignedTo) recipients.push(file.assignedTo);
    for (const admin of admins) {
      if (!recipients.some((r) => r.id === admin.id)) recipients.push(admin);
    }

    const message = `Revisión pendiente ${daysLabel(daysUntilDue)}: "${docName}"`;

    for (const recipient of recipients) {
      const dedupKey = `rev:${file.id}:${window}:${dueDateStr}:${recipient.id}`;

      try {
        await prisma.notification.create({
          data: {
            companyId,
            userId:   recipient.id,
            type:     `REVIEW_DUE_${window.toUpperCase()}`,
            message,
            fileId:   file.id,
            dedupKey,
          },
        });
        result.notificationsSent++;
      } catch (e: unknown) {
        if ((e as { code?: string }).code === "P2002") continue; // already sent
        const msg = e instanceof Error ? e.message : String(e);
        result.errors.push(`notification(${recipient.id},${file.id}): ${msg}`);
        continue;
      }

      const { sent, error } = await sendReviewReminderEmail({
        to:            recipient.email,
        recipientName: recipient.name,
        fileName:      docName,
        companyName:   file.company.name,
        daysUntilDue:  Math.ceil(daysUntilDue),
        dueDateStr,
        loginUrl,
      });
      if (sent)  result.emailsSent++;
      else if (error) result.errors.push(`email(${recipient.email}): ${error}`);
    }
  }

  return result;
}
