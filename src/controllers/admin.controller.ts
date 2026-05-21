import { Response } from 'express';
import { sendSuccess } from '../utils/response';
import { AppError } from '../utils/app-error';
import { AuthedRequest } from '../types';
import { getPagination } from '../utils/pagination';
import * as adminService from '../services/admin.service';
import { createAuditLog } from '../services/audit.service';

const withAudit = async (
  adminId: string,
  action: string,
  entityType: string,
  entityId: string | undefined,
  metadata: unknown
) => {
  await createAuditLog({
    adminId,
    action,
    entityType,
    entityId,
    metadata
  });
};

export const dashboard = async (_req: AuthedRequest, res: Response) => {
  return sendSuccess(res, await adminService.getDashboardMetrics());
};

export const listCategories = async (_req: AuthedRequest, res: Response) => {
  return sendSuccess(res, await adminService.listCategories());
};

export const createCategory = async (req: AuthedRequest, res: Response) => {
  if (!req.user) throw new AppError('Unauthorized', 401);
  const data = await adminService.createCategory(req.body);
  await withAudit(req.user.id, 'CATEGORY_CREATE', 'CATEGORY', data.id, req.body);
  return sendSuccess(res, data, 201);
};

export const updateCategory = async (req: AuthedRequest, res: Response) => {
  if (!req.user) throw new AppError('Unauthorized', 401);
  const data = await adminService.updateCategory(String(req.params.id), req.body);
  await withAudit(req.user.id, 'CATEGORY_UPDATE', 'CATEGORY', data.id, req.body);
  return sendSuccess(res, data);
};

export const deleteCategory = async (req: AuthedRequest, res: Response) => {
  if (!req.user) throw new AppError('Unauthorized', 401);
  const data = await adminService.deleteCategory(String(req.params.id));
  await withAudit(req.user.id, 'CATEGORY_DELETE', 'CATEGORY', data.id, null);
  return sendSuccess(res, data);
};

export const reorderCategories = async (req: AuthedRequest, res: Response) => {
  if (!req.user) throw new AppError('Unauthorized', 401);
  const data = await adminService.reorderCategories(req.body.order);
  await withAudit(req.user.id, 'CATEGORY_REORDER', 'CATEGORY', undefined, req.body.order);
  return sendSuccess(res, data);
};

export const listVerifications = async (req: AuthedRequest, res: Response) => {
  const { page, pageSize } = getPagination(req.query.page as string, req.query.pageSize as string);
  const status = req.query.status as any;
  return sendSuccess(res, await adminService.listVerifications(page, pageSize, status));
};

export const decideVerification = async (req: AuthedRequest, res: Response) => {
  if (!req.user) throw new AppError('Unauthorized', 401);
  const data = await adminService.decideVerification(String(req.params.influencerId), req.body.status, req.body.notes);
  await withAudit(req.user.id, 'VERIFICATION_DECISION', 'INFLUENCER_PROFILE', data.id, req.body);
  return sendSuccess(res, data);
};

export const moderateMission = async (req: AuthedRequest, res: Response) => {
  if (!req.user) throw new AppError('Unauthorized', 401);
  const data = await adminService.moderateMission(String(req.params.missionId), req.body.suspended, req.body.reason);
  await withAudit(req.user.id, 'MISSION_MODERATE', 'MISSION', data.id, req.body);
  return sendSuccess(res, data);
};

export const listUsers = async (req: AuthedRequest, res: Response) => {
  const { page, pageSize } = getPagination(
    req.query.page as string,
    (req.query.pageSize as string) ?? (req.query.limit as string)
  );
  return sendSuccess(
    res,
    await adminService.listUsers(page, pageSize, req.query.role as any, (req.query.query as string) ?? (req.query.search as string))
  );
};

export const updateUserStatus = async (req: AuthedRequest, res: Response) => {
  if (!req.user) throw new AppError('Unauthorized', 401);
  const data = await adminService.updateUserStatus(String(req.params.userId), req.body.status);
  await withAudit(req.user.id, 'USER_STATUS_UPDATE', 'USER', data.id, req.body);
  return sendSuccess(res, data);
};

export const getFinanceSettings = async (_req: AuthedRequest, res: Response) => {
  return sendSuccess(res, await adminService.getFinanceConfig());
};

export const updateFinanceSettings = async (req: AuthedRequest, res: Response) => {
  if (!req.user) throw new AppError('Unauthorized', 401);
  const data = await adminService.updateFinanceConfig(req.body);
  await withAudit(req.user.id, 'FINANCE_SETTINGS_UPDATE', 'SETTING', undefined, req.body);
  return sendSuccess(res, data);
};

export const listWithdrawals = async (req: AuthedRequest, res: Response) => {
  const { page, pageSize } = getPagination(req.query.page as string, req.query.pageSize as string);
  const status = req.query.status as any;
  return sendSuccess(res, await adminService.listWithdrawalsAdmin(page, pageSize, status));
};

export const updateWithdrawal = async (req: AuthedRequest, res: Response) => {
  if (!req.user) throw new AppError('Unauthorized', 401);
  const data = await adminService.updateWithdrawalStatus(String(req.params.withdrawalId), req.body);
  await withAudit(req.user.id, 'WITHDRAWAL_STATUS_UPDATE', 'WITHDRAWAL', data.id, req.body);
  return sendSuccess(res, data);
};

export const listAuditLogs = async (req: AuthedRequest, res: Response) => {
  const { page, pageSize } = getPagination(req.query.page as string, req.query.pageSize as string);
  return sendSuccess(res, await adminService.listAuditLogs(page, pageSize));
};

export const listPointLogs = async (_req: AuthedRequest, res: Response) => {
  return sendSuccess(res, await adminService.listPointLogs());
};

export const listDisputes = async (req: AuthedRequest, res: Response) => {
  const { page, pageSize } = getPagination(req.query.page as string, req.query.pageSize as string);
  return sendSuccess(res, await adminService.listDisputes(page, pageSize, req.query.status as any));
};

export const resolveDispute = async (req: AuthedRequest, res: Response) => {
  if (!req.user) throw new AppError('Unauthorized', 401);
  const data = await adminService.resolveDispute(String(req.params.disputeId), req.body.status, req.body.resolutionNote, req.user.id);
  await withAudit(req.user.id, 'DISPUTE_RESOLVE', 'DISPUTE', String(req.params.disputeId), req.body);
  return sendSuccess(res, data);
};
