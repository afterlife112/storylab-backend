import { NotificationType } from '@prisma/client';
import { prisma } from '../lib/prisma';

export const createNotification = async (input: {
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  metadata?: unknown;
}) => {
  return prisma.notification.create({
    data: {
      userId: input.userId,
      type: input.type,
      title: input.title,
      message: input.message,
      metadata: input.metadata as any
    }
  });
};