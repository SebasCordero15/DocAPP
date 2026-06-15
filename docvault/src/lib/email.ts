import { Resend } from "resend";

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

const FROM = process.env.EMAIL_FROM ?? "DocVault <onboarding@resend.dev>";

interface WelcomeEmailParams {
  to: string;
  adminName: string;
  companyName: string;
  companySlug: string;
  tempPassword: string;
  loginUrl: string;
}

export async function sendCompanyWelcomeEmail(
  p: WelcomeEmailParams
): Promise<{ sent: boolean; error?: string }> {
  if (!resend) {
    console.warn("[email] RESEND_API_KEY not set — skipping welcome email");
    return { sent: false, error: "RESEND_API_KEY not configured" };
  }

  const { error } = await resend.emails.send({
    from: FROM,
    to: p.to,
    subject: `Welcome to ${p.companyName} on DocVault`,
    html: `
      <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:32px">
        <h2 style="color:#1f2937;margin:0 0 8px">Welcome to DocVault, ${p.adminName}!</h2>
        <p style="color:#4b5563;margin:0 0 24px">
          Your workspace <strong>${p.companyName}</strong> has been provisioned.
          Here are your login credentials — please log in and change your password immediately.
        </p>

        <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:16px;margin-bottom:24px">
          <table style="font-size:14px;width:100%">
            <tr><td style="color:#6b7280;padding:3px 0">Company</td><td><strong>${p.companySlug}</strong></td></tr>
            <tr><td style="color:#6b7280;padding:3px 0">Email</td><td>${p.to}</td></tr>
            <tr><td style="color:#6b7280;padding:3px 0">Password</td><td><code style="background:#fff;border:1px solid #d1d5db;padding:2px 6px;border-radius:4px">${p.tempPassword}</code></td></tr>
          </table>
        </div>

        <a href="${p.loginUrl}"
           style="display:inline-block;background:#2563eb;color:#fff;padding:11px 22px;border-radius:7px;text-decoration:none;font-weight:600;font-size:14px">
          Log in to DocVault →
        </a>

        <p style="color:#9ca3af;font-size:12px;margin-top:24px">
          If you weren't expecting this email, you can safely ignore it.
        </p>
      </div>
    `,
  });

  if (error) {
    console.error("[email] Send failed:", error);
    return { sent: false, error: "message" in error ? error.message : String(error) };
  }
  return { sent: true };
}

interface ReviewReminderParams {
  to: string;
  recipientName: string;
  fileName: string;
  companyName: string;
  daysUntilDue: number;
  dueDateStr: string;
  loginUrl: string;
}

export async function sendReviewReminderEmail(
  p: ReviewReminderParams
): Promise<{ sent: boolean; error?: string }> {
  if (!resend) {
    console.warn("[email] RESEND_API_KEY not set — skipping review reminder");
    return { sent: false, error: "RESEND_API_KEY not configured" };
  }

  const urgency =
    p.daysUntilDue <= 0 ? "OVERDUE" : p.daysUntilDue === 1 ? "due tomorrow" : `due in ${p.daysUntilDue} days`;
  const subjectPrefix = p.daysUntilDue <= 1 ? "[Action Required] " : "";

  const { error } = await resend.emails.send({
    from: FROM,
    to: p.to,
    subject: `${subjectPrefix}Review reminder: "${p.fileName}" is ${urgency}`,
    html: `
      <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:32px">
        <h2 style="color:#1f2937;margin:0 0 8px">Document Review Reminder</h2>
        <p style="color:#4b5563;margin:0 0 20px">Hi ${p.recipientName},</p>
        <p style="color:#4b5563;margin:0 0 20px">
          A document in <strong>${p.companyName}</strong> requires your attention.
        </p>

        <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:16px;margin-bottom:24px">
          <table style="font-size:14px;width:100%">
            <tr><td style="color:#6b7280;padding:3px 0;width:110px">Document</td><td><strong>${p.fileName}</strong></td></tr>
            <tr><td style="color:#6b7280;padding:3px 0">Review due</td><td><strong style="color:${p.daysUntilDue <= 1 ? "#dc2626" : p.daysUntilDue <= 7 ? "#d97706" : "#374151"}">${p.dueDateStr}</strong></td></tr>
            <tr><td style="color:#6b7280;padding:3px 0">Status</td><td><strong style="color:${p.daysUntilDue <= 1 ? "#dc2626" : "#374151"}">${urgency}</strong></td></tr>
          </table>
        </div>

        <a href="${p.loginUrl}"
           style="display:inline-block;background:#2563eb;color:#fff;padding:11px 22px;border-radius:7px;text-decoration:none;font-weight:600;font-size:14px">
          Open DocVault →
        </a>

        <p style="color:#9ca3af;font-size:12px;margin-top:24px">
          You are receiving this because you are assigned to this document or are a company administrator.
        </p>
      </div>
    `,
  });

  if (error) {
    console.error("[email] Review reminder send failed:", error);
    return { sent: false, error: "message" in error ? error.message : String(error) };
  }
  return { sent: true };
}
