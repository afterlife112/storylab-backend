import { Role } from '@prisma/client';
import { z } from 'zod';

export const registerSchema = z.object({
  role: z.nativeEnum(Role).refine((value) => value !== Role.ADMIN, 'Admin cannot self-register'),
  email: z.string().email(),
  password: z.string().min(8),
  companyName: z.string().optional(),
  contactPerson: z.string().optional(),
  phone: z.string().optional(),
  igLink: z.string().url().optional(),
  tiktokLink: z.string().url().optional(),
  followerCount: z.number().int().nonnegative().optional()
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8)
});