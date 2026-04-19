import { Request, Response } from 'express';
import { AppError } from '../utils/app-error';
import { sendSuccess } from '../utils/response';
import { AuthedRequest } from '../types';
import { getPagination } from '../utils/pagination';
import * as merchantService from '../services/merchant.service';
import { createTopupIntent } from '../services/payment.service';
import { getChatMessagesByRole, listChatsByRole, sendChatMessageByRole } from '../services/chat.service';

export const getProfile = async (req: AuthedRequest, res: Response) => {
  if (!req.user) throw new AppError('Unauthorized', 401);
  const data = await merchantService.getMerchantProfile(req.user.id);
  return sendSuccess(res, data);
};

export const updateProfile = async (req: AuthedRequest, res: Response) => {
  if (!req.user) throw new AppError('Unauthorized', 401);
  const data = await merchantService.updateMerchantProfile(req.user.id, req.body);
  return sendSuccess(res, data);
};

export const getWallet = async (req: AuthedRequest, res: Response) => {
  if (!req.user) throw new AppError('Unauthorized', 401);
  const data = await merchantService.getMerchantWallet(req.user.id);
  return sendSuccess(res, data);
};

export const getWalletLedger = async (req: AuthedRequest, res: Response) => {
  if (!req.user) throw new AppError('Unauthorized', 401);
  const { page, pageSize } = getPagination(req.query.page as string, req.query.pageSize as string);
  const data = await merchantService.getMerchantWalletLedger(req.user.id, page, pageSize);
  return sendSuccess(res, data);
};

export const createWalletTopupIntent = async (req: AuthedRequest, res: Response) => {
  if (!req.user) throw new AppError('Unauthorized', 401);
  const merchant = await merchantService.getMerchantProfile(req.user.id);
  const data = await createTopupIntent(merchant.id, req.body.amount);
  return sendSuccess(res, data, 201);
};

export const createMission = async (req: AuthedRequest, res: Response) => {
  if (!req.user) throw new AppError('Unauthorized', 401);
  const data = await merchantService.createMission(req.user.id, req.body);
  return sendSuccess(res, data, 201);
};

export const updateMission = async (req: AuthedRequest, res: Response) => {
  if (!req.user) throw new AppError('Unauthorized', 401);
  const data = await merchantService.updateMission(req.user.id, String(req.params.missionId), req.body);
  return sendSuccess(res, data);
};

export const deleteMission = async (req: AuthedRequest, res: Response) => {
  if (!req.user) throw new AppError('Unauthorized', 401);
  const data = await merchantService.deleteMission(req.user.id, String(req.params.missionId));
  return sendSuccess(res, data);
};

export const updateMissionStatus = async (req: AuthedRequest, res: Response) => {
  if (!req.user) throw new AppError('Unauthorized', 401);
  const data = await merchantService.updateMissionStatus(req.user.id, String(req.params.missionId), req.body.status, req.body.reason);
  return sendSuccess(res, data);
};

export const listMissions = async (req: AuthedRequest, res: Response) => {
  if (!req.user) throw new AppError('Unauthorized', 401);
  const { page, pageSize } = getPagination(req.query.page as string, req.query.pageSize as string);
  const status = req.query.status as any;
  const data = await merchantService.listMerchantMissions(req.user.id, page, pageSize, status);
  return sendSuccess(res, data);
};

export const getMissionDetail = async (req: AuthedRequest, res: Response) => {
  if (!req.user) throw new AppError('Unauthorized', 401);
  const data = await merchantService.getMissionDetail(req.user.id, String(req.params.missionId));
  return sendSuccess(res, data);
};

export const listApplicants = async (req: AuthedRequest, res: Response) => {
  if (!req.user) throw new AppError('Unauthorized', 401);
  const data = await merchantService.listMissionApplicants(req.user.id, String(req.params.missionId));
  return sendSuccess(res, data);
};

export const decideApplicant = async (req: AuthedRequest, res: Response) => {
  if (!req.user) throw new AppError('Unauthorized', 401);
  const data = await merchantService.decideMissionApplication(req.user.id, String(req.params.applicationId), req.body.status);
  return sendSuccess(res, data);
};

