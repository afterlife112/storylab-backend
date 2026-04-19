import {
  CommerceOrderSource,
  CommerceOrderStatus,
  MerchantProductStatus,
  MerchantVoucherStatus,
  Prisma
} from '@prisma/client';
import { prisma } from '../lib/prisma';
import { AppError } from '../utils/app-error';
import { toMeta } from '../utils/pagination';

const defaultCommercePreferences = {
  orderUpdates: true,
  promoAlerts: true,
  rememberCheckoutAddress: true
};

const slugify = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64) || 'item';

const toNumber = (value: Prisma.Decimal | number | null | undefined) => Number(value ?? 0);

const asRecord = (value: unknown) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
};

const getInfluencerProfileOrThrow = async (userId: string) => {
  const profile = await prisma.influencerProfile.findUnique({
    where: { userId },
    include: { user: true }
  });

  if (!profile) {
    throw new AppError('Influencer profile not found', 404);
  }

  return profile;
};

const getMerchantProfileOrThrow = async (userId: string) => {
  const profile = await prisma.merchantProfile.findUnique({
    where: { userId }
  });

  if (!profile) {
    throw new AppError('Merchant profile not found', 404);
  }

  return profile;
};

const buildShortDescription = (description: string) => {
  const trimmed = description.trim();
  if (trimmed.length <= 96) return trimmed;
  return `${trimmed.slice(0, 93).trimEnd()}...`;
};

const serializeProduct = (
  product: {
    id: string;
    merchantId: string;
    name: string;
    slug: string;
    sku: string;
    category: string;
    price: Prisma.Decimal | number;
    stock: number;
    status: MerchantProductStatus;
    description: string;
    imageUrl: string | null;
    createdAt: Date;
    updatedAt: Date;
    merchant?: { companyName: string } | null;
  }
) => {
  const brand = product.merchant?.companyName ?? 'Merchant';

  return {
    id: product.id,
    merchantId: product.merchantId,
    slug: product.slug,
    name: product.name,
    brand,
    sku: product.sku,
    category: product.category,
    price: toNumber(product.price),
    stock: product.stock,
    status: product.status,
    description: product.description,
    shortDescription: buildShortDescription(product.description),
    imageUrl: product.imageUrl,
    badges: [product.category, brand].filter(Boolean),
    rating: 0,
    reviewCount: 0,
    tags: [product.category, brand],
    sourceType: 'LINK_FRIENDLY' as const,
    createdAt: product.createdAt,
    updatedAt: product.updatedAt
  };
};

const serializeAddress = (address: {
  id: string;
  label: string;
  recipientName: string;
  phone: string;
  line1: string;
  line2: string | null;
  city: string;
  state: string;
  postalCode: string;
  isDefault: boolean;
}) => ({
  id: address.id,
  label: address.label,
  recipientName: address.recipientName,
  phone: address.phone,
  line1: address.line1,
  line2: address.line2,
  city: address.city,
  state: address.state,
  postalCode: address.postalCode,
  isDefault: address.isDefault
});

const parseAddressSnapshot = (value: Prisma.JsonValue | null, fallback: { buyerName: string; buyerPhone: string }) => {
  const record = asRecord(value);
  return {
    id: typeof record.id === 'string' ? record.id : '',
    label: typeof record.label === 'string' ? record.label : 'Checkout',
    recipientName: typeof record.recipientName === 'string' ? record.recipientName : fallback.buyerName,
    phone: typeof record.phone === 'string' ? record.phone : fallback.buyerPhone,
    line1: typeof record.line1 === 'string' ? record.line1 : 'Captured at checkout',
    line2: typeof record.line2 === 'string' ? record.line2 : '',
    city: typeof record.city === 'string' ? record.city : 'Online',
    state: typeof record.state === 'string' ? record.state : 'Online',
    postalCode: typeof record.postalCode === 'string' ? record.postalCode : '00000'
  };
};

