import { Request, Response } from 'express';
import { sendSuccess } from '../utils/response';
import { getPagination } from '../utils/pagination';
import * as publicService from '../services/public.service';
import * as merchantLandingService from '../services/merchant-landing.service';

export const categories = async (_req: Request, res: Response) => {
  return sendSuccess(res, await publicService.listPublicCategories());
};

export const missions = async (req: Request, res: Response) => {
  const { page, pageSize } = getPagination(req.query.page as string, req.query.pageSize as string);
  const data = await publicService.listPublishedMissions({
    page,
    pageSize,
    categoryId: req.query.categoryId as string | undefined,
    search: req.query.search as string | undefined,
    platform: req.query.platform as 'IG' | 'TikTok' | 'FB' | undefined,
    location: req.query.location as string | undefined
  });
  return sendSuccess(res, data);
};

export const config = async (_req: Request, res: Response) => {
  return sendSuccess(res, await publicService.getPublicConfig());
};

export const missionById = async (req: Request, res: Response) => {
  return sendSuccess(res, await publicService.getPublishedMissionById(String(req.params.missionId)));
};

export const merchantLandingBySlug = async (req: Request, res: Response) => {
  return sendSuccess(res, await merchantLandingService.getPublicMerchantLanding(String(req.params.slug)));
};

export const consumeMerchantCheckIn = async (req: Request, res: Response) => {
  return sendSuccess(
    res,
    await merchantLandingService.consumeMerchantCheckInToken(String(req.params.token), {
      ip: req.ip ?? null
    }),
    201
  );
};

export const shopCategories = async (_req: Request, res: Response) => {
  return sendSuccess(res, await publicService.getShopCategories());
};

export const shopProducts = async (req: Request, res: Response) => {
  const { page, pageSize } = getPagination(req.query.page as string, req.query.pageSize as string);
  return sendSuccess(
    res,
    await publicService.getShopProducts({
      page,
      pageSize,
      category: req.query.category as string | undefined,
      search: req.query.search as string | undefined
    })
  );
};

export const shopProductBySlug = async (req: Request, res: Response) => {
  return sendSuccess(res, await publicService.getShopProductBySlug(String(req.params.slug)));
};

export const merchantLandingProducts = async (req: Request, res: Response) => {
  return sendSuccess(res, await publicService.getMerchantLandingProducts(String(req.params.slug)));
};

export const merchantLandingCheckout = async (req: Request, res: Response) => {
  return sendSuccess(
    res,
    await publicService.checkoutMerchantLanding(String(req.params.slug), {
      buyerId: req.body.buyer_id,
      productId: req.body.product_id,
      referrerId: req.body.referrer_id,
      amount: Number(req.body.amount),
      quantity: Number(req.body.quantity ?? 1),
      buyerName: String(req.body.buyerName ?? ''),
      buyerPhone: String(req.body.buyerPhone ?? ''),
      buyerEmail: String(req.body.buyerEmail ?? ''),
      note: typeof req.body.note === 'string' ? req.body.note : undefined
    }),
    201
  );
};
