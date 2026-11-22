import crypto from 'node:crypto';
import { MongoClient, type Db } from 'mongodb';
import { hashPassword, signSandboxPayload } from './auth.ts';
import type { CreateOrderInput, IDataStore, StoredPaymentTransaction, StoredUserRecord } from './store.ts';
import type {
  Address,
  AffiliateCommission,
  AffiliateProfile,
  Category,
  ChatMessage,
  MasterOrder,
  OrderItemSnapshot,
  PaymentStatus,
  PaymentTransaction,
  Product,
  Review,
  Shop,
  SubOrder,
  SupportTicket,
  User,
  UserRole,
  Voucher,
} from '../src/types.ts';

function stripMongoId<T extends Record<string, any>>(doc: T | null): T | null {
  if (!doc) return null;
  const { _id, ...rest } = doc;
  void _id;
  return rest as T;
}

export class MongoStore implements IDataStore {
  readonly driverName = 'mongodb' as const;
  private client: MongoClient;
  private db!: Db;

  constructor(private uri: string, private dbName: string) {
    this.client = new MongoClient(uri, {
      serverSelectionTimeoutMS: 5000,
    });
  }

  async connectAndInit(): Promise<void> {
    await this.client.connect();
    this.db = this.client.db(this.dbName);

    // Ensure unique indexes
    await Promise.all([
      this.db.collection('users').createIndex({ id: 1 }, { unique: true }),
      this.db.collection('users').createIndex({ email: 1 }, { unique: true }),
      this.db.collection('shops').createIndex({ id: 1 }, { unique: true }),
      this.db.collection('shops').createIndex({ ownerId: 1 }, { unique: true }),
      this.db.collection('shops').createIndex({ slug: 1 }, { unique: true }),
      this.db.collection('categories').createIndex({ id: 1 }, { unique: true }),
      this.db.collection('products').createIndex({ id: 1 }, { unique: true }),
      this.db.collection('products').createIndex({ slug: 1 }, { unique: true }),
      this.db.collection('vouchers').createIndex({ id: 1 }, { unique: true }),
      this.db.collection('vouchers').createIndex({ code: 1 }, { unique: true }),
      this.db.collection('orders_master').createIndex({ id: 1 }, { unique: true }),
      this.db.collection('orders_sub').createIndex({ id: 1 }, { unique: true }),
      this.db.collection('payment_transactions').createIndex({ id: 1 }, { unique: true }),
      this.db.collection('payment_transactions').createIndex({ idempotencyKey: 1 }, { unique: true }),
      this.db.collection('affiliates').createIndex({ id: 1 }, { unique: true }),
      this.db.collection('affiliates').createIndex({ userId: 1 }, { unique: true }),
      this.db.collection('affiliates').createIndex({ refCode: 1 }, { unique: true }),
      this.db.collection('platform_settings').createIndex({ key: 1 }, { unique: true }),
    ]);

    await this.seedIfEmpty();
  }

  private async nextSeq(name: string): Promise<number> {
    const res = await this.db.collection('counters').findOneAndUpdate(
      { _id: name as any },
      { $inc: { seq: 1 } },
      { upsert: true, returnDocument: 'after' }
    );
    return Number((res as any)?.seq || 1);
  }

