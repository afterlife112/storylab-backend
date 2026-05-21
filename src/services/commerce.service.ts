import { many, one } from '../database/query';
import { transaction } from '../database/transaction';
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

const parseTextList = (value: string | null | undefined) => {
  if (!value) return [] as string[];
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) {
      return parsed.map((item) => String(item)).filter(Boolean);
    }
  } catch {
    // ignore
  }
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
};

const stringifyTextList = (value: string[] | undefined | null) => JSON.stringify((value ?? []).filter(Boolean));

const toNumber = (value: number | string | null | undefined) => Number(value ?? 0);

const derivePublicProductSlug = (product: { id: string; name: string }) =>
  `${slugify(product.name)}-${product.id.slice(0, 8).toLowerCase()}`;

type UserRow = {
  id: string;
  email: string;
  phone: string | null;
  display_name: string;
  avatar_url: string | null;
  bio: string | null;
  instagram_url: string | null;
  tiktok_url: string | null;
  youtube_url: string | null;
  follower_count: number;
  verification_status: string;
  proof_image_url: string | null;
};

type MerchantProductRow = {
  id: string;
  merchant_id: string;
  name: string;
  description: string | null;
  image_urls: string | null;
  price: number | string;
  stock: number;
  status: string;
  created_at: Date | string;
  updated_at: Date | string;
  company_name?: string | null;
};

type OrderRow = {
  id: string;
  order_no: string;
  buyer_user_id: string | null;
  merchant_id: string | null;
  influencer_user_id: string | null;
  receiver_name: string | null;
  receiver_phone: string | null;
  address_line_1: string | null;
  address_line_2: string | null;
  city: string | null;
  state: string | null;
  postcode: string | null;
  country: string | null;
  subtotal: number | string;
  discount_amount: number | string;
  shipping_fee: number | string;
  total_amount: number | string;
  payment_status: string;
  order_status: string;
  source: string;
  created_at: Date | string;
  paid_at: Date | string | null;
  completed_at: Date | string | null;
};

type OrderItemRow = {
  id: string;
  order_id: string;
  product_id: string | null;
  product_name_snapshot: string | null;
  unit_price_snapshot: number | string | null;
  quantity: number;
  total_price: number | string;
};

const getUserOrThrow = async (userId: string) => {
  const row = await one<UserRow>(
    `
      select
        id,
        email,
        phone,
        display_name,
        avatar_url,
        bio,
        instagram_url,
        tiktok_url,
        youtube_url,
        follower_count,
        verification_status,
        proof_image_url
      from users
      where id = $1
      limit 1
    `,
    [userId]
  );

  if (!row) {
    throw new AppError('User not found', 404);
  }

  return row;
};

const getMerchantOrThrow = async (userId: string) => {
  const row = await one<{ id: string; company_name: string }>(
    `
      select id, company_name
      from merchants
      where id = $1
      limit 1
    `,
    [userId]
  );

  if (!row) {
    throw new AppError('Merchant not found', 404);
  }

  return row;
};

const serializeOrder = (order: OrderRow, items: OrderItemRow[]) => ({
  id: order.id,
  number: order.order_no,
  source: order.source,
  status: order.order_status,
  createdAt: new Date(order.created_at).toISOString(),
  subtotal: toNumber(order.subtotal),
  shippingFee: toNumber(order.shipping_fee),
  total: toNumber(order.total_amount),
  note: null,
  buyerName: order.receiver_name ?? '',
  buyerPhone: order.receiver_phone ?? '',
  buyerEmail: '',
  address: {
    id: order.id,
    label: 'Checkout',
    recipientName: order.receiver_name ?? '',
    phone: order.receiver_phone ?? '',
    line1: order.address_line_1 ?? '',
    line2: order.address_line_2 ?? '',
    city: order.city ?? '',
    state: order.state ?? '',
    postalCode: order.postcode ?? '',
    isDefault: false
  },
  items: items.map((item) => ({
    id: item.id,
    productId: item.product_id,
    title: item.product_name_snapshot ?? 'Product',
    imageUrl: null,
    quantity: item.quantity,
    unitPrice: toNumber(item.unit_price_snapshot)
  }))
});

