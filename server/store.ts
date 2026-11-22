import crypto from 'node:crypto';
import {
  db,
  getMasterOrderWithSubs as sqliteGetMasterOrder,
  getSetting as sqliteGetSetting,
  mapAddressRow,
  mapAffiliateCommissionRow,
  mapAffiliateRow,
  mapCategoryRow,
  mapMessageRow,
  mapProductRow,
  mapReviewRow,
  mapShopRow,
  mapSubOrderRow,
  mapTicketRow,
  mapTransactionRow,
  mapUserRow,
  mapVoucherRow,
  setSetting as sqliteSetSetting,
} from './db.ts';
import { signSandboxPayload } from './auth.ts';
import type {
  Address,
  AffiliateCommission,
  AffiliateProfile,
  Category,
  ChatMessage,
  MasterOrder,
  OrderItemSnapshot,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  PaymentTransaction,
  Product,
  ProductVariant,
  Review,
  ShippingStatus,
  Shop,
  SubOrder,
  SupportTicket,
  User,
  UserRole,
  Voucher,
} from '../src/types.ts';

export interface StoredUserRecord extends User {
  passwordHash: string;
}

export interface StoredPaymentTransaction extends PaymentTransaction {
  buyerId?: number;
}

export interface CreateOrderInput {
  buyerId: number;
  shippingAddress: Address;
  paymentMethod: PaymentMethod;
  initialPaymentStatus: PaymentStatus;
  platformVoucher: Voucher | null;
  subtotalAmount: number;
  shippingTotal: number;
  platformDiscountTotal: number;
  shopDiscountTotal: number;
  grandTotal: number;
  affiliate: AffiliateProfile | null;
  affiliateCommissionRate: number;
  subOrders: Array<{
    shopId: number;
    shopName: string;
    items: OrderItemSnapshot[];
    subtotal: number;
    shippingFee: number;
    shopDiscount: number;
    shopVoucher: Voucher | null;
    allocatedPlatformDiscount: number;
    finalTotal: number;
    commissionRate: number;
    commissionFee: number;
    affiliateCommissionFee: number;
    sellerNetAmount: number;
  }>;
}

export interface IDataStore {
  readonly driverName: 'mongodb' | 'sqlite';

  // Settings
  getSetting(key: string, fallback: string): Promise<string>;
  setSetting(key: string, value: string): Promise<void>;

  // Users
  getUserById(id: number): Promise<StoredUserRecord | null>;
  getUserByEmail(email: string): Promise<StoredUserRecord | null>;
  createUser(data: {
    email: string;
    passwordHash: string;
    fullName: string;
    phone: string;
    roles: UserRole[];
  }): Promise<StoredUserRecord>;
  updateUserProfile(id: number, fullName: string, phone: string): Promise<User>;
  updateUserRolesAndPassword(id: number, roles: UserRole[], passwordHash?: string): Promise<User>;
  listUsers(): Promise<User[]>;
  setUserLock(id: number, isLocked: boolean): Promise<void>;

  // Addresses & Wishlist
  listAddresses(userId: number): Promise<Address[]>;
  getAddressById(id: number, userId: number): Promise<Address | null>;
  createAddress(
    userId: number,
    data: { recipientName: string; phone: string; province: string; district: string; ward: string; street: string; isDefault: boolean }
  ): Promise<Address>;
  setDefaultAddress(id: number, userId: number): Promise<boolean>;
  deleteAddress(id: number, userId: number): Promise<boolean>;
  getWishlist(userId: number): Promise<number[]>;
  toggleWishlist(userId: number, productId: number): Promise<boolean>;
  mergeWishlist(userId: number, productIds: number[]): Promise<number[]>;
  clearWishlist(userId: number): Promise<void>;

  // Shops
  listApprovedShops(): Promise<Shop[]>;
  listAllShops(): Promise<Shop[]>;
  getShopById(id: number): Promise<Shop | null>;
  getShopByOwner(ownerId: number): Promise<Shop | null>;
  createShop(data: {
    ownerId: number;
    name: string;
    slug: string;
    craftVillage: string;
    description: string;
    logoUrl: string;
    bannerUrl: string;
    contactPhone: string;
    contactEmail: string;
  }): Promise<Shop>;
  updateShop(
    shopId: number,
    ownerId: number,
    data: { name: string; craftVillage: string; description: string; contactPhone: string; contactEmail: string; logoUrl: string; bannerUrl: string }
  ): Promise<Shop | null>;
  updateShopStatus(shopId: number, status: Shop['status']): Promise<void>;

  // Categories
  listCategories(): Promise<Category[]>;
  createCategory(data: { name: string; slug: string; description: string; materialFocus: string }): Promise<Category>;
  deleteCategory(id: number): Promise<{ deleted: boolean; reason?: string }>;

  // Products
  listApprovedProducts(): Promise<Product[]>;
  listAllProducts(): Promise<Product[]>;
  listSellerProducts(shopId: number): Promise<Product[]>;
  getProductById(id: number): Promise<Product | null>;
  createProduct(data: {
    shopId: number;
    categoryId: number;
    name: string;
    slug: string;
    material: string;
    originVillage: string;
    description: string;
    artisanStory: string;
    basePrice: number;
    flashSalePrice: number | null;
    flashSaleEnd: string | null;
    quantityDiscountMin: number | null;
    quantityDiscountPercent: number | null;
    stock: number;
    isMadeToOrder: boolean;
    productionDays: number;
    images: string[];
    variants: ProductVariant[];
  }): Promise<Product>;
  updateSellerProduct(
    prodId: number,
    shopId: number,
    data: Partial<{
      name: string;
      basePrice: number;
      stock: number;
      flashSalePrice: number | null;
      quantityDiscountMin: number | null;
      quantityDiscountPercent: number | null;
      isMadeToOrder: boolean;
      productionDays: number;
      description: string;
      artisanStory: string;
      images: string[];
    }>
  ): Promise<Product | null>;
  deleteSellerProduct(prodId: number, shopId: number): Promise<boolean>;
  moderateProduct(prodId: number, data: { status?: Product['status']; isPromoted?: boolean }): Promise<boolean>;
  deleteProductAdmin(prodId: number): Promise<void>;

