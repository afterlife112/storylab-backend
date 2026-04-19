import { Role } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { AppError } from '../utils/app-error';
import { toMeta } from '../utils/pagination';

const ensureMembership = async (userId: string, role: Role, applicationId: string) => {
  const chat = await prisma.chat.findUnique({
    where: { applicationId },
    include: {
      mission: {
        include: {
          merchantProfile: true
        }
      },
      application: true
    }
  });

  if (!chat) throw new AppError('Chat not found', 404);

  if (role === 'MERCHANT') {
    const merchant = await prisma.merchantProfile.findUnique({ where: { userId } });
    if (!merchant || chat.merchantId !== merchant.id) {
      throw new AppError('Forbidden', 403);
    }
  }

  if (role === 'INFLUENCER') {
    const influencer = await prisma.influencerProfile.findUnique({ where: { userId } });
    if (!influencer || chat.influencerId !== influencer.id) {
      throw new AppError('Forbidden', 403);
    }
  }

  return chat;
};

export const listChatsByRole = async (userId: string, role: Role) => {
  if (role === 'MERCHANT') {
    const merchant = await prisma.merchantProfile.findUnique({ where: { userId } });
    if (!merchant) throw new AppError('Merchant profile not found', 404);
    return prisma.chat.findMany({
      where: { merchantId: merchant.id },
      include: {
        mission: { select: { title: true } },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          include: { sender: { select: { email: true } } }
        }
      },
      orderBy: { updatedAt: 'desc' }
    });
  }

  if (role === 'INFLUENCER') {
    const influencer = await prisma.influencerProfile.findUnique({ where: { userId } });
    if (!influencer) throw new AppError('Influencer profile not found', 404);
    return prisma.chat.findMany({
      where: { influencerId: influencer.id },
      include: {
        mission: { select: { title: true } },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          include: { sender: { select: { email: true } } }
        }
      },
      orderBy: { updatedAt: 'desc' }
    });
  }

  throw new AppError('Unsupported role for chat', 403);
};

export const getChatMessagesByRole = async (
  userId: string,
  role: Role,
  applicationId: string,
  page: number,
  pageSize: number
) => {
  const chat = await ensureMembership(userId, role, applicationId);
  const where = { chatId: chat.id };

  const [items, total] = await Promise.all([
    prisma.chatMessage.findMany({
      where,
      include: { sender: { select: { id: true, email: true, role: true } } },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize
    }),
    prisma.chatMessage.count({ where })
  ]);

  return {
    chat,
    items: items.reverse(),
    meta: toMeta(page, pageSize, total)
  };
};

export const sendChatMessageByRole = async (userId: string, role: Role, applicationId: string, content: string) => {
  const chat = await ensureMembership(userId, role, applicationId);
  const message = await prisma.chatMessage.create({
    data: {
      chatId: chat.id,
      senderId: userId,
      content
    },
    include: {
      sender: { select: { id: true, email: true, role: true } }
    }
  });

  await prisma.chat.update({ where: { id: chat.id }, data: { updatedAt: new Date() } });
  return message;
};