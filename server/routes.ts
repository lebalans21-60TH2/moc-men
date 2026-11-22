import crypto from 'node:crypto';
import express, { type Express } from 'express';
import {
  hashPassword,
  requireAuth,
  requireRole,
  signAuthToken,
  verifyAuthToken,
  verifyPassword,
  verifySandboxSignature,
} from './auth.ts';
import {
  imageUploadMiddleware,
  isCloudinaryConfigured,
  uploadBufferToCloudinary,
} from './cloudinary.ts';
import { generateSmartRecommendations } from './gemini.ts';
import { orderRealtime } from './orderRealtime.ts';
import type { IDataStore } from './store.ts';
import type { AffiliateProfile, OrderItemSnapshot, PaymentMethod, UserRole, Voucher } from '../src/types.ts';

function slugify(input: string): string {
  return (
    input
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') +
    '-' +
    Math.random().toString(36).slice(2, 6)
  );
}

function sanitizeImageUrl(url: unknown, fallback = '/src/assets/images/prod_ceramic_vase_1795250373703.jpg'): string {
  const s = String(url || '').trim();
  if (s.startsWith('https://') || s.startsWith('http://') || s.startsWith('/src/assets/')) {
    return s;
  }
  return fallback;
}

function getEffectiveUnitPrice(
  product: { basePrice: number; flashSalePrice: number | null; flashSaleEnd: string | null; quantityDiscountMin: number | null; quantityDiscountPercent: number | null; stock: number; isMadeToOrder: boolean; variants: any[] },
  variantId: string,
  quantity: number
): { unitPrice: number; variantLabel: string; availableStock: number } {
  const variants = product.variants || [];
  const variant = variants.find((v) => v.id === variantId) || variants[0];
  const nowIso = new Date().toISOString();
  const isFlashActive =
    product.flashSalePrice != null &&
    product.flashSalePrice > 0 &&
    (!product.flashSaleEnd || product.flashSaleEnd > nowIso);

  const base = isFlashActive ? Number(product.flashSalePrice) : Number(product.basePrice);
  const priceDelta = variant ? Number(variant.priceDelta || 0) : 0;
  let unitPrice = base + priceDelta;

  if (
    product.quantityDiscountMin &&
    product.quantityDiscountPercent &&
    quantity >= Number(product.quantityDiscountMin)
  ) {
    unitPrice = Math.round(unitPrice * (1 - Number(product.quantityDiscountPercent) / 100));
  }

  const variantLabel = variant ? `${variant.color} · ${variant.size}` : 'Tiêu chuẩn';
  const availableStock = product.isMadeToOrder ? 999 : variant ? Number(variant.stock) : Number(product.stock);
  return { unitPrice, variantLabel, availableStock };
}

function computeVoucherDiscount(voucher: Voucher | null, eligibleAmount: number, shippingFee: number): number {
  if (!voucher || !voucher.isActive) return 0;
  const now = new Date().toISOString();
  if (voucher.startsAt > now || voucher.endsAt < now) return 0;
  if (voucher.usedCount >= voucher.usageLimit) return 0;
  if (eligibleAmount < voucher.minOrderValue) return 0;

  if (voucher.discountType === 'FREE_SHIP') {
    const cap = voucher.maxDiscountAmount ?? shippingFee;
    return Math.min(shippingFee, voucher.discountValue, cap);
  }
  if (voucher.discountType === 'FIXED') {
    return Math.min(eligibleAmount, voucher.discountValue);
  }
  if (voucher.discountType === 'PERCENT') {
    const raw = Math.round((eligibleAmount * voucher.discountValue) / 100);
    const cap = voucher.maxDiscountAmount ?? raw;
    return Math.min(eligibleAmount, raw, cap);
  }
  return 0;
}

async function calculateMultiVendorCheckout(
  store: IDataStore,
  params: {
    items: Array<{ productId: number; variantId: string; quantity: number }>;
    platformVoucherCode?: string | null;
    shopVoucherCodes?: Record<number, string>;
  }
) {
  if (!Array.isArray(params.items) || params.items.length === 0) {
    throw new Error('Giỏ hàng trống.');
  }

  const defaultShippingFee = Number(await store.getSetting('defaultShippingFee', '30000'));
  const platformCommissionRate = Number(await store.getSetting('platformCommissionRate', '8'));
  const affiliateCommissionRate = Number(await store.getSetting('affiliateCommissionRate', '5'));

  const shopGroups = new Map<
    number,
    {
      shopId: number;
      shopName: string;
      items: OrderItemSnapshot[];
      subtotal: number;
      shippingFee: number;
      shopDiscount: number;
      shopVoucher: Voucher | null;
    }
  >();

  for (const reqItem of params.items) {
    const qty = Math.floor(Number(reqItem.quantity));
    if (!Number.isFinite(qty) || qty <= 0) {
      throw new Error('Số lượng sản phẩm không hợp lệ.');
    }

    const prod = await store.getProductById(Number(reqItem.productId));
    const shop = prod ? await store.getShopById(prod.shopId) : null;
    if (!prod || !shop || prod.status !== 'APPROVED' || shop.status !== 'APPROVED') {
      throw new Error(`Sản phẩm #${reqItem.productId} hiện không khả dụng.`);
    }

    const { unitPrice, variantLabel, availableStock } = getEffectiveUnitPrice(prod, String(reqItem.variantId || ''), qty);
    if (!prod.isMadeToOrder && availableStock < qty) {
      throw new Error(`Sản phẩm "${prod.name}" chỉ còn ${availableStock} sản phẩm trong kho.`);
    }

    const lineSubtotal = unitPrice * qty;
    if (!shopGroups.has(prod.shopId)) {
      shopGroups.set(prod.shopId, {
        shopId: prod.shopId,
        shopName: shop.name,
        items: [],
        subtotal: 0,
        shippingFee: defaultShippingFee,
        shopDiscount: 0,
        shopVoucher: null,
      });
    }

    const group = shopGroups.get(prod.shopId)!;
    group.items.push({
      productId: prod.id,
      productName: prod.name,
      productImage: prod.images[0] || '',
      variantId: String(reqItem.variantId || ''),
      variantLabel,
      quantity: qty,
      unitPrice,
      lineDiscount: 0,
      lineSubtotal,
      isMadeToOrder: Boolean(prod.isMadeToOrder),
      productionDays: Number(prod.productionDays || 0),
    });
    group.subtotal += lineSubtotal;
  }

  let subtotalAmount = 0;
  let shippingTotal = 0;
  let shopDiscountTotal = 0;

  for (const group of shopGroups.values()) {
    const shopCode = params.shopVoucherCodes?.[group.shopId]?.trim().toUpperCase();
    if (shopCode) {
      const voucher = await store.getVoucherByCode(shopCode, 'SHOP', group.shopId);
      if (voucher) {
        group.shopVoucher = voucher;
        group.shopDiscount = computeVoucherDiscount(voucher, group.subtotal, group.shippingFee);
      }
    }
    subtotalAmount += group.subtotal;
    shippingTotal += group.shippingFee;
    shopDiscountTotal += group.shopDiscount;
  }

  let platformVoucher: Voucher | null = null;
  let platformDiscountTotal = 0;
  const pCode = params.platformVoucherCode?.trim().toUpperCase();
  if (pCode) {
    platformVoucher = await store.getVoucherByCode(pCode, 'PLATFORM');
    if (platformVoucher) {
      platformDiscountTotal = computeVoucherDiscount(
        platformVoucher,
        Math.max(0, subtotalAmount - shopDiscountTotal),
        shippingTotal
      );
    }
  }

  const groupsArray = Array.from(shopGroups.values());
  const totalNetBase = groupsArray.reduce((acc, g) => acc + Math.max(0, g.subtotal - g.shopDiscount), 0);
  let remainingPlatformDiscount = platformDiscountTotal;

  const subOrdersPreview = groupsArray.map((g, idx) => {
    let allocatedPlatformDiscount = 0;
    if (platformDiscountTotal > 0 && totalNetBase > 0) {
      if (idx === groupsArray.length - 1) {
        allocatedPlatformDiscount = remainingPlatformDiscount;
      } else {
        const weight = Math.max(0, g.subtotal - g.shopDiscount) / totalNetBase;
        allocatedPlatformDiscount = Math.round(platformDiscountTotal * weight);
        remainingPlatformDiscount -= allocatedPlatformDiscount;
      }
    }

    const finalTotal = Math.max(0, g.subtotal + g.shippingFee - g.shopDiscount - allocatedPlatformDiscount);
    const merchRevenueAfterShopDiscount = Math.max(0, g.subtotal - g.shopDiscount);
    const commissionFee = Math.round((merchRevenueAfterShopDiscount * platformCommissionRate) / 100);
    const affiliateCommissionFee = Math.round((merchRevenueAfterShopDiscount * affiliateCommissionRate) / 100);
    const sellerNetAmount = Math.max(0, merchRevenueAfterShopDiscount - commissionFee);

    return {
      ...g,
      allocatedPlatformDiscount,
      finalTotal,
      commissionRate: platformCommissionRate,
      commissionFee,
      affiliateCommissionFee,
      sellerNetAmount,
    };
  });

  const grandTotal = subOrdersPreview.reduce((acc, s) => acc + s.finalTotal, 0);

  return {
    subtotalAmount,
    shippingTotal,
    shopDiscountTotal,
    platformDiscountTotal,
    grandTotal,
    platformVoucher,
    subOrdersPreview,
    affiliateCommissionRate,
  };
}

