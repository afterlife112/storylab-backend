import { Request } from 'express';
import { Role } from '../constants/enums';

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