const serializeOrder = (
  order: {
    id: string;
    merchantId: string | null;
    source: CommerceOrderSource;
    status: CommerceOrderStatus;
    subtotal: Prisma.Decimal | number;
    shippingFee: Prisma.Decimal | number;
    total: Prisma.Decimal | number;
    buyerName: string;
    buyerPhone: string;
    buyerEmail: string;
    note: string | null;
    addressSnapshot: Prisma.JsonValue | null;
    createdAt: Date;
    items: Array<{
      id: string;
      productId: string | null;
      title: string;
      imageUrl: string | null;
      quantity: number;
      unitPrice: Prisma.Decimal | number;
    }>;
  }
) => ({
  id: order.id,
  number: `ORD-${order.id.slice(-8).toUpperCase()}`,
  source: order.source,
  status: order.status,
  createdAt: order.createdAt,
  subtotal: toNumber(order.subtotal),
  shippingFee: toNumber(order.shippingFee),
  total: toNumber(order.total),
  note: order.note,
  buyerName: order.buyerName,
  buyerPhone: order.buyerPhone,
  buyerEmail: order.buyerEmail,
  address: parseAddressSnapshot(order.addressSnapshot, {
    buyerName: order.buyerName,
    buyerPhone: order.buyerPhone
  }),
  items: order.items.map((item) => ({
    id: item.id,
    productId: item.productId,
    title: item.title,
    imageUrl: item.imageUrl,
    quantity: item.quantity,
    unitPrice: toNumber(item.unitPrice)
  }))
});

const buildDefaultMediaKit = (profile: Awaited<ReturnType<typeof getInfluencerProfileOrThrow>>) => {
  const handle =
    profile.igLink.split('/').filter(Boolean).pop()?.replace('@', '') ||
    profile.user.email.split('@')[0].replace(/[^a-z0-9._-]+/gi, '');
  const displayName = handle
    .split(/[._-]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');

  const socialAccounts = [
    {
      platform: 'Instagram',
      username: `@${handle}`,
      followerCount: profile.followerCount,
      verified: profile.verificationStatus === 'APPROVED',
      engagementRate: 0
    }
  ];

  if (profile.tiktokLink) {
    const tiktokHandle = profile.tiktokLink.split('/').filter(Boolean).pop()?.replace('@', '') || handle;
    socialAccounts.push({
      platform: 'TikTok',
      username: `@${tiktokHandle}`,
      followerCount: profile.followerCount,
      verified: profile.verificationStatus === 'APPROVED',
      engagementRate: 0
    });
  }

  return {
    creatorId: profile.id,
    displayName: displayName || handle || 'Creator',
    username: `@${handle}`,
    bio: profile.verificationNotes || '',
    location: '',
    profilePhotoUrl: profile.proofImageUrl || undefined,
    socialAccounts,
    categories: [],
    audience: {
      femalePercent: 0,
      malePercent: 0,
      topCountries: [],
      ageRanges: []
    },
    portfolioItems: [],
    collaborations: [],
    performance: {
      averageViews: 0,
      averageLikes: 0,
      averageEngagementRate: 0
    },
    verification: {
      phoneVerified: Boolean(profile.phoneVerifiedAt),
      platformVerified: profile.verificationStatus === 'APPROVED',
      followerProofApproved: profile.verificationStatus === 'APPROVED'
    }
  };
};

export const getInfluencerMediaKit = async (userId: string) => {
  const profile = await getInfluencerProfileOrThrow(userId);
  const mediaKit = profile.mediaKit ? asRecord(profile.mediaKit) : buildDefaultMediaKit(profile);

  return {
    ...mediaKit,
    creatorId: profile.id,
    verification: {
      ...asRecord(asRecord(mediaKit).verification),
      phoneVerified: Boolean(profile.phoneVerifiedAt),
      platformVerified: profile.verificationStatus === 'APPROVED',
      followerProofApproved: profile.verificationStatus === 'APPROVED'
    }
  };
};

export const updateInfluencerMediaKit = async (userId: string, payload: Record<string, unknown>) => {
  const profile = await getInfluencerProfileOrThrow(userId);
  await prisma.influencerProfile.update({
    where: { id: profile.id },
    data: {
      mediaKit: payload as Prisma.InputJsonValue
    }
  });

  return getInfluencerMediaKit(userId);
};

export const getInfluencerCommerceState = async (userId: string) => {
  const [user, addresses, orders] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId } }),
    prisma.commerceAddress.findMany({
      where: { userId },
      orderBy: [{ isDefault: 'desc' }, { updatedAt: 'desc' }]
    }),
    prisma.commerceOrder.findMany({
      where: { userId },
      include: {
        items: {
          orderBy: { createdAt: 'asc' }
        }
      },
      orderBy: { createdAt: 'desc' }
    })
  ]);

  if (!user) {
    throw new AppError('User not found', 404);
  }

  return {
    addresses: addresses.map(serializeAddress),
    orders: orders.map(serializeOrder),
    preferences: {
      ...defaultCommercePreferences,
      ...asRecord(user.commercePreferences)
    }
  };
};