  private async seedIfEmpty() {
    const count = await this.db.collection('users').countDocuments();
    if (count > 0) return;

    const now = new Date().toISOString();
    const demoPass = hashPassword('DemoCraft2026!');

    await this.setSetting('platformCommissionRate', '8');
    await this.setSetting('affiliateCommissionRate', '5');
    await this.setSetting('defaultShippingFee', '30000');

    const buyer = await this.createUser({
      email: 'khachhang@mocmen.vn',
      passwordHash: demoPass,
      fullName: 'Nguyễn Minh Anh',
      phone: '0912345678',
      roles: ['customer', 'affiliate'],
    });
    const seller1 = await this.createUser({
      email: 'gom@mocmen.vn',
      passwordHash: demoPass,
      fullName: 'Nghệ nhân Trần Văn Minh',
      phone: '0987111222',
      roles: ['customer', 'seller'],
    });
    const seller2 = await this.createUser({
      email: 'maytre@mocmen.vn',
      passwordHash: demoPass,
      fullName: 'Nghệ nhân Lê Thị Hương',
      phone: '0987333444',
      roles: ['customer', 'seller'],
    });
    const seller3 = await this.createUser({
      email: 'sonmai@mocmen.vn',
      passwordHash: demoPass,
      fullName: 'Nghệ nhân Phạm Quốc Bảo',
      phone: '0987555666',
      roles: ['customer', 'seller'],
    });

    const buyerAddr = await this.createAddress(buyer.id, {
      recipientName: 'Nguyễn Minh Anh',
      phone: '0912345678',
      province: 'TP. Hà Nội',
      district: 'Quận Hoàn Kiếm',
      ward: 'Phường Tràng Tiền',
      street: '28 Lý Thường Kiệt',
      isDefault: true,
    });

    const insertApprovedShop = async (data: Omit<Shop, 'id' | 'createdAt' | 'status'>) => {
      const id = await this.nextSeq('shops');
      const doc: Shop = { ...data, id, status: 'APPROVED', createdAt: now };
      await this.db.collection('shops').insertOne(doc as any);
      return doc;
    };

    const shop1 = await insertApprovedShop({
      ownerId: seller1.id,
      name: 'Lò Gốm Minh Tâm',
      slug: 'lo-gom-minh-tam',
      craftVillage: 'Bát Tràng, Gia Lâm, Hà Nội',
      description: 'Xưởng gốm gia truyền 4 đời chuyên dòng men ngọc rạn cổ và gốm trà đạo nung củi truyền thống.',
      logoUrl: '/src/assets/images/prod_ceramic_vase_1795250373703.jpg',
      bannerUrl: '/src/assets/images/hero_craft_atelier_1795250373033.jpg',
      contactPhone: '0987111222',
      contactEmail: 'gom@mocmen.vn',
    });
    const shop2 = await insertApprovedShop({
      ownerId: seller2.id,
      name: 'Mây Tre Phú Vinh',
      slug: 'may-tre-phu-vinh',
      craftVillage: 'Phú Vinh, Chương Mỹ, Hà Nội',
      description: 'Hợp tác xã đan lát thủ công mỹ nghệ từ song mây tự nhiên xử lý hun khói không hóa chất.',
      logoUrl: '/src/assets/images/prod_rattan_bag_1795250373275.jpg',
      bannerUrl: '/src/assets/images/hero_craft_atelier_1795250373033.jpg',
      contactPhone: '0987333444',
      contactEmail: 'maytre@mocmen.vn',
    });
    const shop3 = await insertApprovedShop({
      ownerId: seller3.id,
      name: 'Xưởng Sơn Mài & Lụa Kinh Kỳ',
      slug: 'xuong-son-mai-kinh-ky',
      craftVillage: 'Hạ Thái & Nha Xá',
      description: 'Quy tụ các tác phẩm sơn mài khảm trai, lụa tơ tằm dệt tay và đồ gỗ chạm khắc tinh xảo.',
      logoUrl: '/src/assets/images/prod_lacquer_tray_1795250373747.jpg',
      bannerUrl: '/src/assets/images/hero_craft_atelier_1795250373033.jpg',
      contactPhone: '0987555666',
      contactEmail: 'sonmai@mocmen.vn',
    });

    const catCeramic = await this.createCategory({ name: 'Gốm Sứ Nghệ Thuật', slug: 'gom-su', description: 'Bình hoa, ấm chén men rạn, men ngọc Bát Tràng và Chu Đậu.', materialFocus: 'Đất sét trắng, men tro trấu' });
    const catRattan = await this.createCategory({ name: 'Mây Tre Đan', slug: 'may-tre', description: 'Túi xách, giỏ trang trí, đèn mây tre thủ công Phú Vinh.', materialFocus: 'Song mây, tre già hun khói' });
    const catLacquer = await this.createCategory({ name: 'Sơn Mài Khảm Trai', slug: 'son-mai', description: 'Khay trà, hộp trang sức sơn ta Hạ Thái.', materialFocus: 'Sơn ta Phú Thọ, vỏ trai, vàng quỳ' });
    const catSilk = await this.createCategory({ name: 'Lụa & Dệt Thủ Công', slug: 'lua-det', description: 'Khăn choàng lụa tơ tằm nhuộm chàm tự nhiên Nha Xá.', materialFocus: 'Tơ tằm 100%, màu nhuộm thảo mộc' });
    const catWood = await this.createCategory({ name: 'Mộc Mỹ Nghệ', slug: 'moc-my-nghe', description: 'Hộp trà, bát gỗ nguyên khối chạm khắc Đồng Kỵ.', materialFocus: 'Gỗ hương, gỗ trắc tự nhiên' });

    const futureFlashEnd = new Date(Date.now() + 1000 * 60 * 60 * 48).toISOString();
    const seedProd = async (doc: Omit<Product, 'id' | 'createdAt' | 'status' | 'shopName' | 'shopVillage' | 'categoryName'>) => {
      const id = await this.nextSeq('products');
      await this.db.collection('products').insertOne({ ...doc, id, status: 'APPROVED', createdAt: now } as any);
      return id;
    };

    const p1Id = await seedProd({
      shopId: shop1.id,
      categoryId: catCeramic.id,
      name: 'Bình Hoa Men Ngọc Lục Bảo Đắp Nổi Liên Hoa',
      slug: 'binh-hoa-men-ngoc-lien-hoa',
      material: 'Gốm men rạn cổ',
      originVillage: 'Bát Tràng, Hà Nội',
      description: 'Bình gốm vuốt tay hoàn toàn trên bàn xoay, phủ lớp men ngọc rạn đặc trưng và chạm nổi hoa sen thanh khiết.',
      artisanStory: 'Nghệ nhân Trần Văn Minh mất 14 ngày từ khâu lọc đất cao lanh, tạo dáng, khắc tỉa từng cánh sen đến 36 giờ canh lửa lò nung.',
      basePrice: 1650000,
      flashSalePrice: 1420000,
      flashSaleEnd: futureFlashEnd,
      quantityDiscountMin: 2,
      quantityDiscountPercent: 5,
      stock: 14,
      isMadeToOrder: false,
      productionDays: 0,
      isPromoted: true,
      images: ['/src/assets/images/prod_ceramic_vase_1795250373703.jpg', '/src/assets/images/hero_craft_atelier_1795250373033.jpg'],
      variants: [
        { id: 'v1-m', color: 'Men Ngọc Cổ', size: 'Cao 28cm', material: 'Đất cao lanh', priceDelta: 0, stock: 8 },
        { id: 'v1-l', color: 'Men Ngọc Sâu', size: 'Cao 36cm', material: 'Đất cao lanh', priceDelta: 450000, stock: 6 },
      ],
      soldCount: 32,
      ratingAvg: 4.9,
      reviewCount: 1,
    });

    const p2Id = await seedProd({
      shopId: shop2.id,
      categoryId: catRattan.id,
      name: 'Túi Xách Mây Đan Thủ Công Quai Da Bò Phú Vinh',
      slug: 'tui-xach-may-dan-phu-vinh',
      material: 'Song mây tự nhiên & da thuộc',
      originVillage: 'Phú Vinh, Hà Nội',
      description: 'Chiếc túi cấu trúc hộp chữ nhật đan xương cá mật độ cao từ sợi mây chuốt mảnh 1.5mm, phối quai da bò thật.',
      artisanStory: 'Mỗi chiếc túi được chị Lê Thị Hương cùng các thợ lành nghề làng Phú Vinh hoàn thiện tỉ mỉ trong 4 ngày liên tục.',
      basePrice: 890000,
      flashSalePrice: null,
      flashSaleEnd: null,
      quantityDiscountMin: 3,
      quantityDiscountPercent: 8,
      stock: 18,
      isMadeToOrder: false,
      productionDays: 0,
      isPromoted: true,
      images: ['/src/assets/images/prod_rattan_bag_1795250373275.jpg'],
      variants: [
        { id: 'v2-nat', color: 'Mây Vàng Mật', size: '24 x 18 x 9cm', material: 'Mây tự nhiên + Da nâu', priceDelta: 0, stock: 10 },
        { id: 'v2-smk', color: 'Mây Hun Khói', size: '28 x 21 x 10cm', material: 'Mây hun khói + Da đen', priceDelta: 120000, stock: 8 },
      ],
      soldCount: 47,
      ratingAvg: 4.8,
      reviewCount: 1,
    });

    await seedProd({
      shopId: shop3.id,
      categoryId: catLacquer.id,
      name: 'Khay Trà Sơn Mài Đen Khảm Trai Trúc Lâm',
      slug: 'khay-tra-son-mai-kham-trai',
      material: 'Sơn ta & vỏ trai biển',
      originVillage: 'Hạ Thái, Thường Tín',
      description: 'Khay chữ nhật bo góc mềm mại, 12 lớp sơn ta ủ ẩm và mài nước thủ công tạo độ sâu như gương.',
      artisanStory: 'Mỗi lớp sơn cần 3 ngày ủ khô trong phòng ẩm trước khi nghệ nhân dùng đá mài mịn từng milimet bề mặt.',
      basePrice: 1950000,
      flashSalePrice: null,
      flashSaleEnd: null,
      quantityDiscountMin: 2,
      quantityDiscountPercent: 6,
      stock: 9,
      isMadeToOrder: true,
      productionDays: 7,
      isPromoted: true,
      images: ['/src/assets/images/prod_lacquer_tray_1795250373747.jpg'],
      variants: [
        { id: 'v3-std', color: 'Đen Huyền Khảm Trai', size: '38 x 26cm', material: 'Gỗ vông + Sơn ta', priceDelta: 0, stock: 9 },
        { id: 'v3-big', color: 'Đen Huyền Khảm Vàng Quỳ', size: '45 x 30cm', material: 'Gỗ vông + Sơn ta + Vàng quỳ', priceDelta: 550000, stock: 4 },
      ],
      soldCount: 19,
      ratingAvg: 5.0,
      reviewCount: 0,
    });

    await seedProd({
      shopId: shop3.id,
      categoryId: catSilk.id,
      name: 'Khăn Choàng Lụa Tơ Tằm Nha Xá Nhuộm Chàm Thảo Mộc',
      slug: 'khan-choang-lua-nha-xa-nhuom-cham',
      material: 'Lụa tơ tằm 100%',
      originVillage: 'Nha Xá, Hà Nam',
      description: 'Khăn dệt trên khung cửi gỗ truyền thống với sợi tơ tằm tự nhiên thoáng nhẹ, nhuộm từ lá chàm và vỏ cây.',
      artisanStory: 'Nước nhuộm hoàn toàn từ cây chàm và củ nâu thu hái theo mùa, không hóa chất công nghiệp.',
      basePrice: 760000,
      flashSalePrice: 680000,
      flashSaleEnd: futureFlashEnd,
      quantityDiscountMin: 2,
      quantityDiscountPercent: 10,
      stock: 25,
      isMadeToOrder: false,
      productionDays: 0,
      isPromoted: false,
      images: ['/src/assets/images/prod_silk_scarf_1795250373557.jpg'],
      variants: [
        { id: 'v4-ind', color: 'Chàm Phối Rêu', size: '190 x 65cm', material: 'Lụa đũi tơ tằm', priceDelta: 0, stock: 15 },
        { id: 'v4-sag', color: 'Xanh Rêu Trầm', size: '190 x 65cm', material: 'Lụa satin tơ tằm', priceDelta: 90000, stock: 10 },
      ],
      soldCount: 41,
      ratingAvg: 4.9,
      reviewCount: 0,
    });

    await seedProd({
      shopId: shop3.id,
      categoryId: catWood.id,
      name: 'Hộp Đựng Trà Gỗ Hương Chạm Tứ Quý & Bát Gỗ Mộng Đuôi Én',
      slug: 'hop-tra-go-huong-cham-tu-quy',
      material: 'Gỗ hương đỏ tự nhiên',
      originVillage: 'Đồng Kỵ, Bắc Ninh',
      description: 'Bộ hộp đựng trà nắp kín giữ hương chạm nổi họa tiết hoa sen đi kèm bát gỗ ghép mộng đuôi én.',
      artisanStory: 'Nghệ nhân Phạm Quốc Bảo chọn gỗ lõi già và đánh bóng bằng lá chuối khô cùng sáp ong rừng.',
      basePrice: 2350000,
      flashSalePrice: null,
      flashSaleEnd: null,
      quantityDiscountMin: null,
      quantityDiscountPercent: null,
      stock: 6,
      isMadeToOrder: true,
      productionDays: 10,
      isPromoted: false,
      images: ['/src/assets/images/prod_wood_tea_box_1795250373719.jpg'],
      variants: [
        { id: 'v5-box', color: 'Nâu Gỗ Hương', size: 'Hộp trà 18cm', material: 'Gỗ hương nguyên khối', priceDelta: 0, stock: 6 },
        { id: 'v5-set', color: 'Nâu Gỗ Hương (Bộ Đôi)', size: 'Hộp trà + Bát ghép mộng', material: 'Gỗ hương', priceDelta: 850000, stock: 3 },
      ],
      soldCount: 12,
      ratingAvg: 5.0,
      reviewCount: 0,
    });

    await seedProd({
      shopId: shop1.id,
      categoryId: catCeramic.id,
      name: 'Bộ Ấm Chén Trà Đạo Men Rạn Quai Mây Bát Tràng',
      slug: 'bo-am-chen-men-ran-quai-may',
      material: 'Gốm men rạn & quai mây',
      originVillage: 'Bát Tràng, Hà Nội',
      description: 'Ấm tích dáng bầu phối quai mây uốn nhiệt thủ công cùng 6 chén trà men ngọc rạn cổ.',
      artisanStory: 'Sự kết hợp giữa đất sét sông Hồng của làng Bát Tràng và nghệ thuật uốn mây Phú Vinh.',
      basePrice: 1280000,
      flashSalePrice: null,
      flashSaleEnd: null,
      quantityDiscountMin: 2,
      quantityDiscountPercent: 5,
      stock: 11,
      isMadeToOrder: false,
      productionDays: 0,
      isPromoted: false,
      images: ['/src/assets/images/hero_craft_atelier_1795250373033.jpg', '/src/assets/images/prod_ceramic_vase_1795250373703.jpg'],
      variants: [{ id: 'v6-set', color: 'Men Ngọc Rạn', size: 'Ấm 450ml + 6 chén', material: 'Gốm + Mây', priceDelta: 0, stock: 11 }],
      soldCount: 27,
      ratingAvg: 4.8,
      reviewCount: 0,
    });

    await this.createVoucher({ scope: 'PLATFORM', shopId: null, code: 'LANGNGHE10', title: 'Giảm 10% toàn sàn (tối đa 250.000đ)', discountType: 'PERCENT', discountValue: 10, maxDiscountAmount: 250000, minOrderValue: 500000, usageLimit: 500 });
    await this.createVoucher({ scope: 'PLATFORM', shopId: null, code: 'FREESHIPVN', title: 'Miễn phí vận chuyển toàn sàn', discountType: 'FREE_SHIP', discountValue: 30000, maxDiscountAmount: 90000, minOrderValue: 400000, usageLimit: 500 });
    await this.createVoucher({ scope: 'SHOP', shopId: shop1.id, code: 'GOMBATTRANG', title: 'Giảm 100.000đ cho đơn từ 1.000.000đ tại Lò Gốm Minh Tâm', discountType: 'FIXED', discountValue: 100000, maxDiscountAmount: 100000, minOrderValue: 1000000, usageLimit: 200 });
    await this.createVoucher({ scope: 'SHOP', shopId: shop2.id, code: 'PHUVINH50K', title: 'Giảm 50.000đ cho đơn Mây Tre Phú Vinh từ 600.000đ', discountType: 'FIXED', discountValue: 50000, maxDiscountAmount: 50000, minOrderValue: 600000, usageLimit: 200 });

    const affId = await this.nextSeq('affiliates');
    await this.db.collection('affiliates').insertOne({
      id: affId,
      userId: buyer.id,
      refCode: 'MINHANH26',
      status: 'APPROVED',
      bankInfo: 'Vietcombank - 0011004289102 - NGUYEN MINH ANH',
      totalClicks: 24,
      createdAt: now,
    });

    // Seed initial multi-vendor completed order
    const mId = await this.nextSeq('orders_master');
    await this.db.collection('orders_master').insertOne({
      id: mId,
      orderCode: 'MM-202611-0001',
      buyerId: buyer.id,
      shippingAddress: buyerAddr,
      paymentMethod: 'SANDBOX_GATEWAY',
      paymentStatus: 'PAID',
      platformVoucherCode: 'LANGNGHE10',
      subtotalAmount: 2310000,
      shippingTotal: 60000,
      platformDiscountTotal: 231000,
      shopDiscountTotal: 0,
      grandTotal: 2139000,
      affiliateCode: null,
      createdAt: now,
    });

    const sub1Id = await this.nextSeq('orders_sub');
    await this.db.collection('orders_sub').insertOne({
      id: sub1Id,
      masterOrderId: mId,
      subOrderCode: 'MM-202611-0001-S1',
      shopId: shop1.id,
      buyerId: buyer.id,
      items: [{ productId: p1Id, productName: 'Bình Hoa Men Ngọc Lục Bảo Đắp Nổi Liên Hoa', productImage: '/src/assets/images/prod_ceramic_vase_1795250373703.jpg', variantId: 'v1-m', variantLabel: 'Men Ngọc Cổ · Cao 28cm', quantity: 1, unitPrice: 1420000, lineDiscount: 0, lineSubtotal: 1420000, isMadeToOrder: false, productionDays: 0 }],
      subtotal: 1420000,
      shippingFee: 30000,
      shopDiscount: 0,
      allocatedPlatformDiscount: 142000,
      finalTotal: 1308000,
      commissionRate: 8,
      commissionFee: 113600,
      affiliateCommissionFee: 0,
      sellerNetAmount: 1306400,
      orderStatus: 'COMPLETED',
      paymentStatus: 'PAID',
      shippingStatus: 'COMPLETED',
      trackingCode: 'GHN-BT-882910',
      carrierName: 'Giao Hàng Nhanh',
      createdAt: now,
      updatedAt: now,
    });

    const sub2Id = await this.nextSeq('orders_sub');
    await this.db.collection('orders_sub').insertOne({
      id: sub2Id,
      masterOrderId: mId,
      subOrderCode: 'MM-202611-0001-S2',
      shopId: shop2.id,
      buyerId: buyer.id,
      items: [{ productId: p2Id, productName: 'Túi Xách Mây Đan Thủ Công Quai Da Bò Phú Vinh', productImage: '/src/assets/images/prod_rattan_bag_1795250373275.jpg', variantId: 'v2-nat', variantLabel: 'Mây Vàng Mật · 24 x 18 x 9cm', quantity: 1, unitPrice: 890000, lineDiscount: 0, lineSubtotal: 890000, isMadeToOrder: false, productionDays: 0 }],
      subtotal: 890000,
      shippingFee: 30000,
      shopDiscount: 0,
      allocatedPlatformDiscount: 89000,
      finalTotal: 831000,
      commissionRate: 8,
      commissionFee: 71200,
      affiliateCommissionFee: 0,
      sellerNetAmount: 818800,
      orderStatus: 'COMPLETED',
      paymentStatus: 'PAID',
      shippingStatus: 'COMPLETED',
      trackingCode: 'GHTK-PV-441022',
      carrierName: 'Giao Hàng Tiết Kiệm',
      createdAt: now,
      updatedAt: now,
    });

    const txnId = await this.nextSeq('payment_transactions');
    await this.db.collection('payment_transactions').insertOne({
      id: txnId,
      masterOrderId: mId,
      transactionCode: 'TXN-202611-0001',
      idempotencyKey: 'idem_seed_0001',
      method: 'SANDBOX_GATEWAY',
      amount: 2139000,
      status: 'SUCCEEDED',
      gatewaySignature: 'verified_seed_hmac',
      createdAt: now,
      updatedAt: now,
    });

    const r1Id = await this.nextSeq('reviews');
    await this.db.collection('reviews').insertOne({
      id: r1Id,
      productId: p1Id,
      buyerId: buyer.id,
      subOrderId: sub1Id,
      rating: 5,
      comment: 'Men ngọc rạn cực kỳ có chiều sâu, họa tiết sen đắp nổi tinh xảo hơn cả ảnh chụp.',
      status: 'VISIBLE',
      createdAt: now,
    });

    const r2Id = await this.nextSeq('reviews');
    await this.db.collection('reviews').insertOne({
      id: r2Id,
      productId: p2Id,
      buyerId: buyer.id,
      subOrderId: sub2Id,
      rating: 5,
      comment: 'Sợi mây đan rất khít và đều tay, mùi thơm tự nhiên nhẹ nhàng.',
      status: 'VISIBLE',
      createdAt: now,
    });
  }

