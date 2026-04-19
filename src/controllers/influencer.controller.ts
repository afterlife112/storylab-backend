import { Response } from 'express';
import { sendSuccess } from '../utils/response';
import { AuthedRequest } from '../types';
import { AppError } from '../utils/app-error';
import { getPagination } from '../utils/pagination';
import * as influencerService from '../services/influencer.service';
import * as merchantLandingService from '../services/merchant-landing.service';
import { getChatMessagesByRole, listChatsByRole, sendChatMessageByRole } from '../services/chat.service';
import { storageProvider } from '../lib/storage';

export const getProfile = async (req: AuthedRequest, res: Response) => {
  if (!req.user) throw new AppError('Unauthorized', 401);
  return sendSuccess(res, await influencerService.getInfluencerProfile(req.user.id));
};

export const updateProfile = async (req: AuthedRequest, res: Response) => {
  if (!req.user) throw new AppError('Unauthorized', 401);
  const file = req.file as Express.Multer.File | undefined;
  return sendSuccess(
    res,
    await influencerService.updateInfluencerProfile(req.user.id, {
      ...req.body,
      proofImageUrl: file ? storageProvider.toPublicUrl(file.filename) : undefined,
      followerCount: Number(req.body.followerCount)
    })
  );
};

export const requestOtp = async (req: AuthedRequest, res: Response) => {
  return sendSuccess(res, await influencerService.requestPhoneOtp(req.body.phone));
};

export const verifyOtp = async (req: AuthedRequest, res: Response) => {
  if (!req.user) throw new AppError('Unauthorized', 401);
  return sendSuccess(res, await influencerService.verifyPhoneOtp(req.user.id, req.body.phone, req.body.code));
};

export const listMissions = async (req: AuthedRequest, res: Response) => {
  const { page, pageSize } = getPagination(req.query.page as string, req.query.pageSize as string);
  const data = await influencerService.listDiscoverMissions({
    page,
    pageSize,
    categoryId: req.query.categoryId as string | undefined,
    search: req.query.search as string | undefined,
    platform: req.query.platform as 'IG' | 'TikTok' | 'FB' | undefined,
    location: req.query.location as string | undefined,
    minPayout: req.query.minPayout ? Number(req.query.minPayout) : undefined,
    maxPayout: req.query.maxPayout ? Number(req.query.maxPayout) : undefined,
    deadlineBefore: req.query.deadlineBefore as string | undefined
  });
  return sendSuccess(res, data);
};

export const applyMission = async (req: AuthedRequest, res: Response) => {
  if (!req.user) throw new AppError('Unauthorized', 401);
  return sendSuccess(res, await influencerService.applyMission(req.user.id, req.body.missionId), 201);
};

export const listApplications = async (req: AuthedRequest, res: Response) => {
  if (!req.user) throw new AppError('Unauthorized', 401);
  const { page, pageSize } = getPagination(req.query.page as string, req.query.pageSize as string);
  return sendSuccess(res, await influencerService.listInfluencerApplications(req.user.id, page, pageSize));
};

export const getMerchantLandingLink = async (req: AuthedRequest, res: Response) => {
  if (!req.user) throw new AppError('Unauthorized', 401);
  return sendSuccess(
    res,
    await merchantLandingService.getMerchantLandingForInfluencer(req.user.id, String(req.params.applicationId))
  );
};

export const generateMerchantLandingQr = async (req: AuthedRequest, res: Response) => {
  if (!req.user) throw new AppError('Unauthorized', 401);
  return sendSuccess(
    res,
    await merchantLandingService.generateMerchantCheckInQr(req.user.id, String(req.params.applicationId)),
    201
  );
};

export const listCustomerCheckIns = async (req: AuthedRequest, res: Response) => {
  if (!req.user) throw new AppError('Unauthorized', 401);
  const { page, pageSize } = getPagination(req.query.page as string, req.query.pageSize as string);
  return sendSuccess(res, await merchantLandingService.listInfluencerCheckInRecords(req.user.id, page, pageSize));
};

export const submitProof = async (req: AuthedRequest, res: Response) => {
  if (!req.user) throw new AppError('Unauthorized', 401);

  const files = (req.files as Express.Multer.File[] | undefined) ?? [];
  const proofImages = files.map((file) => storageProvider.toPublicUrl(file.filename));
  const links =
    typeof req.body.links === 'string'
      ? JSON.parse(req.body.links)
      : Array.isArray(req.body.links)
        ? req.body.links
        : [];

  return sendSuccess(
    res,
    await influencerService.submitMissionProof(req.user.id, {
      applicationId: req.body.applicationId,
      caption: req.body.caption,
      links,
      proofImages
    }),
    201
  );
};