  // Vouchers
  listActiveVouchers(): Promise<Voucher[]>;
  listAllVouchers(): Promise<Voucher[]>;
  listShopVouchers(shopId: number): Promise<Voucher[]>;
  getVoucherByCode(code: string, scope: 'PLATFORM' | 'SHOP', shopId?: number): Promise<Voucher | null>;
  createVoucher(data: {
    scope: 'PLATFORM' | 'SHOP';
    shopId: number | null;
    code: string;
    title: string;
    discountType: Voucher['discountType'];
    discountValue: number;
    maxDiscountAmount: number | null;
    minOrderValue: number;
    usageLimit: number;
  }): Promise<Voucher>;
  toggleVoucher(id: number): Promise<boolean>;

  // Orders & Payments
  createMultiVendorOrder(input: CreateOrderInput): Promise<{
    masterOrder: MasterOrder;
    transactionCode: string;
    idempotencyKey: string;
    sandboxSignature: string | null;
    amount: number;
  }>;
  getMasterOrderWithSubs(masterId: number): Promise<MasterOrder | null>;
  listBuyerOrders(buyerId: number): Promise<MasterOrder[]>;
  listAllOrders(): Promise<MasterOrder[]>;
  listAllSubOrders(): Promise<SubOrder[]>;
  getSubOrderById(subId: number): Promise<SubOrder | null>;
  listSellerSubOrders(shopId: number): Promise<SubOrder[]>;
  updateSellerSubOrderStatus(
    subId: number,
    shopId: number,
    update: {
      orderStatus: OrderStatus;
      shippingStatus: ShippingStatus;
      paymentStatus: PaymentStatus;
      trackingCode: string | null;
      carrierName: string | null;
      approveAffiliate: boolean;
      cancelAffiliate: boolean;
    }
  ): Promise<SubOrder | null>;
  confirmSubOrderReceived(subId: number, buyerId: number): Promise<MasterOrder | null>;
  getPaymentTransaction(transactionCode: string, idempotencyKey: string): Promise<StoredPaymentTransaction | null>;
  finalizePaymentTransaction(
    txnId: number,
    masterOrderId: number,
    txnStatus: 'SUCCEEDED' | 'FAILED',
    newPayStatus: PaymentStatus
  ): Promise<PaymentTransaction>;
  listAllPaymentTransactions(): Promise<PaymentTransaction[]>;

  // Reviews
  listProductReviews(productId: number): Promise<Review[]>;
  listAllReviews(): Promise<Review[]>;
  createVerifiedReview(buyerId: number, productId: number, rating: number, comment: string): Promise<Review>;
  setReviewStatus(id: number, status: 'VISIBLE' | 'HIDDEN'): Promise<void>;

  // Support Tickets
  listBuyerTickets(buyerId: number): Promise<SupportTicket[]>;
  listSellerTickets(shopId: number): Promise<SupportTicket[]>;
  listAllTickets(): Promise<SupportTicket[]>;
  createTicket(buyerId: number, subOrderId: number, type: SupportTicket['type'], reason: string): Promise<SupportTicket>;
  sellerRespondTicket(id: number, shopId: number, approve: boolean, note: string): Promise<boolean>;
  adminResolveTicket(id: number, action: 'REFUND' | 'REJECT', note: string): Promise<boolean>;

  // Chat
  listChatThreads(userId: number, ownedShopId?: number): Promise<Array<{ shopId: number; customerId: number; shopName: string; customerName: string }>>;
  listChatMessages(shopId: number, customerId: number): Promise<ChatMessage[]>;
  createChatMessage(data: {
    shopId: number;
    customerId: number;
    senderId: number;
    senderRole: 'customer' | 'seller';
    productId: number | null;
    content: string;
  }): Promise<ChatMessage>;

  // Affiliates
  getAffiliateByUserId(userId: number): Promise<AffiliateProfile | null>;
  getApprovedAffiliateByCode(refCode: string): Promise<AffiliateProfile | null>;
  registerAffiliate(userId: number, refCode: string, bankInfo: string): Promise<{ affiliate: AffiliateProfile; user: User }>;
  recordAffiliateClick(affiliateId: number, productId: number | null, ipHash: string): Promise<void>;
  listAffiliateCommissions(affiliateId: number): Promise<AffiliateCommission[]>;
  listAllAffiliates(): Promise<AffiliateProfile[]>;
  listAllAffiliateCommissions(): Promise<AffiliateCommission[]>;
  updateAffiliateStatus(id: number, status: AffiliateProfile['status']): Promise<void>;
  payoutAffiliateCommission(id: number): Promise<void>;
}

export class SqliteStore implements IDataStore {
  readonly driverName = 'sqlite' as const;

  async getSetting(key: string, fallback: string) {
    return sqliteGetSetting(key, fallback);
  }
  async setSetting(key: string, value: string) {
    sqliteSetSetting(key, value);
  }

  async getUserById(id: number): Promise<StoredUserRecord | null> {
    const row = db.prepare('SELECT * FROM users WHERE id = ?').get(id) as any;
    return row ? { ...mapUserRow(row), passwordHash: row.passwordHash } : null;
  }
  async getUserByEmail(email: string): Promise<StoredUserRecord | null> {
    const row = db.prepare('SELECT * FROM users WHERE email = ?').get(email) as any;
    return row ? { ...mapUserRow(row), passwordHash: row.passwordHash } : null;
  }
  async createUser(data: { email: string; passwordHash: string; fullName: string; phone: string; roles: UserRole[] }) {
    const id = Number(
      db
        .prepare('INSERT INTO users (email, passwordHash, fullName, phone, rolesJson, isLocked, createdAt) VALUES (?, ?, ?, ?, ?, 0, ?)')
        .run(data.email, data.passwordHash, data.fullName, data.phone, JSON.stringify(data.roles), new Date().toISOString())
        .lastInsertRowid
    );
    return (await this.getUserById(id))!;
  }
  async updateUserProfile(id: number, fullName: string, phone: string) {
    db.prepare('UPDATE users SET fullName = ?, phone = ? WHERE id = ?').run(fullName, phone, id);
    return mapUserRow(db.prepare('SELECT * FROM users WHERE id = ?').get(id));
  }
  async updateUserRolesAndPassword(id: number, roles: UserRole[], passwordHash?: string) {
    if (passwordHash) {
      db.prepare('UPDATE users SET rolesJson = ?, passwordHash = ? WHERE id = ?').run(JSON.stringify(roles), passwordHash, id);
    } else {
      db.prepare('UPDATE users SET rolesJson = ? WHERE id = ?').run(JSON.stringify(roles), id);
    }
    return mapUserRow(db.prepare('SELECT * FROM users WHERE id = ?').get(id));
  }
  async listUsers() {
    return db.prepare('SELECT * FROM users ORDER BY id DESC').all().map(mapUserRow);
  }
  async setUserLock(id: number, isLocked: boolean) {
    db.prepare('UPDATE users SET isLocked = ? WHERE id = ?').run(isLocked ? 1 : 0, id);
  }