  async getSetting(key: string, fallback: string) {
    const doc = await this.db.collection('platform_settings').findOne({ key: String(key) });
    return doc ? String(doc.value) : fallback;
  }
  async setSetting(key: string, value: string) {
    await this.db.collection('platform_settings').updateOne(
      { key: String(key) },
      { $set: { key: String(key), value: String(value) } },
      { upsert: true }
    );
  }

  async getUserById(id: number): Promise<StoredUserRecord | null> {
    const doc = await this.db.collection('users').findOne({ id: Number(id) });
    return stripMongoId(doc as any);
  }
  async getUserByEmail(email: string): Promise<StoredUserRecord | null> {
    const doc = await this.db.collection('users').findOne({ email: String(email).toLowerCase() });
    return stripMongoId(doc as any);
  }
  async createUser(data: { email: string; passwordHash: string; fullName: string; phone: string; roles: UserRole[] }) {
    const id = await this.nextSeq('users');
    const doc: StoredUserRecord = {
      id,
      email: String(data.email).toLowerCase(),
      passwordHash: data.passwordHash,
      fullName: data.fullName,
      phone: data.phone,
      roles: data.roles,
      isLocked: false,
      createdAt: new Date().toISOString(),
    };
    await this.db.collection('users').insertOne(doc as any);
    return doc;
  }
  async updateUserProfile(id: number, fullName: string, phone: string): Promise<User> {
    await this.db.collection('users').updateOne({ id: Number(id) }, { $set: { fullName, phone } });
    const u = await this.getUserById(id);
    const { passwordHash: _, ...safe } = u!;
    return safe;
  }
  async updateUserRolesAndPassword(id: number, roles: UserRole[], passwordHash?: string): Promise<User> {
    const $set: Record<string, any> = { roles };
    if (passwordHash) $set.passwordHash = passwordHash;
    await this.db.collection('users').updateOne({ id: Number(id) }, { $set });
    const u = await this.getUserById(id);
    const { passwordHash: _, ...safe } = u!;
    return safe;
  }
  async listUsers(): Promise<User[]> {
    const docs = await this.db.collection('users').find().sort({ id: -1 }).toArray();
    return docs.map((d: any) => {
      const { _id, passwordHash: _, ...rest } = d;
      void _id;
      return rest as User;
    });
  }
  async setUserLock(id: number, isLocked: boolean) {
    await this.db.collection('users').updateOne({ id: Number(id) }, { $set: { isLocked: Boolean(isLocked) } });
  }

