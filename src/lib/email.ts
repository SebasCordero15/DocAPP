import { Resend } from "resend";

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

const FROM = process.env.EMAIL_FROM ?? "KE-Control <onboarding@resend.dev>";

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

  const html = `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>Bienvenido a KE-Control</title></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:'Segoe UI',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:40px 16px;">
  <tr><td align="center">
    <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">

      <!-- HEADER -->
      <tr><td style="background:#1B3A6B;border-radius:12px 12px 0 0;padding:36px 40px;text-align:center;">
        <div style="font-size:28px;font-weight:800;color:#ffffff;letter-spacing:-0.5px;">KE-Control</div>
        <div style="font-size:13px;color:rgba(255,255,255,0.65);margin-top:4px;letter-spacing:1px;text-transform:uppercase;">Plataforma Documental</div>
        <div style="width:48px;height:3px;background:#3CB54A;margin:18px auto 0;border-radius:2px;"></div>
      </td></tr>

      <!-- WELCOME BODY -->
      <tr><td style="background:#ffffff;padding:40px 40px 32px;">
        <p style="margin:0 0 6px;font-size:13px;font-weight:700;color:#3CB54A;text-transform:uppercase;letter-spacing:1px;">¡Bienvenido!</p>
        <h1 style="margin:0 0 16px;font-size:24px;font-weight:800;color:#1B3A6B;line-height:1.2;">Hola, ${p.adminName}</h1>
        <p style="margin:0 0 28px;font-size:15px;color:#475569;line-height:1.7;">
          Tu espacio de trabajo <strong style="color:#1B3A6B;">${p.companyName}</strong> ha sido creado exitosamente en KE-Control.
          A continuación encontrarás tus credenciales de acceso. Te recomendamos cambiar tu contraseña al iniciar sesión por primera vez.
        </p>

        <!-- CREDENTIALS BOX -->
        <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;margin-bottom:32px;">
          <tr><td style="padding:20px 24px;">
            <p style="margin:0 0 14px;font-size:11px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:1px;">Tus credenciales de acceso</p>
            <table width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;">
              <tr>
                <td style="color:#64748b;padding:7px 0;width:110px;vertical-align:top;">Empresa</td>
                <td style="color:#1e293b;font-weight:600;padding:7px 0;">${p.companyName}</td>
              </tr>
              <tr style="border-top:1px solid #e2e8f0;">
                <td style="color:#64748b;padding:7px 0;vertical-align:top;">Correo</td>
                <td style="color:#1e293b;font-weight:600;padding:7px 0;">${p.to}</td>
              </tr>
              <tr style="border-top:1px solid #e2e8f0;">
                <td style="color:#64748b;padding:7px 0;vertical-align:top;">Contraseña</td>
                <td style="padding:7px 0;">
                  <code style="background:#1B3A6B;color:#ffffff;padding:5px 12px;border-radius:6px;font-size:14px;font-weight:700;letter-spacing:1px;">${p.tempPassword}</code>
                </td>
              </tr>
            </table>
          </td></tr>
        </table>

        <!-- CTA BUTTON -->
        <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:12px;">
          <tr><td align="center">
            <a href="${p.loginUrl}" style="display:inline-block;background:#3CB54A;color:#ffffff;padding:15px 40px;border-radius:8px;text-decoration:none;font-weight:700;font-size:15px;letter-spacing:0.3px;">
              Iniciar Sesión en KE-Control →
            </a>
          </td></tr>
        </table>
        <p style="text-align:center;margin:0;font-size:12px;color:#94a3b8;">${p.loginUrl}</p>
      </td></tr>

      <!-- DIVIDER -->
      <tr><td style="background:#ffffff;padding:0 40px;">
        <div style="border-top:2px solid #f1f5f9;"></div>
      </td></tr>

      <!-- TERMS HEADER -->
      <tr><td style="background:#ffffff;padding:32px 40px 24px;">
        <p style="margin:0 0 4px;font-size:11px;font-weight:700;color:#3CB54A;text-transform:uppercase;letter-spacing:1px;">Documento legal</p>
        <h2 style="margin:0 0 8px;font-size:18px;font-weight:800;color:#1B3A6B;">Términos y Condiciones</h2>
        <p style="margin:0;font-size:13px;color:#64748b;line-height:1.6;">
          Al acceder o utilizar la plataforma, usted acepta los siguientes términos y condiciones. Léalos detenidamente.
        </p>
      </td></tr>

      <!-- TERMS CONTENT -->
      <tr><td style="background:#ffffff;padding:0 40px 40px;">

        ${[
          ["1. Objeto del Servicio", "La plataforma documental tiene como finalidad permitir a las empresas gestionar de forma digital su documentación, facilitando el almacenamiento, consulta, edición, control de acceso y administración de documentos en un entorno seguro y accesible vía web.<br><br>La plataforma ha sido diseñada para apoyar los procesos de gestión documental y facilitar el cumplimiento de los requisitos documentales establecidos por normas ISO aplicables a los sistemas de gestión."],
          ["2. Alcance de la Suscripción", "La suscripción contratada incluye:<br><br>• Acceso a la plataforma vía web.<br>• Hasta diez (10) usuarios autorizados por empresa.<br>• Almacenamiento y administración de documentos.<br>• Asignación de permisos y niveles de acceso a los usuarios.<br>• Consulta y visualización de la información registrada.<br>• Capacitación inicial para el uso de la plataforma.<br>• Soporte técnico y atención de consultas relacionadas con el funcionamiento del sistema.<br><br>Cualquier ampliación de usuarios o servicios adicionales podrá estar sujeta a costos adicionales."],
          ["3. Pago del Servicio", "El servicio se presta bajo la modalidad de suscripción mensual.<br><br>El cliente autoriza el cobro automático mediante tarjeta de crédito o débito registrada al momento de la contratación. El cobro se realizará el día 1 de cada mes correspondiente al período de servicio.<br><br>La empresa emitirá la respectiva factura electrónica por cada pago recibido, de conformidad con la legislación vigente."],
          ["4. Suspensión por Falta de Pago", "En caso de que el cobro automático no pueda procesarse o el pago mensual no sea recibido en la fecha correspondiente, el acceso a la plataforma podrá ser suspendido automáticamente hasta que se regularice la situación de pago.<br><br>La suspensión del servicio no exime al cliente de las obligaciones económicas pendientes. Una vez confirmado el pago, el acceso será restablecido en un plazo razonable."],
          ["5. Responsabilidades del Cliente", "El cliente se compromete a:<br><br>• Mantener actualizada la información de pago.<br>• Utilizar la plataforma únicamente para fines lícitos y relacionados con su actividad empresarial.<br>• Administrar adecuadamente los permisos de acceso otorgados a sus usuarios.<br>• Mantener la confidencialidad de las credenciales de acceso.<br>• Resguardar la información que considere crítica mediante sus propios mecanismos internos de respaldo.<br>• Contar con conexión a internet adecuada considerando que la plataforma se utiliza vía web."],
          ["6. Seguridad y Confidencialidad", "La plataforma incorpora medidas de seguridad destinadas a proteger la información almacenada por los clientes.<br><br>Toda la información cargada será considerada confidencial y únicamente accesible por los usuarios autorizados. La empresa proveedora se compromete a no divulgar la información almacenada, salvo requerimiento legal o autorización expresa del cliente."],
          ["7. Disponibilidad del Servicio", "La empresa realizará esfuerzos razonables para mantener la disponibilidad continua de la plataforma. No obstante, podrán existir interrupciones temporales derivadas de mantenimiento, actualizaciones, fallas de conectividad, servicios de terceros o situaciones de fuerza mayor."],
          ["8. Soporte Técnico", "La suscripción incluye soporte técnico para atención de consultas sobre el uso de la plataforma, orientación funcional y resolución de incidencias relacionadas con el servicio.<br><br>El soporte no incluye servicios de consultoría especializada, personalizaciones o desarrollos específicos no contemplados dentro del servicio contratado."],
          ["9. Propiedad Intelectual", "La plataforma, su software, diseño, estructura, funcionalidades, marcas y documentación asociada son propiedad exclusiva del proveedor del servicio. La contratación de la suscripción otorga únicamente un derecho de uso limitado y no exclusivo durante la vigencia del servicio."],
          ["10. Protección de Datos", "La información almacenada por el cliente seguirá siendo propiedad exclusiva del cliente. La empresa proveedora actuará únicamente como custodio tecnológico de la información y adoptará medidas razonables para protegerla contra accesos no autorizados."],
          ["11. Terminación del Servicio", "Cualquiera de las partes podrá dar por terminada la relación comercial mediante notificación previa conforme a las condiciones pactadas. La empresa podrá cancelar el acceso de forma inmediata en caso de incumplimiento grave de estas condiciones o uso indebido de la plataforma."],
          ["12. Modificaciones", "La empresa podrá actualizar o modificar las presentes condiciones cuando sea necesario para mejorar el servicio, cumplir obligaciones legales o incorporar nuevas funcionalidades. Las modificaciones serán comunicadas oportunamente a los clientes."],
          ["13. Aceptación", "La contratación, acceso o utilización de la plataforma implica la aceptación plena de los presentes Términos y Condiciones."],
        ].map(([title, body]) => `
        <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:16px;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;">
          <tr><td style="background:#f8fafc;padding:10px 18px;border-bottom:1px solid #e2e8f0;">
            <p style="margin:0;font-size:13px;font-weight:700;color:#1B3A6B;">${title}</p>
          </td></tr>
          <tr><td style="padding:14px 18px;">
            <p style="margin:0;font-size:13px;color:#475569;line-height:1.7;">${body}</p>
          </td></tr>
        </table>`).join("")}

      </td></tr>

      <!-- FOOTER -->
      <tr><td style="background:#1B3A6B;border-radius:0 0 12px 12px;padding:28px 40px;text-align:center;">
        <p style="margin:0 0 6px;font-size:14px;font-weight:700;color:#ffffff;">KE-Control — Plataforma Documental</p>
        <p style="margin:0 0 16px;font-size:12px;color:rgba(255,255,255,0.55);">
          Este correo fue generado automáticamente al crear tu empresa en la plataforma.<br>
          Si no esperabas este mensaje, puedes ignorarlo de forma segura.
        </p>
        <div style="width:32px;height:2px;background:#3CB54A;margin:0 auto;border-radius:1px;"></div>
      </td></tr>

    </table>
  </td></tr>
</table>
</body>
</html>`;

  const { error } = await resend.emails.send({
    from: FROM,
    to: p.to,
    subject: `Bienvenido a KE-Control — ${p.companyName}`,
    html,
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
          Open KE-Control →
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