export const createCommerceAddress = async (
  userId: string,
  payload: {
    label: string;
    recipientName: string;
    phone: string;
    line1: string;
    line2?: string | null;
    city: string;
    state: string;
    postalCode: string;
    isDefault?: boolean;
  }
) => {
  if (!payload.label.trim() || !payload.recipientName.trim() || !payload.phone.trim() || !payload.line1.trim()) {
    throw new AppError('Address fields are incomplete', 422);
  }

  return prisma.$transaction(async (tx) => {
    if (payload.isDefault !== false) {
      await tx.commerceAddress.updateMany({
        where: { userId, isDefault: true },
        data: { isDefault: false }
      });
    }

    const address = await tx.commerceAddress.create({
      data: {
        userId,
        label: payload.label.trim(),
        recipientName: payload.recipientName.trim(),
        phone: payload.phone.trim(),
        line1: payload.line1.trim(),
        line2: payload.line2?.trim() || null,
        city: payload.city.trim(),
        state: payload.state.trim(),
        postalCode: payload.postalCode.trim(),
        isDefault: payload.isDefault !== false
      }
    });

    return serializeAddress(address);
  });
};

export const setDefaultCommerceAddress = async (userId: string, addressId: string) => {
  const address = await prisma.commerceAddress.findFirst({
    where: { id: addressId, userId }
  });

  if (!address) {
    throw new AppError('Address not found', 404);
  }

  await prisma.$transaction([
    prisma.commerceAddress.updateMany({
      where: { userId, isDefault: true },
      data: { isDefault: false }
    }),
    prisma.commerceAddress.update({
      where: { id: addressId },
      data: { isDefault: true }
    })
  ]);

  return { updated: true };
};

export const updateCommercePreferences = async (
  userId: string,
  payload: Partial<typeof defaultCommercePreferences>
) => {
  const current = await prisma.user.findUnique({
    where: { id: userId },
    select: { commercePreferences: true }
  });

  if (!current) {
    throw new AppError('User not found', 404);
  }

  const next = {
    ...defaultCommercePreferences,
    ...asRecord(current.commercePreferences),
    ...payload
  };

  await prisma.user.update({
    where: { id: userId },
    data: {
      commercePreferences: next as Prisma.InputJsonValue
    }
  });

  return next;
};

type OrderCreateInput = {
  productItems: Array<{ productId: string; quantity: number }>;
  addressId: string;
  note?: string;
  source?: CommerceOrderSource;
};

