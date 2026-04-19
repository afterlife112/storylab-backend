import { Request } from 'express';
import { Role } from '@prisma/client';

export type AuthUser = {
  id: string;
  role: Role;
  email: string;
};

export type PaginationQuery = {
  page: number;
  pageSize: number;
};

export type AuthedRequest = Request & {
  user?: AuthUser;
};