  async listAddresses(userId: number) {
    return db.prepare('SELECT * FROM addresses WHERE userId = ? ORDER BY isDefault DESC, id DESC').all(userId).map(mapAddressRow);
  }
  async getAddressById(id: number, userId: number) {
    const row = db.prepare('SELECT * FROM addresses WHERE id = ? AND userId = ?').get(id, userId);
    return row ? mapAddressRow(row) : null;
  }
  async createAddress(userId: number, data: any) {
    const row = db.transaction(() => {
      if (data.isDefault) db.prepare('UPDATE addresses SET isDefault = 0 WHERE userId = ?').run(userId);
      const count = (db.prepare('SELECT COUNT(*) as c FROM addresses WHERE userId = ?').get(userId) as { c: number }).c;
      const shouldDefault = data.isDefault || count === 0 ? 1 : 0;
      const id = Number(
        db
          .prepare('INSERT INTO addresses (userId, recipientName, phone, province, district, ward, street, isDefault) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
          .run(userId, data.recipientName, data.phone, data.province, data.district, data.ward, data.street, shouldDefault)
          .lastInsertRowid
      );
      return db.prepare('SELECT * FROM addresses WHERE id = ?').get(id);
    })();
    return mapAddressRow(row);
  }
  async setDefaultAddress(id: number, userId: number) {
    const addr = db.prepare('SELECT id FROM addresses WHERE id = ? AND userId = ?').get(id, userId);
    if (!addr) return false;
    db.transaction(() => {
      db.prepare('UPDATE addresses SET isDefault = 0 WHERE userId = ?').run(userId);
      db.prepare('UPDATE addresses SET isDefault = 1 WHERE id = ?').run(id);
    })();
    return true;
  }
  async deleteAddress(id: number, userId: number) {
    return db.prepare('DELETE FROM addresses WHERE id = ? AND userId = ?').run(id, userId).changes > 0;
  }
  async getWishlist(userId: number) {
    return (db.prepare('SELECT productId FROM wishlist WHERE userId = ? ORDER BY createdAt DESC').all(userId) as Array<{ productId: number }>).map(
      (r) => r.productId
    );
  }
  async toggleWishlist(userId: number, productId: number) {
    const exists = db.prepare('SELECT 1 FROM wishlist WHERE userId = ? AND productId = ?').get(userId, productId);
    if (exists) {
      db.prepare('DELETE FROM wishlist WHERE userId = ? AND productId = ?').run(userId, productId);
      return false;
    }
    db.prepare('INSERT INTO wishlist (userId, productId, createdAt) VALUES (?, ?, ?)').run(userId, productId, new Date().toISOString());
    return true;
  }
  async mergeWishlist(userId: number, productIds: number[]) {
    const now = new Date().toISOString();
    const insertStmt = db.prepare('INSERT OR IGNORE INTO wishlist (userId, productId, createdAt) VALUES (?, ?, ?)');
    db.transaction(() => {
      for (const pid of productIds) {
        if (Number.isInteger(pid) && pid > 0) {
          const prod = db.prepare('SELECT id FROM products WHERE id = ?').get(pid);
          if (prod) {
            insertStmt.run(userId, pid, now);
          }
        }
      }
    })();
    return this.getWishlist(userId);
  }
  async clearWishlist(userId: number) {
    db.prepare('DELETE FROM wishlist WHERE userId = ?').run(userId);
  }

  async listApprovedShops() {
    return db.prepare("SELECT * FROM shops WHERE status = 'APPROVED' ORDER BY id ASC").all().map(mapShopRow);
  }
  async listAllShops() {
    return db.prepare('SELECT * FROM shops ORDER BY id DESC').all().map(mapShopRow);
  }
  async getShopById(id: number) {
    const row = db.prepare('SELECT * FROM shops WHERE id = ?').get(id);
    return row ? mapShopRow(row) : null;
  }
  async getShopByOwner(ownerId: number) {
    const row = db.prepare('SELECT * FROM shops WHERE ownerId = ?').get(ownerId);
    return row ? mapShopRow(row) : null;
  }
  async createShop(data: any) {
    const id = db.transaction(() => {
      const shopId = Number(
        db
          .prepare(
            `INSERT INTO shops (ownerId, name, slug, craftVillage, description, logoUrl, bannerUrl, contactPhone, contactEmail, status, createdAt)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?)`
          )
          .run(
            data.ownerId,
            data.name,
            data.slug,
            data.craftVillage,
            data.description,
            data.logoUrl,
            data.bannerUrl,
            data.contactPhone,
            data.contactEmail,
            new Date().toISOString()
          ).lastInsertRowid
      );
      const u = db.prepare('SELECT rolesJson FROM users WHERE id = ?').get(data.ownerId) as any;
      const roles = JSON.parse(u.rolesJson || '["customer"]') as UserRole[];
      if (!roles.includes('seller')) roles.push('seller');
      db.prepare('UPDATE users SET rolesJson = ? WHERE id = ?').run(JSON.stringify(roles), data.ownerId);
      return shopId;
    })();
    return mapShopRow(db.prepare('SELECT * FROM shops WHERE id = ?').get(id));
  }
  async updateShop(shopId: number, ownerId: number, data: any) {
    const info = db
      .prepare(
        'UPDATE shops SET name = ?, craftVillage = ?, description = ?, contactPhone = ?, contactEmail = ?, logoUrl = ?, bannerUrl = ? WHERE id = ? AND ownerId = ?'
      )
      .run(data.name, data.craftVillage, data.description, data.contactPhone, data.contactEmail, data.logoUrl, data.bannerUrl, shopId, ownerId);
    if (info.changes === 0) return null;
    return mapShopRow(db.prepare('SELECT * FROM shops WHERE id = ?').get(shopId));
  }
  async updateShopStatus(shopId: number, status: Shop['status']) {
    db.prepare('UPDATE shops SET status = ? WHERE id = ?').run(status, shopId);
  }

  async listCategories() {
    return db.prepare('SELECT * FROM categories ORDER BY id ASC').all().map(mapCategoryRow);
  }
  async createCategory(data: any) {
    const id = Number(
      db.prepare('INSERT INTO categories (name, slug, description, materialFocus) VALUES (?, ?, ?, ?)').run(
        data.name,
        data.slug,
        data.description,
        data.materialFocus
      ).lastInsertRowid
    );
    return mapCategoryRow(db.prepare('SELECT * FROM categories WHERE id = ?').get(id));
  }
  async deleteCategory(id: number) {
    const inUse = db.prepare('SELECT COUNT(*) as c FROM products WHERE categoryId = ?').get(id) as { c: number };
    if (inUse.c > 0) return { deleted: false, reason: 'Không thể xóa danh mục đang có sản phẩm.' };
    db.prepare('DELETE FROM categories WHERE id = ?').run(id);
    return { deleted: true };
  }

  async listApprovedProducts() {
    return db
      .prepare(
        `SELECT p.*, s.name as shopName, s.craftVillage as shopVillage, c.name as categoryName
         FROM products p JOIN shops s ON p.shopId = s.id JOIN categories c ON p.categoryId = c.id
         WHERE p.status = 'APPROVED' AND s.status = 'APPROVED'`
      )
      .all()
      .map(mapProductRow);
  }
  async listAllProducts() {
    return db
      .prepare(
        `SELECT p.*, s.name as shopName, s.craftVillage as shopVillage, c.name as categoryName
         FROM products p JOIN shops s ON p.shopId = s.id JOIN categories c ON p.categoryId = c.id
         ORDER BY p.id DESC`
      )
      .all()
      .map(mapProductRow);
  }
  async listSellerProducts(shopId: number) {
    return db
      .prepare(
        `SELECT p.*, s.name as shopName, s.craftVillage as shopVillage, c.name as categoryName
         FROM products p JOIN shops s ON p.shopId = s.id JOIN categories c ON p.categoryId = c.id
         WHERE p.shopId = ? ORDER BY p.id DESC`
      )
      .all(shopId)
      .map(mapProductRow);
  }
  async getProductById(id: number) {
    const row = db
      .prepare(
        `SELECT p.*, s.name as shopName, s.craftVillage as shopVillage, c.name as categoryName
         FROM products p JOIN shops s ON p.shopId = s.id JOIN categories c ON p.categoryId = c.id WHERE p.id = ?`
      )
      .get(id);
    return row ? mapProductRow(row) : null;
  }
  async createProduct(data: any) {
    const id = Number(
      db
        .prepare(
          `INSERT INTO products (
            shopId, categoryId, name, slug, material, originVillage, description, artisanStory,
            basePrice, flashSalePrice, flashSaleEnd, quantityDiscountMin, quantityDiscountPercent,
            stock, isMadeToOrder, productionDays, isPromoted, status, imagesJson, variantsJson,
            soldCount, ratingAvg, reviewCount, createdAt
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 'PENDING_REVIEW', ?, ?, 0, 5.0, 0, ?)`
        )
        .run(
          data.shopId,
          data.categoryId,
          data.name,
          data.slug,
          data.material,
          data.originVillage,
          data.description,
          data.artisanStory,
          data.basePrice,
          data.flashSalePrice,
          data.flashSaleEnd,
          data.quantityDiscountMin,
          data.quantityDiscountPercent,
          data.stock,
          data.isMadeToOrder ? 1 : 0,
          data.productionDays,
          JSON.stringify(data.images),
          JSON.stringify(data.variants),
          new Date().toISOString()
        ).lastInsertRowid
    );
    return (await this.getProductById(id))!;
  }
  async updateSellerProduct(prodId: number, shopId: number, data: any) {
    const existing = db.prepare('SELECT * FROM products WHERE id = ? AND shopId = ?').get(prodId, shopId) as any;
    if (!existing) return null;
    db.prepare(
      `UPDATE products SET
        name = ?, basePrice = ?, stock = ?, flashSalePrice = ?,
        quantityDiscountMin = ?, quantityDiscountPercent = ?,
        isMadeToOrder = ?, productionDays = ?, description = ?, artisanStory = ?, imagesJson = ?
       WHERE id = ? AND shopId = ?`
    ).run(
      data.name ?? existing.name,
      data.basePrice ?? existing.basePrice,
      data.stock ?? existing.stock,
      data.flashSalePrice !== undefined ? data.flashSalePrice : existing.flashSalePrice,
      data.quantityDiscountMin !== undefined ? data.quantityDiscountMin : existing.quantityDiscountMin,
      data.quantityDiscountPercent !== undefined ? data.quantityDiscountPercent : existing.quantityDiscountPercent,
      data.isMadeToOrder !== undefined ? (data.isMadeToOrder ? 1 : 0) : existing.isMadeToOrder,
      data.productionDays !== undefined ? data.productionDays : existing.productionDays,
      data.description ?? existing.description,
      data.artisanStory ?? existing.artisanStory,
      data.images ? JSON.stringify(data.images) : existing.imagesJson,
      prodId,
      shopId
    );
    return this.getProductById(prodId);
  }
  async deleteSellerProduct(prodId: number, shopId: number) {
    return db.prepare('DELETE FROM products WHERE id = ? AND shopId = ?').run(prodId, shopId).changes > 0;
  }
  async moderateProduct(prodId: number, data: { status?: Product['status']; isPromoted?: boolean }) {
    const existing = db.prepare('SELECT * FROM products WHERE id = ?').get(prodId) as any;
    if (!existing) return false;
    const status = data.status ?? existing.status;
    const isPromoted = data.isPromoted !== undefined ? (data.isPromoted ? 1 : 0) : existing.isPromoted;
    db.prepare('UPDATE products SET status = ?, isPromoted = ? WHERE id = ?').run(status, isPromoted, prodId);
    return true;
  }
  async deleteProductAdmin(prodId: number) {
    db.prepare('DELETE FROM products WHERE id = ?').run(prodId);
  }

  async listActiveVouchers() {
    const now = new Date().toISOString();
    return db
      .prepare(
        `SELECT v.*, s.name as shopName FROM vouchers v LEFT JOIN shops s ON v.shopId = s.id
         WHERE v.isActive = 1 AND v.endsAt >= ? AND v.usedCount < v.usageLimit ORDER BY v.scope ASC, v.id DESC`
      )
      .all(now)
      .map(mapVoucherRow);
  }
  async listAllVouchers() {
    return db
      .prepare('SELECT v.*, s.name as shopName FROM vouchers v LEFT JOIN shops s ON v.shopId = s.id ORDER BY v.id DESC')
      .all()
      .map(mapVoucherRow);
  }
  async listShopVouchers(shopId: number) {
    return db.prepare("SELECT * FROM vouchers WHERE scope = 'SHOP' AND shopId = ? ORDER BY id DESC").all(shopId).map(mapVoucherRow);
  }
  async getVoucherByCode(code: string, scope: 'PLATFORM' | 'SHOP', shopId?: number) {
    const row =
      scope === 'PLATFORM'
        ? db.prepare("SELECT * FROM vouchers WHERE code = ? AND scope = 'PLATFORM'").get(code)
        : db.prepare("SELECT * FROM vouchers WHERE code = ? AND scope = 'SHOP' AND shopId = ?").get(code, shopId);
    return row ? mapVoucherRow(row) : null;
  }
  async createVoucher(data: any) {
    const now = new Date().toISOString();
    const endsAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 60).toISOString();
    const id = Number(
      db
        .prepare(
          `INSERT INTO vouchers (scope, shopId, code, title, discountType, discountValue, maxDiscountAmount, minOrderValue, usageLimit, usedCount, startsAt, endsAt, isActive)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, 1)`
        )
        .run(
          data.scope,
          data.shopId,
          data.code,
          data.title,
          data.discountType,
          data.discountValue,
          data.maxDiscountAmount,
          data.minOrderValue,
          data.usageLimit,
          now,
          endsAt
        ).lastInsertRowid
    );
    return mapVoucherRow(db.prepare('SELECT * FROM vouchers WHERE id = ?').get(id));
  }
  async toggleVoucher(id: number) {
    const row = db.prepare('SELECT isActive FROM vouchers WHERE id = ?').get(id) as { isActive: number } | undefined;
    if (!row) return false;
    db.prepare('UPDATE vouchers SET isActive = ? WHERE id = ?').run(row.isActive ? 0 : 1, id);
    return true;
  }