export const createInfluencerCommerceOrder = async (userId: string, payload: OrderCreateInput) => {
  if (!payload.productItems.length) {
    throw new AppError('Cart is empty', 422);
  }

  const [user, address] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId } }),
    prisma.commerceAddress.findFirst({ where: { id: payload.addressId, userId } })
  ]);

  if (!user || !address) {
    throw new AppError('Checkout address not found', 404);
  }

  const uniqueProductIds = Array.from(new Set(payload.productItems.map((item) => item.productId)));
  const products = await prisma.merchantProduct.findMany({
    where: {
      id: { in: uniqueProductIds },
      status: 'ACTIVE'
    },
    include: {
      merchant: {
        select: { companyName: true }
      }
    }
  });

  const productMap = new Map(products.map((item) => [item.id, item]));
  const normalizedItems = payload.productItems.map((item) => {
    const product = productMap.get(item.productId);
    if (!product) {
      throw new AppError('Product not found', 404);
    }
    if (item.quantity <= 0 || item.quantity > product.stock) {
      throw new AppError(`Insufficient stock for ${product.name}`, 422);
    }
    return { product, quantity: item.quantity };
  });

  const subtotal = normalizedItems.reduce((sum, item) => sum + toNumber(item.product.price) * item.quantity, 0);
  const shippingFee = subtotal >= 180 ? 0 : 12;
  const merchantId = normalizedItems[0]?.product.merchantId ?? null;

  const order = await prisma.$transaction(async (tx) => {
    const created = await tx.commerceOrder.create({
      data: {
        userId,
        merchantId,
        source: payload.source ?? 'SELF_PURCHASE',
        status: 'PROCESSING',
        subtotal,
        shippingFee,
        total: subtotal + shippingFee,
        buyerName: address.recipientName,
        buyerPhone: address.phone,
        buyerEmail: user.email,
        note: payload.note?.trim() || 'Placed from in-app checkout',
        addressSnapshot: {
          id: address.id,
          label: address.label,
          recipientName: address.recipientName,
          phone: address.phone,
          line1: address.line1,
          line2: address.line2,
          city: address.city,
          state: address.state,
          postalCode: address.postalCode
        },
        items: {
          create: normalizedItems.map(({ product, quantity }) => ({
            productId: product.id,
            title: product.name,
            imageUrl: product.imageUrl,
            quantity,
            unitPrice: product.price
          }))
        }
      },
      include: {
        items: true
      }
    });

    for (const { product, quantity } of normalizedItems) {
      await tx.merchantProduct.update({
        where: { id: product.id },
        data: {
          stock: {
            decrement: quantity
          }
        }
      });
    }

    return created;
  });

  return serializeOrder(order);
};

export const listMerchantProducts = async (userId: string) => {
  const merchant = await getMerchantProfileOrThrow(userId);
  const items = await prisma.merchantProduct.findMany({
    where: { merchantId: merchant.id },
    include: {
      merchant: {
        select: { companyName: true }
      }
    },
    orderBy: { updatedAt: 'desc' }
  });

  return items.map(serializeProduct);
};

export const getMerchantProduct = async (userId: string, productId: string) => {
  const merchant = await getMerchantProfileOrThrow(userId);
  const product = await prisma.merchantProduct.findFirst({
    where: {
      id: productId,
      merchantId: merchant.id
    },
    include: {
      merchant: {
        select: { companyName: true }
      }
    }
  });

  if (!product) {
    throw new AppError('Product not found', 404);
  }

  return serializeProduct(product);
};

const ensureUniqueProductSlug = async (merchantId: string, name: string, productId?: string) => {
  const base = `${slugify(name)}-${merchantId.slice(-6)}`;

  for (let attempt = 0; attempt < 10; attempt += 1) {
    const candidate = attempt === 0 ? base : `${base}-${attempt + 1}`;
    const existing = await prisma.merchantProduct.findUnique({ where: { slug: candidate } });
    if (!existing || existing.id === productId) {
      return candidate;
    }
  }

  throw new AppError('Unable to create product slug', 500);
};

export const createMerchantProduct = async (
  userId: string,
  payload: {
    name: string;
    sku: string;
    category: string;
    price: number;
    stock: number;
    status: MerchantProductStatus;
    description: string;
    imageUrl?: string | null;
  }
) => {
  const merchant = await getMerchantProfileOrThrow(userId);
  if (!payload.name.trim() || !payload.sku.trim() || !payload.category.trim() || !payload.description.trim()) {
    throw new AppError('Product fields are incomplete', 422);
  }

  const slug = await ensureUniqueProductSlug(merchant.id, payload.name);
  const product = await prisma.merchantProduct.create({
    data: {
      merchantId: merchant.id,
      slug,
      name: payload.name.trim(),
      sku: payload.sku.trim(),
      category: payload.category.trim(),
      price: payload.price,
      stock: Math.max(0, Math.floor(payload.stock)),
      status: payload.status,
      description: payload.description.trim(),
      imageUrl: payload.imageUrl?.trim() || null
    },
    include: {
      merchant: {
        select: { companyName: true }
      }
    }
  });

  return serializeProduct(product);
};