const buildDefaultMediaKit = (user: UserRow) => ({
  creatorId: user.id,
  displayName: user.display_name,
  username: `@${user.email.split('@')[0]}`,
  bio: user.bio ?? '',
  location: '',
  profilePhotoUrl: user.avatar_url ?? undefined,
  socialAccounts: [
    user.instagram_url
      ? {
          platform: 'Instagram',
          username: `@${user.instagram_url.split('/').filter(Boolean).pop()?.replace('@', '') ?? user.email.split('@')[0]}`,
          followerCount: user.follower_count,
          verified: user.verification_status === 'VERIFIED'
        }
      : null,
    user.tiktok_url
      ? {
          platform: 'TikTok',
          username: `@${user.tiktok_url.split('/').filter(Boolean).pop()?.replace('@', '') ?? user.email.split('@')[0]}`,
          followerCount: user.follower_count,
          verified: user.verification_status === 'VERIFIED'
        }
      : null,
    user.youtube_url
      ? {
          platform: 'YouTube',
          username: user.youtube_url,
          followerCount: user.follower_count,
          verified: user.verification_status === 'VERIFIED'
        }
      : null
  ].filter(Boolean),
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
    phoneVerified: Boolean(user.phone),
    platformVerified: user.verification_status === 'VERIFIED',
    followerProofApproved: user.verification_status === 'VERIFIED'
  }
});

export const getInfluencerMediaKit = async (userId: string) => {
  const user = await getUserOrThrow(userId);
  return buildDefaultMediaKit(user);
};

export const updateInfluencerMediaKit = async (userId: string, payload: Record<string, unknown>) => {
  const displayName = typeof payload.displayName === 'string' ? payload.displayName.trim() : undefined;
  const bio = typeof payload.bio === 'string' ? payload.bio.trim() : undefined;
  const profilePhotoUrl = typeof payload.profilePhotoUrl === 'string' ? payload.profilePhotoUrl.trim() : undefined;

  await one(
    `
      update users
      set
        display_name = coalesce($2, display_name),
        bio = coalesce($3, bio),
        avatar_url = coalesce($4, avatar_url),
        updated_at = now()
      where id = $1
      returning id
    `,
    [userId, displayName || null, bio || null, profilePhotoUrl || null]
  );

  return getInfluencerMediaKit(userId);
};

export const getInfluencerCommerceState = async (userId: string) => {
  await getUserOrThrow(userId);

  const orders = await many<OrderRow>(
    `
      select *
      from orders
      where buyer_user_id = $1
      order by created_at desc
    `,
    [userId]
  );

  const orderIds = orders.map((item) => item.id);
  const items = orderIds.length
    ? await many<OrderItemRow>(
        `
          select *
          from order_items
          where order_id = any($1::uuid[])
          order by id asc
        `,
        [orderIds]
      )
    : [];

  const itemsByOrder = new Map<string, OrderItemRow[]>();
  for (const item of items) {
    const bucket = itemsByOrder.get(item.order_id) ?? [];
    bucket.push(item);
    itemsByOrder.set(item.order_id, bucket);
  }

  return {
    addresses: [],
    orders: orders.map((order) => serializeOrder(order, itemsByOrder.get(order.id) ?? [])),
    preferences: defaultCommercePreferences
  };
};