  async listAddresses(userId: number): Promise<Address[]> {
    const docs = await this.db.collection('addresses').find({ userId: Number(userId) }).sort({ isDefault: -1, id: -1 }).toArray();
    return docs.map((d) => stripMongoId(d as any)!);
  }
  async getAddressById(id: number, userId: number): Promise<Address | null> {
    const doc = await this.db.collection('addresses').findOne({ id: Number(id), userId: Number(userId) });
    return stripMongoId(doc as any);
  }
  async createAddress(userId: number, data: any): Promise<Address> {
    if (data.isDefault) {
      await this.db.collection('addresses').updateMany({ userId: Number(userId) }, { $set: { isDefault: false } });
    }
    const existing = await this.db.collection('addresses').countDocuments({ userId: Number(userId) });
    const id = await this.nextSeq('addresses');
    const doc: Address = {
      id,
      userId: Number(userId),
      recipientName: String(data.recipientName),
      phone: String(data.phone),
      province: String(data.province),
      district: String(data.district),
      ward: String(data.ward || ''),
      street: String(data.street),
      isDefault: Boolean(data.isDefault || existing === 0),
    };
    await this.db.collection('addresses').insertOne(doc as any);
    return doc;
  }
  async setDefaultAddress(id: number, userId: number) {
    const found = await this.getAddressById(id, userId);
    if (!found) return false;
    await this.db.collection('addresses').updateMany({ userId: Number(userId) }, { $set: { isDefault: false } });
    await this.db.collection('addresses').updateOne({ id: Number(id), userId: Number(userId) }, { $set: { isDefault: true } });
    return true;
  }
  async deleteAddress(id: number, userId: number) {
    const res = await this.db.collection('addresses').deleteOne({ id: Number(id), userId: Number(userId) });
    return res.deletedCount > 0;
  }
  async getWishlist(userId: number) {
    const docs = await this.db.collection('wishlist').find({ userId: Number(userId) }).sort({ createdAt: -1 }).toArray();
    return docs.map((d: any) => Number(d.productId));
  }
  async toggleWishlist(userId: number, productId: number) {
    const exists = await this.db.collection('wishlist').findOne({ userId: Number(userId), productId: Number(productId) });
    if (exists) {
      await this.db.collection('wishlist').deleteOne({ userId: Number(userId), productId: Number(productId) });
      return false;
    }
    await this.db.collection('wishlist').insertOne({ userId: Number(userId), productId: Number(productId), createdAt: new Date().toISOString() });
    return true;
  }
  async mergeWishlist(userId: number, productIds: number[]) {
    const uid = Number(userId);
    const now = new Date().toISOString();
    const cleanIds = Array.from(new Set(productIds.map(Number).filter((id) => Number.isInteger(id) && id > 0)));
    if (cleanIds.length > 0) {
      const validProducts = await this.db
        .collection('products')
        .find({ id: { $in: cleanIds } }, { projection: { id: 1 } })
        .toArray();
      const validIds = validProducts.map((p: any) => Number(p.id));
      for (const pid of validIds) {
        const exists = await this.db.collection('wishlist').findOne({ userId: uid, productId: pid });
        if (!exists) {
          await this.db.collection('wishlist').insertOne({ userId: uid, productId: pid, createdAt: now });
        }
      }
    }
    return this.getWishlist(uid);
  }
  async clearWishlist(userId: number) {
    await this.db.collection('wishlist').deleteMany({ userId: Number(userId) });
  }

