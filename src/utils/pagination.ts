import { PaginationQuery } from '../types';

export const getPagination = (rawPage?: string, rawPageSize?: string): PaginationQuery => {
  const page = Math.max(1, Number(rawPage ?? 1) || 1);
  const pageSize = Math.min(50, Math.max(1, Number(rawPageSize ?? 10) || 10));
  return { page, pageSize };
};

export const toMeta = (page: number, pageSize: number, total: number) => ({
  page,
  pageSize,
  total,
  totalPages: Math.ceil(total / pageSize)
});