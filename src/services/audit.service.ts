import { prisma } from '../lib/prisma';

export const createAuditLog = async (input: {
  adminId: string;
  action: string;
  entityType: string;
  entityId?: string;
  metadata?: unknown;
}) => {
  await prisma.auditLog.create({
    data: {
      adminId: input.adminId,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      metadata: input.metadata as any
    }
  });
};