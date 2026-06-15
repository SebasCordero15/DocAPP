import { prisma } from "./prisma";

export async function logAction(params: {
  companyId: string | null;
  userId?: string | null;
  action: string;
  resourceType?: string;
  resourceId?: string;
  detail?: string;
}): Promise<void> {
  await prisma.auditLog.create({
    data: {
      companyId: params.companyId,
      userId: params.userId ?? null,
      action: params.action,
      resourceType: params.resourceType,
      resourceId: params.resourceId,
      detail: params.detail,
    },
  });
}
