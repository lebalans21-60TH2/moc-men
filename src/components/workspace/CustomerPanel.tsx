import React, { useCallback, useEffect, useState } from 'react';
import { ArrowRight, CheckCircle2, Heart, MapPin, MessageSquare, Package, Radio, RefreshCw, RotateCcw, ShoppingBag, Trash2, User as UserIcon } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import type { Address, MasterOrder, Product, SubOrder, SupportTicket } from '../../types';
import {
  formatDateTime,
  formatVND,
  ORDER_STATUS_LABEL,
  PAYMENT_STATUS_LABEL,
  SHIPPING_STATUS_LABEL,
} from '../../utils/format';
import { ResilientImage } from '../ResilientImage';
import { OrderTrackingStepper } from './OrderTrackingStepper';

export type CustomerPanelTab = 'orders' | 'wishlist' | 'addresses' | 'tickets' | 'profile';

interface CustomerPanelProps {
  allProducts: Product[];
  activeTab?: CustomerPanelTab;
  onChangeTab?: (tab: CustomerPanelTab) => void;
  onSelectProduct: (id: number) => void;
  onBackToStore?: () => void;
  onOpenChatWithShop: (shopId: number) => void;
}

export function CustomerPanel({
  allProducts,
  activeTab,
  onChangeTab,
  onSelectProduct,
  onBackToStore,
  onOpenChatWithShop,
}: CustomerPanelProps) {
  const { user, token, wishlistIds, toggleWishlist, clearWishlist, addToCart, apiFetch, refreshAccount, showToast } = useApp();
  const [internalTab, setInternalTab] = useState<CustomerPanelTab>(activeTab || 'orders');
  const tab = activeTab ?? internalTab;
  const setTab = (next: CustomerPanelTab) => {
    setInternalTab(next);
    onChangeTab?.(next);
  };

  const [orders, setOrders] = useState<MasterOrder[]>([]);
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [liveConnected, setLiveConnected] = useState(false);
  const [highlightedSubId, setHighlightedSubId] = useState<number | null>(null);

  // Ticket modal
  const [ticketSubId, setTicketSubId] = useState<number | null>(null);
  const [ticketType, setTicketType] = useState<'CANCEL' | 'RETURN' | 'REFUND' | 'COMPLAINT'>('RETURN');
  const [ticketReason, setTicketReason] = useState('');

  // New Address form
  const [addrForm, setAddrForm] = useState({
    recipientName: '',
    phone: '',
    province: 'TP. Hà Nội',
    district: '',
    ward: '',
    street: '',
    isDefault: false,
  });

  // Profile form
  const [fullName, setFullName] = useState(user?.fullName || '');
  const [phone, setPhone] = useState(user?.phone || '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');

  const loadData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [ordRes, addrRes, tickRes] = await Promise.all([
        apiFetch<MasterOrder[]>('/api/customer/orders'),
        apiFetch<Address[]>('/api/customer/addresses'),
        apiFetch<SupportTicket[]>('/api/customer/tickets'),
      ]);
      setOrders(ordRes);
      setAddresses(addrRes);
      setTickets(tickRes);
    } catch {
      // ignore
    } finally {
      if (!silent) setLoading(false);
    }
  }, [apiFetch]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // Real-time Server-Sent Events subscription for instant order tracking updates
  useEffect(() => {
    if (!token) {
      setLiveConnected(false);
      return;
    }

    let cancelled = false;
    let activeController: AbortController | null = null;
    let reconnectTimer: number | null = null;
    let highlightTimer: number | null = null;
    let hasConnectedOnce = false;

    const applyOrderUpdated = (subOrder: SubOrder, masterOrder?: MasterOrder) => {
      setOrders((prev) => {
        if (masterOrder) {
          const exists = prev.some((m) => m.id === masterOrder.id);
          return exists ? prev.map((m) => (m.id === masterOrder.id ? masterOrder : m)) : [masterOrder, ...prev];
        }
        return prev.map((m) => {
          if (m.id !== subOrder.masterOrderId) return m;
          return {
            ...m,
            subOrders: m.subOrders.map((s) => (s.id === subOrder.id ? subOrder : s)),
          };
        });
      });
      setHighlightedSubId(subOrder.id);
      if (highlightTimer) window.clearTimeout(highlightTimer);
      highlightTimer = window.setTimeout(() => setHighlightedSubId(null), 4000);
      const label = SHIPPING_STATUS_LABEL[subOrder.shippingStatus]?.text || subOrder.shippingStatus;
      showToast(`Đơn ${subOrder.subOrderCode}: ${label}`);
    };

    const connectStream = async (attempt = 0) => {
      if (cancelled) return;
      const controller = new AbortController();
      activeController = controller;

      try {
        const res = await fetch('/api/customer/orders/stream', {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'text/event-stream',
          },
          signal: controller.signal,
        });
        if (!res.ok || !res.body) {
          throw new Error(`Stream error ${res.status}`);
        }

        setLiveConnected(true);
        if (hasConnectedOnce) {
          void loadData(true);
        }
        hasConnectedOnce = true;

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (!cancelled) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          const frames = buffer.split('\n\n');
          buffer = frames.pop() || '';

          for (const frame of frames) {
            if (!frame.trim() || frame.startsWith(':')) continue;
            let eventType = 'message';
            const dataLines: string[] = [];
            for (const line of frame.split('\n')) {
              if (line.startsWith('event:')) {
                eventType = line.slice(6).trim();
              } else if (line.startsWith('data:')) {
                dataLines.push(line.slice(5).trim());
              }
            }
            if (dataLines.length === 0) continue;
            try {
              const payload = JSON.parse(dataLines.join('\n'));
              if (eventType === 'order:created' && payload.masterOrder) {
                setOrders((prev) =>
                  prev.some((m) => m.id === payload.masterOrder.id) ? prev : [payload.masterOrder, ...prev]
                );
              } else if (eventType === 'order:updated' && payload.subOrder) {
                applyOrderUpdated(payload.subOrder, payload.masterOrder);
              }
            } catch {
              // Ignore malformed SSE payload
            }
          }
        }
      } catch {
        // Reconnect below unless unmounted
      } finally {
        setLiveConnected(false);
        if (!cancelled) {
          const delayMs = Math.min(8000, 1500 * Math.max(1, attempt + 1));
          reconnectTimer = window.setTimeout(() => {
            void connectStream(attempt + 1);
          }, delayMs);
        }
      }
    };

    void connectStream(0);

    return () => {
      cancelled = true;
      activeController?.abort();
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      if (highlightTimer) window.clearTimeout(highlightTimer);
    };
  }, [token, loadData, showToast]);

  useEffect(() => {
    if (user) {
      setFullName(user.fullName);
      setPhone(user.phone);
    }
  }, [user]);

  const handleConfirmReceived = async (subId: number) => {
    try {
      await apiFetch(`/api/customer/sub-orders/${subId}/confirm-received`, { method: 'POST' });
      showToast('Đã xác nhận nhận hàng thành công.');
      await loadData();
    } catch (err: any) {
      showToast(err.message);
    }
  };

  const handleSubmitTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ticketSubId) return;
    try {
      await apiFetch('/api/customer/tickets', {
        method: 'POST',
        body: JSON.stringify({ subOrderId: ticketSubId, type: ticketType, reason: ticketReason }),
      });
      showToast('Đã gửi yêu cầu hỗ trợ / đổi trả.');
      setTicketSubId(null);
      setTicketReason('');
      await loadData();
    } catch (err: any) {
      showToast(err.message);
    }
  };

  const handleAddAddress = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch('/api/customer/addresses', {
        method: 'POST',
        body: JSON.stringify(addrForm),
      });
      setAddrForm({ recipientName: '', phone: '', province: 'TP. Hà Nội', district: '', ward: '', street: '', isDefault: false });
      showToast('Đã thêm địa chỉ mới.');
      await loadData();
    } catch (err: any) {
      showToast(err.message);
    }
  };

  const handleSetDefaultAddr = async (id: number) => {
    await apiFetch(`/api/customer/addresses/${id}/default`, { method: 'PATCH' });
    await loadData();
  };

  const handleDeleteAddr = async (id: number) => {
    await apiFetch(`/api/customer/addresses/${id}`, { method: 'DELETE' });
    await loadData();
  };

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch('/api/auth/profile', {
        method: 'PUT',
        body: JSON.stringify({ fullName, phone }),
      });
      await refreshAccount();
      showToast('Đã cập nhật hồ sơ cá nhân.');
    } catch (err: any) {
      showToast(err.message);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch('/api/auth/password', {
        method: 'PUT',
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      setCurrentPassword('');
      setNewPassword('');
      showToast('Đã đổi mật khẩu tài khoản thành công.');
    } catch (err: any) {
      showToast(err.message);
    }
  };

  const wishedProducts = allProducts.filter((p) => wishlistIds.includes(p.id));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-1.5 p-1 bg-[#E6E7E2] rounded-lg w-fit">
        {[
          { id: 'orders', label: `Đơn hàng (${orders.length})`, icon: Package },
          { id: 'wishlist', label: `Yêu thích (${wishedProducts.length})`, icon: Heart },
          { id: 'addresses', label: `Địa chỉ (${addresses.length})`, icon: MapPin },
          { id: 'tickets', label: `Đổi trả & Hỗ trợ (${tickets.length})`, icon: RotateCcw },
          { id: 'profile', label: 'Hồ sơ', icon: UserIcon },
        ].map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id as any)}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                tab === item.id ? 'bg-white text-[#121316] shadow-sm' : 'text-[#5A5D64] hover:text-[#121316]'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>

      {loading && <div className="h-32 bg-[#E6E7E2] rounded-xl animate-pulse" />}

      {!loading && tab === 'orders' && (
        <div className="space-y-5">
          {/* Real-time Tracking Status Bar */}
          <div className="bg-white border border-[#121316]/10 rounded-xl px-5 py-3.5 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2.5 text-xs">
              <Radio className={`w-4 h-4 ${liveConnected ? 'text-emerald-700' : 'text-amber-700'}`} />
              <span className="font-semibold text-[#121316]">Theo dõi trạng thái đơn hàng theo thời gian thực</span>
              <span className="text-[#5A5D64]">·</span>
              <span className={liveConnected ? 'text-emerald-700 font-medium' : 'text-amber-700 font-medium'}>
                {liveConnected ? 'Đã kết nối luồng cập nhật trực tiếp' : 'Đang đồng bộ kết nối...'}
              </span>
            </div>
            <button
              type="button"
              onClick={() => void loadData(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#121316] border border-[#121316]/15 rounded-lg hover:bg-[#F4F4F1] transition-colors cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Làm mới</span>
            </button>
          </div>

          {orders.length === 0 ? (
            <div className="p-10 text-center bg-white border border-[#121316]/10 rounded-xl">
              <p className="text-sm font-medium text-[#121316]">Bạn chưa có đơn hàng nào</p>
              <p className="text-xs text-[#5A5D64] mt-1">Các đơn hàng sau khi thanh toán sẽ hiển thị tiến trình theo dõi trực tiếp tại đây.</p>
            </div>
          ) : (
            orders.map((master) => (
              <div key={master.id} className="bg-white border border-[#121316]/12 rounded-xl overflow-hidden">
                {/* Master Order Header */}
                <div className="px-5 py-4 bg-[#F4F4F1] border-b border-[#121316]/10 flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2 text-xs text-[#5A5D64]">
                      <span className="font-mono font-semibold text-[#121316]">{master.orderCode}</span>
                      <span>·</span>
                      <span className="tabular-nums">{formatDateTime(master.createdAt)}</span>
                      <span>·</span>
                      <span>{master.paymentMethod}</span>
                      <span>·</span>
                      <span className={PAYMENT_STATUS_LABEL[master.paymentStatus].tone}>
                        {PAYMENT_STATUS_LABEL[master.paymentStatus].text}
                      </span>
                    </div>
                    <p className="text-xs text-[#5A5D64] mt-1">
                      Giao tới: {master.shippingAddress.recipientName} ({master.shippingAddress.phone}) —{' '}
                      {master.shippingAddress.street}, {master.shippingAddress.district}, {master.shippingAddress.province}
                    </p>
                  </div>

                  <div className="text-right">
                    <p className="text-xs text-[#5A5D64]">Tổng thanh toán ({master.subOrders.length} đơn con)</p>
                    <p className="font-mono text-base font-semibold text-[#1D3C5C] tabular-nums">
                      {formatVND(master.grandTotal)}
                    </p>
                  </div>
                </div>

                {/* SubOrders */}
                <div className="divide-y divide-[#121316]/10">
                  {master.subOrders.map((sub) => (
                    <div key={sub.id} className="p-5 space-y-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="text-xs space-y-0.5">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-mono font-semibold text-[#121316]">{sub.subOrderCode}</span>
                            <span className="text-[#5A5D64]">·</span>
                            <span className="font-semibold text-[#1D3C5C]">{sub.shopName}</span>
                            {sub.trackingCode && (
                              <>
                                <span className="text-[#5A5D64]">·</span>
                                <span className="font-mono text-[#5A5D64]">
                                  {sub.carrierName}: {sub.trackingCode}
                                </span>
                              </>
                            )}
                          </div>
                          {/* 3 Independent Status Fields */}
                          <div className="flex flex-wrap items-center gap-3 pt-1">
                            <span>
                              Đơn hàng:{' '}
                              <strong className={ORDER_STATUS_LABEL[sub.orderStatus].tone}>
                                {ORDER_STATUS_LABEL[sub.orderStatus].text}
                              </strong>
                            </span>
                            <span className="text-[#5A5D64]">|</span>
                            <span>
                              Thanh toán:{' '}
                              <strong className={PAYMENT_STATUS_LABEL[sub.paymentStatus].tone}>
                                {PAYMENT_STATUS_LABEL[sub.paymentStatus].text}
                              </strong>
                            </span>
                            <span className="text-[#5A5D64]">|</span>
                            <span>
                              Vận chuyển:{' '}
                              <strong className={SHIPPING_STATUS_LABEL[sub.shippingStatus].tone}>
                                {SHIPPING_STATUS_LABEL[sub.shippingStatus].text}
                              </strong>
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => onOpenChatWithShop(sub.shopId)}
                            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-[#121316] border border-[#121316]/15 rounded-lg hover:bg-[#E6E7E2] cursor-pointer"
                          >
                            <MessageSquare className="w-3.5 h-3.5" />
                            <span>Chat Shop</span>
                          </button>

                          {['DELIVERED', 'IN_TRANSIT'].includes(sub.shippingStatus) &&
                            sub.orderStatus !== 'COMPLETED' && (
                              <button
                                type="button"
                                onClick={() => handleConfirmReceived(sub.id)}
                                className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-white bg-[#1D3C5C] rounded-lg hover:bg-[#142B43] cursor-pointer"
                              >
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                <span>Đã nhận hàng</span>
                              </button>
                            )}

                          {!['CANCELLED', 'RETURNED'].includes(sub.orderStatus) && (
                            <button
                              type="button"
                              onClick={() => setTicketSubId(sub.id)}
                              className="px-3 py-1.5 text-xs font-medium text-rose-700 border border-rose-200 rounded-lg hover:bg-rose-50 cursor-pointer"
                            >
                              Hủy / Trả hàng
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Real-time 4-stage Tracking Stepper: Confirmed -> Preparing -> In Transit -> Delivered */}
                      <OrderTrackingStepper
                        orderStatus={sub.orderStatus}
                        shippingStatus={sub.shippingStatus}
                        trackingCode={sub.trackingCode}
                        carrierName={sub.carrierName}
                        updatedAt={sub.updatedAt}
                        isHighlighted={highlightedSubId === sub.id}
                      />

                      <div className="space-y-2">
                        {sub.items.map((item, idx) => (
                          <div key={idx} className="flex items-center justify-between gap-4 text-xs">
                            <div className="flex items-center gap-3 min-w-0">
                              <div className="w-12 h-9 rounded overflow-hidden bg-[#E6E7E2] shrink-0">
                                <ResilientImage
                                  src={item.productImage}
                                  alt={item.productName}
                                  className="w-full h-full object-cover"
                                />
                              </div>
                              <div className="min-w-0">
                                <p className="font-medium text-[#121316] truncate">{item.productName}</p>
                                <p className="text-[#5A5D64]">
                                  {item.variantLabel} · SL: {item.quantity}
                                </p>
                              </div>
                            </div>
                            <span className="font-mono font-medium text-[#121316] tabular-nums shrink-0">
                              {formatVND(item.lineSubtotal)}
                            </span>
                          </div>
                        ))}
                      </div>

                      <div className="flex flex-wrap justify-between gap-2 pt-2 border-t border-[#121316]/8 text-xs text-[#5A5D64] font-mono tabular-nums">
                        <span>
                          Phí ship: {formatVND(sub.shippingFee)} · Giảm Shop: -{formatVND(sub.shopDiscount)} · Phân bổ
                          sàn: -{formatVND(sub.allocatedPlatformDiscount)}
                        </span>
                        <span className="font-semibold text-[#121316]">Thành tiền đơn con: {formatVND(sub.finalTotal)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {!loading && tab === 'wishlist' && (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-4 bg-white border border-[#121316]/10 rounded-2xl px-5 py-4">
            <div>
              <h3 className="font-display text-2xl font-semibold text-[#121316]">Bộ sưu tập Yêu thích</h3>
              <p className="text-xs text-[#5A5D64] mt-0.5 tabular-nums">
                {wishedProducts.length > 0
                  ? `${wishedProducts.length} tác phẩm thủ công được lưu vào tài khoản của bạn`
                  : 'Lưu các tác phẩm gốm, sơn mài, mây tre yêu thích để dễ dàng xem lại hoặc đặt mua.'}
              </p>
            </div>
            {wishedProducts.length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    wishedProducts.forEach((p) => addToCart(p, p.variants[0]?.id || 'default', 1));
                  }}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#1D3C5C] rounded-xl hover:bg-[#142B43] transition-colors cursor-pointer"
                >
                  <ShoppingBag className="w-3.5 h-3.5" />
                  <span>Thêm tất cả vào giỏ</span>
                </button>
                <button
                  type="button"
                  onClick={() => void clearWishlist()}
                  className="px-3.5 py-2 text-xs font-medium text-[#9E3B2B] border border-[#9E3B2B]/25 rounded-xl hover:bg-[#9E3B2B]/5 transition-colors cursor-pointer"
                >
                  Xóa tất cả
                </button>
              </div>
            )}
          </div>

          {wishedProducts.length === 0 ? (
            <div className="p-12 text-center bg-white border border-[#121316]/10 rounded-3xl shadow-[0_6px_24px_-6px_rgba(18,19,22,0.06)] space-y-3">
              <div className="w-12 h-12 mx-auto rounded-full bg-[#F4F4F1] flex items-center justify-center text-[#9E3B2B]">
                <Heart className="w-5 h-5" />
              </div>
              <p className="font-display text-2xl font-semibold text-[#121316]">Chưa có sản phẩm yêu thích nào</p>
              <p className="text-xs text-[#5A5D64] max-w-md mx-auto">
                Nhấn biểu tượng trái tim trên bất kỳ tác phẩm nào tại trang trưng bày để lưu vào danh sách yêu thích của bạn.
              </p>
              {onBackToStore && (
                <button
                  type="button"
                  onClick={onBackToStore}
                  className="inline-flex items-center gap-2 mt-2 px-5 py-2.5 text-xs font-semibold text-white bg-[#1D3C5C] rounded-xl hover:bg-[#142B43] transition-colors cursor-pointer"
                >
                  <span>Khám phá bộ sưu tập</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          ) : (
            <div className="columns-1 md:columns-2 lg:columns-3 gap-5">
              {wishedProducts.map((p, idx) => (
                <div
                  key={p.id}
                  className="break-inside-avoid mb-5 bg-white border border-[#121316]/8 rounded-3xl p-3 shadow-[0_6px_24px_-6px_rgba(18,19,22,0.07),0_2px_6px_-2px_rgba(18,19,22,0.04)] hover:-translate-y-1 hover:shadow-[0_18px_36px_-12px_rgba(29,60,92,0.14)] transition-all duration-300 flex flex-col"
                >
                  <div
                    onClick={() => onSelectProduct(p.id)}
                    className={`relative ${idx % 2 === 0 ? 'aspect-[4/5]' : 'aspect-[4/3]'} rounded-2xl overflow-hidden bg-[#E6E7E2] mb-3 cursor-pointer`}
                  >
                    <ResilientImage src={p.images[0]} alt={p.name} className="w-full h-full object-cover" />
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        void toggleWishlist(p.id);
                      }}
                      aria-label="Bỏ khỏi yêu thích"
                      aria-pressed="true"
                      className="absolute top-3 right-3 w-8 h-8 rounded-full bg-white/90 backdrop-blur-md border border-[#121316]/10 shadow-sm flex items-center justify-center cursor-pointer hover:scale-105 transition-transform"
                    >
                      <Heart className="w-3.5 h-3.5 fill-[#9E3B2B] text-[#9E3B2B]" />
                    </button>
                  </div>
                  <div className="px-2 pb-1.5">
                    <p className="text-[11px] text-[#5A5D64] mb-1">
                      {p.originVillage} · {p.material}
                    </p>
                    <h4
                      onClick={() => onSelectProduct(p.id)}
                      className="font-display text-xl font-semibold text-[#121316] line-clamp-1 cursor-pointer hover:text-[#1D3C5C] transition-colors"
                    >
                      {p.name}
                    </h4>
                    <p className="text-[11px] text-[#5A5D64] mt-0.5">{p.shopName}</p>
                    <div className="flex items-baseline gap-2 my-2">
                      <span className="font-mono text-sm text-[#1D3C5C] font-semibold tabular-nums">
                        {formatVND(p.flashSalePrice ?? p.basePrice)}
                      </span>
                      {p.flashSalePrice && p.flashSalePrice < p.basePrice && (
                        <span className="font-mono text-xs text-[#5A5D64] line-through tabular-nums">
                          {formatVND(p.basePrice)}
                        </span>
                      )}
                    </div>
                    <div className="pt-2.5 border-t border-[#121316]/8 flex gap-2">
                      <button
                        type="button"
                        onClick={() => addToCart(p, p.variants[0]?.id || 'default', 1)}
                        className="flex-1 py-2 text-xs font-semibold text-white bg-[#1D3C5C] rounded-xl cursor-pointer hover:bg-[#142B43] transition-colors"
                      >
                        Thêm giỏ hàng
                      </button>
                      <button
                        type="button"
                        onClick={() => void toggleWishlist(p.id)}
                        className="px-3 py-2 text-xs text-rose-700 border border-rose-200 rounded-xl cursor-pointer hover:bg-rose-50 transition-colors"
                      >
                        Bỏ lưu
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {!loading && tab === 'addresses' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-7 space-y-3">
            {addresses.map((addr) => (
              <div
                key={addr.id}
                className="bg-white border border-[#121316]/10 rounded-xl p-4 flex items-start justify-between gap-4"
              >
                <div className="text-xs space-y-1">
                  <p className="font-semibold text-[#121316]">
                    {addr.recipientName} · {addr.phone}{' '}
                    {addr.isDefault && <span className="text-[#1D3C5C] ml-1">(Mặc định)</span>}
                  </p>
                  <p className="text-[#5A5D64]">
                    {addr.street}, {addr.ward ? `${addr.ward}, ` : ''}
                    {addr.district}, {addr.province}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {!addr.isDefault && (
                    <button
                      type="button"
                      onClick={() => handleSetDefaultAddr(addr.id)}
                      className="text-xs font-medium text-[#1D3C5C] hover:underline cursor-pointer"
                    >
                      Đặt mặc định
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => handleDeleteAddr(addr.id)}
                    className="p-1.5 text-[#5A5D64] hover:text-rose-600 cursor-pointer"
                    aria-label="Xóa địa chỉ"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>

          <form onSubmit={handleAddAddress} className="lg:col-span-5 bg-white border border-[#121316]/10 rounded-xl p-5 space-y-3">
            <h3 className="text-sm font-semibold text-[#121316]">Thêm địa chỉ giao hàng</h3>
            <input
              required
              placeholder="Họ tên người nhận"
              value={addrForm.recipientName}
              onChange={(e) => setAddrForm({ ...addrForm, recipientName: e.target.value })}
              className="w-full px-3 py-2 text-xs bg-[#F4F4F1] border border-[#121316]/12 rounded-lg"
            />
            <input
              required
              placeholder="Số điện thoại"
              value={addrForm.phone}
              onChange={(e) => setAddrForm({ ...addrForm, phone: e.target.value })}
              className="w-full px-3 py-2 text-xs bg-[#F4F4F1] border border-[#121316]/12 rounded-lg"
            />
            <div className="grid grid-cols-2 gap-2">
              <input
                required
                placeholder="Tỉnh / Thành phố"
                value={addrForm.province}
                onChange={(e) => setAddrForm({ ...addrForm, province: e.target.value })}
                className="px-3 py-2 text-xs bg-[#F4F4F1] border border-[#121316]/12 rounded-lg"
              />
              <input
                required
                placeholder="Quận / Huyện"
                value={addrForm.district}
                onChange={(e) => setAddrForm({ ...addrForm, district: e.target.value })}
                className="px-3 py-2 text-xs bg-[#F4F4F1] border border-[#121316]/12 rounded-lg"
              />
            </div>
            <input
              placeholder="Phường / Xã"
              value={addrForm.ward}
              onChange={(e) => setAddrForm({ ...addrForm, ward: e.target.value })}
              className="w-full px-3 py-2 text-xs bg-[#F4F4F1] border border-[#121316]/12 rounded-lg"
            />
            <input
              required
              placeholder="Số nhà, tên đường"
              value={addrForm.street}
              onChange={(e) => setAddrForm({ ...addrForm, street: e.target.value })}
              className="w-full px-3 py-2 text-xs bg-[#F4F4F1] border border-[#121316]/12 rounded-lg"
            />
            <label className="flex items-center gap-2 text-xs text-[#5A5D64]">
              <input
                type="checkbox"
                checked={addrForm.isDefault}
                onChange={(e) => setAddrForm({ ...addrForm, isDefault: e.target.checked })}
              />
              <span>Đặt làm địa chỉ mặc định</span>
            </label>
            <button
              type="submit"
              className="w-full py-2.5 text-xs font-semibold text-white bg-[#1D3C5C] rounded-lg cursor-pointer"
            >
              Lưu địa chỉ
            </button>
          </form>
        </div>
      )}

      {!loading && tab === 'tickets' && (
        <div className="space-y-3">
          {tickets.length === 0 ? (
            <div className="p-10 text-center bg-white border border-[#121316]/10 rounded-xl text-sm text-[#5A5D64]">
              Bạn chưa có yêu cầu hủy đơn, đổi trả hoặc hoàn tiền nào.
            </div>
          ) : (
            tickets.map((t) => (
              <div key={t.id} className="bg-white border border-[#121316]/10 rounded-xl p-4 text-xs space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-mono font-semibold text-[#121316]">
                    {t.subOrderCode} · {t.shopName} · {t.type}
                  </span>
                  <span className="font-semibold text-[#1D3C5C]">{t.status}</span>
                </div>
                <p className="text-[#5A5D64]">Lý do: {t.reason}</p>
                {t.resolutionNote && <p className="text-[#121316]">Phản hồi: {t.resolutionNote}</p>}
              </div>
            ))
          )}
        </div>
      )}

      {!loading && tab === 'profile' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <div className="lg:col-span-6 space-y-6">
            <form onSubmit={handleUpdateProfile} className="bg-white border border-[#121316]/10 rounded-2xl p-6 space-y-4">
              <h3 className="font-display text-2xl font-semibold text-[#121316]">Thông tin tài khoản thống nhất</h3>
              <p className="text-xs text-[#5A5D64]">
                Email: <strong className="text-[#121316]">{user?.email}</strong> · Vai trò:{' '}
                <span className="font-mono">{user?.roles.join(', ')}</span>
              </p>
              <div>
                <label className="block text-xs font-medium text-[#5A5D64] mb-1">Họ và tên</label>
                <input
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full px-3.5 py-2 text-sm bg-[#F4F4F1] border border-[#121316]/15 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#5A5D64] mb-1">Số điện thoại</label>
                <input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full px-3.5 py-2 text-sm bg-[#F4F4F1] border border-[#121316]/15 rounded-lg"
                />
              </div>
              <button
                type="submit"
                className="px-5 py-2.5 text-xs font-semibold text-white bg-[#1D3C5C] rounded-xl hover:bg-[#142B43] transition-colors cursor-pointer"
              >
                Lưu thay đổi
              </button>
            </form>

            <form onSubmit={handleChangePassword} className="bg-white border border-[#121316]/10 rounded-2xl p-6 space-y-4">
              <h3 className="font-display text-2xl font-semibold text-[#121316]">Đổi mật khẩu đăng nhập</h3>
              <div>
                <label className="block text-xs font-medium text-[#5A5D64] mb-1">Mật khẩu hiện tại</label>
                <input
                  type="password"
                  required
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-3.5 py-2 text-sm bg-[#F4F4F1] border border-[#121316]/15 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#5A5D64] mb-1">Mật khẩu mới (tối thiểu 6 ký tự)</label>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-3.5 py-2 text-sm bg-[#F4F4F1] border border-[#121316]/15 rounded-lg"
                />
              </div>
              <button
                type="submit"
                className="px-5 py-2.5 text-xs font-semibold text-white bg-[#121316] rounded-xl hover:bg-[#1D3C5C] transition-colors cursor-pointer"
              >
                Cập nhật mật khẩu
              </button>
            </form>
          </div>

          {/* Saved Favorites Showcase directly accessible in Profile Section */}
          <div className="lg:col-span-6 bg-white border border-[#121316]/10 rounded-2xl p-6 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="font-display text-2xl font-semibold text-[#121316]">Sản phẩm yêu thích</h3>
                <p className="text-xs text-[#5A5D64] tabular-nums mt-0.5">
                  Đang lưu {wishedProducts.length} tác phẩm trong hồ sơ cá nhân
                </p>
              </div>
              <button
                type="button"
                onClick={() => setTab('wishlist')}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-[#1D3C5C] border border-[#1D3C5C]/25 rounded-xl hover:bg-[#1D3C5C]/5 transition-colors cursor-pointer whitespace-nowrap"
              >
                <Heart className={`w-3.5 h-3.5 ${wishedProducts.length > 0 ? 'fill-[#9E3B2B] text-[#9E3B2B]' : ''}`} />
                <span>Xem tất cả</span>
              </button>
            </div>

            {wishedProducts.length === 0 ? (
              <div className="p-6 text-center bg-[#F4F4F1] rounded-2xl border border-[#121316]/8 space-y-2">
                <p className="text-xs text-[#5A5D64]">Bạn chưa lưu sản phẩm yêu thích nào.</p>
                {onBackToStore && (
                  <button
                    type="button"
                    onClick={onBackToStore}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#1D3C5C] hover:underline cursor-pointer"
                  >
                    <span>Khám phá tác phẩm ngay</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-2.5">
                {wishedProducts.slice(0, 4).map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center justify-between gap-3 p-2.5 bg-[#F4F4F1] border border-[#121316]/8 rounded-xl"
                  >
                    <div
                      onClick={() => onSelectProduct(p.id)}
                      className="flex items-center gap-3 min-w-0 cursor-pointer group"
                    >
                      <div className="w-12 h-12 rounded-lg overflow-hidden bg-[#E6E7E2] shrink-0">
                        <ResilientImage src={p.images[0]} alt={p.name} className="w-full h-full object-cover" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-[#121316] truncate group-hover:text-[#1D3C5C] transition-colors">
                          {p.name}
                        </p>
                        <p className="font-mono text-[11px] text-[#1D3C5C] font-semibold tabular-nums">
                          {formatVND(p.flashSalePrice ?? p.basePrice)}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => addToCart(p, p.variants[0]?.id || 'default', 1)}
                        className="px-2.5 py-1.5 text-[11px] font-semibold text-white bg-[#1D3C5C] rounded-lg hover:bg-[#142B43] cursor-pointer"
                      >
                        Thêm giỏ
                      </button>
                      <button
                        type="button"
                        onClick={() => void toggleWishlist(p.id)}
                        aria-label="Bỏ lưu"
                        className="p-1.5 text-[#9E3B2B] hover:bg-rose-50 rounded-lg cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
                {wishedProducts.length > 4 && (
                  <button
                    type="button"
                    onClick={() => setTab('wishlist')}
                    className="w-full py-2 text-xs font-medium text-[#1D3C5C] hover:underline cursor-pointer"
                  >
                    + Xem thêm {wishedProducts.length - 4} sản phẩm yêu thích khác
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Support / Return Ticket Modal */}
      {ticketSubId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <form
            onSubmit={handleSubmitTicket}
            className="w-full max-w-md bg-white border border-[#121316]/15 rounded-xl p-6 space-y-4 shadow-xl"
          >
            <h3 className="font-display text-lg font-semibold text-[#121316]">Yêu cầu hủy đơn / đổi trả</h3>
            <div>
              <label className="block text-xs font-medium text-[#5A5D64] mb-1">Loại yêu cầu</label>
              <select
                value={ticketType}
                onChange={(e) => setTicketType(e.target.value as any)}
                className="w-full px-3 py-2 text-xs bg-[#F4F4F1] border border-[#121316]/15 rounded-lg"
              >
                <option value="CANCEL">Hủy đơn hàng</option>
                <option value="RETURN">Đổi trả hàng</option>
                <option value="REFUND">Yêu cầu hoàn tiền</option>
                <option value="COMPLAINT">Khiếu nại chất lượng</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-[#5A5D64] mb-1">Lý do chi tiết</label>
              <textarea
                required
                rows={3}
                value={ticketReason}
                onChange={(e) => setTicketReason(e.target.value)}
                placeholder="Mô tả vấn đề sản phẩm hoặc lý do hủy..."
                className="w-full px-3 py-2 text-xs bg-[#F4F4F1] border border-[#121316]/15 rounded-lg"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setTicketSubId(null)}
                className="px-4 py-2 text-xs text-[#5A5D64] border border-[#121316]/15 rounded-lg cursor-pointer"
              >
                Hủy bỏ
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-xs font-semibold text-white bg-[#1D3C5C] rounded-lg cursor-pointer"
              >
                Gửi yêu cầu
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