export const listSubmissions = async (req: AuthedRequest, res: Response) => {
  if (!req.user) throw new AppError('Unauthorized', 401);
  const data = await merchantService.listMissionSubmissions(req.user.id, String(req.params.missionId));
  return sendSuccess(res, data);
};

export const reviewSubmission = async (req: AuthedRequest, res: Response) => {
  if (!req.user) throw new AppError('Unauthorized', 401);
  const data = await merchantService.reviewSubmission(req.user.id, String(req.params.submissionId), req.body.status, req.body.reviewNote);
  return sendSuccess(res, data);
};

export const createReview = async (req: AuthedRequest, res: Response) => {
  if (!req.user) throw new AppError('Unauthorized', 401);
  const data = await merchantService.createMissionReview(req.user.id, req.body);
  return sendSuccess(res, data, 201);
};

export const listNotifications = async (req: AuthedRequest, res: Response) => {
  if (!req.user) throw new AppError('Unauthorized', 401);
  const { page, pageSize } = getPagination(req.query.page as string, req.query.pageSize as string);
  const data = await merchantService.listMerchantNotifications(req.user.id, page, pageSize);
  return sendSuccess(res, data);
};

export const listChats = async (req: AuthedRequest, res: Response) => {
  if (!req.user) throw new AppError('Unauthorized', 401);
  const data = await listChatsByRole(req.user.id, req.user.role);
  return sendSuccess(res, data);
};

export const getChatMessages = async (req: AuthedRequest, res: Response) => {
  if (!req.user) throw new AppError('Unauthorized', 401);
  const { page, pageSize } = getPagination(req.query.page as string, req.query.pageSize as string);
  const data = await getChatMessagesByRole(req.user.id, req.user.role, String(req.params.applicationId), page, pageSize);
  return sendSuccess(res, data);
};

export const sendChatMessage = async (req: AuthedRequest, res: Response) => {
  if (!req.user) throw new AppError('Unauthorized', 401);
  const data = await sendChatMessageByRole(req.user.id, req.user.role, String(req.params.applicationId), req.body.content);
  return sendSuccess(res, data, 201);
};

export const openDispute = async (req: AuthedRequest, res: Response) => {
  if (!req.user) throw new AppError('Unauthorized', 401);
  const data = await merchantService.openMerchantDispute(req.user.id, req.body);
  return sendSuccess(res, data, 201);
};

export const listProducts = async (req: AuthedRequest, res: Response) => {
  if (!req.user) throw new AppError('Unauthorized', 401);
  return sendSuccess(res, await merchantService.listMerchantProducts(req.user.id));
};

export const getProduct = async (req: AuthedRequest, res: Response) => {
  if (!req.user) throw new AppError('Unauthorized', 401);
  return sendSuccess(res, await merchantService.getMerchantProduct(req.user.id, String(req.params.productId)));
};

export const createProduct = async (req: AuthedRequest, res: Response) => {
  if (!req.user) throw new AppError('Unauthorized', 401);
  return sendSuccess(res, await merchantService.createMerchantProduct(req.user.id, req.body), 201);
};

export const updateProduct = async (req: AuthedRequest, res: Response) => {
  if (!req.user) throw new AppError('Unauthorized', 401);
  return sendSuccess(res, await merchantService.updateMerchantProduct(req.user.id, String(req.params.productId), req.body));
};

export const deleteProduct = async (req: AuthedRequest, res: Response) => {
  if (!req.user) throw new AppError('Unauthorized', 401);
  return sendSuccess(res, await merchantService.deleteMerchantProduct(req.user.id, String(req.params.productId)));
};

export const getVoucherByCode = async (req: AuthedRequest, res: Response) => {
  if (!req.user) throw new AppError('Unauthorized', 401);
  return sendSuccess(res, await merchantService.getMerchantVoucherByCode(req.user.id, String(req.params.code)));
};

export const redeemVoucher = async (req: AuthedRequest, res: Response) => {
  if (!req.user) throw new AppError('Unauthorized', 401);
  return sendSuccess(res, await merchantService.redeemMerchantVoucher(req.user.id, String(req.params.code)));
};