export function registerApiRoutes(app: Express, store: IDataStore) {
  app.use(express.json({ limit: '2mb' }));

  // Attach authenticated user from Bearer token if present
  app.use('/api', async (req, _res, next) => {
    try {
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.slice(7).trim();
        const payload = verifyAuthToken(token);
        if (payload) {
          const user = await store.getUserById(payload.userId);
          if (user) {
            const { passwordHash: _, ...safeUser } = user;
            req.currentUser = safeUser;
          }
        }
      }
      next();
    } catch (err) {
      next(err);
    }
  });

  // ==========================================
  // 0. SYSTEM INTEGRATIONS & CLOUDINARY UPLOAD
  // ==========================================
  app.get('/api/system/integrations', (_req, res) => {
    res.json({
      database: store.driverName,
      cloudinaryConfigured: isCloudinaryConfigured(),
    });
  });

  app.post('/api/upload/images', requireAuth, (req, res) => {
    if (!isCloudinaryConfigured()) {
      res.status(503).json({
        error:
          'Chưa cấu hình Cloudinary (CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET) trong Settings > Secrets.',
      });
      return;
    }

    imageUploadMiddleware.array('images', 6)(req, res, async (err: any) => {
      if (err) {
        res.status(400).json({ error: err.message || 'Lỗi tải ảnh lên.' });
        return;
      }

      const files = req.files as Express.Multer.File[] | undefined;
      if (!files || files.length === 0) {
        res.status(400).json({ error: 'Vui lòng chọn ít nhất một tệp hình ảnh.' });
        return;
      }

      const requestedFolder = String(req.body?.folder || 'moc-men/crafts').trim();
      const folder = requestedFolder === 'moc-men/shops' ? 'moc-men/shops' : 'moc-men/crafts';

      try {
        const uploaded = await Promise.all(
          files.map((f) => uploadBufferToCloudinary(f.buffer, folder))
        );
        res.status(201).json({
          provider: 'cloudinary',
          urls: uploaded.map((u) => u.url),
          items: uploaded,
        });
      } catch (uploadErr: any) {
        res.status(502).json({
          error: uploadErr?.message || 'Không thể tải ảnh lên Cloudinary lúc này.',
        });
      }
    });
  });

  // ==========================================
  // 1. AUTHENTICATION & UNIFIED ACCOUNT ROLES
  // ==========================================
  app.get('/api/auth/admin-status', async (_req, res) => {
    const envEmail = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
    const envPassword = (process.env.ADMIN_PASSWORD || process.env.ADMIN_PASSCODE || '').trim();
    const claimedHash = await store.getSetting('adminClaimedHash', '');
    const users = await store.listUsers();
    const hasAdminAccount = users.some((u) => u.roles.includes('admin'));

    if (hasAdminAccount || claimedHash || (envEmail && envPassword)) {
      res.json({ configured: true, mode: 'account_password' });
      return;
    }
    res.json({ configured: false, mode: 'first_run_setup' });
  });

  app.post('/api/auth/claim-admin', async (req, res) => {
    const envEmail = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
    const envPassword = (process.env.ADMIN_PASSWORD || process.env.ADMIN_PASSCODE || '').trim();
    const claimedHash = await store.getSetting('adminClaimedHash', '');
    const users = await store.listUsers();
    const hasAdminAccount = users.some((u) => u.roles.includes('admin'));

    if (hasAdminAccount || claimedHash || (envEmail && envPassword)) {
      res.status(409).json({ error: 'Tài khoản quản trị viên đã được thiết lập trước đó.' });
      return;
    }

    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');
    const fullName = String(req.body?.fullName || 'Quản trị viên Sàn').trim();
    if (!email || !email.includes('@') || password.length < 6) {
      res.status(400).json({ error: 'Vui lòng nhập email hợp lệ và mật khẩu tối thiểu 6 ký tự.' });
      return;
    }

    const pwHash = hashPassword(password);
    await store.setSetting('adminClaimedHash', pwHash);
    await store.setSetting('adminClaimedEmail', email);

    const existing = await store.getUserByEmail(email);
    let user;
    if (existing) {
      const roles = [...existing.roles];
      if (!roles.includes('admin')) roles.push('admin');
      user = await store.updateUserRolesAndPassword(existing.id, roles, pwHash);
    } else {
      const created = await store.createUser({
        email,
        passwordHash: pwHash,
        fullName,
        phone: '0900000000',
        roles: ['customer', 'admin'],
      });
      const { passwordHash: _, ...safe } = created;
      user = safe;
    }

    const token = signAuthToken(user.id, user.email);
    res.json({ token, user });
  });

  app.post('/api/auth/admin-login', async (req, res) => {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');

    if (!email || !email.includes('@') || !password) {
      res.status(400).json({ error: 'Vui lòng nhập đầy đủ email tài khoản và mật khẩu quản trị.' });
      return;
    }

    const envEmail = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
    const envPassword = (process.env.ADMIN_PASSWORD || process.env.ADMIN_PASSCODE || '').trim();

    // Check DB user first with scrypt password verification
    const row = await store.getUserByEmail(email);
    if (row) {
      if (!verifyPassword(password, row.passwordHash)) {
        res.status(401).json({ error: 'Tài khoản hoặc mật khẩu quản trị không chính xác.' });
        return;
      }
      if (row.isLocked) {
        res.status(403).json({ error: 'Tài khoản này đã bị khóa.' });
        return;
      }
      if (!row.roles.includes('admin')) {
        res.status(403).json({ error: 'Tài khoản này không có quyền Quản trị viên.' });
        return;
      }
      const { passwordHash: _, ...safeUser } = row;
      const token = signAuthToken(safeUser.id, safeUser.email);
      res.json({ token, user: safeUser });
      return;
    }

    // Optional server-env configured admin account bootstrap on first login
    if (envEmail && envPassword && email === envEmail) {
      const a = Buffer.from(password, 'utf8');
      const b = Buffer.from(envPassword, 'utf8');
      if (a.length === b.length && crypto.timingSafeEqual(a, b)) {
        const created = await store.createUser({
          email: envEmail,
          passwordHash: hashPassword(password),
          fullName: 'Quản trị viên Sàn',
          phone: '0900000000',
          roles: ['customer', 'admin'],
        });
        const { passwordHash: _, ...safeUser } = created;
        const token = signAuthToken(safeUser.id, safeUser.email);
        res.json({ token, user: safeUser });
        return;
      }
    }

    res.status(401).json({ error: 'Tài khoản hoặc mật khẩu quản trị không chính xác.' });
  });

  app.post('/api/auth/register', async (req, res) => {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');
    const fullName = String(req.body?.fullName || '').trim();
    const phone = String(req.body?.phone || '').trim();

    if (!email || !email.includes('@') || password.length < 6 || !fullName) {
      res.status(400).json({ error: 'Vui lòng nhập đầy đủ họ tên, email hợp lệ và mật khẩu từ 6 ký tự.' });
      return;
    }

    const existing = await store.getUserByEmail(email);
    if (existing) {
      res.status(409).json({ error: 'Email này đã được đăng ký.' });
      return;
    }

    const created = await store.createUser({
      email,
      passwordHash: hashPassword(password),
      fullName,
      phone,
      roles: ['customer'],
    });
    const { passwordHash: _, ...user } = created;
    const token = signAuthToken(user.id, user.email);
    res.status(201).json({ token, user });
  });

  app.post('/api/auth/login', async (req, res) => {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');

    const row = await store.getUserByEmail(email);
    if (!row || !verifyPassword(password, row.passwordHash)) {
      res.status(401).json({ error: 'Email hoặc mật khẩu không chính xác.' });
      return;
    }
    if (row.isLocked) {
      res.status(403).json({ error: 'Tài khoản này đã bị khóa bởi quản trị viên.' });
      return;
    }

    const { passwordHash: _, ...user } = row;
    const token = signAuthToken(user.id, user.email);
    res.json({ token, user });
  });

  app.get('/api/auth/me', requireAuth, async (req, res) => {
    const [u, shop, affiliate] = await Promise.all([
      store.getUserById(req.currentUser!.id),
      store.getShopByOwner(req.currentUser!.id),
      store.getAffiliateByUserId(req.currentUser!.id),
    ]);
    if (!u) {
      res.status(404).json({ error: 'Không tìm thấy tài khoản.' });
      return;
    }
    const { passwordHash: _, ...user } = u;
    res.json({ user, shop, affiliate });
  });

  app.put('/api/auth/profile', requireAuth, async (req, res) => {
    const fullName = String(req.body?.fullName || '').trim();
    const phone = String(req.body?.phone || '').trim();
    if (!fullName) {
      res.status(400).json({ error: 'Họ tên không được để trống.' });
      return;
    }
    const user = await store.updateUserProfile(req.currentUser!.id, fullName, phone);
    res.json({ user });
  });

  app.put('/api/auth/password', requireAuth, async (req, res) => {
    const currentPassword = String(req.body?.currentPassword || '');
    const newPassword = String(req.body?.newPassword || '');
    if (!currentPassword || newPassword.length < 6) {
      res.status(400).json({ error: 'Vui lòng nhập mật khẩu hiện tại và mật khẩu mới tối thiểu 6 ký tự.' });
      return;
    }
    const existing = await store.getUserById(req.currentUser!.id);
    if (!existing || !verifyPassword(currentPassword, existing.passwordHash)) {
      res.status(401).json({ error: 'Mật khẩu hiện tại không chính xác.' });
      return;
    }
    const nextHash = hashPassword(newPassword);
    await store.updateUserRolesAndPassword(existing.id, existing.roles, nextHash);
    res.json({ ok: true });
  });

  // ==========================================
  // 2. PUBLIC CATALOG, SHOPS, VOUCHERS & AI
  // ==========================================
  app.get('/api/categories', async (_req, res) => {
    res.json(await store.listCategories());
  });

  app.get('/api/shops', async (_req, res) => {
    res.json(await store.listApprovedShops());
  });

  app.get('/api/products', async (req, res) => {
    const q = String(req.query.q || '').trim().toLowerCase();
    const categoryId = req.query.categoryId ? Number(req.query.categoryId) : null;
    const shopId = req.query.shopId ? Number(req.query.shopId) : null;
    const material = String(req.query.material || '').trim().toLowerCase();
    const minPrice = req.query.minPrice ? Number(req.query.minPrice) : null;
    const maxPrice = req.query.maxPrice ? Number(req.query.maxPrice) : null;
    const sort = String(req.query.sort || 'featured');

    const rows = await store.listApprovedProducts();
    const filtered = rows.filter((p) => {
      const effectivePrice = p.flashSalePrice ?? p.basePrice;
      if (q) {
        const hay = `${p.name} ${p.material} ${p.originVillage} ${p.shopName || ''} ${p.categoryName || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (categoryId && p.categoryId !== categoryId) return false;
      if (shopId && p.shopId !== shopId) return false;
      if (material && !p.material.toLowerCase().includes(material)) return false;
      if (minPrice !== null && effectivePrice < minPrice) return false;
      if (maxPrice !== null && effectivePrice > maxPrice) return false;
      return true;
    });

    filtered.sort((a, b) => {
      if (sort === 'price_asc') return (a.flashSalePrice ?? a.basePrice) - (b.flashSalePrice ?? b.basePrice);
      if (sort === 'price_desc') return (b.flashSalePrice ?? b.basePrice) - (a.flashSalePrice ?? a.basePrice);
      if (sort === 'bestseller') return b.soldCount - a.soldCount;
      if (a.isPromoted !== b.isPromoted) return a.isPromoted ? -1 : 1;
      return b.soldCount - a.soldCount;
    });

    res.json(filtered);
  });

  app.get('/api/products/:id', async (req, res) => {
    const id = Number(req.params.id);
    const product = await store.getProductById(id);
    if (!product) {
      res.status(404).json({ error: 'Không tìm thấy sản phẩm.' });
      return;
    }
    const [shop, reviews] = await Promise.all([
      store.getShopById(product.shopId),
      store.listProductReviews(id),
    ]);
    res.json({ product, shop, reviews });
  });

  app.get('/api/vouchers/active', async (_req, res) => {
    res.json(await store.listActiveVouchers());
  });

  app.post('/api/recommendations', async (req, res) => {
    try {
      const query = String(req.body?.query || '').trim();
      const currentProductId = req.body?.currentProductId ? Number(req.body.currentProductId) : null;
      const cartProductNames = Array.isArray(req.body?.cartProductNames)
        ? req.body.cartProductNames.map(String).slice(0, 10)
        : [];

      const catalog = await store.listApprovedProducts();
      const currentProduct = currentProductId ? catalog.find((p) => p.id === currentProductId) || null : null;
      const aiResult = await generateSmartRecommendations({
        query,
        currentProduct,
        cartProductNames,
        catalog,
      });

      res.json(aiResult);
    } catch (err: any) {
      if (err?.message === 'GEMINI_API_KEY_MISSING') {
        res.status(503).json({
          error: 'Chưa cấu hình GEMINI_API_KEY trên máy chủ. Vui lòng thiết lập khóa trong Settings > Secrets để bật gợi ý AI.',
        });
        return;
      }
      res.status(502).json({
        error: 'Hệ thống gợi ý thông minh đang bận hoặc gặp lỗi kết nối Gemini API. Vui lòng thử lại sau.',
      });
    }
  });

  // ==========================================
  // 3. CUSTOMER SUBSYSTEM
  // ==========================================
  app.get('/api/customer/addresses', requireAuth, async (req, res) => {
    res.json(await store.listAddresses(req.currentUser!.id));
  });

  app.post('/api/customer/addresses', requireAuth, async (req, res) => {
    const recipientName = String(req.body?.recipientName || '').trim();
    const phone = String(req.body?.phone || '').trim();
    const province = String(req.body?.province || '').trim();
    const district = String(req.body?.district || '').trim();
    const ward = String(req.body?.ward || '').trim();
    const street = String(req.body?.street || '').trim();
    const isDefault = Boolean(req.body?.isDefault);

    if (!recipientName || !phone || !province || !street) {
      res.status(400).json({ error: 'Vui lòng nhập đầy đủ người nhận, số điện thoại, tỉnh/thành và địa chỉ.' });
      return;
    }

    const created = await store.createAddress(req.currentUser!.id, {
      recipientName,
      phone,
      province,
      district,
      ward,
      street,
      isDefault,
    });
    res.status(201).json(created);
  });

  app.patch('/api/customer/addresses/:id/default', requireAuth, async (req, res) => {
    const ok = await store.setDefaultAddress(Number(req.params.id), req.currentUser!.id);
    if (!ok) {
      res.status(404).json({ error: 'Không tìm thấy địa chỉ.' });
      return;
    }
    res.json({ ok: true });
  });

  app.delete('/api/customer/addresses/:id', requireAuth, async (req, res) => {
    const ok = await store.deleteAddress(Number(req.params.id), req.currentUser!.id);
    if (!ok) {
      res.status(404).json({ error: 'Không tìm thấy địa chỉ.' });
      return;
    }
    res.json({ ok: true });
  });

  app.get('/api/customer/wishlist', requireAuth, async (req, res) => {
    res.json(await store.getWishlist(req.currentUser!.id));
  });

  app.post('/api/customer/wishlist/merge', requireAuth, async (req, res) => {
    const rawIds = Array.isArray(req.body?.productIds) ? req.body.productIds : [];
    const productIds = rawIds
      .map((id: unknown) => Number(id))
      .filter((id: number) => Number.isInteger(id) && id > 0)
      .slice(0, 50);
    const wishlistIds = await store.mergeWishlist(req.currentUser!.id, productIds);
    res.json({ wishlistIds });
  });

  app.delete('/api/customer/wishlist', requireAuth, async (req, res) => {
    await store.clearWishlist(req.currentUser!.id);
    res.json({ ok: true });
  });

  app.post('/api/customer/wishlist/:productId', requireAuth, async (req, res) => {
    const productId = Number(req.params.productId);
    if (!Number.isInteger(productId) || productId <= 0) {
      res.status(400).json({ error: 'Mã sản phẩm không hợp lệ.' });
      return;
    }
    const product = await store.getProductById(productId);
    if (!product) {
      res.status(404).json({ error: 'Không tìm thấy sản phẩm.' });
      return;
    }
    const wishlisted = await store.toggleWishlist(req.currentUser!.id, productId);
    res.json({ wishlisted });
  });

  app.post('/api/orders/preview', requireAuth, async (req, res) => {
    try {
      const calc = await calculateMultiVendorCheckout(store, {
        items: req.body?.items || [],
        platformVoucherCode: req.body?.platformVoucherCode,
        shopVoucherCodes: req.body?.shopVoucherCodes || {},
      });
      res.json(calc);
    } catch (err: any) {
      res.status(400).json({ error: err.message || 'Không thể tính toán đơn hàng.' });
    }
  });

  app.post('/api/orders', requireAuth, async (req, res) => {
    try {
      const addressId = Number(req.body?.addressId);
      const shippingAddress = await store.getAddressById(addressId, req.currentUser!.id);
      if (!shippingAddress) {
        res.status(400).json({ error: 'Vui lòng chọn địa chỉ giao hàng hợp lệ.' });
        return;
      }

      const paymentMethod = String(req.body?.paymentMethod || 'COD') as PaymentMethod;
      if (!['COD', 'BANK_TRANSFER', 'SANDBOX_GATEWAY'].includes(paymentMethod)) {
        res.status(400).json({ error: 'Phương thức thanh toán không hợp lệ.' });
        return;
      }

      const affiliateCodeRaw = String(req.body?.affiliateCode || '').trim().toUpperCase();
      let validAffiliate: AffiliateProfile | null = null;
      if (affiliateCodeRaw) {
        const aff = await store.getApprovedAffiliateByCode(affiliateCodeRaw);
        if (aff && aff.userId !== req.currentUser!.id) {
          validAffiliate = aff;
        }
      }

      const calc = await calculateMultiVendorCheckout(store, {
        items: req.body?.items || [],
        platformVoucherCode: req.body?.platformVoucherCode,
        shopVoucherCodes: req.body?.shopVoucherCodes || {},
      });

      const initialPaymentStatus = paymentMethod === 'SANDBOX_GATEWAY' ? 'PENDING_GATEWAY' : 'UNPAID';

      const created = await store.createMultiVendorOrder({
        buyerId: req.currentUser!.id,
        shippingAddress,
        paymentMethod,
        initialPaymentStatus,
        platformVoucher: calc.platformVoucher,
        subtotalAmount: calc.subtotalAmount,
        shippingTotal: calc.shippingTotal,
        platformDiscountTotal: calc.platformDiscountTotal,
        shopDiscountTotal: calc.shopDiscountTotal,
        grandTotal: calc.grandTotal,
        affiliate: validAffiliate,
        affiliateCommissionRate: calc.affiliateCommissionRate,
        subOrders: calc.subOrdersPreview,
      });

      orderRealtime.emitOrderCreated(req.currentUser!.id, created.masterOrder);

      res.status(201).json({
        masterOrder: created.masterOrder,
        payment: {
          transactionCode: created.transactionCode,
          idempotencyKey: created.idempotencyKey,
          sandboxSignature: created.sandboxSignature,
          amount: created.amount,
        },
      });
    } catch (err: any) {
      res.status(400).json({ error: err.message || 'Đặt hàng thất bại.' });
    }
  });

  app.post('/api/payments/sandbox-callback', requireAuth, async (req, res) => {
    const transactionCode = String(req.body?.transactionCode || '').trim();
    const idempotencyKey = String(req.body?.idempotencyKey || '').trim();
    const status = String(req.body?.status || '').trim();
    const amount = Number(req.body?.amount || 0);
    const signature = String(req.body?.signature || '').trim();

    if (!transactionCode || !idempotencyKey || !['SUCCEEDED', 'FAILED'].includes(status)) {
      res.status(400).json({ error: 'Thiếu tham số giao dịch hoặc trạng thái không hợp lệ.' });
      return;
    }

    const txn = await store.getPaymentTransaction(transactionCode, idempotencyKey);
    if (!txn) {
      res.status(404).json({ error: 'Không tìm thấy giao dịch thanh toán.' });
      return;
    }

    if (txn.buyerId !== req.currentUser!.id && !req.currentUser!.roles.includes('admin')) {
      res.status(403).json({ error: 'Không có quyền xác nhận giao dịch này.' });
      return;
    }

    if (txn.amount !== amount) {
      res.status(400).json({ error: 'Số tiền giao dịch không khớp với hệ thống.' });
      return;
    }
    if (status === 'SUCCEEDED' && !verifySandboxSignature(transactionCode, status, amount, signature)) {
      res.status(403).json({ error: 'Chữ ký xác thực cổng thanh toán không hợp lệ.' });
      return;
    }

    if (txn.status === 'SUCCEEDED' || txn.status === 'REFUNDED') {
      res.json({
        idempotentReplay: true,
        transaction: txn,
        masterOrder: await store.getMasterOrderWithSubs(txn.masterOrderId),
      });
      return;
    }

    const newPayStatus = status === 'SUCCEEDED' ? 'PAID' : 'UNPAID';
    const updatedTxn = await store.finalizePaymentTransaction(
      txn.id,
      txn.masterOrderId,
      status as 'SUCCEEDED' | 'FAILED',
      newPayStatus
    );

    const masterOrder = await store.getMasterOrderWithSubs(txn.masterOrderId);
    if (masterOrder && masterOrder.subOrders[0]) {
      orderRealtime.emitSubOrderUpdated(masterOrder.buyerId, masterOrder.subOrders[0], masterOrder);
    }

    res.json({
      idempotentReplay: false,
      transaction: updatedTxn,
      masterOrder,
    });
  });

  app.get('/api/customer/orders', requireAuth, async (req, res) => {
    res.json(await store.listBuyerOrders(req.currentUser!.id));
  });

  app.get('/api/customer/orders/stream', requireAuth, (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    const unsubscribe = orderRealtime.subscribe(req.currentUser!.id, res);
    req.on('close', () => {
      unsubscribe();
    });
  });

  app.post('/api/customer/sub-orders/:subOrderId/confirm-received', requireAuth, async (req, res) => {
    const subId = Number(req.params.subOrderId);
    const sub = await store.getSubOrderById(subId);
    if (!sub || sub.buyerId !== req.currentUser!.id) {
      res.status(404).json({ error: 'Không tìm thấy đơn hàng con.' });
      return;
    }
    if (!['DELIVERED', 'IN_TRANSIT'].includes(sub.shippingStatus)) {
      res.status(400).json({ error: 'Đơn hàng chưa ở trạng thái có thể xác nhận đã nhận.' });
      return;
    }
    const masterOrder = await store.confirmSubOrderReceived(subId, req.currentUser!.id);
    const updatedSub = masterOrder?.subOrders.find((s) => s.id === subId);
    if (updatedSub) {
      orderRealtime.emitSubOrderUpdated(req.currentUser!.id, updatedSub, masterOrder);
    }
    res.json({ masterOrder });
  });

  app.post('/api/customer/reviews', requireAuth, async (req, res) => {
    const productId = Number(req.body?.productId);
    const rating = Math.min(5, Math.max(1, Math.round(Number(req.body?.rating || 5))));
    const comment = String(req.body?.comment || '').trim();
    if (!comment) {
      res.status(400).json({ error: 'Vui lòng nhập nội dung đánh giá.' });
      return;
    }
    try {
      const rev = await store.createVerifiedReview(req.currentUser!.id, productId, rating, comment);
      res.status(201).json(rev);
    } catch (err: any) {
      if (err.message === 'NOT_VERIFIED_BUYER') {
        res.status(403).json({ error: 'Chỉ khách hàng đã mua và nhận sản phẩm thành công mới có thể đánh giá.' });
        return;
      }
      if (err.message === 'ALREADY_REVIEWED') {
        res.status(409).json({ error: 'Bạn đã đánh giá sản phẩm này rồi.' });
        return;
      }
      res.status(400).json({ error: 'Không thể gửi đánh giá.' });
    }
  });

  app.get('/api/customer/tickets', requireAuth, async (req, res) => {
    res.json(await store.listBuyerTickets(req.currentUser!.id));
  });

  app.post('/api/customer/tickets', requireAuth, async (req, res) => {
    const subOrderId = Number(req.body?.subOrderId);
    const type = String(req.body?.type || 'RETURN').toUpperCase();
    const reason = String(req.body?.reason || '').trim();
    if (!['CANCEL', 'RETURN', 'REFUND', 'COMPLAINT'].includes(type) || !reason) {
      res.status(400).json({ error: 'Loại yêu cầu hoặc lý do không hợp lệ.' });
      return;
    }
    try {
      const ticket = await store.createTicket(req.currentUser!.id, subOrderId, type as any, reason);
      const updatedSub = await store.getSubOrderById(subOrderId);
      if (updatedSub) {
        const masterOrder = await store.getMasterOrderWithSubs(updatedSub.masterOrderId);
        orderRealtime.emitSubOrderUpdated(req.currentUser!.id, updatedSub, masterOrder);
      }
      res.status(201).json(ticket);
    } catch {
      res.status(404).json({ error: 'Không tìm thấy đơn hàng con.' });
    }
  });

  // ==========================================
  // 4. CUSTOMER <-> SELLER CHAT
  // ==========================================
  app.get('/api/chat/threads', requireAuth, async (req, res) => {
    const ownedShop = await store.getShopByOwner(req.currentUser!.id);
    res.json(await store.listChatThreads(req.currentUser!.id, ownedShop?.id));
  });

  app.get('/api/chat/messages', requireAuth, async (req, res) => {
    const shopId = Number(req.query.shopId);
    const customerId = req.query.customerId ? Number(req.query.customerId) : req.currentUser!.id;
    const shop = await store.getShopById(shopId);
    if (!shop) {
      res.status(404).json({ error: 'Không tìm thấy gian hàng.' });
      return;
    }
    const isShopOwner = shop.ownerId === req.currentUser!.id;
    if (customerId !== req.currentUser!.id && !isShopOwner) {
      res.status(403).json({ error: 'Không có quyền xem hội thoại này.' });
      return;
    }
    res.json(await store.listChatMessages(shopId, customerId));
  });

  app.post('/api/chat/messages', requireAuth, async (req, res) => {
    const shopId = Number(req.body?.shopId);
    const content = String(req.body?.content || '').trim();
    const productId = req.body?.productId ? Number(req.body.productId) : null;
    if (!shopId || !content) {
      res.status(400).json({ error: 'Nội dung tin nhắn không được để trống.' });
      return;
    }
    const shop = await store.getShopById(shopId);
    if (!shop) {
      res.status(404).json({ error: 'Không tìm thấy gian hàng.' });
      return;
    }
    const isShopOwner = shop.ownerId === req.currentUser!.id;
    const customerId = isShopOwner ? Number(req.body?.customerId) : req.currentUser!.id;
    if (!customerId) {
      res.status(400).json({ error: 'Thiếu thông tin khách hàng nhận tin nhắn.' });
      return;
    }
    const msg = await store.createChatMessage({
      shopId,
      customerId,
      senderId: req.currentUser!.id,
      senderRole: isShopOwner ? 'seller' : 'customer',
      productId,
      content,
    });
    res.status(201).json(msg);
  });

  // ==========================================
  // 5. SELLER SUBSYSTEM
  // ==========================================
  app.post('/api/seller/register-shop', requireAuth, async (req, res) => {
    const existing = await store.getShopByOwner(req.currentUser!.id);
    if (existing) {
      res.status(409).json({ error: 'Tài khoản này đã đăng ký gian hàng.' });
      return;
    }

    const name = String(req.body?.name || '').trim();
    const craftVillage = String(req.body?.craftVillage || '').trim();
    const description = String(req.body?.description || '').trim();
    const contactPhone = String(req.body?.contactPhone || req.currentUser!.phone || '').trim();
    const contactEmail = String(req.body?.contactEmail || req.currentUser!.email).trim();
    const logoUrl = sanitizeImageUrl(req.body?.logoUrl, '/src/assets/images/prod_ceramic_vase_1795250373703.jpg');
    const bannerUrl = sanitizeImageUrl(req.body?.bannerUrl, '/src/assets/images/hero_craft_atelier_1795250373033.jpg');

    if (!name || !craftVillage || !description) {
      res.status(400).json({ error: 'Vui lòng nhập tên gian hàng, làng nghề và mô tả.' });
      return;
    }

    const shop = await store.createShop({
      ownerId: req.currentUser!.id,
      name,
      slug: slugify(name),
      craftVillage,
      description,
      logoUrl,
      bannerUrl,
      contactPhone,
      contactEmail,
    });
    const u = await store.getUserById(req.currentUser!.id);
    const { passwordHash: _, ...user } = u!;
    res.status(201).json({ shop, user });
  });

  app.get('/api/seller/shop', requireAuth, async (req, res) => {
    const shop = await store.getShopByOwner(req.currentUser!.id);
    if (!shop) {
      res.status(404).json({ error: 'Bạn chưa có gian hàng.' });
      return;
    }
    res.json(shop);
  });

  app.put('/api/seller/shop', requireAuth, requireRole('seller'), async (req, res) => {
    const shop = await store.getShopByOwner(req.currentUser!.id);
    if (!shop) {
      res.status(404).json({ error: 'Không tìm thấy gian hàng của bạn.' });
      return;
    }
    const updated = await store.updateShop(shop.id, req.currentUser!.id, {
      name: String(req.body?.name || shop.name).trim(),
      craftVillage: String(req.body?.craftVillage || shop.craftVillage).trim(),
      description: String(req.body?.description || shop.description).trim(),
      contactPhone: String(req.body?.contactPhone || shop.contactPhone).trim(),
      contactEmail: String(req.body?.contactEmail || shop.contactEmail).trim(),
      logoUrl: sanitizeImageUrl(req.body?.logoUrl, shop.logoUrl),
      bannerUrl: sanitizeImageUrl(req.body?.bannerUrl, shop.bannerUrl),
    });
    res.json(updated);
  });

  app.get('/api/seller/products', requireAuth, requireRole('seller'), async (req, res) => {
    const shop = await store.getShopByOwner(req.currentUser!.id);
    if (!shop) {
      res.status(404).json({ error: 'Chưa có gian hàng.' });
      return;
    }
    res.json(await store.listSellerProducts(shop.id));
  });

  app.post('/api/seller/products', requireAuth, requireRole('seller'), async (req, res) => {
    const shop = await store.getShopByOwner(req.currentUser!.id);
    if (!shop) {
      res.status(404).json({ error: 'Chưa có gian hàng.' });
      return;
    }

    const name = String(req.body?.name || '').trim();
    const categoryId = Number(req.body?.categoryId || 1);
    const material = String(req.body?.material || '').trim();
    const originVillage = String(req.body?.originVillage || shop.craftVillage).trim();
    const description = String(req.body?.description || '').trim();
    const artisanStory = String(req.body?.artisanStory || '').trim();
    const basePrice = Math.max(1000, Math.round(Number(req.body?.basePrice || 0)));
    const flashSalePrice = req.body?.flashSalePrice ? Math.round(Number(req.body.flashSalePrice)) : null;
    const flashSaleEnd = flashSalePrice ? new Date(Date.now() + 1000 * 60 * 60 * 72).toISOString() : null;
    const quantityDiscountMin = req.body?.quantityDiscountMin ? Number(req.body.quantityDiscountMin) : null;
    const quantityDiscountPercent = req.body?.quantityDiscountPercent ? Number(req.body.quantityDiscountPercent) : null;
    const stock = Math.max(0, Math.round(Number(req.body?.stock || 0)));
    const isMadeToOrder = Boolean(req.body?.isMadeToOrder);
    const productionDays = isMadeToOrder ? Math.max(1, Number(req.body?.productionDays || 5)) : 0;
    const rawImages = Array.isArray(req.body?.images)
      ? req.body.images
          .map((item: unknown) => sanitizeImageUrl(item, ''))
          .filter(Boolean)
          .slice(0, 6)
      : [];
    const images = rawImages.length > 0 ? rawImages : ['/src/assets/images/prod_ceramic_vase_1795250373703.jpg'];
    const variants =
      Array.isArray(req.body?.variants) && req.body.variants.length > 0
        ? req.body.variants
        : [{ id: `var-${Date.now()}`, color: 'Nguyên bản', size: 'Tiêu chuẩn', material: material || 'Thủ công', priceDelta: 0, stock }];

    if (!name || !material || !description) {
      res.status(400).json({ error: 'Vui lòng điền tên sản phẩm, chất liệu và mô tả.' });
      return;
    }

    const created = await store.createProduct({
      shopId: shop.id,
      categoryId,
      name,
      slug: slugify(name),
      material,
      originVillage,
      description,
      artisanStory: artisanStory || 'Chế tác thủ công tại xưởng nghệ nhân truyền thống.',
      basePrice,
      flashSalePrice,
      flashSaleEnd,
      quantityDiscountMin,
      quantityDiscountPercent,
      stock,
      isMadeToOrder,
      productionDays,
      images,
      variants,
    });
    res.status(201).json(created);
  });

  app.put('/api/seller/products/:id', requireAuth, requireRole('seller'), async (req, res) => {
    const shop = await store.getShopByOwner(req.currentUser!.id);
    if (!shop) {
      res.status(404).json({ error: 'Chưa có gian hàng.' });
      return;
    }
    const updated = await store.updateSellerProduct(Number(req.params.id), shop.id, {
      name: req.body?.name !== undefined ? String(req.body.name).trim() : undefined,
      basePrice: req.body?.basePrice !== undefined ? Math.max(1000, Math.round(Number(req.body.basePrice))) : undefined,
      stock: req.body?.stock !== undefined ? Math.max(0, Math.round(Number(req.body.stock))) : undefined,
      flashSalePrice: req.body?.flashSalePrice === null ? null : req.body?.flashSalePrice !== undefined ? Number(req.body.flashSalePrice) : undefined,
      quantityDiscountMin: req.body?.quantityDiscountMin !== undefined ? Number(req.body.quantityDiscountMin) : undefined,
      quantityDiscountPercent: req.body?.quantityDiscountPercent !== undefined ? Number(req.body.quantityDiscountPercent) : undefined,
      isMadeToOrder: req.body?.isMadeToOrder !== undefined ? Boolean(req.body.isMadeToOrder) : undefined,
      productionDays: req.body?.productionDays !== undefined ? Number(req.body.productionDays) : undefined,
      description: req.body?.description !== undefined ? String(req.body.description).trim() : undefined,
      artisanStory: req.body?.artisanStory !== undefined ? String(req.body.artisanStory).trim() : undefined,
      images: Array.isArray(req.body?.images)
        ? req.body.images
            .map((item: unknown) => sanitizeImageUrl(item, ''))
            .filter(Boolean)
            .slice(0, 6)
        : undefined,
    });
    if (!updated) {
      res.status(403).json({ error: 'Bạn chỉ có thể chỉnh sửa sản phẩm thuộc gian hàng của mình.' });
      return;
    }
    res.json(updated);
  });

  app.delete('/api/seller/products/:id', requireAuth, requireRole('seller'), async (req, res) => {
    const shop = await store.getShopByOwner(req.currentUser!.id);
    if (!shop) {
      res.status(404).json({ error: 'Chưa có gian hàng.' });
      return;
    }
    const ok = await store.deleteSellerProduct(Number(req.params.id), shop.id);
    if (!ok) {
      res.status(403).json({ error: 'Bạn không có quyền xóa sản phẩm này.' });
      return;
    }
    res.json({ ok: true });
  });

  app.get('/api/seller/sub-orders', requireAuth, requireRole('seller'), async (req, res) => {
    const shop = await store.getShopByOwner(req.currentUser!.id);
    if (!shop) {
      res.status(404).json({ error: 'Chưa có gian hàng.' });
      return;
    }
    res.json(await store.listSellerSubOrders(shop.id));
  });

  app.patch('/api/seller/sub-orders/:id/status', requireAuth, requireRole('seller'), async (req, res) => {
    const shop = await store.getShopByOwner(req.currentUser!.id);
    if (!shop) {
      res.status(404).json({ error: 'Chưa có gian hàng.' });
      return;
    }
    const subId = Number(req.params.id);
    const sub = await store.getSubOrderById(subId);
    if (!sub || sub.shopId !== shop.id) {
      res.status(403).json({ error: 'Bạn chỉ được xử lý đơn hàng con thuộc gian hàng mình.' });
      return;
    }

    const action = String(req.body?.action || '').trim();
    const trackingCode = req.body?.trackingCode ? String(req.body.trackingCode).trim() : sub.trackingCode;
    const carrierName = req.body?.carrierName ? String(req.body.carrierName).trim() : sub.carrierName;

    let orderStatus = sub.orderStatus;
    let shippingStatus = sub.shippingStatus;
    let paymentStatus = sub.paymentStatus;

    switch (action) {
      case 'CONFIRM':
        orderStatus = 'CONFIRMED';
        shippingStatus = 'CONFIRMED';
        break;
      case 'PREPARE':
        orderStatus = 'PROCESSING';
        shippingStatus = 'PREPARING_CRAFT';
        break;
      case 'SHIP':
        orderStatus = 'PROCESSING';
        shippingStatus = 'IN_TRANSIT';
        break;
      case 'DELIVERED':
        orderStatus = 'PROCESSING';
        shippingStatus = 'DELIVERED';
        if (paymentStatus === 'UNPAID') paymentStatus = 'PAID';
        break;
      case 'COMPLETE':
        orderStatus = 'COMPLETED';
        shippingStatus = 'COMPLETED';
        paymentStatus = 'PAID';
        break;
      case 'DELIVERY_FAILED':
        shippingStatus = 'DELIVERY_FAILED';
        break;
      case 'RETRY_DELIVERY':
        shippingStatus = 'RETRY_DELIVERY';
        break;
      case 'CANCEL':
        orderStatus = 'CANCELLED';
        shippingStatus = 'CANCELLED';
        if (paymentStatus === 'PAID') paymentStatus = 'REFUNDED';
        break;
      case 'APPROVE_RETURN':
        orderStatus = 'RETURNED';
        shippingStatus = 'RETURNED';
        if (paymentStatus === 'PAID') paymentStatus = 'REFUNDED';
        break;
      default:
        res.status(400).json({ error: 'Hành động cập nhật không hợp lệ.' });
        return;
    }

    const updated = await store.updateSellerSubOrderStatus(subId, shop.id, {
      orderStatus,
      shippingStatus,
      paymentStatus,
      trackingCode: trackingCode || (action === 'SHIP' ? `MM-SHIP-${sub.id}${Math.floor(100 + Math.random() * 900)}` : sub.trackingCode),
      carrierName: carrierName || (action === 'SHIP' ? 'Giao Hàng Nhanh' : sub.carrierName),
      approveAffiliate: action === 'COMPLETE',
      cancelAffiliate: action === 'CANCEL' || action === 'APPROVE_RETURN',
    });

    if (updated) {
      const masterOrder = await store.getMasterOrderWithSubs(updated.masterOrderId);
      orderRealtime.emitSubOrderUpdated(updated.buyerId, updated, masterOrder);
    }

    res.json(updated);
  });

  app.get('/api/seller/vouchers', requireAuth, requireRole('seller'), async (req, res) => {
    const shop = await store.getShopByOwner(req.currentUser!.id);
    if (!shop) {
      res.status(404).json({ error: 'Chưa có gian hàng.' });
      return;
    }
    res.json(await store.listShopVouchers(shop.id));
  });

  app.post('/api/seller/vouchers', requireAuth, requireRole('seller'), async (req, res) => {
    const shop = await store.getShopByOwner(req.currentUser!.id);
    if (!shop) {
      res.status(404).json({ error: 'Chưa có gian hàng.' });
      return;
    }
    const code = String(req.body?.code || '').trim().toUpperCase();
    const title = String(req.body?.title || '').trim();
    const discountType = String(req.body?.discountType || 'FIXED') as Voucher['discountType'];
    const discountValue = Number(req.body?.discountValue || 0);
    const minOrderValue = Number(req.body?.minOrderValue || 0);
    const usageLimit = Number(req.body?.usageLimit || 100);
    const maxDiscountAmount = req.body?.maxDiscountAmount ? Number(req.body.maxDiscountAmount) : null;

    if (!code || !title || discountValue <= 0) {
      res.status(400).json({ error: 'Mã giảm giá, tiêu đề và giá trị giảm không hợp lệ.' });
      return;
    }

    try {
      const created = await store.createVoucher({
        scope: 'SHOP',
        shopId: shop.id,
        code,
        title,
        discountType,
        discountValue,
        maxDiscountAmount,
        minOrderValue,
        usageLimit,
      });
      res.status(201).json(created);
    } catch {
      res.status(409).json({ error: 'Mã giảm giá đã tồn tại.' });
    }
  });

  app.get('/api/seller/tickets', requireAuth, requireRole('seller'), async (req, res) => {
    const shop = await store.getShopByOwner(req.currentUser!.id);
    if (!shop) {
      res.status(404).json({ error: 'Chưa có gian hàng.' });
      return;
    }
    res.json(await store.listSellerTickets(shop.id));
  });

  app.patch('/api/seller/tickets/:id', requireAuth, requireRole('seller'), async (req, res) => {
    const shop = await store.getShopByOwner(req.currentUser!.id);
    if (!shop) {
      res.status(404).json({ error: 'Chưa có gian hàng.' });
      return;
    }
    const ok = await store.sellerRespondTicket(
      Number(req.params.id),
      shop.id,
      Boolean(req.body?.approve),
      String(req.body?.resolutionNote || '').trim()
    );
    if (!ok) {
      res.status(403).json({ error: 'Không có quyền xử lý yêu cầu này.' });
      return;
    }
    res.json({ ok: true });
  });

  app.get('/api/seller/analytics', requireAuth, requireRole('seller'), async (req, res) => {
    const shop = await store.getShopByOwner(req.currentUser!.id);
    if (!shop) {
      res.status(404).json({ error: 'Chưa có gian hàng.' });
      return;
    }
    const [subOrders, products] = await Promise.all([
      store.listSellerSubOrders(shop.id),
      store.listSellerProducts(shop.id),
    ]);
    products.sort((a, b) => b.soldCount - a.soldCount);

    const validOrders = subOrders.filter((o) => !['CANCELLED', 'RETURNED'].includes(o.orderStatus));
    const grossMerchandise = validOrders.reduce((acc, o) => acc + Math.max(0, o.subtotal - o.shopDiscount), 0);
    const totalCommissionFee = validOrders.reduce((acc, o) => acc + o.commissionFee, 0);
    const settledNetRevenue = subOrders.filter((o) => o.orderStatus === 'COMPLETED').reduce((acc, o) => acc + o.sellerNetAmount, 0);
    const pendingSettlement = validOrders.filter((o) => o.orderStatus !== 'COMPLETED').reduce((acc, o) => acc + o.sellerNetAmount, 0);
    const lowStockCount = products.filter((p) => !p.isMadeToOrder && p.stock <= 5).length;

    res.json({
      totalOrders: subOrders.length,
      completedOrders: subOrders.filter((o) => o.orderStatus === 'COMPLETED').length,
      grossMerchandise,
      totalCommissionFee,
      settledNetRevenue,
      pendingSettlement,
      lowStockCount,
      topProducts: products.slice(0, 5),
    });
  });

  // ==========================================
  // 6. AFFILIATE SUBSYSTEM
  // ==========================================
  app.post('/api/affiliate/register', requireAuth, async (req, res) => {
    const existing = await store.getAffiliateByUserId(req.currentUser!.id);
    if (existing) {
      res.status(409).json({ error: 'Bạn đã đăng ký chương trình Affiliate.' });
      return;
    }

    const bankInfo = String(req.body?.bankInfo || '').trim();
    const customCode = String(req.body?.refCode || '')
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '');
    const refCode = customCode.length >= 4 ? customCode : `AFF${req.currentUser!.id}${Math.floor(100 + Math.random() * 899)}`;

    if (!bankInfo) {
      res.status(400).json({ error: 'Vui lòng cung cấp thông tin tài khoản ngân hàng nhận hoa hồng.' });
      return;
    }

    try {
      const result = await store.registerAffiliate(req.currentUser!.id, refCode, bankInfo);
      res.status(201).json(result);
    } catch {
      res.status(409).json({ error: 'Mã giới thiệu này đã được sử dụng, vui lòng chọn mã khác.' });
    }
  });

  app.get('/api/affiliate/me', requireAuth, async (req, res) => {
    const affiliate = await store.getAffiliateByUserId(req.currentUser!.id);
    if (!affiliate) {
      res.json({ affiliate: null, commissions: [], summary: null });
      return;
    }
    const commissions = await store.listAffiliateCommissions(affiliate.id);
    const pendingAmount = commissions.filter((c) => c.status === 'PENDING').reduce((a, b) => a + b.commissionAmount, 0);
    const approvedAmount = commissions.filter((c) => c.status === 'APPROVED').reduce((a, b) => a + b.commissionAmount, 0);
    const paidAmount = commissions.filter((c) => c.status === 'PAID').reduce((a, b) => a + b.commissionAmount, 0);

    res.json({
      affiliate,
      commissions,
      summary: {
        totalClicks: affiliate.totalClicks,
        totalOrders: commissions.filter((c) => c.status !== 'CANCELLED').length,
        pendingAmount,
        approvedAmount,
        paidAmount,
      },
    });
  });

  app.post('/api/affiliate/track-click', async (req, res) => {
    const refCode = String(req.body?.refCode || '').trim().toUpperCase();
    const productId = req.body?.productId ? Number(req.body.productId) : null;
    if (!refCode) {
      res.status(400).json({ error: 'Thiếu mã giới thiệu.' });
      return;
    }
    const aff = await store.getApprovedAffiliateByCode(refCode);
    if (!aff) {
      res.status(404).json({ error: 'Mã giới thiệu không tồn tại hoặc chưa được kích hoạt.' });
      return;
    }
    const ipHash = crypto.createHash('sha256').update(String(req.ip || 'unknown')).digest('hex').slice(0, 16);
    await store.recordAffiliateClick(aff.id, productId, ipHash);
    res.json({ ok: true, refCode: aff.refCode });
  });

  // ==========================================
  // 7. ADMIN SUBSYSTEM
  // ==========================================
  app.get('/api/admin/overview', requireAuth, requireRole('admin'), async (_req, res) => {
    const [
      users,
      shops,
      products,
      categories,
      orders,
      allSubOrders,
      transactions,
      vouchers,
      affiliates,
      commissions,
      reviews,
      tickets,
      platformCommissionRate,
      affiliateCommissionRate,
      defaultShippingFee,
    ] = await Promise.all([
      store.listUsers(),
      store.listAllShops(),
      store.listAllProducts(),
      store.listCategories(),
      store.listAllOrders(),
      store.listAllSubOrders(),
      store.listAllPaymentTransactions(),
      store.listAllVouchers(),
      store.listAllAffiliates(),
      store.listAllAffiliateCommissions(),
      store.listAllReviews(),
      store.listAllTickets(),
      store.getSetting('platformCommissionRate', '8'),
      store.getSetting('affiliateCommissionRate', '5'),
      store.getSetting('defaultShippingFee', '30000'),
    ]);

    const activeSubs = allSubOrders.filter((s) => !['CANCELLED', 'RETURNED'].includes(s.orderStatus));
    const gmv = activeSubs.reduce((acc, s) => acc + s.finalTotal, 0);
    const platformCommissionRevenue = activeSubs.reduce((acc, s) => acc + s.commissionFee, 0);

    res.json({
      stats: {
        gmv,
        platformCommissionRevenue,
        totalUsers: users.length,
        totalShops: shops.length,
        totalProducts: products.length,
        totalOrders: orders.length,
      },
      settings: {
        platformCommissionRate: Number(platformCommissionRate),
        affiliateCommissionRate: Number(affiliateCommissionRate),
        defaultShippingFee: Number(defaultShippingFee),
      },
      users,
      shops,
      products,
      categories,
      orders,
      transactions,
      vouchers,
      affiliates,
      commissions,
      reviews,
      tickets,
    });
  });

  app.patch('/api/admin/users/:id/lock', requireAuth, requireRole('admin'), async (req, res) => {
    const id = Number(req.params.id);
    if (id === req.currentUser!.id) {
      res.status(400).json({ error: 'Không thể tự khóa tài khoản đang đăng nhập.' });
      return;
    }
    await store.setUserLock(id, Boolean(req.body?.isLocked));
    res.json({ ok: true });
  });

  app.patch('/api/admin/shops/:id/status', requireAuth, requireRole('admin'), async (req, res) => {
    const status = String(req.body?.status || '').toUpperCase();
    if (!['APPROVED', 'REJECTED', 'SUSPENDED', 'PENDING'].includes(status)) {
      res.status(400).json({ error: 'Trạng thái gian hàng không hợp lệ.' });
      return;
    }
    await store.updateShopStatus(Number(req.params.id), status as any);
    res.json({ ok: true });
  });

  app.patch('/api/admin/products/:id/moderate', requireAuth, requireRole('admin'), async (req, res) => {
    const ok = await store.moderateProduct(Number(req.params.id), {
      status: req.body?.status ? (String(req.body.status).toUpperCase() as any) : undefined,
      isPromoted: req.body?.isPromoted !== undefined ? Boolean(req.body.isPromoted) : undefined,
    });
    if (!ok) {
      res.status(404).json({ error: 'Không tìm thấy sản phẩm.' });
      return;
    }
    res.json({ ok: true });
  });

  app.delete('/api/admin/products/:id', requireAuth, requireRole('admin'), async (req, res) => {
    await store.deleteProductAdmin(Number(req.params.id));
    res.json({ ok: true });
  });

  app.post('/api/admin/categories', requireAuth, requireRole('admin'), async (req, res) => {
    const name = String(req.body?.name || '').trim();
    const description = String(req.body?.description || '').trim();
    const materialFocus = String(req.body?.materialFocus || '').trim();
    if (!name) {
      res.status(400).json({ error: 'Tên danh mục không được để trống.' });
      return;
    }
    const created = await store.createCategory({ name, slug: slugify(name), description, materialFocus });
    res.status(201).json(created);
  });

  app.delete('/api/admin/categories/:id', requireAuth, requireRole('admin'), async (req, res) => {
    const result = await store.deleteCategory(Number(req.params.id));
    if (!result.deleted) {
      res.status(400).json({ error: result.reason });
      return;
    }
    res.json({ ok: true });
  });

  app.put('/api/admin/settings', requireAuth, requireRole('admin'), async (req, res) => {
    const platformCommissionRate = Math.min(30, Math.max(0, Number(req.body?.platformCommissionRate ?? 8)));
    const affiliateCommissionRate = Math.min(25, Math.max(0, Number(req.body?.affiliateCommissionRate ?? 5)));
    const defaultShippingFee = Math.max(0, Number(req.body?.defaultShippingFee ?? 30000));
    await Promise.all([
      store.setSetting('platformCommissionRate', String(platformCommissionRate)),
      store.setSetting('affiliateCommissionRate', String(affiliateCommissionRate)),
      store.setSetting('defaultShippingFee', String(defaultShippingFee)),
    ]);
    res.json({ platformCommissionRate, affiliateCommissionRate, defaultShippingFee });
  });

  app.post('/api/admin/vouchers', requireAuth, requireRole('admin'), async (req, res) => {
    const code = String(req.body?.code || '').trim().toUpperCase();
    const title = String(req.body?.title || '').trim();
    const discountType = String(req.body?.discountType || 'PERCENT') as Voucher['discountType'];
    const discountValue = Number(req.body?.discountValue || 0);
    const minOrderValue = Number(req.body?.minOrderValue || 0);
    const usageLimit = Number(req.body?.usageLimit || 200);
    const maxDiscountAmount = req.body?.maxDiscountAmount ? Number(req.body.maxDiscountAmount) : null;

    if (!code || !title || discountValue <= 0) {
      res.status(400).json({ error: 'Thông tin mã khuyến mãi không hợp lệ.' });
      return;
    }
    try {
      const created = await store.createVoucher({
        scope: 'PLATFORM',
        shopId: null,
        code,
        title,
        discountType,
        discountValue,
        maxDiscountAmount,
        minOrderValue,
        usageLimit,
      });
      res.status(201).json(created);
    } catch {
      res.status(409).json({ error: 'Mã voucher đã tồn tại.' });
    }
  });

  app.patch('/api/admin/vouchers/:id/toggle', requireAuth, requireRole('admin'), async (req, res) => {
    const ok = await store.toggleVoucher(Number(req.params.id));
    if (!ok) {
      res.status(404).json({ error: 'Không tìm thấy voucher.' });
      return;
    }
    res.json({ ok: true });
  });

  app.patch('/api/admin/affiliates/:id/status', requireAuth, requireRole('admin'), async (req, res) => {
    const status = String(req.body?.status || '').toUpperCase();
    if (!['APPROVED', 'SUSPENDED', 'PENDING'].includes(status)) {
      res.status(400).json({ error: 'Trạng thái không hợp lệ.' });
      return;
    }
    await store.updateAffiliateStatus(Number(req.params.id), status as any);
    res.json({ ok: true });
  });

  app.patch('/api/admin/affiliate-commissions/:id/payout', requireAuth, requireRole('admin'), async (req, res) => {
    await store.payoutAffiliateCommission(Number(req.params.id));
    res.json({ ok: true });
  });

  app.patch('/api/admin/reviews/:id/status', requireAuth, requireRole('admin'), async (req, res) => {
    await store.setReviewStatus(Number(req.params.id), req.body?.status === 'HIDDEN' ? 'HIDDEN' : 'VISIBLE');
    res.json({ ok: true });
  });

  app.patch('/api/admin/tickets/:id/resolve', requireAuth, requireRole('admin'), async (req, res) => {
    const ticketId = Number(req.params.id);
    const action = String(req.body?.action || 'REFUND').toUpperCase() === 'REJECT' ? 'REJECT' : 'REFUND';
    const ok = await store.adminResolveTicket(ticketId, action, String(req.body?.resolutionNote || '').trim());
    if (!ok) {
      res.status(404).json({ error: 'Không tìm thấy yêu cầu hỗ trợ.' });
      return;
    }
    const allTickets = await store.listAllTickets();
    const resolved = allTickets.find((t) => t.id === ticketId);
    if (resolved) {
      const updatedSub = await store.getSubOrderById(resolved.subOrderId);
      if (updatedSub) {
        const masterOrder = await store.getMasterOrderWithSubs(updatedSub.masterOrderId);
        orderRealtime.emitSubOrderUpdated(updatedSub.buyerId, updatedSub, masterOrder);
      }
    }
    res.json({ ok: true });
  });
}