export const getEarnings = async (req: AuthedRequest, res: Response) => {
  if (!req.user) throw new AppError('Unauthorized', 401);
  const { page, pageSize } = getPagination(req.query.page as string, req.query.pageSize as string);
  return sendSuccess(res, await influencerService.getEarningsSummary(req.user.id, page, pageSize));
};

export const requestWithdrawal = async (req: AuthedRequest, res: Response) => {
  if (!req.user) throw new AppError('Unauthorized', 401);
  return sendSuccess(res, await influencerService.requestWithdrawal(req.user.id, req.body.points), 201);
};

export const listWithdrawals = async (req: AuthedRequest, res: Response) => {
  if (!req.user) throw new AppError('Unauthorized', 401);
  const { page, pageSize } = getPagination(req.query.page as string, req.query.pageSize as string);
  return sendSuccess(res, await influencerService.listWithdrawals(req.user.id, page, pageSize));
};

export const listNotifications = async (req: AuthedRequest, res: Response) => {
  if (!req.user) throw new AppError('Unauthorized', 401);
  const { page, pageSize } = getPagination(req.query.page as string, req.query.pageSize as string);
  return sendSuccess(res, await influencerService.listInfluencerNotifications(req.user.id, page, pageSize));
};

export const openDispute = async (req: AuthedRequest, res: Response) => {
  if (!req.user) throw new AppError('Unauthorized', 401);
  return sendSuccess(res, await influencerService.openDispute(req.user.id, req.body), 201);
};

export const listChats = async (req: AuthedRequest, res: Response) => {
  if (!req.user) throw new AppError('Unauthorized', 401);
  return sendSuccess(res, await listChatsByRole(req.user.id, req.user.role));
};

export const getChatMessages = async (req: AuthedRequest, res: Response) => {
  if (!req.user) throw new AppError('Unauthorized', 401);
  const { page, pageSize } = getPagination(req.query.page as string, req.query.pageSize as string);
  return sendSuccess(res, await getChatMessagesByRole(req.user.id, req.user.role, String(req.params.applicationId), page, pageSize));
};

export const sendChatMessage = async (req: AuthedRequest, res: Response) => {
  if (!req.user) throw new AppError('Unauthorized', 401);
  return sendSuccess(res, await sendChatMessageByRole(req.user.id, req.user.role, String(req.params.applicationId), req.body.content), 201);
};

export const getCommerceState = async (req: AuthedRequest, res: Response) => {
  if (!req.user) throw new AppError('Unauthorized', 401);
  return sendSuccess(res, await influencerService.getCommerceState(req.user.id));
};

export const createCommerceAddress = async (req: AuthedRequest, res: Response) => {
  if (!req.user) throw new AppError('Unauthorized', 401);
  return sendSuccess(res, await influencerService.addCommerceAddress(req.user.id, req.body), 201);
};

export const setDefaultCommerceAddress = async (req: AuthedRequest, res: Response) => {
  if (!req.user) throw new AppError('Unauthorized', 401);
  return sendSuccess(res, await influencerService.markDefaultCommerceAddress(req.user.id, String(req.params.addressId)));
};

export const createCommerceOrder = async (req: AuthedRequest, res: Response) => {
  if (!req.user) throw new AppError('Unauthorized', 401);
  return sendSuccess(res, await influencerService.createCommerceOrder(req.user.id, req.body), 201);
};

export const getMediaKit = async (req: AuthedRequest, res: Response) => {
  if (!req.user) throw new AppError('Unauthorized', 401);
  return sendSuccess(res, await influencerService.getMediaKit(req.user.id));
};

export const updateMediaKit = async (req: AuthedRequest, res: Response) => {
  if (!req.user) throw new AppError('Unauthorized', 401);
  return sendSuccess(res, await influencerService.saveMediaKit(req.user.id, req.body));
};

export const updateCommercePreferences = async (req: AuthedRequest, res: Response) => {
  if (!req.user) throw new AppError('Unauthorized', 401);
  return sendSuccess(res, await influencerService.saveCommercePreferences(req.user.id, req.body));
};