  async listApprovedShops(): Promise<Shop[]> {
    const docs = await this.db.collection('shops').find({ status: 'APPROVED' }).sort({ id: 1 }).toArray();
    return docs.map((d) => stripMongoId(d as any)!);
  }
  async listAllShops(): Promise<Shop[]> {
    const docs = await this.db.collection('shops').find().sort({ id: -1 }).toArray();
    return docs.map((d) => stripMongoId(d as any)!);
  }
  async getShopById(id: number): Promise<Shop | null> {
    const doc = await this.db.collection('shops').findOne({ id: Number(id) });
    return stripMongoId(doc as any);
  }
  async getShopByOwner(ownerId: number): Promise<Shop | null> {
    const doc = await this.db.collection('shops').findOne({ ownerId: Number(ownerId) });
    return stripMongoId(doc as any);
  }
  async createShop(data: any): Promise<Shop> {
    const id = await this.nextSeq('shops');
    const doc: Shop = {
      id,
      ownerId: Number(data.ownerId),
      name: String(data.name),
      slug: String(data.slug),
      craftVillage: String(data.craftVillage),
      description: String(data.description),
      logoUrl: String(data.logoUrl),
      bannerUrl: String(data.bannerUrl),
      contactPhone: String(data.contactPhone),
      contactEmail: String(data.contactEmail),
      status: 'PENDING',
      createdAt: new Date().toISOString(),
    };
    await this.db.collection('shops').insertOne(doc as any);
    const u = await this.getUserById(data.ownerId);
    if (u && !u.roles.includes('seller')) {
      await this.updateUserRolesAndPassword(u.id, [...u.roles, 'seller']);
    }
    return doc;
  }
  async updateShop(shopId: number, ownerId: number, data: any): Promise<Shop | null> {
    const res = await this.db.collection('shops').updateOne(
      { id: Number(shopId), ownerId: Number(ownerId) },
      { $set: { name: data.name, craftVillage: data.craftVillage, description: data.description, contactPhone: data.contactPhone, contactEmail: data.contactEmail, logoUrl: data.logoUrl, bannerUrl: data.bannerUrl } }
    );
    if (res.matchedCount === 0) return null;
    return this.getShopById(shopId);
  }
  async updateShopStatus(shopId: number, status: Shop['status']) {
    await this.db.collection('shops').updateOne({ id: Number(shopId) }, { $set: { status } });
  }

  async listCategories(): Promise<Category[]> {
    const docs = await this.db.collection('categories').find().sort({ id: 1 }).toArray();
    return docs.map((d) => stripMongoId(d as any)!);
  }
  async createCategory(data: any): Promise<Category> {
    const id = await this.nextSeq('categories');
    const doc: Category = { id, name: data.name, slug: data.slug, description: data.description, materialFocus: data.materialFocus };
    await this.db.collection('categories').insertOne(doc as any);
    return doc;
  }
  async deleteCategory(id: number) {
    const c = await this.db.collection('products').countDocuments({ categoryId: Number(id) });
    if (c > 0) return { deleted: false, reason: 'Không thể xóa danh mục đang có sản phẩm.' };
    await this.db.collection('categories').deleteOne({ id: Number(id) });
    return { deleted: true };
  }

  private async hydrateProducts(docs: any[]): Promise<Product[]> {
    const [shops, cats] = await Promise.all([this.listAllShops(), this.listCategories()]);
    const shopMap = new Map(shops.map((s) => [s.id, s]));
    const catMap = new Map(cats.map((c) => [c.id, c]));
    return docs.map((raw) => {
      const p = stripMongoId(raw)! as Product;
      const sh = shopMap.get(p.shopId);
      const ct = catMap.get(p.categoryId);
      return {
        ...p,
        shopName: sh?.name,
        shopVillage: sh?.craftVillage,
        categoryName: ct?.name,
      };
    });
  }

  async listApprovedProducts() {
    const approvedShops = await this.listApprovedShops();
    const shopIds = approvedShops.map((s) => s.id);
    const docs = await this.db
      .collection('products')
      .find({ status: 'APPROVED', shopId: { $in: shopIds } })
      .toArray();
    return this.hydrateProducts(docs);
  }
  async listAllProducts() {
    const docs = await this.db.collection('products').find().sort({ id: -1 }).toArray();
    return this.hydrateProducts(docs);
  }
  async listSellerProducts(shopId: number) {
    const docs = await this.db.collection('products').find({ shopId: Number(shopId) }).sort({ id: -1 }).toArray();
    return this.hydrateProducts(docs);
  }
  async getProductById(id: number) {
    const doc = await this.db.collection('products').findOne({ id: Number(id) });
    if (!doc) return null;
    const [hydrated] = await this.hydrateProducts([doc]);
    return hydrated;
  }
  async createProduct(data: any): Promise<Product> {
    const id = await this.nextSeq('products');
    const doc = {
      ...data,
      id,
      isPromoted: false,
      status: 'PENDING_REVIEW',
      soldCount: 0,
      ratingAvg: 5.0,
      reviewCount: 0,
      createdAt: new Date().toISOString(),
    };
    await this.db.collection('products').insertOne(doc);
    return (await this.getProductById(id))!;
  }
  async updateSellerProduct(prodId: number, shopId: number, data: any) {
    const existing = await this.db.collection('products').findOne({ id: Number(prodId), shopId: Number(shopId) });
    if (!existing) return null;
    const $set: Record<string, any> = {};
    for (const k of [
      'name',
      'basePrice',
      'stock',
      'flashSalePrice',
      'quantityDiscountMin',
      'quantityDiscountPercent',
      'isMadeToOrder',
      'productionDays',
      'description',
      'artisanStory',
      'images',
    ]) {
      if (data[k] !== undefined) $set[k] = data[k];
    }
    await this.db.collection('products').updateOne({ id: Number(prodId), shopId: Number(shopId) }, { $set });
    return this.getProductById(prodId);
  }
  async deleteSellerProduct(prodId: number, shopId: number) {
    const res = await this.db.collection('products').deleteOne({ id: Number(prodId), shopId: Number(shopId) });
    return res.deletedCount > 0;
  }
  async moderateProduct(prodId: number, data: { status?: Product['status']; isPromoted?: boolean }) {
    const $set: Record<string, any> = {};
    if (data.status !== undefined) $set.status = data.status;
    if (data.isPromoted !== undefined) $set.isPromoted = Boolean(data.isPromoted);
    const res = await this.db.collection('products').updateOne({ id: Number(prodId) }, { $set });
    return res.matchedCount > 0;
  }
  async deleteProductAdmin(prodId: number) {
    await this.db.collection('products').deleteOne({ id: Number(prodId) });
  }

