import { Roles } from '../constants/enums';
import { z } from 'zod';

export const registerSchema = z.object({
  role: z.enum([Roles.MERCHANT, Roles.INFLUENCER]),
  email: z.string().email(),
  password: z.string().min(8),
  companyName: z.string().optional(),
  contactPerson: z.string().optional(),
  phone: z.string().optional(),
  igLink: z.string().url().optional(),
  tiktokLink: z.string().url().optional(),
  followerCount: z.number().int().nonnegative().optional()
}).superRefine((value, ctx) => {
  if (value.role === Roles.MERCHANT) {
    if (!value.companyName?.trim()) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['companyName'], message: 'Company name is required' });
    }
    if (!value.contactPerson?.trim()) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['contactPerson'], message: 'Contact person is required' });
    }
    if (!value.phone?.trim()) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['phone'], message: 'Phone is required' });
    }
  }

  if (value.role === Roles.INFLUENCER) {
    if (!value.igLink?.trim()) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['igLink'], message: 'Instagram link is required' });
    }
    if (!value.phone?.trim()) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['phone'], message: 'Phone is required' });
    }
  }
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8)
});
