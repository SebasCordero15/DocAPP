import { prisma } from "./prisma";

export interface UserLimitStatus {
  allowed: boolean;
  current: number;
  max: number;
}

// Returns the current active-user count vs the company's maxUsers cap.
// The invite route calls this before creating any invite; tests call it directly.
export async function checkUserLimit(companyId: string): Promise<UserLimitStatus> {
  const [company, current] = await Promise.all([
    prisma.company.findUnique({ where: { id: companyId }, select: { maxUsers: true } }),
    prisma.user.count({ where: { companyId, isActive: true } }),
  ]);

  if (!company) return { allowed: false, current: 0, max: 0 };
  return { allowed: current < company.maxUsers, current, max: company.maxUsers };
}
