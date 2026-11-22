export type UserRole = 'customer' | 'seller' | 'affiliate' | 'admin';

export interface User {
  id: number;
  email: string;
  fullName: string;
  phone: string;
  roles: UserRole[];
  isLocked: boolean;
  createdAt: string;
}

export interface Address {
  id: number;
  userId: number;
  recipientName: string;
  phone: string;
  province: string;
  district: string;
  ward: string;
  street: string;
  isDefault: boolean;
}

export interface Shop {
  id: number;
  ownerId: number;
  name: string;
  slug: string;
  craftVillage: string;
  description: string;
  logoUrl: string;
  bannerUrl: string;
  contactPhone: string;
  contactEmail: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'SUSPENDED';
  createdAt: string;
}

export interface Category {
  id: number;
  name: string;
  slug: string;
  description: string;
  materialFocus: string;
}

export interface ProductVariant {
  id: string;
  color: string;
  size: string;
  material: string;
  priceDelta: number;
  stock: number;
}

export interface Product {
  id: number;
  shopId: number;
  shopName?: string;
  shopVillage?: string;
  categoryId: number;
  categoryName?: string;
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
  isPromoted: boolean;
  status: 'PENDING_REVIEW' | 'APPROVED' | 'HIDDEN' | 'REJECTED';
  images: string[];
  variants: ProductVariant[];
  soldCount: number;
  ratingAvg: number;
  reviewCount: number;
  createdAt: string;
}

export interface Voucher {
  id: number;
  scope: 'PLATFORM' | 'SHOP';
  shopId: number | null;
  shopName?: string;
  code: string;
  title: string;
  discountType: 'PERCENT' | 'FIXED' | 'FREE_SHIP';
  discountValue: number;
  maxDiscountAmount: number | null;
  minOrderValue: number;
  usageLimit: number;
  usedCount: number;
  startsAt: string;
  endsAt: string;
  isActive: boolean;
}

export type OrderStatus =
  | 'PENDING_CONFIRM'
  | 'CONFIRMED'
  | 'PROCESSING'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'RETURN_REQUESTED'
  | 'RETURNED';

export type PaymentStatus = 'UNPAID' | 'PENDING_GATEWAY' | 'PAID' | 'REFUNDED';

export type ShippingStatus =
  | 'AWAITING_CONFIRM'
  | 'CONFIRMED'
  | 'PREPARING_CRAFT'
  | 'IN_TRANSIT'
  | 'DELIVERED'
  | 'COMPLETED'
  | 'DELIVERY_FAILED'
  | 'RETRY_DELIVERY'
  | 'CANCELLED'
  | 'RETURNED';

export type PaymentMethod = 'COD' | 'BANK_TRANSFER' | 'SANDBOX_GATEWAY';

export interface OrderItemSnapshot {
  productId: number;
  productName: string;
  productImage: string;
  variantId: string;
  variantLabel: string;
  quantity: number;
  unitPrice: number;
  lineDiscount: number;
  lineSubtotal: number;
  isMadeToOrder: boolean;
  productionDays: number;
}

export interface SubOrder {
  id: number;
  masterOrderId: number;
  subOrderCode: string;
  shopId: number;
  shopName?: string;
  buyerId: number;
  buyerName?: string;
  items: OrderItemSnapshot[];
  subtotal: number;
  shippingFee: number;
  shopDiscount: number;
  allocatedPlatformDiscount: number;
  finalTotal: number;
  commissionRate: number;
  commissionFee: number;
  affiliateCommissionFee: number;
  sellerNetAmount: number;
  orderStatus: OrderStatus;
  paymentStatus: PaymentStatus;
  shippingStatus: ShippingStatus;
  trackingCode: string | null;
  carrierName: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MasterOrder {
  id: number;
  orderCode: string;
  buyerId: number;
  buyerName?: string;
  shippingAddress: Address;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  platformVoucherCode: string | null;
  subtotalAmount: number;
  shippingTotal: number;
  platformDiscountTotal: number;
  shopDiscountTotal: number;
  grandTotal: number;
  affiliateCode: string | null;
  subOrders: SubOrder[];
  createdAt: string;
}

export interface PaymentTransaction {
  id: number;
  masterOrderId: number;
  orderCode?: string;
  transactionCode: string;
  idempotencyKey: string;
  method: PaymentMethod;
  amount: number;
  status: 'INITIATED' | 'SUCCEEDED' | 'FAILED' | 'REFUNDED';
  gatewaySignature: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AffiliateProfile {
  id: number;
  userId: number;
  userName?: string;
  userEmail?: string;
  refCode: string;
  status: 'PENDING' | 'APPROVED' | 'SUSPENDED';
  bankInfo: string;
  totalClicks: number;
  createdAt: string;
}

export interface AffiliateCommission {
  id: number;
  affiliateId: number;
  refCode?: string;
  subOrderId: number;
  subOrderCode?: string;
  masterOrderId: number;
  productSummary: string;
  orderAmount: number;
  commissionRate: number;
  commissionAmount: number;
  status: 'PENDING' | 'APPROVED' | 'PAID' | 'CANCELLED';
  createdAt: string;
  updatedAt: string;
}

export interface Review {
  id: number;
  productId: number;
  productName?: string;
  buyerId: number;
  buyerName?: string;
  subOrderId: number;
  rating: number;
  comment: string;
  status: 'VISIBLE' | 'HIDDEN';
  createdAt: string;
}

export interface SupportTicket {
  id: number;
  subOrderId: number;
  subOrderCode?: string;
  masterOrderId: number;
  buyerId: number;
  buyerName?: string;
  shopId: number;
  shopName?: string;
  type: 'CANCEL' | 'RETURN' | 'REFUND' | 'COMPLAINT';
  reason: string;
  status: 'OPEN' | 'SELLER_APPROVED' | 'ADMIN_APPROVED_REFUND' | 'REJECTED' | 'RESOLVED';
  resolutionNote: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ChatMessage {
  id: number;
  shopId: number;
  shopName?: string;
  customerId: number;
  customerName?: string;
  senderId: number;
  senderRole: 'customer' | 'seller';
  productId: number | null;
  content: string;
  createdAt: string;
}

export interface CartItem {
  product: Product;
  variantId: string;
  variantLabel: string;
  unitPrice: number;
  quantity: number;
}

export interface SmartRecommendationItem {
  productId: number;
  reason: string;
  pairingTip: string;
}