  async createMultiVendorOrder(input: CreateOrderInput) {
    const now = new Date().toISOString();
    const orderCode = `MM-${Date.now().toString().slice(-6)}-${Math.floor(100 + Math.random() * 900)}`;

    const result = db.transaction(() => {
      const masterId = Number(
        db
          .prepare(
            `INSERT INTO orders_master (
              orderCode, buyerId, shippingAddressJson, paymentMethod, paymentStatus,
              platformVoucherCode, subtotalAmount, shippingTotal, platformDiscountTotal,
              shopDiscountTotal, grandTotal, affiliateCode, createdAt
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          )
          .run(
            orderCode,
            input.buyerId,
            JSON.stringify(input.shippingAddress),
            input.paymentMethod,
            input.initialPaymentStatus,
            input.platformVoucher ? input.platformVoucher.code : null,
            input.subtotalAmount,
            input.shippingTotal,
            input.platformDiscountTotal,
            input.shopDiscountTotal,
            input.grandTotal,
            input.affiliate ? input.affiliate.refCode : null,
            now
          ).lastInsertRowid
      );

      if (input.platformVoucher && input.platformDiscountTotal > 0) {
        db.prepare('UPDATE vouchers SET usedCount = usedCount + 1 WHERE id = ?').run(input.platformVoucher.id);
      }

      const insertSub = db.prepare(`
        INSERT INTO orders_sub (
          masterOrderId, subOrderCode, shopId, buyerId, itemsJson, subtotal, shippingFee,
          shopDiscount, allocatedPlatformDiscount, finalTotal, commissionRate, commissionFee,
          affiliateCommissionFee, sellerNetAmount, orderStatus, paymentStatus, shippingStatus,
          trackingCode, carrierName, createdAt, updatedAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING_CONFIRM', ?, 'AWAITING_CONFIRM', NULL, NULL, ?, ?)
      `);

      input.subOrders.forEach((sub, idx) => {
        const subCode = `${orderCode}-S${idx + 1}`;
        const affFee = input.affiliate ? sub.affiliateCommissionFee : 0;

        const subId = Number(
          insertSub.run(
            masterId,
            subCode,
            sub.shopId,
            input.buyerId,
            JSON.stringify(sub.items),
            sub.subtotal,
            sub.shippingFee,
            sub.shopDiscount,
            sub.allocatedPlatformDiscount,
            sub.finalTotal,
            sub.commissionRate,
            sub.commissionFee,
            affFee,
            sub.sellerNetAmount,
            input.initialPaymentStatus,
            now,
            now
          ).lastInsertRowid
        );

        if (sub.shopVoucher && sub.shopDiscount > 0) {
          db.prepare('UPDATE vouchers SET usedCount = usedCount + 1 WHERE id = ?').run(sub.shopVoucher.id);
        }

        for (const item of sub.items) {
          const pRow = db.prepare('SELECT stock, variantsJson, isMadeToOrder FROM products WHERE id = ?').get(item.productId) as any;
          if (pRow && !pRow.isMadeToOrder) {
            const variants = JSON.parse(pRow.variantsJson || '[]') as any[];
            const vIdx = variants.findIndex((v) => v.id === item.variantId);
            if (vIdx >= 0) variants[vIdx].stock = Math.max(0, Number(variants[vIdx].stock) - item.quantity);
            const newStock = Math.max(0, Number(pRow.stock) - item.quantity);
            db.prepare('UPDATE products SET stock = ?, variantsJson = ?, soldCount = soldCount + ? WHERE id = ?').run(
              newStock,
              JSON.stringify(variants),
              item.quantity,
              item.productId
            );
          } else if (pRow) {
            db.prepare('UPDATE products SET soldCount = soldCount + ? WHERE id = ?').run(item.quantity, item.productId);
          }
        }

        if (input.affiliate && affFee > 0) {
          const summary = sub.items.map((i) => `${i.productName} x${i.quantity}`).join(', ');
          db.prepare(
            `INSERT INTO affiliate_commissions (
              affiliateId, subOrderId, masterOrderId, productSummary, orderAmount,
              commissionRate, commissionAmount, status, createdAt, updatedAt
            ) VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, ?)`
          ).run(
            input.affiliate.id,
            subId,
            masterId,
            summary,
            Math.max(0, sub.subtotal - sub.shopDiscount),
            input.affiliateCommissionRate,
            affFee,
            now,
            now
          );
        }
      });

      const txnCode = `TXN-${Date.now().toString().slice(-7)}`;
      const idempotencyKey = `idem_${masterId}_${crypto.randomBytes(6).toString('hex')}`;
      const sandboxSignature =
        input.paymentMethod === 'SANDBOX_GATEWAY' ? signSandboxPayload(txnCode, 'SUCCEEDED', input.grandTotal) : null;

      db.prepare(
        `INSERT INTO payment_transactions (
          masterOrderId, transactionCode, idempotencyKey, method, amount, status, gatewaySignature, rawPayloadJson, createdAt, updatedAt
        ) VALUES (?, ?, ?, ?, ?, 'INITIATED', ?, ?, ?, ?)`
      ).run(masterId, txnCode, idempotencyKey, input.paymentMethod, input.grandTotal, sandboxSignature, JSON.stringify({ orderCode }), now, now);

      return { masterId, txnCode, idempotencyKey, sandboxSignature, amount: input.grandTotal };
    })();

    return {
      masterOrder: sqliteGetMasterOrder(result.masterId)!,
      transactionCode: result.txnCode,
      idempotencyKey: result.idempotencyKey,
      sandboxSignature: result.sandboxSignature,
      amount: result.amount,
    };
  }

  async getMasterOrderWithSubs(masterId: number) {
    return sqliteGetMasterOrder(masterId);
  }
  async listBuyerOrders(buyerId: number) {
    const ids = db.prepare('SELECT id FROM orders_master WHERE buyerId = ? ORDER BY id DESC').all(buyerId) as Array<{ id: number }>;
    return ids.map((r) => sqliteGetMasterOrder(r.id)!).filter(Boolean);
  }
  async listAllOrders() {
    const ids = db.prepare('SELECT id FROM orders_master ORDER BY id DESC').all() as Array<{ id: number }>;
    return ids.map((r) => sqliteGetMasterOrder(r.id)!).filter(Boolean);
  }
  async listAllSubOrders() {
    return db
      .prepare('SELECT s.*, sh.name as shopName, u.fullName as buyerName FROM orders_sub s JOIN shops sh ON s.shopId = sh.id JOIN users u ON s.buyerId = u.id')
      .all()
      .map(mapSubOrderRow);
  }
  async getSubOrderById(subId: number) {
    const row = db
      .prepare('SELECT s.*, sh.name as shopName, u.fullName as buyerName FROM orders_sub s JOIN shops sh ON s.shopId = sh.id JOIN users u ON s.buyerId = u.id WHERE s.id = ?')
      .get(subId);
    return row ? mapSubOrderRow(row) : null;
  }
  async listSellerSubOrders(shopId: number) {
    return db
      .prepare(
        'SELECT s.*, sh.name as shopName, u.fullName as buyerName FROM orders_sub s JOIN shops sh ON s.shopId = sh.id JOIN users u ON s.buyerId = u.id WHERE s.shopId = ? ORDER BY s.id DESC'
      )
      .all(shopId)
      .map(mapSubOrderRow);
  }
  async updateSellerSubOrderStatus(subId: number, shopId: number, update: any) {
    const now = new Date().toISOString();
    const ok = db.transaction(() => {
      const info = db
        .prepare(
          'UPDATE orders_sub SET orderStatus = ?, shippingStatus = ?, paymentStatus = ?, trackingCode = ?, carrierName = ?, updatedAt = ? WHERE id = ? AND shopId = ?'
        )
        .run(update.orderStatus, update.shippingStatus, update.paymentStatus, update.trackingCode, update.carrierName, now, subId, shopId);
      if (info.changes === 0) return false;
      if (update.approveAffiliate) {
        db.prepare("UPDATE affiliate_commissions SET status = 'APPROVED', updatedAt = ? WHERE subOrderId = ? AND status = 'PENDING'").run(now, subId);
      }
      if (update.cancelAffiliate) {
        db.prepare("UPDATE affiliate_commissions SET status = 'CANCELLED', updatedAt = ? WHERE subOrderId = ? AND status IN ('PENDING', 'APPROVED')").run(now, subId);
      }
      return true;
    })();
    if (!ok) return null;
    return this.getSubOrderById(subId);
  }
  async confirmSubOrderReceived(subId: number, buyerId: number) {
    const sub = db.prepare('SELECT * FROM orders_sub WHERE id = ? AND buyerId = ?').get(subId, buyerId) as any;
    if (!sub) return null;
    const now = new Date().toISOString();
    db.transaction(() => {
      db.prepare("UPDATE orders_sub SET orderStatus = 'COMPLETED', shippingStatus = 'COMPLETED', paymentStatus = 'PAID', updatedAt = ? WHERE id = ?").run(now, subId);
      db.prepare("UPDATE affiliate_commissions SET status = 'APPROVED', updatedAt = ? WHERE subOrderId = ? AND status = 'PENDING'").run(now, subId);
      const unpaid = db.prepare("SELECT COUNT(*) as c FROM orders_sub WHERE masterOrderId = ? AND paymentStatus != 'PAID'").get(sub.masterOrderId) as { c: number };
      if (unpaid.c === 0) db.prepare("UPDATE orders_master SET paymentStatus = 'PAID' WHERE id = ?").run(sub.masterOrderId);
    })();
    return sqliteGetMasterOrder(sub.masterOrderId);
  }
  async getPaymentTransaction(transactionCode: string, idempotencyKey: string): Promise<StoredPaymentTransaction | null> {
    const row = db
      .prepare('SELECT t.*, m.buyerId, m.orderCode FROM payment_transactions t JOIN orders_master m ON t.masterOrderId = m.id WHERE t.transactionCode = ? AND t.idempotencyKey = ?')
      .get(transactionCode, idempotencyKey) as any;
    return row ? { ...mapTransactionRow(row), buyerId: row.buyerId } : null;
  }
  async finalizePaymentTransaction(txnId: number, masterOrderId: number, txnStatus: 'SUCCEEDED' | 'FAILED', newPayStatus: PaymentStatus) {
    const now = new Date().toISOString();
    db.transaction(() => {
      db.prepare('UPDATE payment_transactions SET status = ?, updatedAt = ? WHERE id = ?').run(txnStatus, now, txnId);
      db.prepare('UPDATE orders_master SET paymentStatus = ? WHERE id = ?').run(newPayStatus, masterOrderId);
      db.prepare('UPDATE orders_sub SET paymentStatus = ?, updatedAt = ? WHERE masterOrderId = ?').run(newPayStatus, now, masterOrderId);
    })();
    return mapTransactionRow(
      db.prepare('SELECT t.*, m.orderCode FROM payment_transactions t JOIN orders_master m ON t.masterOrderId = m.id WHERE t.id = ?').get(txnId)
    );
  }
  async listAllPaymentTransactions() {
    return db
      .prepare('SELECT t.*, m.orderCode FROM payment_transactions t JOIN orders_master m ON t.masterOrderId = m.id ORDER BY t.id DESC')
      .all()
      .map(mapTransactionRow);
  }

  async listProductReviews(productId: number) {
    return db
      .prepare(
        `SELECT r.*, u.fullName as buyerName, p.name as productName FROM reviews r
         JOIN users u ON r.buyerId = u.id JOIN products p ON r.productId = p.id
         WHERE r.productId = ? AND r.status = 'VISIBLE' ORDER BY r.id DESC`
      )
      .all(productId)
      .map(mapReviewRow);
  }
  async listAllReviews() {
    return db
      .prepare(
        'SELECT r.*, u.fullName as buyerName, p.name as productName FROM reviews r JOIN users u ON r.buyerId = u.id JOIN products p ON r.productId = p.id ORDER BY r.id DESC'
      )
      .all()
      .map(mapReviewRow);
  }
  async createVerifiedReview(buyerId: number, productId: number, rating: number, comment: string) {
    const subOrders = db
      .prepare("SELECT id, itemsJson FROM orders_sub WHERE buyerId = ? AND (orderStatus = 'COMPLETED' OR shippingStatus IN ('DELIVERED', 'COMPLETED'))")
      .all(buyerId) as Array<{ id: number; itemsJson: string }>;
    const matchedSub = subOrders.find((s) => (JSON.parse(s.itemsJson || '[]') as OrderItemSnapshot[]).some((i) => i.productId === productId));
    if (!matchedSub) throw new Error('NOT_VERIFIED_BUYER');
    const already = db.prepare('SELECT id FROM reviews WHERE productId = ? AND buyerId = ?').get(productId, buyerId);
    if (already) throw new Error('ALREADY_REVIEWED');

    const now = new Date().toISOString();
    const revRow = db.transaction(() => {
      const revId = Number(
        db
          .prepare("INSERT INTO reviews (productId, buyerId, subOrderId, rating, comment, status, createdAt) VALUES (?, ?, ?, ?, ?, 'VISIBLE', ?)")
          .run(productId, buyerId, matchedSub.id, rating, comment, now).lastInsertRowid
      );
      const stats = db.prepare("SELECT AVG(rating) as avgRating, COUNT(*) as cnt FROM reviews WHERE productId = ? AND status = 'VISIBLE'").get(productId) as any;
      db.prepare('UPDATE products SET ratingAvg = ?, reviewCount = ? WHERE id = ?').run(Math.round((stats.avgRating || 5) * 10) / 10, stats.cnt, productId);
      return db
        .prepare('SELECT r.*, u.fullName as buyerName, p.name as productName FROM reviews r JOIN users u ON r.buyerId = u.id JOIN products p ON r.productId = p.id WHERE r.id = ?')
        .get(revId);
    })();
    return mapReviewRow(revRow);
  }
  async setReviewStatus(id: number, status: 'VISIBLE' | 'HIDDEN') {
    db.prepare('UPDATE reviews SET status = ? WHERE id = ?').run(status, id);
  }

  async listBuyerTickets(buyerId: number) {
    return db
      .prepare(
        `SELECT t.*, s.subOrderCode, sh.name as shopName, u.fullName as buyerName FROM support_tickets t
         JOIN orders_sub s ON t.subOrderId = s.id JOIN shops sh ON t.shopId = sh.id JOIN users u ON t.buyerId = u.id
         WHERE t.buyerId = ? ORDER BY t.id DESC`
      )
      .all(buyerId)
      .map(mapTicketRow);
  }
  async listSellerTickets(shopId: number) {
    return db
      .prepare(
        `SELECT t.*, s.subOrderCode, sh.name as shopName, u.fullName as buyerName FROM support_tickets t
         JOIN orders_sub s ON t.subOrderId = s.id JOIN shops sh ON t.shopId = sh.id JOIN users u ON t.buyerId = u.id
         WHERE t.shopId = ? ORDER BY t.id DESC`
      )
      .all(shopId)
      .map(mapTicketRow);
  }
  async listAllTickets() {
    return db
      .prepare(
        `SELECT t.*, s.subOrderCode, sh.name as shopName, u.fullName as buyerName FROM support_tickets t
         JOIN orders_sub s ON t.subOrderId = s.id JOIN shops sh ON t.shopId = sh.id JOIN users u ON t.buyerId = u.id
         ORDER BY t.id DESC`
      )
      .all()
      .map(mapTicketRow);
  }
  async createTicket(buyerId: number, subOrderId: number, type: SupportTicket['type'], reason: string) {
    const sub = db.prepare('SELECT * FROM orders_sub WHERE id = ? AND buyerId = ?').get(subOrderId, buyerId) as any;
    if (!sub) throw new Error('SUBORDER_NOT_FOUND');
    const now = new Date().toISOString();
    const id = db.transaction(() => {
      const tid = Number(
        db
          .prepare("INSERT INTO support_tickets (subOrderId, masterOrderId, buyerId, shopId, type, reason, status, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, 'OPEN', ?, ?)")
          .run(sub.id, sub.masterOrderId, buyerId, sub.shopId, type, reason, now, now).lastInsertRowid
      );
      if (type === 'RETURN' || type === 'REFUND') {
        db.prepare("UPDATE orders_sub SET orderStatus = 'RETURN_REQUESTED', updatedAt = ? WHERE id = ?").run(now, sub.id);
      }
      return tid;
    })();
    return mapTicketRow(
      db
        .prepare(
          `SELECT t.*, s.subOrderCode, sh.name as shopName, u.fullName as buyerName FROM support_tickets t
           JOIN orders_sub s ON t.subOrderId = s.id JOIN shops sh ON t.shopId = sh.id JOIN users u ON t.buyerId = u.id WHERE t.id = ?`
        )
        .get(id)
    );
  }
  async sellerRespondTicket(id: number, shopId: number, approve: boolean, note: string) {
    const status = approve ? 'SELLER_APPROVED' : 'REJECTED';
    return (
      db
        .prepare('UPDATE support_tickets SET status = ?, resolutionNote = ?, updatedAt = ? WHERE id = ? AND shopId = ?')
        .run(status, note, new Date().toISOString(), id, shopId).changes > 0
    );
  }
  async adminResolveTicket(id: number, action: 'REFUND' | 'REJECT', note: string) {
    const ticket = db.prepare('SELECT * FROM support_tickets WHERE id = ?').get(id) as any;
    if (!ticket) return false;
    const now = new Date().toISOString();
    db.transaction(() => {
      if (action === 'REFUND') {
        db.prepare("UPDATE support_tickets SET status = 'ADMIN_APPROVED_REFUND', resolutionNote = ?, updatedAt = ? WHERE id = ?").run(
          note || 'Admin đã duyệt hoàn tiền.',
          now,
          id
        );
        db.prepare("UPDATE orders_sub SET orderStatus = 'RETURNED', paymentStatus = 'REFUNDED', shippingStatus = 'RETURNED', updatedAt = ? WHERE id = ?").run(
          now,
          ticket.subOrderId
        );
        db.prepare("UPDATE affiliate_commissions SET status = 'CANCELLED', updatedAt = ? WHERE subOrderId = ? AND status IN ('PENDING', 'APPROVED')").run(
          now,
          ticket.subOrderId
        );
      } else {
        db.prepare("UPDATE support_tickets SET status = 'REJECTED', resolutionNote = ?, updatedAt = ? WHERE id = ?").run(
          note || 'Yêu cầu chưa đủ điều kiện.',
          now,
          id
        );
      }
    })();
    return true;
  }

  async listChatThreads(userId: number, ownedShopId?: number) {
    return db
      .prepare(
        `SELECT DISTINCT m.shopId, m.customerId, sh.name as shopName, u.fullName as customerName
         FROM messages m JOIN shops sh ON m.shopId = sh.id JOIN users u ON m.customerId = u.id
         WHERE m.customerId = ? ${ownedShopId ? 'OR m.shopId = ?' : ''} ORDER BY m.id DESC`
      )
      .all(...(ownedShopId ? [userId, ownedShopId] : [userId])) as any[];
  }
  async listChatMessages(shopId: number, customerId: number) {
    return db
      .prepare(
        'SELECT m.*, sh.name as shopName, u.fullName as customerName FROM messages m JOIN shops sh ON m.shopId = sh.id JOIN users u ON m.customerId = u.id WHERE m.shopId = ? AND m.customerId = ? ORDER BY m.id ASC'
      )
      .all(shopId, customerId)
      .map(mapMessageRow);
  }
  async createChatMessage(data: any) {
    const id = Number(
      db
        .prepare('INSERT INTO messages (shopId, customerId, senderId, senderRole, productId, content, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .run(data.shopId, data.customerId, data.senderId, data.senderRole, data.productId, data.content, new Date().toISOString())
        .lastInsertRowid
    );
    return mapMessageRow(
      db
        .prepare('SELECT m.*, sh.name as shopName, u.fullName as customerName FROM messages m JOIN shops sh ON m.shopId = sh.id JOIN users u ON m.customerId = u.id WHERE m.id = ?')
        .get(id)
    );
  }

  async getAffiliateByUserId(userId: number) {
    const row = db
      .prepare('SELECT a.*, u.fullName as userName, u.email as userEmail FROM affiliates a JOIN users u ON a.userId = u.id WHERE a.userId = ?')
      .get(userId);
    return row ? mapAffiliateRow(row) : null;
  }
  async getApprovedAffiliateByCode(refCode: string) {
    const row = db
      .prepare("SELECT a.*, u.fullName as userName, u.email as userEmail FROM affiliates a JOIN users u ON a.userId = u.id WHERE a.refCode = ? AND a.status = 'APPROVED'")
      .get(refCode);
    return row ? mapAffiliateRow(row) : null;
  }
  async registerAffiliate(userId: number, refCode: string, bankInfo: string) {
    const affId = db.transaction(() => {
      const id = Number(
        db
          .prepare("INSERT INTO affiliates (userId, refCode, status, bankInfo, totalClicks, createdAt) VALUES (?, ?, 'PENDING', ?, 0, ?)")
          .run(userId, refCode, bankInfo, new Date().toISOString()).lastInsertRowid
      );
      const u = db.prepare('SELECT rolesJson FROM users WHERE id = ?').get(userId) as any;
      const roles = JSON.parse(u.rolesJson || '["customer"]') as UserRole[];
      if (!roles.includes('affiliate')) roles.push('affiliate');
      db.prepare('UPDATE users SET rolesJson = ? WHERE id = ?').run(JSON.stringify(roles), userId);
      return id;
    })();
    return {
      affiliate: mapAffiliateRow(db.prepare('SELECT * FROM affiliates WHERE id = ?').get(affId)),
      user: mapUserRow(db.prepare('SELECT * FROM users WHERE id = ?').get(userId)),
    };
  }
  async recordAffiliateClick(affiliateId: number, productId: number | null, ipHash: string) {
    db.transaction(() => {
      db.prepare('INSERT INTO affiliate_clicks (affiliateId, productId, ipHash, createdAt) VALUES (?, ?, ?, ?)').run(
        affiliateId,
        productId,
        ipHash,
        new Date().toISOString()
      );
      db.prepare('UPDATE affiliates SET totalClicks = totalClicks + 1 WHERE id = ?').run(affiliateId);
    })();
  }
  async listAffiliateCommissions(affiliateId: number) {
    return db
      .prepare(
        `SELECT c.*, a.refCode, s.subOrderCode FROM affiliate_commissions c
         JOIN affiliates a ON c.affiliateId = a.id JOIN orders_sub s ON c.subOrderId = s.id
         WHERE c.affiliateId = ? ORDER BY c.id DESC`
      )
      .all(affiliateId)
      .map(mapAffiliateCommissionRow);
  }
  async listAllAffiliates() {
    return db
      .prepare('SELECT a.*, u.fullName as userName, u.email as userEmail FROM affiliates a JOIN users u ON a.userId = u.id ORDER BY a.id DESC')
      .all()
      .map(mapAffiliateRow);
  }
  async listAllAffiliateCommissions() {
    return db
      .prepare(
        `SELECT c.*, a.refCode, s.subOrderCode FROM affiliate_commissions c
         JOIN affiliates a ON c.affiliateId = a.id JOIN orders_sub s ON c.subOrderId = s.id
         ORDER BY c.id DESC`
      )
      .all()
      .map(mapAffiliateCommissionRow);
  }
  async updateAffiliateStatus(id: number, status: AffiliateProfile['status']) {
    db.prepare('UPDATE affiliates SET status = ? WHERE id = ?').run(status, id);
  }
  async payoutAffiliateCommission(id: number) {
    db.prepare("UPDATE affiliate_commissions SET status = 'PAID', updatedAt = ? WHERE id = ? AND status = 'APPROVED'").run(
      new Date().toISOString(),
      id
    );
  }
}
