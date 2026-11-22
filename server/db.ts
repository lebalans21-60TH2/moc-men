import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';
import { hashPassword } from './auth.ts';
import type {
  Address,
  AffiliateCommission,
  AffiliateProfile,
  Category,
  ChatMessage,
  MasterOrder,
  OrderItemSnapshot,
  PaymentTransaction,
  Product,
  ProductVariant,
  Review,
  Shop,
  SubOrder,
  SupportTicket,
  User,
  UserRole,
  Voucher,
} from '../src/types.ts';

const DATA_DIR = path.resolve(process.cwd(), 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DB_PATH = path.join(DATA_DIR, 'mocmen.sqlite');
export const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

export function initDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      passwordHash TEXT NOT NULL,
      fullName TEXT NOT NULL,
      phone TEXT NOT NULL DEFAULT '',
      rolesJson TEXT NOT NULL DEFAULT '["customer"]',
      isLocked INTEGER NOT NULL DEFAULT 0,
      createdAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS addresses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      userId INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      recipientName TEXT NOT NULL,
      phone TEXT NOT NULL,
      province TEXT NOT NULL,
      district TEXT NOT NULL,
      ward TEXT NOT NULL,
      street TEXT NOT NULL,
      isDefault INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS wishlist (
      userId INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      productId INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      createdAt TEXT NOT NULL,
      PRIMARY KEY (userId, productId)
    );

    CREATE TABLE IF NOT EXISTS shops (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ownerId INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      craftVillage TEXT NOT NULL,
      description TEXT NOT NULL,
      logoUrl TEXT NOT NULL DEFAULT '',
      bannerUrl TEXT NOT NULL DEFAULT '',
      contactPhone TEXT NOT NULL,
      contactEmail TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'PENDING',
      createdAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      description TEXT NOT NULL,
      materialFocus TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      shopId INTEGER NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
      categoryId INTEGER NOT NULL REFERENCES categories(id),
      name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      material TEXT NOT NULL,
      originVillage TEXT NOT NULL,
      description TEXT NOT NULL,
      artisanStory TEXT NOT NULL,
      basePrice INTEGER NOT NULL,
      flashSalePrice INTEGER,
      flashSaleEnd TEXT,
      quantityDiscountMin INTEGER,
      quantityDiscountPercent INTEGER,
      stock INTEGER NOT NULL DEFAULT 0,
      isMadeToOrder INTEGER NOT NULL DEFAULT 0,
      productionDays INTEGER NOT NULL DEFAULT 0,
      isPromoted INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'PENDING_REVIEW',
      imagesJson TEXT NOT NULL DEFAULT '[]',
      variantsJson TEXT NOT NULL DEFAULT '[]',
      soldCount INTEGER NOT NULL DEFAULT 0,
      ratingAvg REAL NOT NULL DEFAULT 0,
      reviewCount INTEGER NOT NULL DEFAULT 0,
      createdAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS vouchers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      scope TEXT NOT NULL,
      shopId INTEGER REFERENCES shops(id) ON DELETE CASCADE,
      code TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      discountType TEXT NOT NULL,
      discountValue INTEGER NOT NULL,
      maxDiscountAmount INTEGER,
      minOrderValue INTEGER NOT NULL DEFAULT 0,
      usageLimit INTEGER NOT NULL DEFAULT 100,
      usedCount INTEGER NOT NULL DEFAULT 0,
      startsAt TEXT NOT NULL,
      endsAt TEXT NOT NULL,
      isActive INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS orders_master (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      orderCode TEXT NOT NULL UNIQUE,
      buyerId INTEGER NOT NULL REFERENCES users(id),
      shippingAddressJson TEXT NOT NULL,
      paymentMethod TEXT NOT NULL,
      paymentStatus TEXT NOT NULL,
      platformVoucherCode TEXT,
      subtotalAmount INTEGER NOT NULL,
      shippingTotal INTEGER NOT NULL,
      platformDiscountTotal INTEGER NOT NULL,
      shopDiscountTotal INTEGER NOT NULL,
      grandTotal INTEGER NOT NULL,
      affiliateCode TEXT,
      createdAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS orders_sub (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      masterOrderId INTEGER NOT NULL REFERENCES orders_master(id) ON DELETE CASCADE,
      subOrderCode TEXT NOT NULL UNIQUE,
      shopId INTEGER NOT NULL REFERENCES shops(id),
      buyerId INTEGER NOT NULL REFERENCES users(id),
      itemsJson TEXT NOT NULL,
      subtotal INTEGER NOT NULL,
      shippingFee INTEGER NOT NULL,
      shopDiscount INTEGER NOT NULL,
      allocatedPlatformDiscount INTEGER NOT NULL,
      finalTotal INTEGER NOT NULL,
      commissionRate REAL NOT NULL,
      commissionFee INTEGER NOT NULL,
      affiliateCommissionFee INTEGER NOT NULL,
      sellerNetAmount INTEGER NOT NULL,
      orderStatus TEXT NOT NULL,
      paymentStatus TEXT NOT NULL,
      shippingStatus TEXT NOT NULL,
      trackingCode TEXT,
      carrierName TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS payment_transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      masterOrderId INTEGER NOT NULL REFERENCES orders_master(id) ON DELETE CASCADE,
      transactionCode TEXT NOT NULL UNIQUE,
      idempotencyKey TEXT NOT NULL UNIQUE,
      method TEXT NOT NULL,
      amount INTEGER NOT NULL,
      status TEXT NOT NULL,
      gatewaySignature TEXT,
      rawPayloadJson TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS affiliates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      userId INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
      refCode TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL DEFAULT 'PENDING',
      bankInfo TEXT NOT NULL DEFAULT '',
      totalClicks INTEGER NOT NULL DEFAULT 0,
      createdAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS affiliate_clicks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      affiliateId INTEGER NOT NULL REFERENCES affiliates(id) ON DELETE CASCADE,
      productId INTEGER,
      ipHash TEXT NOT NULL,
      createdAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS affiliate_commissions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      affiliateId INTEGER NOT NULL REFERENCES affiliates(id) ON DELETE CASCADE,
      subOrderId INTEGER NOT NULL REFERENCES orders_sub(id) ON DELETE CASCADE,
      masterOrderId INTEGER NOT NULL REFERENCES orders_master(id) ON DELETE CASCADE,
      productSummary TEXT NOT NULL,
      orderAmount INTEGER NOT NULL,
      commissionRate REAL NOT NULL,
      commissionAmount INTEGER NOT NULL,
      status TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS reviews (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      productId INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      buyerId INTEGER NOT NULL REFERENCES users(id),
      subOrderId INTEGER NOT NULL REFERENCES orders_sub(id),
      rating INTEGER NOT NULL,
      comment TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'VISIBLE',
      createdAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS support_tickets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      subOrderId INTEGER NOT NULL REFERENCES orders_sub(id) ON DELETE CASCADE,
      masterOrderId INTEGER NOT NULL REFERENCES orders_master(id) ON DELETE CASCADE,
      buyerId INTEGER NOT NULL REFERENCES users(id),
      shopId INTEGER NOT NULL REFERENCES shops(id),
      type TEXT NOT NULL,
      reason TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'OPEN',
      resolutionNote TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      shopId INTEGER NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
      customerId INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      senderId INTEGER NOT NULL REFERENCES users(id),
      senderRole TEXT NOT NULL,
      productId INTEGER,
      content TEXT NOT NULL,
      createdAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS platform_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  seedInitialData();
}

function seedInitialData() {
  const existingUsers = db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number };
  if (existingUsers.count > 0) return;

  const now = new Date().toISOString();
  const demoPass = hashPassword('DemoCraft2026!');

  const insertSetting = db.prepare('INSERT OR IGNORE INTO platform_settings (key, value) VALUES (?, ?)');
  insertSetting.run('platformCommissionRate', '8');
  insertSetting.run('affiliateCommissionRate', '5');
  insertSetting.run('defaultShippingFee', '30000');

  const insertUser = db.prepare(
    'INSERT INTO users (email, passwordHash, fullName, phone, rolesJson, isLocked, createdAt) VALUES (?, ?, ?, ?, ?, 0, ?)'
  );
  const buyerId = Number(
    insertUser.run('khachhang@mocmen.vn', demoPass, 'Nguyễn Minh Anh', '0912345678', JSON.stringify(['customer', 'affiliate']), now)
      .lastInsertRowid
  );
  const seller1UserId = Number(
    insertUser.run('gom@mocmen.vn', demoPass, 'Nghệ nhân Trần Văn Minh', '0987111222', JSON.stringify(['customer', 'seller']), now)
      .lastInsertRowid
  );
  const seller2UserId = Number(
    insertUser.run('maytre@mocmen.vn', demoPass, 'Nghệ nhân Lê Thị Hương', '0987333444', JSON.stringify(['customer', 'seller']), now)
      .lastInsertRowid
  );
  const seller3UserId = Number(
    insertUser.run('sonmai@mocmen.vn', demoPass, 'Nghệ nhân Phạm Quốc Bảo', '0987555666', JSON.stringify(['customer', 'seller']), now)
      .lastInsertRowid
  );

  // Default address for demo buyer
  db.prepare(
    'INSERT INTO addresses (userId, recipientName, phone, province, district, ward, street, isDefault) VALUES (?, ?, ?, ?, ?, ?, ?, 1)'
  ).run(buyerId, 'Nguyễn Minh Anh', '0912345678', 'TP. Hà Nội', 'Quận Hoàn Kiếm', 'Phường Tràng Tiền', '28 Lý Thường Kiệt');

  // Seed Shops
  const insertShop = db.prepare(
    'INSERT INTO shops (ownerId, name, slug, craftVillage, description, logoUrl, bannerUrl, contactPhone, contactEmail, status, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  );
  const shop1Id = Number(
    insertShop.run(
      seller1UserId,
      'Lò Gốm Minh Tâm',
      'lo-gom-minh-tam',
      'Bát Tràng, Gia Lâm, Hà Nội',
      'Xưởng gốm gia truyền 4 đời chuyên dòng men ngọc rạn cổ và gốm trà đạo nung củi truyền thống.',
      '/src/assets/images/prod_ceramic_vase_1795250373703.jpg',
      '/src/assets/images/hero_craft_atelier_1795250373033.jpg',
      '0987111222',
      'gom@mocmen.vn',
      'APPROVED',
      now
    ).lastInsertRowid
  );
  const shop2Id = Number(
    insertShop.run(
      seller2UserId,
      'Mây Tre Phú Vinh',
      'may-tre-phu-vinh',
      'Phú Vinh, Chương Mỹ, Hà Nội',
      'Hợp tác xã đan lát thủ công mỹ nghệ từ song mây tự nhiên xử lý hun khói không hóa chất.',
      '/src/assets/images/prod_rattan_bag_1795250373275.jpg',
      '/src/assets/images/hero_craft_atelier_1795250373033.jpg',
      '0987333444',
      'maytre@mocmen.vn',
      'APPROVED',
      now
    ).lastInsertRowid
  );
  const shop3Id = Number(
    insertShop.run(
      seller3UserId,
      'Xưởng Sơn Mài & Lụa Kinh Kỳ',
      'xuong-son-mai-kinh-ky',
      'Hạ Thái & Nha Xá',
      'Quy tụ các tác phẩm sơn mài khảm trai, lụa tơ tằm dệt tay và đồ gỗ chạm khắc tinh xảo.',
      '/src/assets/images/prod_lacquer_tray_1795250373747.jpg',
      '/src/assets/images/hero_craft_atelier_1795250373033.jpg',
      '0987555666',
      'sonmai@mocmen.vn',
      'APPROVED',
      now
    ).lastInsertRowid
  );

  // Seed Categories
  const insertCat = db.prepare(
    'INSERT INTO categories (name, slug, description, materialFocus) VALUES (?, ?, ?, ?)'
  );
  const catCeramicId = Number(insertCat.run('Gốm Sứ Nghệ Thuật', 'gom-su', 'Bình hoa, ấm chén men rạn, men ngọc Bát Tràng và Chu Đậu.', 'Đất sét trắng, men tro trấu').lastInsertRowid);
  const catRattanId = Number(insertCat.run('Mây Tre Đan', 'may-tre', 'Túi xách, giỏ trang trí, đèn mây tre thủ công Phú Vinh.', 'Song mây, tre già hun khói').lastInsertRowid);
  const catLacquerId = Number(insertCat.run('Sơn Mài Khảm Trai', 'son-mai', 'Khay trà, hộp trang sức sơn ta Hạ Thái.', 'Sơn ta Phú Thọ, vỏ trai, vàng quỳ').lastInsertRowid);
  const catSilkId = Number(insertCat.run('Lụa & Dệt Thủ Công', 'lua-det', 'Khăn choàng lụa tơ tằm nhuộm chàm tự nhiên Nha Xá.', 'Tơ tằm 100%, màu nhuộm thảo mộc').lastInsertRowid);
  const catWoodId = Number(insertCat.run('Mộc Mỹ Nghệ', 'moc-my-nghe', 'Hộp trà, bát gỗ nguyên khối chạm khắc Đồng Kỵ.', 'Gỗ hương, gỗ trắc tự nhiên').lastInsertRowid);

  // Seed Products
  const insertProduct = db.prepare(`
    INSERT INTO products (
      shopId, categoryId, name, slug, material, originVillage, description, artisanStory,
      basePrice, flashSalePrice, flashSaleEnd, quantityDiscountMin, quantityDiscountPercent,
      stock, isMadeToOrder, productionDays, isPromoted, status, imagesJson, variantsJson,
      soldCount, ratingAvg, reviewCount, createdAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'APPROVED', ?, ?, ?, ?, ?, ?)
  `);

  const futureFlashEnd = new Date(Date.now() + 1000 * 60 * 60 * 48).toISOString();

  const p1Id = Number(
    insertProduct.run(
      shop1Id,
      catCeramicId,
      'Bình Hoa Men Ngọc Lục Bảo Đắp Nổi Liên Hoa',
      'binh-hoa-men-ngoc-lien-hoa',
      'Gốm men rạn cổ',
      'Bát Tràng, Hà Nội',
      'Bình gốm vuốt tay hoàn toàn trên bàn xoay, phủ lớp men ngọc rạn đặc trưng và chạm nổi hoa sen thanh khiết. Nung ở 1280°C giúp cốt gốm đanh chắc và giữ độ bóng sâu theo thời gian.',
      'Nghệ nhân Trần Văn Minh mất 14 ngày từ khâu lọc đất cao lanh, tạo dáng, khắc tỉa từng cánh sen khi đất còn ẩm đến 36 giờ canh lửa lò nung để đạt sắc men ngọc trong trẻo.',
      1650000,
      1420000,
      futureFlashEnd,
      2,
      5,
      14,
      0,
      0,
      1,
      JSON.stringify(['/src/assets/images/prod_ceramic_vase_1795250373703.jpg', '/src/assets/images/hero_craft_atelier_1795250373033.jpg']),
      JSON.stringify([
        { id: 'v1-m', color: 'Men Ngọc Cổ', size: 'Cao 28cm', material: 'Đất cao lanh', priceDelta: 0, stock: 8 },
        { id: 'v1-l', color: 'Men Ngọc Sâu', size: 'Cao 36cm', material: 'Đất cao lanh', priceDelta: 450000, stock: 6 },
      ]),
      32,
      4.9,
      1,
      now
    ).lastInsertRowid
  );

  const p2Id = Number(
    insertProduct.run(
      shop2Id,
      catRattanId,
      'Túi Xách Mây Đan Thủ Công Quai Da Bò Phú Vinh',
      'tui-xach-may-dan-phu-vinh',
      'Song mây tự nhiên & da thuộc',
      'Phú Vinh, Hà Nội',
      'Chiếc túi cấu trúc hộp chữ nhật đan xương cá mật độ cao từ sợi mây chuốt mảnh 1.5mm, phối quai da bò thật khâu tay chắc chắn, lót vải linen thô bên trong.',
      'Mỗi chiếc túi được chị Lê Thị Hương cùng các thợ lành nghề làng Phú Vinh hoàn thiện tỉ mỉ trong 4 ngày liên tục, phơi sương và sấy nhẹ giữ màu mây vàng mật ong tự nhiên.',
      890000,
      null,
      null,
      3,
      8,
      18,
      0,
      0,
      1,
      JSON.stringify(['/src/assets/images/prod_rattan_bag_1795250373275.jpg']),
      JSON.stringify([
        { id: 'v2-nat', color: 'Mây Vàng Mật', size: '24 x 18 x 9cm', material: 'Mây tự nhiên + Da nâu', priceDelta: 0, stock: 10 },
        { id: 'v2-smk', color: 'Mây Hun Khói', size: '28 x 21 x 10cm', material: 'Mây hun khói + Da đen', priceDelta: 120000, stock: 8 },
      ]),
      47,
      4.8,
      1,
      now
    ).lastInsertRowid
  );

  const p3Id = Number(
    insertProduct.run(
      shop3Id,
      catLacquerId,
      'Khay Trà Sơn Mài Đen Khảm Trai Trúc Lâm',
      'khay-tra-son-mai-kham-trai',
      'Sơn ta & vỏ trai biển',
      'Hạ Thái, Thường Tín',
      'Khay chữ nhật bo góc mềm mại, 12 lớp sơn ta ủ ẩm và mài nước thủ công tạo độ sâu như gương, khảm họa tiết khóm trúc và chim én bằng vỏ trai lấp lánh tự nhiên.',
      'Kỹ thuật sơn mài Hạ Thái đòi hỏi sự kiên nhẫn tuyệt đối: mỗi lớp sơn cần 3 ngày ủ khô trong phòng ẩm trước khi nghệ nhân dùng đá mài mịn từng milimet bề mặt.',
      1950000,
      null,
      null,
      2,
      6,
      9,
      1,
      7,
      1,
      JSON.stringify(['/src/assets/images/prod_lacquer_tray_1795250373747.jpg']),
      JSON.stringify([
        { id: 'v3-std', color: 'Đen Huyền Khảm Trai', size: '38 x 26cm', material: 'Gỗ vông + Sơn ta', priceDelta: 0, stock: 9 },
        { id: 'v3-big', color: 'Đen Huyền Khảm Vàng Quỳ', size: '45 x 30cm', material: 'Gỗ vông + Sơn ta + Vàng quỳ', priceDelta: 550000, stock: 4 },
      ]),
      19,
      5.0,
      0,
      now
    ).lastInsertRowid
  );

  const p4Id = Number(
    insertProduct.run(
      shop3Id,
      catSilkId,
      'Khăn Choàng Lụa Tơ Tằm Nha Xá Nhuộm Chàm Thảo Mộc',
      'khan-choang-lua-nha-xa-nhuom-cham',
      'Lụa tơ tằm 100%',
      'Nha Xá, Hà Nam',
      'Khăn dệt trên khung cửi gỗ truyền thống với sợi tơ tằm tự nhiên thoáng nhẹ, nhuộm nhiều nước từ lá chàm và vỏ cây cho sắc xanh lam trầm phối rêu dịu mắt.',
      'Nước nhuộm hoàn toàn từ cây chàm và củ nâu thu hái theo mùa, không hóa chất công nghiệp, càng giặt nhẹ càng mềm mượt và bền màu theo năm tháng.',
      760000,
      680000,
      futureFlashEnd,
      2,
      10,
      25,
      0,
      0,
      0,
      JSON.stringify(['/src/assets/images/prod_silk_scarf_1795250373557.jpg']),
      JSON.stringify([
        { id: 'v4-ind', color: 'Chàm Phối Rêu', size: '190 x 65cm', material: 'Lụa đũi tơ tằm', priceDelta: 0, stock: 15 },
        { id: 'v4-sag', color: 'Xanh Rêu Trầm', size: '190 x 65cm', material: 'Lụa satin tơ tằm', priceDelta: 90000, stock: 10 },
      ]),
      41,
      4.9,
      0,
      now
    ).lastInsertRowid
  );

  const p5Id = Number(
    insertProduct.run(
      shop3Id,
      catWoodId,
      'Hộp Đựng Trà Gỗ Hương Chạm Tứ Quý & Bát Gỗ Mộng Đuôi Én',
      'hop-tra-go-huong-cham-tu-quy',
      'Gỗ hương đỏ tự nhiên',
      'Đồng Kỵ, Bắc Ninh',
      'Bộ hộp đựng trà nắp kín giữ hương chạm nổi họa tiết hoa sen cổ điển đi kèm bát gỗ nguyên khối ghép mộng đuôi én truyền thống, hoàn thiện bằng sáp ong tự nhiên.',
      'Nghệ nhân Phạm Quốc Bảo chọn phần gỗ lõi già không nứt xé, đục tay hoàn toàn bằng bộ đục 24 mũi và đánh bóng bằng lá chuối khô cùng sáp ong rừng.',
      2350000,
      null,
      null,
      null,
      null,
      6,
      1,
      10,
      0,
      JSON.stringify(['/src/assets/images/prod_wood_tea_box_1795250373719.jpg']),
      JSON.stringify([
        { id: 'v5-box', color: 'Nâu Gỗ Hương', size: 'Hộp trà 18cm', material: 'Gỗ hương nguyên khối', priceDelta: 0, stock: 6 },
        { id: 'v5-set', color: 'Nâu Gỗ Hương (Bộ Đôi)', size: 'Hộp trà + Bát ghép mộng', priceDelta: 850000, stock: 3 },
      ]),
      12,
      5.0,
      0,
      now
    ).lastInsertRowid
  );

  const p6Id = Number(
    insertProduct.run(
      shop1Id,
      catCeramicId,
      'Bộ Ấm Chén Trà Đạo Men Rạn Quai Mây Bát Tràng',
      'bo-am-chen-men-ran-quai-may',
      'Gốm men rạn & quai mây',
      'Bát Tràng, Hà Nội',
      'Ấm tích dáng bầu thanh thoát phối quai mây uốn nhiệt thủ công cùng 6 chén trà men ngọc rạn cổ, giữ nhiệt tốt và tôn hương vị trà shan tuyết.',
      'Sự kết hợp giữa đất sét sông Hồng của làng Bát Tràng và nghệ thuật uốn mây Phú Vinh tạo nên tác phẩm giao thoa hai làng nghề truyền thống Bắc Bộ.',
      1280000,
      null,
      null,
      2,
      5,
      11,
      0,
      0,
      0,
      JSON.stringify(['/src/assets/images/hero_craft_atelier_1795250373033.jpg', '/src/assets/images/prod_ceramic_vase_1795250373703.jpg']),
      JSON.stringify([
        { id: 'v6-set', color: 'Men Ngọc Rạn', size: 'Ấm 450ml + 6 chén', material: 'Gốm + Mây', priceDelta: 0, stock: 11 },
      ]),
      27,
      4.8,
      0,
      now
    ).lastInsertRowid
  );

  // Seed Vouchers (Platform & Shop)
  const insertVoucher = db.prepare(`
    INSERT INTO vouchers (scope, shopId, code, title, discountType, discountValue, maxDiscountAmount, minOrderValue, usageLimit, usedCount, startsAt, endsAt, isActive)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, 1)
  `);
  const endsAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 60).toISOString();
  insertVoucher.run('PLATFORM', null, 'LANGNGHE10', 'Giảm 10% toàn sàn (tối đa 250.000đ)', 'PERCENT', 10, 250000, 500000, 500, now, endsAt);
  insertVoucher.run('PLATFORM', null, 'FREESHIPVN', 'Miễn phí vận chuyển toàn sàn', 'FREE_SHIP', 30000, 90000, 400000, 500, now, endsAt);
  insertVoucher.run('SHOP', shop1Id, 'GOMBATTRANG', 'Giảm 100.000đ cho đơn từ 1.000.000đ tại Lò Gốm Minh Tâm', 'FIXED', 100000, 100000, 1000000, 200, now, endsAt);
  insertVoucher.run('SHOP', shop2Id, 'PHUVINH50K', 'Giảm 50.000đ cho đơn Mây Tre Phú Vinh từ 600.000đ', 'FIXED', 50000, 50000, 600000, 200, now, endsAt);

  // Seed Affiliate Profile for demo buyer
  const insertAff = db.prepare(
    'INSERT INTO affiliates (userId, refCode, status, bankInfo, totalClicks, createdAt) VALUES (?, ?, ?, ?, 24, ?)'
  );
  const affId = Number(insertAff.run(buyerId, 'MINHANH26', 'APPROVED', 'Vietcombank - 0011004289102 - NGUYEN MINH ANH', now).lastInsertRowid);

  // Seed 1 historical Multi-Vendor Master Order (2 SubOrders from Shop 1 and Shop 2) for rich initial demo state
  const addrObj: Address = {
    id: 1,
    userId: buyerId,
    recipientName: 'Nguyễn Minh Anh',
    phone: '0912345678',
    province: 'TP. Hà Nội',
    district: 'Quận Hoàn Kiếm',
    ward: 'Phường Tràng Tiền',
    street: '28 Lý Thường Kiệt',
    isDefault: true,
  };
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
        'MM-202611-0001',
        buyerId,
        JSON.stringify(addrObj),
        'SANDBOX_GATEWAY',
        'PAID',
        'LANGNGHE10',
        2310000,
        60000,
        231000,
        0,
        2139000,
        null,
        now
      ).lastInsertRowid
  );

  const sub1Items: OrderItemSnapshot[] = [
    {
      productId: p1Id,
      productName: 'Bình Hoa Men Ngọc Lục Bảo Đắp Nổi Liên Hoa',
      productImage: '/src/assets/images/prod_ceramic_vase_1795250373703.jpg',
      variantId: 'v1-m',
      variantLabel: 'Men Ngọc Cổ · Cao 28cm',
      quantity: 1,
      unitPrice: 1420000,
      lineDiscount: 0,
      lineSubtotal: 1420000,
      isMadeToOrder: false,
      productionDays: 0,
    },
  ];
  const sub2Items: OrderItemSnapshot[] = [
    {
      productId: p2Id,
      productName: 'Túi Xách Mây Đan Thủ Công Quai Da Bò Phú Vinh',
      productImage: '/src/assets/images/prod_rattan_bag_1795250373275.jpg',
      variantId: 'v2-nat',
      variantLabel: 'Mây Vàng Mật · 24 x 18 x 9cm',
      quantity: 1,
      unitPrice: 890000,
      lineDiscount: 0,
      lineSubtotal: 890000,
      isMadeToOrder: false,
      productionDays: 0,
    },
  ];

  const insertSub = db.prepare(`
    INSERT INTO orders_sub (
      masterOrderId, subOrderCode, shopId, buyerId, itemsJson, subtotal, shippingFee,
      shopDiscount, allocatedPlatformDiscount, finalTotal, commissionRate, commissionFee,
      affiliateCommissionFee, sellerNetAmount, orderStatus, paymentStatus, shippingStatus,
      trackingCode, carrierName, createdAt, updatedAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const sub1Id = Number(
    insertSub.run(
      masterId,
      'MM-202611-0001-S1',
      shop1Id,
      buyerId,
      JSON.stringify(sub1Items),
      1420000,
      30000,
      0,
      142000,
      1308000,
      8,
      113600,
      0,
      1306400,
      'COMPLETED',
      'PAID',
      'COMPLETED',
      'GHN-BT-882910',
      'Giao Hàng Nhanh',
      now,
      now
    ).lastInsertRowid
  );

  const sub2Id = Number(
    insertSub.run(
      masterId,
      'MM-202611-0001-S2',
      shop2Id,
      buyerId,
      JSON.stringify(sub2Items),
      890000,
      30000,
      0,
      89000,
      831000,
      8,
      71200,
      0,
      818800,
      'COMPLETED',
      'PAID',
      'COMPLETED',
      'GHTK-PV-441022',
      'Giao Hàng Tiết Kiệm',
      now,
      now
    ).lastInsertRowid
  );

  // Payment Transaction
  db.prepare(`
    INSERT INTO payment_transactions (
      masterOrderId, transactionCode, idempotencyKey, method, amount, status, gatewaySignature, rawPayloadJson, createdAt, updatedAt
    ) VALUES (?, ?, ?, ?, ?, 'SUCCEEDED', ?, ?, ?, ?)
  `).run(
    masterId,
    'TXN-202611-0001',
    'idem_seed_0001',
    'SANDBOX_GATEWAY',
    2139000,
    'verified_seed_hmac',
    JSON.stringify({ provider: 'MocMenSandboxPay', note: 'Initial completed multi-vendor split demo' }),
    now,
    now
  );

  // Seed Verified Reviews
  db.prepare(
    'INSERT INTO reviews (productId, buyerId, subOrderId, rating, comment, status, createdAt) VALUES (?, ?, ?, 5, ?, "VISIBLE", ?)'
  ).run(p1Id, buyerId, sub1Id, 'Men ngọc rạn cực kỳ có chiều sâu, họa tiết sen đắp nổi tinh xảo hơn cả ảnh chụp.', now);

  db.prepare(
    'INSERT INTO reviews (productId, buyerId, subOrderId, rating, comment, status, createdAt) VALUES (?, ?, ?, 5, ?, "VISIBLE", ?)'
  ).run(p2Id, buyerId, sub2Id, 'Sợi mây đan rất khít và đều tay, mùi thơm tự nhiên nhẹ nhàng.', now);

  // Seed sample affiliate commission for another order context
  void affId;
  void p3Id;
  void p4Id;
  void p5Id;
  void p6Id;
}

// Helper mappers
export function mapUserRow(row: any): User {
  return {
    id: row.id,
    email: row.email,
    fullName: row.fullName,
    phone: row.phone,
    roles: JSON.parse(row.rolesJson || '["customer"]') as UserRole[],
    isLocked: Boolean(row.isLocked),
    createdAt: row.createdAt,
  };
}

export function mapShopRow(row: any): Shop {
  return {
    id: row.id,
    ownerId: row.ownerId,
    name: row.name,
    slug: row.slug,
    craftVillage: row.craftVillage,
    description: row.description,
    logoUrl: row.logoUrl,
    bannerUrl: row.bannerUrl,
    contactPhone: row.contactPhone,
    contactEmail: row.contactEmail,
    status: row.status,
    createdAt: row.createdAt,
  };
}

export function mapProductRow(row: any): Product {
  return {
    id: row.id,
    shopId: row.shopId,
    shopName: row.shopName,
    shopVillage: row.shopVillage,
    categoryId: row.categoryId,
    categoryName: row.categoryName,
    name: row.name,
    slug: row.slug,
    material: row.material,
    originVillage: row.originVillage,
    description: row.description,
    artisanStory: row.artisanStory,
    basePrice: row.basePrice,
    flashSalePrice: row.flashSalePrice,
    flashSaleEnd: row.flashSaleEnd,
    quantityDiscountMin: row.quantityDiscountMin,
    quantityDiscountPercent: row.quantityDiscountPercent,
    stock: row.stock,
    isMadeToOrder: Boolean(row.isMadeToOrder),
    productionDays: row.productionDays,
    isPromoted: Boolean(row.isPromoted),
    status: row.status,
    images: JSON.parse(row.imagesJson || '[]') as string[],
    variants: JSON.parse(row.variantsJson || '[]') as ProductVariant[],
    soldCount: row.soldCount,
    ratingAvg: row.ratingAvg,
    reviewCount: row.reviewCount,
    createdAt: row.createdAt,
  };
}

export function mapVoucherRow(row: any): Voucher {
  return {
    id: row.id,
    scope: row.scope,
    shopId: row.shopId,
    shopName: row.shopName,
    code: row.code,
    title: row.title,
    discountType: row.discountType,
    discountValue: row.discountValue,
    maxDiscountAmount: row.maxDiscountAmount,
    minOrderValue: row.minOrderValue,
    usageLimit: row.usageLimit,
    usedCount: row.usedCount,
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    isActive: Boolean(row.isActive),
  };
}

export function mapSubOrderRow(row: any): SubOrder {
  return {
    id: row.id,
    masterOrderId: row.masterOrderId,
    subOrderCode: row.subOrderCode,
    shopId: row.shopId,
    shopName: row.shopName,
    buyerId: row.buyerId,
    buyerName: row.buyerName,
    items: JSON.parse(row.itemsJson || '[]') as OrderItemSnapshot[],
    subtotal: row.subtotal,
    shippingFee: row.shippingFee,
    shopDiscount: row.shopDiscount,
    allocatedPlatformDiscount: row.allocatedPlatformDiscount,
    finalTotal: row.finalTotal,
    commissionRate: row.commissionRate,
    commissionFee: row.commissionFee,
    affiliateCommissionFee: row.affiliateCommissionFee,
    sellerNetAmount: row.sellerNetAmount,
    orderStatus: row.orderStatus,
    paymentStatus: row.paymentStatus,
    shippingStatus: row.shippingStatus,
    trackingCode: row.trackingCode,
    carrierName: row.carrierName,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function getMasterOrderWithSubs(masterId: number): MasterOrder | null {
  const m = db
    .prepare(
      `SELECT m.*, u.fullName as buyerName
       FROM orders_master m
       JOIN users u ON m.buyerId = u.id
       WHERE m.id = ?`
    )
    .get(masterId) as any;
  if (!m) return null;

  const subs = db
    .prepare(
      `SELECT s.*, sh.name as shopName, u.fullName as buyerName
       FROM orders_sub s
       JOIN shops sh ON s.shopId = sh.id
       JOIN users u ON s.buyerId = u.id
       WHERE s.masterOrderId = ?
       ORDER BY s.id ASC`
    )
    .all(masterId)
    .map(mapSubOrderRow);

  return {
    id: m.id,
    orderCode: m.orderCode,
    buyerId: m.buyerId,
    buyerName: m.buyerName,
    shippingAddress: JSON.parse(m.shippingAddressJson),
    paymentMethod: m.paymentMethod,
    paymentStatus: m.paymentStatus,
    platformVoucherCode: m.platformVoucherCode,
    subtotalAmount: m.subtotalAmount,
    shippingTotal: m.shippingTotal,
    platformDiscountTotal: m.platformDiscountTotal,
    shopDiscountTotal: m.shopDiscountTotal,
    grandTotal: m.grandTotal,
    affiliateCode: m.affiliateCode,
    subOrders: subs,
    createdAt: m.createdAt,
  };
}

export function getSetting(key: string, fallback: string): string {
  const row = db.prepare('SELECT value FROM platform_settings WHERE key = ?').get(key) as { value: string } | undefined;
  return row ? row.value : fallback;
}

export function setSetting(key: string, value: string): void {
  db.prepare('INSERT INTO platform_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(
    key,
    value
  );
}

export function mapAddressRow(row: any): Address {
  return {
    id: row.id,
    userId: row.userId,
    recipientName: row.recipientName,
    phone: row.phone,
    province: row.province,
    district: row.district,
    ward: row.ward,
    street: row.street,
    isDefault: Boolean(row.isDefault),
  };
}

export function mapCategoryRow(row: any): Category {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    materialFocus: row.materialFocus,
  };
}

export function mapReviewRow(row: any): Review {
  return {
    id: row.id,
    productId: row.productId,
    productName: row.productName,
    buyerId: row.buyerId,
    buyerName: row.buyerName,
    subOrderId: row.subOrderId,
    rating: row.rating,
    comment: row.comment,
    status: row.status,
    createdAt: row.createdAt,
  };
}

export function mapTicketRow(row: any): SupportTicket {
  return {
    id: row.id,
    subOrderId: row.subOrderId,
    subOrderCode: row.subOrderCode,
    masterOrderId: row.masterOrderId,
    buyerId: row.buyerId,
    buyerName: row.buyerName,
    shopId: row.shopId,
    shopName: row.shopName,
    type: row.type,
    reason: row.reason,
    status: row.status,
    resolutionNote: row.resolutionNote,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function mapTransactionRow(row: any): PaymentTransaction {
  return {
    id: row.id,
    masterOrderId: row.masterOrderId,
    orderCode: row.orderCode,
    transactionCode: row.transactionCode,
    idempotencyKey: row.idempotencyKey,
    method: row.method,
    amount: row.amount,
    status: row.status,
    gatewaySignature: row.gatewaySignature,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function mapAffiliateRow(row: any): AffiliateProfile {
  return {
    id: row.id,
    userId: row.userId,
    userName: row.userName,
    userEmail: row.userEmail,
    refCode: row.refCode,
    status: row.status,
    bankInfo: row.bankInfo,
    totalClicks: row.totalClicks,
    createdAt: row.createdAt,
  };
}

export function mapAffiliateCommissionRow(row: any): AffiliateCommission {
  return {
    id: row.id,
    affiliateId: row.affiliateId,
    refCode: row.refCode,
    subOrderId: row.subOrderId,
    subOrderCode: row.subOrderCode,
    masterOrderId: row.masterOrderId,
    productSummary: row.productSummary,
    orderAmount: row.orderAmount,
    commissionRate: row.commissionRate,
    commissionAmount: row.commissionAmount,
    status: row.status,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function mapMessageRow(row: any): ChatMessage {
  return {
    id: row.id,
    shopId: row.shopId,
    shopName: row.shopName,
    customerId: row.customerId,
    customerName: row.customerName,
    senderId: row.senderId,
    senderRole: row.senderRole,
    productId: row.productId,
    content: row.content,
    createdAt: row.createdAt,
  };
}