export const updateMerchantProduct = async (
  userId: string,
  productId: string,
  payload: {
    name: string;
    sku: string;
    category: string;
    price: number;
    stock: number;
    status: MerchantProductStatus;
    description: string;
    imageUrl?: string | null;
  }
) => {
  const merchant = await getMerchantProfileOrThrow(userId);
  const existing = await prisma.merchantProduct.findFirst({
    where: { id: productId, merchantId: merchant.id }
  });

  if (!existing) {
    throw new AppError('Product not found', 404);
  }

  const slug = await ensureUniqueProductSlug(merchant.id, payload.name, existing.id);
  const product = await prisma.merchantProduct.update({
    where: { id: existing.id },
    data: {
      slug,
      name: payload.name.trim(),
      sku: payload.sku.trim(),
      category: payload.category.trim(),
      price: payload.price,
      stock: Math.max(0, Math.floor(payload.stock)),
      status: payload.status,
      description: payload.description.trim(),
      imageUrl: payload.imageUrl?.trim() || null
    },
    include: {
      merchant: {
        select: { companyName: true }
      }
    }
  });

  return serializeProduct(product);
};

export const deleteMerchantProduct = async (userId: string, productId: string) => {
  const merchant = await getMerchantProfileOrThrow(userId);
  const existing = await prisma.merchantProduct.findFirst({
    where: { id: productId, merchantId: merchant.id }
  });

  if (!existing) {
    throw new AppError('Product not found', 404);
  }

  await prisma.merchantProduct.delete({ where: { id: existing.id } });
  return { deleted: true as const, id: existing.id };
};

const normalizeVoucherCode = (value: string) => value.trim().toUpperCase().replace(/\s+/g, '');

const serializeVoucher = (voucher: {
  id: string;
  code: string;
  title: string;
  productName: string;
  campaignName: string;
  status: MerchantVoucherStatus;
  referredBy: Prisma.JsonValue;
  redeemingUser: Prisma.JsonValue;
  createdAt: Date;
  validUntil: Date;
  usedAt: Date | null;
}) => ({
  id: voucher.id,
  code: voucher.code,
  title: voucher.title,
  productName: voucher.productName,
  campaignName: voucher.campaignName,
  status: voucher.status,
  referredBy: asRecord(voucher.referredBy),
  redeemingUser: asRecord(voucher.redeemingUser),
  createdAt: voucher.createdAt,
  validUntil: voucher.validUntil,
  usedAt: voucher.usedAt
});

export const getMerchantVoucherByCode = async (userId: string, code: string) => {
  const merchant = await getMerchantProfileOrThrow(userId);
  const voucher = await prisma.merchantVoucher.findFirst({
    where: {
      merchantId: merchant.id,
      code: normalizeVoucherCode(code)
    }
  });

  if (!voucher) {
    throw new AppError('Voucher not found', 404);
  }

  return serializeVoucher(voucher);
};

export const redeemMerchantVoucher = async (userId: string, code: string) => {
  const merchant = await getMerchantProfileOrThrow(userId);
  const voucher = await prisma.merchantVoucher.findFirst({
    where: {
      merchantId: merchant.id,
      code: normalizeVoucherCode(code)
    }
  });

  if (!voucher) {
    throw new AppError('Voucher not found', 404);
  }

  if (voucher.status === 'USED') {
    return serializeVoucher(voucher);
  }

  const updated = await prisma.merchantVoucher.update({
    where: { id: voucher.id },
    data: {
      status: 'USED',
      usedAt: new Date()
    }
  });

  return serializeVoucher(updated);
};

export const listPublicShopCategories = async () => {
  const rows = await prisma.merchantProduct.findMany({
    where: { status: 'ACTIVE' },
    select: { category: true }
  });

  const names = Array.from(new Set(rows.map((item) => item.category.trim()).filter(Boolean))).sort((left, right) =>
    left.localeCompare(right)
  );

  return names.map((name) => ({
    id: slugify(name),
    name,
    slug: slugify(name)
  }));
};

