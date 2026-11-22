import type { OrderStatus, PaymentStatus, ShippingStatus } from '../types';

export function formatVND(amount: number): string {
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
    maximumFractionDigits: 0,
  }).format(Math.round(amount || 0));
}

export function formatDateTime(iso: string): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function isSafeImageUrl(url?: string | null): boolean {
  if (!url) return false;
  if (url.startsWith('/src/assets/') || url.startsWith('/assets/')) return true;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

export const ORDER_STATUS_LABEL: Record<OrderStatus, { text: string; tone: string }> = {
  PENDING_CONFIRM: { text: 'Chờ xác nhận', tone: 'text-amber-700' },
  CONFIRMED: { text: 'Đã xác nhận', tone: 'text-[#1D3C5C]' },
  PROCESSING: { text: 'Đang xử lý', tone: 'text-sky-700' },
  COMPLETED: { text: 'Hoàn thành', tone: 'text-emerald-700' },
  CANCELLED: { text: 'Đã hủy', tone: 'text-rose-700' },
  RETURN_REQUESTED: { text: 'Yêu cầu trả hàng', tone: 'text-amber-700' },
  RETURNED: { text: 'Đã hoàn trả', tone: 'text-stone-600' },
};

export const PAYMENT_STATUS_LABEL: Record<PaymentStatus, { text: string; tone: string }> = {
  UNPAID: { text: 'Chưa thanh toán', tone: 'text-amber-700' },
  PENDING_GATEWAY: { text: 'Chờ cổng thanh toán', tone: 'text-sky-700' },
  PAID: { text: 'Đã thanh toán', tone: 'text-emerald-700' },
  REFUNDED: { text: 'Đã hoàn tiền', tone: 'text-stone-600' },
};

export const SHIPPING_STATUS_LABEL: Record<ShippingStatus, { text: string; tone: string }> = {
  AWAITING_CONFIRM: { text: 'Chờ Shop xác nhận', tone: 'text-amber-700' },
  CONFIRMED: { text: 'Shop đã tiếp nhận', tone: 'text-[#1D3C5C]' },
  PREPARING_CRAFT: { text: 'Đang chế tác / đóng gói', tone: 'text-sky-700' },
  IN_TRANSIT: { text: 'Đang vận chuyển', tone: 'text-indigo-700' },
  DELIVERED: { text: 'Đã giao hàng', tone: 'text-emerald-700' },
  COMPLETED: { text: 'Hoàn tất đối soát', tone: 'text-emerald-800' },
  DELIVERY_FAILED: { text: 'Giao thất bại', tone: 'text-rose-700' },
  RETRY_DELIVERY: { text: 'Đang giao lại', tone: 'text-amber-700' },
  CANCELLED: { text: 'Đã hủy vận đơn', tone: 'text-rose-700' },
  RETURNED: { text: 'Hoàn hàng về Shop', tone: 'text-stone-600' },
};