export const createCommerceAddress = async (
  _userId: string,
  _payload: {
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
  throw new AppError('Saved addresses are not supported by the current database schema', 501);
};

export const setDefaultCommerceAddress = async (_userId: string, _addressId: string) => {
  throw new AppError('Saved addresses are not supported by the current database schema', 501);
};

export const updateCommercePreferences = async (_userId: string, payload: Partial<typeof defaultCommercePreferences>) => ({
  ...defaultCommercePreferences,
  ...payload
});

type OrderCreateInput = {
  productItems: Array<{ productId: string; quantity: number }>;
  addressId?: string;
  note?: string;
  source?: string;
  receiverName?: string;
  receiverPhone?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  postcode?: string;
  country?: string;
};

export const createInfluencerCommerceOrder = async (userId: string, payload: OrderCreateInput) => {
  if (!payload.productItems.length) {
    throw new AppError('Cart is empty', 422);
  }

  const user = await getUserOrThrow(userId);
  const uniqueProductIds = Array.from(new Set(payload.productItems.map((item) => item.productId)));
  const products = await many<MerchantProductRow>(
    `
      select p.*, m.company_name
      from merchant_products p
      join merchants m on m.id = p.merchant_id
      where p.id = any($1::uuid[])
        and p.status = 'ACTIVE'
    `,
    [uniqueProductIds]
  );

  const productMap = new Map(products.map((item) => [item.id, item]));
  const normalizedItems = payload.productItems.map((item) => {
    const product = productMap.get(item.productId);
    if (!product) throw new AppError('Product not found', 404);
    if (item.quantity <= 0 || item.quantity > product.stock) {
      throw new AppError(`Insufficient stock for ${product.name}`, 422);
    }
    return { product, quantity: item.quantity };
  });

  const subtotal = normalizedItems.reduce((sum, item) => sum + toNumber(item.product.price) * item.quantity, 0);
  const shippingFee = subtotal >= 180 ? 0 : 12;
  const totalAmount = subtotal + shippingFee;
  const merchantId = normalizedItems[0]?.product.merchant_id;

  return transaction(async (client) => {
    for (const item of normalizedItems) {
      await one(
        `
          update merchant_products
          set stock = stock - $2, updated_at = now()
          where id = $1
          returning id
        `,
        [item.product.id, item.quantity],
        client
      );
    }

    const order = await one<OrderRow>(
      `
        insert into orders (
          order_no,
          buyer_user_id,
          merchant_id,
          influencer_user_id,
          receiver_name,
          receiver_phone,
          address_line_1,
          address_line_2,
          city,
          state,
          postcode,
          country,
          subtotal,
          discount_amount,
          shipping_fee,
          total_amount,
          payment_status,
          order_status,
          source,
          paid_at
        )
        values (
          $1, $2, $3, null, $4, $5, $6, $7, $8, $9, $10, $11,
          $12, 0, $13, $14, 'PAID', 'PROCESSING', $15, now()
        )
        returning *
      `,
      [
        `SL-ORD-${Date.now()}`,
        userId,
        merchantId,
        payload.receiverName ?? user.display_name,
        payload.receiverPhone ?? user.phone ?? '',
        payload.addressLine1 ?? '',
        payload.addressLine2 ?? '',
        payload.city ?? '',
        payload.state ?? '',
        payload.postcode ?? '',
        payload.country ?? 'Malaysia',
        subtotal,
        shippingFee,
        totalAmount,
        payload.source ?? 'SELF_PURCHASE'
      ],
      client
    );

    if (!order) {
      throw new AppError('Failed to create order', 500);
    }

    const createdItems: OrderItemRow[] = [];
    for (const item of normalizedItems) {
      const createdItem = await one<OrderItemRow>(
        `
          insert into order_items (
            order_id,
            product_id,
            product_name_snapshot,
            unit_price_snapshot,
            quantity,
            total_price
          )
          values ($1, $2, $3, $4, $5, $6)
          returning *
        `,
        [
          order.id,
          item.product.id,
          item.product.name,
          toNumber(item.product.price),
          item.quantity,
          toNumber(item.product.price) * item.quantity
        ],
        client
      );

      if (createdItem) createdItems.push(createdItem);
    }

    return serializeOrder(order, createdItems);
  });
};

const serializeMerchantProduct = (product: MerchantProductRow) => {
  const images = parseTextList(product.image_urls);
  const description = product.description?.trim() || product.name;
  const brand = product.company_name ?? 'Merchant';

  return {
    id: product.id,
    merchantId: product.merchant_id,
    slug: derivePublicProductSlug(product),
    name: product.name,
    brand,
    sku: `SKU-${product.id.slice(-8).toUpperCase()}`,
    category: 'General',
    price: toNumber(product.price),
    stock: product.stock,
    status: product.status,
    description,
    shortDescription: description.length > 96 ? `${description.slice(0, 93).trimEnd()}...` : description,
    imageUrl: images[0] ?? null,
    badges: ['General'],
    rating: 0,
    reviewCount: 0,
    tags: ['General', brand],
    sourceType: 'LINK_FRIENDLY' as const,
    compareAtPrice: null,
    createdAt: new Date(product.created_at).toISOString(),
    updatedAt: new Date(product.updated_at).toISOString()
  };
};

export const listMerchantProducts = async (userId: string) => {
  const merchant = await getMerchantOrThrow(userId);
  const rows = await many<MerchantProductRow>(
    `
      select p.*, m.company_name
      from merchant_products p
      join merchants m on m.id = p.merchant_id
      where p.merchant_id = $1
      order by p.created_at desc
    `,
    [merchant.id]
  );

  return rows.map(serializeMerchantProduct);
};

export const getMerchantProduct = async (userId: string, productId: string) => {
  const merchant = await getMerchantOrThrow(userId);
  const row = await one<MerchantProductRow>(
    `
      select p.*, m.company_name
      from merchant_products p
      join merchants m on m.id = p.merchant_id
      where p.merchant_id = $1 and p.id = $2
      limit 1
    `,
    [merchant.id, productId]
  );

  if (!row) throw new AppError('Product not found', 404);
  return serializeMerchantProduct(row);
};

export const createMerchantProduct = async (
  userId: string,
  payload: {
    name: string;
    description?: string;
    imageUrl?: string | null;
    imageUrls?: string[];
    price: number;
    stock: number;
    status?: string;
  }
) => {
  const merchant = await getMerchantOrThrow(userId);
  const imageUrls = payload.imageUrls?.length ? payload.imageUrls : payload.imageUrl ? [payload.imageUrl] : [];

  const row = await one<MerchantProductRow>(
    `
      insert into merchant_products (
        merchant_id,
        name,
        description,
        image_urls,
        price,
        stock,
        status
      )
      values ($1, $2, $3, $4, $5, $6, $7)
      returning *
    `,
    [
      merchant.id,
      payload.name.trim(),
      payload.description?.trim() || '',
      stringifyTextList(imageUrls),
      payload.price,
      payload.stock,
      payload.status ?? 'ACTIVE'
    ]
  );

  if (!row) throw new AppError('Failed to create product', 500);
  return serializeMerchantProduct({ ...row, company_name: merchant.company_name });
};

export const updateMerchantProduct = async (
  userId: string,
  productId: string,
  payload: {
    name: string;
    description?: string;
    imageUrl?: string | null;
    imageUrls?: string[];
    price: number;
    stock: number;
    status?: string;
  }
) => {
  const merchant = await getMerchantOrThrow(userId);
  const imageUrls = payload.imageUrls?.length ? payload.imageUrls : payload.imageUrl ? [payload.imageUrl] : [];

  const row = await one<MerchantProductRow>(
    `
      update merchant_products
      set
        name = $3,
        description = $4,
        image_urls = $5,
        price = $6,
        stock = $7,
        status = $8,
        updated_at = now()
      where merchant_id = $1 and id = $2
      returning *
    `,
    [
      merchant.id,
      productId,
      payload.name.trim(),
      payload.description?.trim() || '',
      stringifyTextList(imageUrls),
      payload.price,
      payload.stock,
      payload.status ?? 'ACTIVE'
    ]
  );

  if (!row) throw new AppError('Product not found', 404);
  return serializeMerchantProduct({ ...row, company_name: merchant.company_name });
};

export const deleteMerchantProduct = async (userId: string, productId: string) => {
  const merchant = await getMerchantOrThrow(userId);
  const row = await one<{ id: string }>(
    `
      delete from merchant_products
      where merchant_id = $1 and id = $2
      returning id
    `,
    [merchant.id, productId]
  );

  if (!row) throw new AppError('Product not found', 404);
  return { deleted: true };
};

export const getMerchantVoucherByCode = async (_userId: string, _code: string) => {
  throw new AppError('Vouchers are not supported by the current database schema', 501);
};

export const redeemMerchantVoucher = async (_userId: string, _code: string) => {
  throw new AppError('Vouchers are not supported by the current database schema', 501);
};

export const listPublicShopCategories = async () => {
  const rows = await many<{ id: string; name: string; slug: string }>(
    `
      select id, name, slug
      from categories
      where is_active = true
      order by sort_order asc, name asc
    `
  );

  return rows.map((row) => ({ id: row.id, name: row.name, slug: row.slug }));
};

export const listPublicShopProducts = async (params: { page: number; pageSize: number; category?: string; search?: string }) => {
  const filters = [`p.status = 'ACTIVE'`];
  const values: unknown[] = [];

  if (params.search) {
    values.push(`%${params.search}%`);
    const index = values.length;
    filters.push(`(p.name ilike $${index} or coalesce(p.description, '') ilike $${index} or m.company_name ilike $${index})`);
  }

  const whereClause = filters.join(' and ');
  const offset = (params.page - 1) * params.pageSize;

  const rowsPromise = many<MerchantProductRow>(
    `
      select p.*, m.company_name
      from merchant_products p
      join merchants m on m.id = p.merchant_id
      where ${whereClause}
      order by p.created_at desc
      offset $${values.length + 1}
      limit $${values.length + 2}
    `,
    [...values, offset, params.pageSize]
  );

  const totalPromise = one<{ count: string }>(
    `
      select count(*)::text as count
      from merchant_products p
      join merchants m on m.id = p.merchant_id
      where ${whereClause}
    `,
    values
  );

  const [rows, totalRow] = await Promise.all([rowsPromise, totalPromise]);
  const items = rows.map(serializeMerchantProduct).filter((item) => !params.category || item.category.toLowerCase() === params.category.toLowerCase());
  const total = Number(totalRow?.count ?? items.length);

  return {
    items,
    total,
    page: params.page,
    pageSize: params.pageSize,
    meta: toMeta(params.page, params.pageSize, total)
  };
};

export const getPublicShopProductBySlug = async (slug: string) => {
  const rows = await many<MerchantProductRow>(
    `
      select p.*, m.company_name
      from merchant_products p
      join merchants m on m.id = p.merchant_id
      where p.status = 'ACTIVE'
    `
  );

  const product = rows.map(serializeMerchantProduct).find((item) => item.slug === slug);
  if (!product) throw new AppError('Product not found', 404);
  return product;
};

export const listMerchantLandingProducts = async (_slug: string) => {
  throw new AppError('Merchant landing products are not supported by the current database schema', 501);
};

export const createMerchantLandingCheckout = async (
  _slug: string,
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
  const quantity = Math.max(1, payload.quantity ?? 1);
  const product = await one<MerchantProductRow>(
    `
      select p.*, m.company_name
      from merchant_products p
      join merchants m on m.id = p.merchant_id
      where p.id = $1 and p.status = 'ACTIVE'
      limit 1
    `,
    [payload.productId]
  );

  if (!product) throw new AppError('Product not found', 404);

  return transaction(async (client) => {
    await one(
      `
        update merchant_products
        set stock = stock - $2, updated_at = now()
        where id = $1
        returning id
      `,
      [product.id, quantity],
      client
    );

    const order = await one<OrderRow>(
      `
        insert into orders (
          order_no,
          buyer_user_id,
          merchant_id,
          influencer_user_id,
          receiver_name,
          receiver_phone,
          address_line_1,
          city,
          state,
          postcode,
          country,
          subtotal,
          total_amount,
          payment_status,
          order_status,
          source,
          paid_at
        )
        values ($1, $2, $3, $4, $5, $6, '', '', '', '', 'Malaysia', $7, $7, 'PAID', 'PROCESSING', 'AFFILIATE', now())
        returning *
      `,
      [
        `SL-ORD-${Date.now()}`,
        payload.buyerId ?? null,
        product.merchant_id,
        payload.referrerId ?? null,
        payload.buyerName,
        payload.buyerPhone,
        payload.amount * quantity
      ],
      client
    );

    if (!order) throw new AppError('Failed to create order', 500);

    const item = await one<OrderItemRow>(
      `
        insert into order_items (
          order_id,
          product_id,
          product_name_snapshot,
          unit_price_snapshot,
          quantity,
          total_price
        )
        values ($1, $2, $3, $4, $5, $6)
        returning *
      `,
      [order.id, product.id, product.name, payload.amount, quantity, payload.amount * quantity],
      client
    );

    return serializeOrder(order, item ? [item] : []);
  });
};