  async listActiveVouchers(): Promise<Voucher[]> {
    const now = new Date().toISOString();
    const all = await this.listAllVouchers();
    return all.filter((v) => v.isActive && v.endsAt >= now && v.usedCount < v.usageLimit);
  }
  async listAllVouchers(): Promise<Voucher[]> {
    const [docs, shops] = await Promise.all([
      this.db.collection('vouchers').find().sort({ id: -1 }).toArray(),
      this.listAllShops(),
    ]);
    const shopMap = new Map(shops.map((s) => [s.id, s.name]));
    return docs.map((d: any) => {
      const v = stripMongoId(d)! as Voucher;
      return { ...v, shopName: v.shopId ? shopMap.get(v.shopId) : undefined };
    });
  }
  async listShopVouchers(shopId: number): Promise<Voucher[]> {
    const docs = await this.db.collection('vouchers').find({ scope: 'SHOP', shopId: Number(shopId) }).sort({ id: -1 }).toArray();
    return docs.map((d) => stripMongoId(d as any)!);
  }
  async getVoucherByCode(code: string, scope: 'PLATFORM' | 'SHOP', shopId?: number): Promise<Voucher | null> {
    const filter: Record<string, any> = { code: String(code), scope };
    if (scope === 'SHOP') filter.shopId = Number(shopId);
    const doc = await this.db.collection('vouchers').findOne(filter);
    return stripMongoId(doc as any);
  }
  async createVoucher(data: any): Promise<Voucher> {
    const id = await this.nextSeq('vouchers');
    const now = new Date().toISOString();
    const endsAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 60).toISOString();
    const doc: Voucher = {
      id,
      scope: data.scope,
      shopId: data.shopId,
      code: String(data.code),
      title: String(data.title),
      discountType: data.discountType,
      discountValue: Number(data.discountValue),
      maxDiscountAmount: data.maxDiscountAmount ?? null,
      minOrderValue: Number(data.minOrderValue || 0),
      usageLimit: Number(data.usageLimit || 100),
      usedCount: 0,
      startsAt: now,
      endsAt,
      isActive: true,
    };
    await this.db.collection('vouchers').insertOne(doc as any);
    return doc;
  }
  async toggleVoucher(id: number) {
    const doc = await this.db.collection('vouchers').findOne({ id: Number(id) });
    if (!doc) return false;
    await this.db.collection('vouchers').updateOne({ id: Number(id) }, { $set: { isActive: !doc.isActive } });
    return true;
  }

  async createMultiVendorOrder(input: CreateOrderInput) {
    const now = new Date().toISOString();
    const orderCode = `MM-${Date.now().toString().slice(-6)}-${Math.floor(100 + Math.random() * 900)}`;
    const masterId = await this.nextSeq('orders_master');

    await this.db.collection('orders_master').insertOne({
      id: masterId,
      orderCode,
      buyerId: input.buyerId,
      shippingAddress: input.shippingAddress,
      paymentMethod: input.paymentMethod,
      paymentStatus: input.initialPaymentStatus,
      platformVoucherCode: input.platformVoucher ? input.platformVoucher.code : null,
      subtotalAmount: input.subtotalAmount,
      shippingTotal: input.shippingTotal,
      platformDiscountTotal: input.platformDiscountTotal,
      shopDiscountTotal: input.shopDiscountTotal,
      grandTotal: input.grandTotal,
      affiliateCode: input.affiliate ? input.affiliate.refCode : null,
      createdAt: now,
    });

    if (input.platformVoucher && input.platformDiscountTotal > 0) {
      await this.db.collection('vouchers').updateOne({ id: input.platformVoucher.id }, { $inc: { usedCount: 1 } });
    }

    for (let idx = 0; idx < input.subOrders.length; idx++) {
      const sub = input.subOrders[idx];
      const subId = await this.nextSeq('orders_sub');
      const subCode = `${orderCode}-S${idx + 1}`;
      const affFee = input.affiliate ? sub.affiliateCommissionFee : 0;

      await this.db.collection('orders_sub').insertOne({
        id: subId,
        masterOrderId: masterId,
        subOrderCode: subCode,
        shopId: sub.shopId,
        buyerId: input.buyerId,
        items: sub.items,
        subtotal: sub.subtotal,
        shippingFee: sub.shippingFee,
        shopDiscount: sub.shopDiscount,
        allocatedPlatformDiscount: sub.allocatedPlatformDiscount,
        finalTotal: sub.finalTotal,
        commissionRate: sub.commissionRate,
        commissionFee: sub.commissionFee,
        affiliateCommissionFee: affFee,
        sellerNetAmount: sub.sellerNetAmount,
        orderStatus: 'PENDING_CONFIRM',
        paymentStatus: input.initialPaymentStatus,
        shippingStatus: 'AWAITING_CONFIRM',
        trackingCode: null,
        carrierName: null,
        createdAt: now,
        updatedAt: now,
      });

      if (sub.shopVoucher && sub.shopDiscount > 0) {
        await this.db.collection('vouchers').updateOne({ id: sub.shopVoucher.id }, { $inc: { usedCount: 1 } });
      }

      for (const item of sub.items) {
        const prod = await this.db.collection('products').findOne({ id: item.productId });
        if (prod && !prod.isMadeToOrder) {
          const variants = (prod.variants || []) as any[];
          const vIdx = variants.findIndex((v) => v.id === item.variantId);
          if (vIdx >= 0) variants[vIdx].stock = Math.max(0, Number(variants[vIdx].stock) - item.quantity);
          await this.db.collection('products').updateOne(
            { id: item.productId },
            { $set: { stock: Math.max(0, Number(prod.stock) - item.quantity), variants }, $inc: { soldCount: item.quantity } }
          );
        } else if (prod) {
          await this.db.collection('products').updateOne({ id: item.productId }, { $inc: { soldCount: item.quantity } });
        }
      }

      if (input.affiliate && affFee > 0) {
        const commId = await this.nextSeq('affiliate_commissions');
        await this.db.collection('affiliate_commissions').insertOne({
          id: commId,
          affiliateId: input.affiliate.id,
          subOrderId: subId,
          masterOrderId: masterId,
          productSummary: sub.items.map((i) => `${i.productName} x${i.quantity}`).join(', '),
          orderAmount: Math.max(0, sub.subtotal - sub.shopDiscount),
          commissionRate: input.affiliateCommissionRate,
          commissionAmount: affFee,
          status: 'PENDING',
          createdAt: now,
          updatedAt: now,
        });
      }
    }

    const txnId = await this.nextSeq('payment_transactions');
    const txnCode = `TXN-${Date.now().toString().slice(-7)}`;
    const idempotencyKey = `idem_${masterId}_${crypto.randomBytes(6).toString('hex')}`;
    const sandboxSignature =
      input.paymentMethod === 'SANDBOX_GATEWAY' ? signSandboxPayload(txnCode, 'SUCCEEDED', input.grandTotal) : null;

    await this.db.collection('payment_transactions').insertOne({
      id: txnId,
      masterOrderId: masterId,
      transactionCode: txnCode,
      idempotencyKey,
      method: input.paymentMethod,
      amount: input.grandTotal,
      status: 'INITIATED',
      gatewaySignature: sandboxSignature,
      createdAt: now,
      updatedAt: now,
    });

    return {
      masterOrder: (await this.getMasterOrderWithSubs(masterId))!,
      transactionCode: txnCode,
      idempotencyKey,
      sandboxSignature,
      amount: input.grandTotal,
    };
  }

  private async hydrateSubOrders(docs: any[]): Promise<SubOrder[]> {
    const [shops, users] = await Promise.all([this.listAllShops(), this.listUsers()]);
    const shopMap = new Map(shops.map((s) => [s.id, s.name]));
    const userMap = new Map(users.map((u) => [u.id, u.fullName]));
    return docs.map((d) => {
      const s = stripMongoId(d)! as SubOrder;
      return { ...s, shopName: shopMap.get(s.shopId), buyerName: userMap.get(s.buyerId) };
    });
  }

  async getMasterOrderWithSubs(masterId: number): Promise<MasterOrder | null> {
    const m = await this.db.collection('orders_master').findOne({ id: Number(masterId) });
    if (!m) return null;
    const buyer = await this.getUserById(m.buyerId);
    const subsRaw = await this.db.collection('orders_sub').find({ masterOrderId: Number(masterId) }).sort({ id: 1 }).toArray();
    const subOrders = await this.hydrateSubOrders(subsRaw);
    const { _id, ...rest } = m as any;
    void _id;
    return { ...rest, buyerName: buyer?.fullName, subOrders };
  }
  async listBuyerOrders(buyerId: number): Promise<MasterOrder[]> {
    const docs = await this.db.collection('orders_master').find({ buyerId: Number(buyerId) }).sort({ id: -1 }).toArray();
    const res = await Promise.all(docs.map((d: any) => this.getMasterOrderWithSubs(d.id)));
    return res.filter(Boolean) as MasterOrder[];
  }
  async listAllOrders(): Promise<MasterOrder[]> {
    const docs = await this.db.collection('orders_master').find().sort({ id: -1 }).toArray();
    const res = await Promise.all(docs.map((d: any) => this.getMasterOrderWithSubs(d.id)));
    return res.filter(Boolean) as MasterOrder[];
  }
  async listAllSubOrders() {
    const docs = await this.db.collection('orders_sub').find().toArray();
    return this.hydrateSubOrders(docs);
  }
  async getSubOrderById(subId: number) {
    const doc = await this.db.collection('orders_sub').findOne({ id: Number(subId) });
    if (!doc) return null;
    const [hydrated] = await this.hydrateSubOrders([doc]);
    return hydrated;
  }
  async listSellerSubOrders(shopId: number) {
    const docs = await this.db.collection('orders_sub').find({ shopId: Number(shopId) }).sort({ id: -1 }).toArray();
    return this.hydrateSubOrders(docs);
  }
  async updateSellerSubOrderStatus(subId: number, shopId: number, update: any) {
    const now = new Date().toISOString();
    const res = await this.db.collection('orders_sub').updateOne(
      { id: Number(subId), shopId: Number(shopId) },
      { $set: { orderStatus: update.orderStatus, shippingStatus: update.shippingStatus, paymentStatus: update.paymentStatus, trackingCode: update.trackingCode, carrierName: update.carrierName, updatedAt: now } }
    );
    if (res.matchedCount === 0) return null;
    if (update.approveAffiliate) {
      await this.db.collection('affiliate_commissions').updateMany({ subOrderId: Number(subId), status: 'PENDING' }, { $set: { status: 'APPROVED', updatedAt: now } });
    }
    if (update.cancelAffiliate) {
      await this.db.collection('affiliate_commissions').updateMany({ subOrderId: Number(subId), status: { $in: ['PENDING', 'APPROVED'] } }, { $set: { status: 'CANCELLED', updatedAt: now } });
    }
    return this.getSubOrderById(subId);
  }
  async confirmSubOrderReceived(subId: number, buyerId: number) {
    const sub = await this.db.collection('orders_sub').findOne({ id: Number(subId), buyerId: Number(buyerId) });
    if (!sub) return null;
    const now = new Date().toISOString();
    await this.db.collection('orders_sub').updateOne({ id: Number(subId) }, { $set: { orderStatus: 'COMPLETED', shippingStatus: 'COMPLETED', paymentStatus: 'PAID', updatedAt: now } });
    await this.db.collection('affiliate_commissions').updateMany({ subOrderId: Number(subId), status: 'PENDING' }, { $set: { status: 'APPROVED', updatedAt: now } });
    const unpaid = await this.db.collection('orders_sub').countDocuments({ masterOrderId: sub.masterOrderId, paymentStatus: { $ne: 'PAID' } });
    if (unpaid === 0) {
      await this.db.collection('orders_master').updateOne({ id: sub.masterOrderId }, { $set: { paymentStatus: 'PAID' } });
    }
    return this.getMasterOrderWithSubs(sub.masterOrderId);
  }

  async getPaymentTransaction(transactionCode: string, idempotencyKey: string): Promise<StoredPaymentTransaction | null> {
    const doc = await this.db.collection('payment_transactions').findOne({
      transactionCode: String(transactionCode),
      idempotencyKey: String(idempotencyKey),
    });
    if (!doc) return null;
    const m = await this.db.collection('orders_master').findOne({ id: doc.masterOrderId });
    return { ...(stripMongoId(doc as any)!), orderCode: m?.orderCode, buyerId: m?.buyerId };
  }
  async finalizePaymentTransaction(txnId: number, masterOrderId: number, txnStatus: 'SUCCEEDED' | 'FAILED', newPayStatus: PaymentStatus): Promise<PaymentTransaction> {
    const now = new Date().toISOString();
    await this.db.collection('payment_transactions').updateOne({ id: Number(txnId) }, { $set: { status: txnStatus, updatedAt: now } });
    await this.db.collection('orders_master').updateOne({ id: Number(masterOrderId) }, { $set: { paymentStatus: newPayStatus } });
    await this.db.collection('orders_sub').updateMany({ masterOrderId: Number(masterOrderId) }, { $set: { paymentStatus: newPayStatus, updatedAt: now } });
    const doc = await this.db.collection('payment_transactions').findOne({ id: Number(txnId) });
    const m = await this.db.collection('orders_master').findOne({ id: Number(masterOrderId) });
    return { ...(stripMongoId(doc as any)!), orderCode: m?.orderCode };
  }
  async listAllPaymentTransactions(): Promise<PaymentTransaction[]> {
    const [docs, masters] = await Promise.all([
      this.db.collection('payment_transactions').find().sort({ id: -1 }).toArray(),
      this.db.collection('orders_master').find().toArray(),
    ]);
    const mMap = new Map(masters.map((m: any) => [m.id, m.orderCode]));
    return docs.map((d: any) => ({ ...(stripMongoId(d)!), orderCode: mMap.get(d.masterOrderId) }));
  }

  private async hydrateReviews(docs: any[]): Promise<Review[]> {
    const [users, prods] = await Promise.all([this.listUsers(), this.listAllProducts()]);
    const uMap = new Map(users.map((u) => [u.id, u.fullName]));
    const pMap = new Map(prods.map((p) => [p.id, p.name]));
    return docs.map((d) => {
      const r = stripMongoId(d)! as Review;
      return { ...r, buyerName: uMap.get(r.buyerId), productName: pMap.get(r.productId) };
    });
  }
  async listProductReviews(productId: number) {
    const docs = await this.db.collection('reviews').find({ productId: Number(productId), status: 'VISIBLE' }).sort({ id: -1 }).toArray();
    return this.hydrateReviews(docs);
  }
  async listAllReviews() {
    const docs = await this.db.collection('reviews').find().sort({ id: -1 }).toArray();
    return this.hydrateReviews(docs);
  }
  async createVerifiedReview(buyerId: number, productId: number, rating: number, comment: string) {
    const subs = await this.db
      .collection('orders_sub')
      .find({ buyerId: Number(buyerId), $or: [{ orderStatus: 'COMPLETED' }, { shippingStatus: { $in: ['DELIVERED', 'COMPLETED'] } }] })
      .toArray();
    const matchedSub = subs.find((s: any) => ((s.items || []) as OrderItemSnapshot[]).some((i) => i.productId === Number(productId)));
    if (!matchedSub) throw new Error('NOT_VERIFIED_BUYER');
    const already = await this.db.collection('reviews').findOne({ productId: Number(productId), buyerId: Number(buyerId) });
    if (already) throw new Error('ALREADY_REVIEWED');

    const id = await this.nextSeq('reviews');
    const now = new Date().toISOString();
    await this.db.collection('reviews').insertOne({
      id,
      productId: Number(productId),
      buyerId: Number(buyerId),
      subOrderId: matchedSub.id,
      rating,
      comment,
      status: 'VISIBLE',
      createdAt: now,
    });
    const visReviews = await this.db.collection('reviews').find({ productId: Number(productId), status: 'VISIBLE' }).toArray();
    const avg = visReviews.reduce((acc, r: any) => acc + r.rating, 0) / (visReviews.length || 1);
    await this.db.collection('products').updateOne({ id: Number(productId) }, { $set: { ratingAvg: Math.round(avg * 10) / 10, reviewCount: visReviews.length } });
    const [hydrated] = await this.hydrateReviews([await this.db.collection('reviews').findOne({ id })]);
    return hydrated;
  }
  async setReviewStatus(id: number, status: 'VISIBLE' | 'HIDDEN') {
    await this.db.collection('reviews').updateOne({ id: Number(id) }, { $set: { status } });
  }

  private async hydrateTickets(docs: any[]): Promise<SupportTicket[]> {
    const [shops, users, subs] = await Promise.all([this.listAllShops(), this.listUsers(), this.listAllSubOrders()]);
    const shopMap = new Map(shops.map((s) => [s.id, s.name]));
    const userMap = new Map(users.map((u) => [u.id, u.fullName]));
    const subMap = new Map(subs.map((s) => [s.id, s.subOrderCode]));
    return docs.map((d) => {
      const t = stripMongoId(d)! as SupportTicket;
      return { ...t, shopName: shopMap.get(t.shopId), buyerName: userMap.get(t.buyerId), subOrderCode: subMap.get(t.subOrderId) };
    });
  }
  async listBuyerTickets(buyerId: number) {
    const docs = await this.db.collection('support_tickets').find({ buyerId: Number(buyerId) }).sort({ id: -1 }).toArray();
    return this.hydrateTickets(docs);
  }
  async listSellerTickets(shopId: number) {
    const docs = await this.db.collection('support_tickets').find({ shopId: Number(shopId) }).sort({ id: -1 }).toArray();
    return this.hydrateTickets(docs);
  }
  async listAllTickets() {
    const docs = await this.db.collection('support_tickets').find().sort({ id: -1 }).toArray();
    return this.hydrateTickets(docs);
  }
  async createTicket(buyerId: number, subOrderId: number, type: SupportTicket['type'], reason: string) {
    const sub = await this.db.collection('orders_sub').findOne({ id: Number(subOrderId), buyerId: Number(buyerId) });
    if (!sub) throw new Error('SUBORDER_NOT_FOUND');
    const id = await this.nextSeq('support_tickets');
    const now = new Date().toISOString();
    await this.db.collection('support_tickets').insertOne({
      id,
      subOrderId: sub.id,
      masterOrderId: sub.masterOrderId,
      buyerId: Number(buyerId),
      shopId: sub.shopId,
      type,
      reason,
      status: 'OPEN',
      resolutionNote: null,
      createdAt: now,
      updatedAt: now,
    });
    if (type === 'RETURN' || type === 'REFUND') {
      await this.db.collection('orders_sub').updateOne({ id: sub.id }, { $set: { orderStatus: 'RETURN_REQUESTED', updatedAt: now } });
    }
    const [hydrated] = await this.hydrateTickets([await this.db.collection('support_tickets').findOne({ id })]);
    return hydrated;
  }
  async sellerRespondTicket(id: number, shopId: number, approve: boolean, note: string) {
    const res = await this.db.collection('support_tickets').updateOne(
      { id: Number(id), shopId: Number(shopId) },
      { $set: { status: approve ? 'SELLER_APPROVED' : 'REJECTED', resolutionNote: note, updatedAt: new Date().toISOString() } }
    );
    return res.matchedCount > 0;
  }
  async adminResolveTicket(id: number, action: 'REFUND' | 'REJECT', note: string) {
    const ticket = await this.db.collection('support_tickets').findOne({ id: Number(id) });
    if (!ticket) return false;
    const now = new Date().toISOString();
    if (action === 'REFUND') {
      await this.db.collection('support_tickets').updateOne({ id: Number(id) }, { $set: { status: 'ADMIN_APPROVED_REFUND', resolutionNote: note || 'Admin đã duyệt hoàn tiền.', updatedAt: now } });
      await this.db.collection('orders_sub').updateOne({ id: ticket.subOrderId }, { $set: { orderStatus: 'RETURNED', paymentStatus: 'REFUNDED', shippingStatus: 'RETURNED', updatedAt: now } });
      await this.db.collection('affiliate_commissions').updateMany({ subOrderId: ticket.subOrderId, status: { $in: ['PENDING', 'APPROVED'] } }, { $set: { status: 'CANCELLED', updatedAt: now } });
    } else {
      await this.db.collection('support_tickets').updateOne({ id: Number(id) }, { $set: { status: 'REJECTED', resolutionNote: note || 'Yêu cầu chưa đủ điều kiện.', updatedAt: now } });
    }
    return true;
  }

  async listChatThreads(userId: number, ownedShopId?: number) {
    const filter = ownedShopId ? { $or: [{ customerId: Number(userId) }, { shopId: Number(ownedShopId) }] } : { customerId: Number(userId) };
    const docs = await this.db.collection('messages').find(filter).sort({ id: -1 }).toArray();
    const [shops, users] = await Promise.all([this.listAllShops(), this.listUsers()]);
    const shopMap = new Map(shops.map((s) => [s.id, s.name]));
    const userMap = new Map(users.map((u) => [u.id, u.fullName]));
    const seen = new Set<string>();
    const threads: any[] = [];
    for (const d of docs) {
      const key = `${d.shopId}:${d.customerId}`;
      if (!seen.has(key)) {
        seen.add(key);
        threads.push({ shopId: d.shopId, customerId: d.customerId, shopName: shopMap.get(d.shopId) || '', customerName: userMap.get(d.customerId) || '' });
      }
    }
    return threads;
  }
  async listChatMessages(shopId: number, customerId: number): Promise<ChatMessage[]> {
    const docs = await this.db.collection('messages').find({ shopId: Number(shopId), customerId: Number(customerId) }).sort({ id: 1 }).toArray();
    const [shop, user] = await Promise.all([this.getShopById(shopId), this.getUserById(customerId)]);
    return docs.map((d) => ({ ...(stripMongoId(d as any)!), shopName: shop?.name, customerName: user?.fullName }));
  }
  async createChatMessage(data: any): Promise<ChatMessage> {
    const id = await this.nextSeq('messages');
    const doc = { ...data, id, createdAt: new Date().toISOString() };
    await this.db.collection('messages').insertOne(doc);
    const [shop, user] = await Promise.all([this.getShopById(data.shopId), this.getUserById(data.customerId)]);
    return { ...(stripMongoId(doc)!), shopName: shop?.name, customerName: user?.fullName };
  }

  async getAffiliateByUserId(userId: number): Promise<AffiliateProfile | null> {
    const doc = await this.db.collection('affiliates').findOne({ userId: Number(userId) });
    if (!doc) return null;
    const u = await this.getUserById(userId);
    return { ...(stripMongoId(doc as any)!), userName: u?.fullName, userEmail: u?.email };
  }
  async getApprovedAffiliateByCode(refCode: string): Promise<AffiliateProfile | null> {
    const doc = await this.db.collection('affiliates').findOne({ refCode: String(refCode), status: 'APPROVED' });
    return stripMongoId(doc as any);
  }
  async registerAffiliate(userId: number, refCode: string, bankInfo: string) {
    const id = await this.nextSeq('affiliates');
    const doc: AffiliateProfile = { id, userId: Number(userId), refCode: String(refCode), status: 'PENDING', bankInfo: String(bankInfo), totalClicks: 0, createdAt: new Date().toISOString() };
    await this.db.collection('affiliates').insertOne(doc as any);
    const u = await this.getUserById(userId);
    const roles = u ? [...u.roles] : (['customer'] as UserRole[]);
    if (!roles.includes('affiliate')) roles.push('affiliate');
    const updatedUser = await this.updateUserRolesAndPassword(userId, roles);
    return { affiliate: doc, user: updatedUser };
  }
  async recordAffiliateClick(affiliateId: number, productId: number | null, ipHash: string) {
    const id = await this.nextSeq('affiliate_clicks');
    await this.db.collection('affiliate_clicks').insertOne({ id, affiliateId: Number(affiliateId), productId, ipHash, createdAt: new Date().toISOString() });
    await this.db.collection('affiliates').updateOne({ id: Number(affiliateId) }, { $inc: { totalClicks: 1 } });
  }
  private async hydrateCommissions(docs: any[]): Promise<AffiliateCommission[]> {
    const [affs, subs] = await Promise.all([this.listAllAffiliates(), this.listAllSubOrders()]);
    const affMap = new Map(affs.map((a) => [a.id, a.refCode]));
    const subMap = new Map(subs.map((s) => [s.id, s.subOrderCode]));
    return docs.map((d) => ({ ...(stripMongoId(d as any)!), refCode: affMap.get(d.affiliateId), subOrderCode: subMap.get(d.subOrderId) }));
  }
  async listAffiliateCommissions(affiliateId: number) {
    const docs = await this.db.collection('affiliate_commissions').find({ affiliateId: Number(affiliateId) }).sort({ id: -1 }).toArray();
    return this.hydrateCommissions(docs);
  }
  async listAllAffiliates(): Promise<AffiliateProfile[]> {
    const [docs, users] = await Promise.all([this.db.collection('affiliates').find().sort({ id: -1 }).toArray(), this.listUsers()]);
    const uMap = new Map(users.map((u) => [u.id, u]));
    return docs.map((d: any) => {
      const a = stripMongoId(d)! as AffiliateProfile;
      const u = uMap.get(a.userId);
      return { ...a, userName: u?.fullName, userEmail: u?.email };
    });
  }
  async listAllAffiliateCommissions() {
    const docs = await this.db.collection('affiliate_commissions').find().sort({ id: -1 }).toArray();
    return this.hydrateCommissions(docs);
  }
  async updateAffiliateStatus(id: number, status: AffiliateProfile['status']) {
    await this.db.collection('affiliates').updateOne({ id: Number(id) }, { $set: { status } });
  }
  async payoutAffiliateCommission(id: number) {
    await this.db.collection('affiliate_commissions').updateOne({ id: Number(id), status: 'APPROVED' }, { $set: { status: 'PAID', updatedAt: new Date().toISOString() } });
  }
}
