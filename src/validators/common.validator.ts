import { z } from 'zod';

export const paginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(50).default(10)
});

export const messageSchema = z.object({
  content: z.string().min(1).max(1000)
});