export const listPublicShopProducts = async (params: { page: number; pageSize: number; category?: string; search?: string }) => {
  const where: Prisma.MerchantProductWhereInput = {
    status: 'ACTIVE',
    ...(params.category ? { category: { equals: params.category, mode: 'insensitive' } } : {}),
    ...(params.search
      ? {
          OR: [
            { name: { contains: params.search, mode: 'insensitive' } },
            { description: { contains: params.search, mode: 'insensitive' } },
            { category: { contains: params.search, mode: 'insensitive' } }
          ]
        }
      : {})
  };

  const [items, total] = await Promise.all([
    prisma.merchantProduct.findMany({
      where,
      include: {
        merchant: {
          select: { companyName: true }
        }
      },
      orderBy: { updatedAt: 'desc' },
      skip: (params.page - 1) * params.pageSize,
      take: params.pageSize
    }),
    prisma.merchantProduct.count({ where })
  ]);

  return {
    items: items.map(serializeProduct),
    meta: toMeta(params.page, params.pageSize, total)
  };
};

export const getPublicShopProductBySlug = async (slug: string) => {
  const product = await prisma.merchantProduct.findFirst({
    where: {
      slug,
      status: 'ACTIVE'
    },
    include: {
      merchant: {
        select: { companyName: true }
      }
    }
  });

  if (!product) {
    throw new AppError('Product not found', 404);
  }

  return serializeProduct(product);
};

export const listMerchantLandingProducts = async (slug: string) => {
  const landing = await prisma.merchantLanding.findUnique({
    where: { slug },
    include: {
      application: true
    }
  });

  if (!landing || landing.status !== 'ACTIVE' || landing.application.status !== 'ACCEPTED') {
    throw new AppError('Merchant landing page not found', 404);
  }

  const items = await prisma.merchantProduct.findMany({
    where: {
      merchantId: landing.merchantId,
      status: 'ACTIVE'
    },
    include: {
      merchant: {
        select: { companyName: true }
      }
    },
    orderBy: { updatedAt: 'desc' }
  });

  return items.map(serializeProduct);
};

export const createMerchantLandingCheckout = async (
  slug: string,
  payload: {
    buyerId?: string | null;
    productId: string;
    referrerId?: string | null;
    amount: number;
    quantity?: number;
    buyerName: string;
    buyerPhone: string;
    buyerEmail: string;
    note?: string;
  }
) => {
  const landing = await prisma.merchantLanding.findUnique({
    where: { slug },
    include: {
      application: true,
      merchant: true
    }
  });

  if (!landing || landing.status !== 'ACTIVE' || landing.application.status !== 'ACCEPTED') {
    throw new AppError('Merchant landing page not found', 404);
  }

  const product = await prisma.merchantProduct.findFirst({
    where: {
      id: payload.productId,
      merchantId: landing.merchantId,
      status: 'ACTIVE'
    }
  });

  if (!product) {
    throw new AppError('Product not found', 404);
  }

  const quantity = Math.max(1, Math.floor(Number(payload.quantity ?? 1)));
  if (product.stock < quantity) {
    throw new AppError('Insufficient stock for this product', 422);
  }

  const total = toNumber(product.price) * quantity;
  if (Math.abs(total - Number(payload.amount ?? 0)) > 0.01) {
    throw new AppError('Checkout amount mismatch', 422);
  }

  const linkedUser = payload.buyerId
    ? await prisma.user.findUnique({
        where: { id: payload.buyerId },
        select: { id: true }
      })
    : null;

  const order = await prisma.$transaction(async (tx) => {
    const created = await tx.commerceOrder.create({
      data: {
        userId: linkedUser?.id ?? null,
        merchantId: landing.merchantId,
        source: payload.referrerId ? 'AFFILIATE_LINK' : 'SELF_PURCHASE',
        status: 'PROCESSING',
        subtotal: total,
        shippingFee: 0,
        total,
        buyerName: payload.buyerName.trim(),
        buyerPhone: payload.buyerPhone.trim(),
        buyerEmail: payload.buyerEmail.trim(),
        referrerId: payload.referrerId?.trim() || null,
        note: payload.note?.trim() || 'Placed from merchant landing',
        items: {
          create: {
            productId: product.id,
            title: product.name,
            imageUrl: product.imageUrl,
            quantity,
            unitPrice: product.price
          }
        }
      },
      include: {
        items: true
      }
    });

    await tx.merchantProduct.update({
      where: { id: product.id },
      data: {
        stock: {
          decrement: quantity
        }
      }
    });

    return created;
  });

  return {
    orderId: order.id,
    status: 'SUCCESS' as const,
    source: 'backend' as const,
    message: 'Checkout request accepted by the backend.',
    paymentUrl: null
  };
};
