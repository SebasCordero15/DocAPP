import { AccessLevel, Role } from "@prisma/client";
import { prisma } from "./prisma";
import { atLeast, isAdminRole } from "./permissions";

/** True when the user's access means changes bypass the approval workflow. */
export function canBypassApproval(level: AccessLevel, role: Role | string): boolean {
  return isAdminRole(role) || atLeast(level, "MANAGE");
}

const CR_TYPE_LABELS: Record<string, string> = {
  NEW_UPLOAD:           "nueva subida de archivo",
  EDIT_METADATA:        "edición de metadatos",
  REPLACE_FILE:         "reemplazo de archivo",
  DELETE:               "eliminación de documento",
  REVISION_DATE_CHANGE: "cambio de fecha de revisión",
  OTHER:                "cambio de documento",
};

/**
 * Notify every COMPANY_ADMIN in the company that a ChangeRequest needs review.
 * Fire-and-forget — caller awaits this but it never throws to the user.
 */
export async function notifyAdminsOfRequest(params: {
  companyId: string;
  fileId:    string | null;
  docName:   string;
  type:      string;
}): Promise<void> {
  const admins = await prisma.user.findMany({
    where: { companyId: params.companyId, role: "COMPANY_ADMIN", isActive: true },
    select: { id: true },
  });
  if (admins.length === 0) return;

  const label = CR_TYPE_LABELS[params.type] ?? params.type;
  await prisma.notification.createMany({
    data: admins.map((a) => ({
      companyId: params.companyId,
      userId:    a.id,
      type:      "CHANGE_REQUEST_PENDING",
      message:   `Solicitud de ${label} para "${params.docName}" requiere tu aprobación`,
      fileId:    params.fileId,
    })),
  });
}

/** Notify the requesting user that their ChangeRequest was reviewed. */
export async function notifyRequesterOfReview(params: {
  companyId:        string;
  requestedByUserId: string;
  fileId:           string | null;
  docName:          string;
  type:             string;
  approved:         boolean;
  adminNotes?:      string | null;
}): Promise<void> {
  const label = CR_TYPE_LABELS[params.type] ?? params.type;
  const message = params.approved
    ? `Tu solicitud de ${label} para "${params.docName}" fue aprobada`
    : `Tu solicitud de ${label} para "${params.docName}" fue rechazada${params.adminNotes ? `. Motivo: ${params.adminNotes}` : ""}`;

  await prisma.notification.create({
    data: {
      companyId: params.companyId,
      userId:    params.requestedByUserId,
      type:      params.approved ? "CHANGE_REQUEST_APPROVED" : "CHANGE_REQUEST_REJECTED",
      message,
      fileId:    params.fileId,
    },
  });
}
