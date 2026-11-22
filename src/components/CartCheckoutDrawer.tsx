import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, CreditCard, Plus, ShieldCheck, Trash2, X } from 'lucide-react';
import { useApp } from '../context/AppContext';
import type { Address, MasterOrder, PaymentMethod, Voucher } from '../types';
import { formatVND } from '../utils/format';
import { ResilientImage } from './ResilientImage';

interface CartCheckoutDrawerProps {
  open: boolean;
  onClose: () => void;
  vouchers: Voucher[];
  onOpenAuth: () => void;
  onOrderCompleted: (order: MasterOrder) => void;
}

interface PreviewResponse {
  subtotalAmount: number;
  shippingTotal: number;
  shopDiscountTotal: number;
  platformDiscountTotal: number;
  grandTotal: number;
  subOrdersPreview: Array<{
    shopId: number;
    shopName: string;
    subtotal: number;
    shippingFee: number;
    shopDiscount: number;
    allocatedPlatformDiscount: number;
    finalTotal: number;
  }>;
}

export function CartCheckoutDrawer({
  open,
  onClose,
  vouchers,
  onOpenAuth,
  onOrderCompleted,
}: CartCheckoutDrawerProps) {
  const {
    token,
    cart,
    updateCartQuantity,
    removeFromCart,
    clearCart,
    affiliateRefCode,
    setAffiliateRefCode,
    apiFetch,
    showToast,
  } = useApp();

  const [addresses, setAddresses] = useState<Address[]>([]);
  const [selectedAddressId, setSelectedAddressId] = useState<number | null>(null);
  const [showNewAddr, setShowNewAddr] = useState(false);
  const [newAddr, setNewAddr] = useState({
    recipientName: '',
    phone: '',
    province: 'TP. Hà Nội',
    district: '',
    ward: '',
    street: '',
  });

  const [platformVoucherCode, setPlatformVoucherCode] = useState('');
  const [shopVoucherCodes, setShopVoucherCodes] = useState<Record<number, string>>({});
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('SANDBOX_GATEWAY');
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sandbox payment verification state
  const [sandboxModal, setSandboxModal] = useState<{
    masterOrder: MasterOrder;
    transactionCode: string;
    idempotencyKey: string;
    sandboxSignature: string;
    amount: number;
  } | null>(null);
  const [sandboxProcessing, setSandboxProcessing] = useState(false);

  const groupedByShop = useMemo(() => {
    const map = new Map<number, { shopId: number; shopName: string; items: typeof cart }>();
    cart.forEach((item) => {
      const sid = item.product.shopId;
      if (!map.has(sid)) {
        map.set(sid, { shopId: sid, shopName: item.product.shopName || `Gian hàng #${sid}`, items: [] });
      }
      map.get(sid)!.items.push(item);
    });
    return Array.from(map.values());
  }, [cart]);

  useEffect(() => {
    if (!open || !token) return;
    apiFetch<Address[]>('/api/customer/addresses')
      .then((list) => {
        setAddresses(list);
        const def = list.find((a) => a.isDefault) || list[0];
        if (def) setSelectedAddressId(def.id);
      })
      .catch(() => {});
  }, [open, token, apiFetch]);

  useEffect(() => {
    if (!open || !token || cart.length === 0) {
      setPreview(null);
      return;
    }
    const items = cart.map((c) => ({
      productId: c.product.id,
      variantId: c.variantId,
      quantity: c.quantity,
    }));
    apiFetch<PreviewResponse>('/api/orders/preview', {
      method: 'POST',
      body: JSON.stringify({ items, platformVoucherCode, shopVoucherCodes }),
    })
      .then((res) => {
        setPreview(res);
        setError(null);
      })
      .catch((err) => setError(err.message));
  }, [open, token, cart, platformVoucherCode, shopVoucherCodes, apiFetch]);

  if (!open) return null;

  const clientSubtotal = cart.reduce((acc, i) => acc + i.unitPrice * i.quantity, 0);

  const handleCreateAddress = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const created = await apiFetch<Address>('/api/customer/addresses', {
        method: 'POST',
        body: JSON.stringify({ ...newAddr, isDefault: true }),
      });
      setAddresses((prev) => [created, ...prev]);
      setSelectedAddressId(created.id);
      setShowNewAddr(false);
      setNewAddr({ recipientName: '', phone: '', province: 'TP. Hà Nội', district: '', ward: '', street: '' });
      showToast('Đã lưu địa chỉ giao hàng mới.');
    } catch (err: any) {
      showToast(err.message);
    }
  };

  const handlePlaceOrder = async () => {
    if (!token) {
      onOpenAuth();
      return;
    }
    if (!selectedAddressId) {
      setError('Vui lòng chọn hoặc thêm địa chỉ giao hàng.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await apiFetch<{
        masterOrder: MasterOrder;
        payment: {
          transactionCode: string;
          idempotencyKey: string;
          sandboxSignature: string | null;
          amount: number;
        };
      }>('/api/orders', {
        method: 'POST',
        body: JSON.stringify({
          addressId: selectedAddressId,
          paymentMethod,
          platformVoucherCode: platformVoucherCode || null,
          shopVoucherCodes,
          affiliateCode: affiliateRefCode || null,
          items: cart.map((c) => ({
            productId: c.product.id,
            variantId: c.variantId,
            quantity: c.quantity,
          })),
        }),
      });

      clearCart();

      if (paymentMethod === 'SANDBOX_GATEWAY' && res.payment.sandboxSignature) {
        setSandboxModal({
          masterOrder: res.masterOrder,
          transactionCode: res.payment.transactionCode,
          idempotencyKey: res.payment.idempotencyKey,
          sandboxSignature: res.payment.sandboxSignature,
          amount: res.payment.amount,
        });
      } else {
        showToast(`Đã tạo đơn hàng ${res.masterOrder.orderCode} (${res.masterOrder.subOrders.length} đơn con).`);
        onOrderCompleted(res.masterOrder);
        onClose();
      }
    } catch (err: any) {
      setError(err.message || 'Không thể đặt hàng.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSandboxCallback = async (status: 'SUCCEEDED' | 'FAILED') => {
    if (!sandboxModal) return;
    setSandboxProcessing(true);
    try {
      const res = await apiFetch<{ idempotentReplay: boolean; masterOrder: MasterOrder }>(
        '/api/payments/sandbox-callback',
        {
          method: 'POST',
          body: JSON.stringify({
            transactionCode: sandboxModal.transactionCode,
            idempotencyKey: sandboxModal.idempotencyKey,
            status,
            amount: sandboxModal.amount,
            signature: sandboxModal.sandboxSignature,
          }),
        }
      );
      showToast(
        status === 'SUCCEEDED'
          ? `Thanh toán thành công cho đơn ${res.masterOrder.orderCode}.`
          : 'Giao dịch sandbox được ghi nhận thất bại; đơn giữ trạng thái chưa thanh toán.'
      );
      setSandboxModal(null);
      onOrderCompleted(res.masterOrder);
      onClose();
    } catch (err: any) {
      showToast(err.message);
    } finally {
      setSandboxProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-[2px]">
      <div className="w-full max-w-xl bg-white h-full flex flex-col shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#121316]/10">
          <div>
            <h2 className="font-display text-lg font-semibold text-[#121316]">Giỏ hàng &amp; Thanh toán</h2>
            <p className="text-xs text-[#5A5D64]">
              {groupedByShop.length > 1
                ? `Đơn hàng sẽ tự động tách thành ${groupedByShop.length} đơn con theo từng nhà bán`
                : 'Thanh toán một lần, xử lý minh bạch theo từng xưởng'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng"
            className="p-1.5 text-[#5A5D64] hover:text-[#121316] cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {cart.length === 0 && !sandboxModal ? (
            <div className="py-16 text-center">
              <p className="text-sm font-medium text-[#121316]">Giỏ hàng đang trống</p>
              <p className="text-xs text-[#5A5D64] mt-1">Hãy chọn tác phẩm thủ công từ bộ sưu tập.</p>
            </div>
          ) : (
            <>
              {error && (
                <div className="p-3 text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg">{error}</div>
              )}

              {/* Items grouped by Shop */}
              <div className="space-y-4">
                {groupedByShop.map((group, idx) => {
                  const shopVouchers = vouchers.filter((v) => v.scope === 'SHOP' && v.shopId === group.shopId);
                  const subPreview = preview?.subOrdersPreview.find((s) => s.shopId === group.shopId);

                  return (
                    <div key={group.shopId} className="border border-[#121316]/12 rounded-xl p-4 space-y-3 bg-[#F4F4F1]">
                      <div className="flex items-center justify-between border-b border-[#121316]/8 pb-2">
                        <span className="text-xs font-semibold text-[#121316]">
                          Đơn con #{idx + 1} · {group.shopName}
                        </span>
                        {subPreview && (
                          <span className="font-mono text-xs text-[#1D3C5C] font-semibold tabular-nums">
                            {formatVND(subPreview.finalTotal)}
                          </span>
                        )}
                      </div>

                      {group.items.map((item) => (
                        <div key={`${item.product.id}-${item.variantId}`} className="flex items-center gap-3">
                          <div className="w-16 h-12 rounded-lg overflow-hidden bg-[#E6E7E2] shrink-0">
                            <ResilientImage
                              src={item.product.images[0]}
                              alt={item.product.name}
                              className="w-full h-full object-cover"
                            />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-[#121316] truncate">{item.product.name}</p>
                            <p className="text-xs text-[#5A5D64] truncate">{item.variantLabel}</p>
                            <p className="font-mono text-xs font-semibold text-[#1D3C5C] tabular-nums">
                              {formatVND(item.unitPrice)}
                            </p>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => updateCartQuantity(item.product.id, item.variantId, item.quantity - 1)}
                              className="w-7 h-7 bg-white border border-[#121316]/15 rounded text-xs font-semibold cursor-pointer"
                            >
                              −
                            </button>
                            <span className="w-6 text-center font-mono text-xs tabular-nums">{item.quantity}</span>
                            <button
                              type="button"
                              onClick={() => updateCartQuantity(item.product.id, item.variantId, item.quantity + 1)}
                              className="w-7 h-7 bg-white border border-[#121316]/15 rounded text-xs font-semibold cursor-pointer"
                            >
                              +
                            </button>
                            <button
                              type="button"
                              onClick={() => removeFromCart(item.product.id, item.variantId)}
                              className="p-1.5 text-[#5A5D64] hover:text-rose-600 cursor-pointer"
                              aria-label="Xóa"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      ))}

                      {/* Shop Voucher input */}
                      <div className="pt-2 border-t border-[#121316]/8 space-y-1.5">
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={shopVoucherCodes[group.shopId] || ''}
                            onChange={(e) =>
                              setShopVoucherCodes((prev) => ({
                                ...prev,
                                [group.shopId]: e.target.value.toUpperCase(),
                              }))
                            }
                            placeholder="Mã giảm giá riêng của Shop"
                            className="flex-1 px-3 py-1.5 text-xs bg-white border border-[#121316]/12 rounded-lg focus:outline-none focus:border-[#1D3C5C]"
                          />
                          {shopVouchers.map((v) => (
                            <button
                              key={v.id}
                              type="button"
                              onClick={() =>
                                setShopVoucherCodes((prev) => ({ ...prev, [group.shopId]: v.code }))
                              }
                              className="px-2.5 py-1.5 text-xs font-mono text-[#1D3C5C] bg-white border border-[#1D3C5C]/30 rounded-lg hover:bg-[#1D3C5C]/5 cursor-pointer"
                            >
                              {v.code}
                            </button>
                          ))}
                        </div>
                        {subPreview && (
                          <div className="flex justify-between text-[11px] text-[#5A5D64] font-mono tabular-nums">
                            <span>Vận chuyển: {formatVND(subPreview.shippingFee)}</span>
                            <span>
                              Giảm Shop: -{formatVND(subPreview.shopDiscount)} · Phân bổ sàn: -
                              {formatVND(subPreview.allocatedPlatformDiscount)}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Platform Voucher & Affiliate */}
              <div className="space-y-3 pt-2 border-t border-[#121316]/10">
                <div>
                  <label className="block text-xs font-semibold text-[#121316] mb-1.5">Mã khuyến mãi toàn sàn</label>
                  <div className="flex flex-wrap gap-2">
                    <input
                      type="text"
                      value={platformVoucherCode}
                      onChange={(e) => setPlatformVoucherCode(e.target.value.toUpperCase())}
                      placeholder="Nhập mã (vd: LANGNGHE10, FREESHIPVN)"
                      className="flex-1 px-3 py-2 text-xs bg-[#F4F4F1] border border-[#121316]/15 rounded-lg focus:outline-none focus:border-[#1D3C5C]"
                    />
                    {vouchers
                      .filter((v) => v.scope === 'PLATFORM')
                      .slice(0, 2)
                      .map((v) => (
                        <button
                          key={v.id}
                          type="button"
                          onClick={() => setPlatformVoucherCode(v.code)}
                          className="px-3 py-2 text-xs font-mono text-[#1D3C5C] border border-[#1D3C5C]/30 rounded-lg hover:bg-[#1D3C5C]/5 cursor-pointer"
                        >
                          {v.code}
                        </button>
                      ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#121316] mb-1">
                    Mã giới thiệu Affiliate (nếu có)
                  </label>
                  <input
                    type="text"
                    value={affiliateRefCode}
                    onChange={(e) => setAffiliateRefCode(e.target.value.toUpperCase())}
                    placeholder="Tự động ghi nhận qua ?ref= hoặc nhập mã CTV"
                    className="w-full px-3 py-2 text-xs font-mono bg-[#F4F4F1] border border-[#121316]/15 rounded-lg focus:outline-none focus:border-[#1D3C5C]"
                  />
                </div>
              </div>

              {/* Shipping Address */}
              {token && (
                <div className="space-y-2.5 pt-2 border-t border-[#121316]/10">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-[#121316]">Địa chỉ nhận hàng</label>
                    <button
                      type="button"
                      onClick={() => setShowNewAddr((s) => !s)}
                      className="inline-flex items-center gap-1 text-xs font-medium text-[#1D3C5C] cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Thêm địa chỉ mới</span>
                    </button>
                  </div>

                  {showNewAddr && (
                    <form onSubmit={handleCreateAddress} className="p-3 bg-[#F4F4F1] border border-[#121316]/12 rounded-lg space-y-2">
                      <div className="grid grid-cols-2 gap-2">
                        <input
                          required
                          placeholder="Người nhận"
                          value={newAddr.recipientName}
                          onChange={(e) => setNewAddr({ ...newAddr, recipientName: e.target.value })}
                          className="px-2.5 py-1.5 text-xs bg-white border border-[#121316]/12 rounded"
                        />
                        <input
                          required
                          placeholder="Số điện thoại"
                          value={newAddr.phone}
                          onChange={(e) => setNewAddr({ ...newAddr, phone: e.target.value })}
                          className="px-2.5 py-1.5 text-xs bg-white border border-[#121316]/12 rounded"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <input
                          required
                          placeholder="Tỉnh / Thành phố"
                          value={newAddr.province}
                          onChange={(e) => setNewAddr({ ...newAddr, province: e.target.value })}
                          className="px-2.5 py-1.5 text-xs bg-white border border-[#121316]/12 rounded"
                        />
                        <input
                          required
                          placeholder="Quận / Huyện"
                          value={newAddr.district}
                          onChange={(e) => setNewAddr({ ...newAddr, district: e.target.value })}
                          className="px-2.5 py-1.5 text-xs bg-white border border-[#121316]/12 rounded"
                        />
                      </div>
                      <input
                        required
                        placeholder="Số nhà, đường, phường/xã"
                        value={newAddr.street}
                        onChange={(e) => setNewAddr({ ...newAddr, street: e.target.value })}
                        className="w-full px-2.5 py-1.5 text-xs bg-white border border-[#121316]/12 rounded"
                      />
                      <button
                        type="submit"
                        className="px-3 py-1.5 text-xs font-semibold text-white bg-[#1D3C5C] rounded cursor-pointer"
                      >
                        Lưu địa chỉ
                      </button>
                    </form>
                  )}

                  {addresses.length === 0 ? (
                    <p className="text-xs text-[#5A5D64]">Chưa có địa chỉ nào. Vui lòng thêm địa chỉ giao hàng.</p>
                  ) : (
                    <div className="space-y-1.5">
                      {addresses.map((addr) => (
                        <label
                          key={addr.id}
                          className={`flex items-start gap-2.5 p-3 rounded-lg border text-xs cursor-pointer ${
                            selectedAddressId === addr.id
                              ? 'border-[#1D3C5C] bg-[#1D3C5C]/5'
                              : 'border-[#121316]/12 bg-white'
                          }`}
                        >
                          <input
                            type="radio"
                            name="address"
                            checked={selectedAddressId === addr.id}
                            onChange={() => setSelectedAddressId(addr.id)}
                            className="mt-0.5 accent-[#1D3C5C]"
                          />
                          <div>
                            <p className="font-semibold text-[#121316]">
                              {addr.recipientName} · {addr.phone}
                            </p>
                            <p className="text-[#5A5D64]">
                              {addr.street}, {addr.ward ? `${addr.ward}, ` : ''}
                              {addr.district}, {addr.province}
                            </p>
                          </div>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Payment Method */}
              <div className="space-y-2 pt-2 border-t border-[#121316]/10">
                <label className="block text-xs font-semibold text-[#121316]">Phương thức thanh toán</label>
                <div className="grid grid-cols-1 gap-2">
                  {[
                    {
                      id: 'SANDBOX_GATEWAY' as PaymentMethod,
                      title: 'Cổng thanh toán trực tuyến (Sandbox)',
                      desc: 'Xác thực chữ ký HMAC & bảo vệ idempotent',
                    },
                    {
                      id: 'BANK_TRANSFER' as PaymentMethod,
                      title: 'Chuyển khoản ngân hàng',
                      desc: 'Ghi nhận mã đơn tổng và đối soát tự động',
                    },
                    {
                      id: 'COD' as PaymentMethod,
                      title: 'Thanh toán khi nhận hàng (COD)',
                      desc: 'Trả tiền mặt cho bưu tá theo từng kiện hàng',
                    },
                  ].map((m) => (
                    <label
                      key={m.id}
                      className={`flex items-start gap-2.5 p-3 rounded-lg border text-xs cursor-pointer ${
                        paymentMethod === m.id ? 'border-[#1D3C5C] bg-[#1D3C5C]/5' : 'border-[#121316]/12'
                      }`}
                    >
                      <input
                        type="radio"
                        name="payMethod"
                        checked={paymentMethod === m.id}
                        onChange={() => setPaymentMethod(m.id)}
                        className="mt-0.5 accent-[#1D3C5C]"
                      />
                      <div>
                        <p className="font-semibold text-[#121316]">{m.title}</p>
                        <p className="text-[#5A5D64]">{m.desc}</p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer Totals & Submit */}
        {cart.length > 0 && (
          <div className="p-6 border-t border-[#121316]/10 bg-[#F4F4F1] space-y-3">
            <div className="space-y-1 text-xs">
              <div className="flex justify-between text-[#5A5D64]">
                <span>Tạm tính hàng hóa</span>
                <span className="font-mono tabular-nums">
                  {formatVND(preview ? preview.subtotalAmount : clientSubtotal)}
                </span>
              </div>
              {preview && (
                <>
                  <div className="flex justify-between text-[#5A5D64]">
                    <span>Tổng phí vận chuyển ({groupedByShop.length} kiện)</span>
                    <span className="font-mono tabular-nums">{formatVND(preview.shippingTotal)}</span>
                  </div>
                  {preview.shopDiscountTotal > 0 && (
                    <div className="flex justify-between text-emerald-700">
                      <span>Giảm giá từ Shop</span>
                      <span className="font-mono tabular-nums">-{formatVND(preview.shopDiscountTotal)}</span>
                    </div>
                  )}
                  {preview.platformDiscountTotal > 0 && (
                    <div className="flex justify-between text-emerald-700">
                      <span>Ưu đãi toàn sàn (đã phân bổ cho từng đơn con)</span>
                      <span className="font-mono tabular-nums">-{formatVND(preview.platformDiscountTotal)}</span>
                    </div>
                  )}
                </>
              )}
              <div className="flex justify-between text-base font-semibold text-[#121316] pt-2 border-t border-[#121316]/10">
                <span>Tổng thanh toán</span>
                <span className="font-mono text-[#1D3C5C] tabular-nums">
                  {formatVND(preview ? preview.grandTotal : clientSubtotal)}
                </span>
              </div>
            </div>

            {token ? (
              <button
                type="button"
                onClick={handlePlaceOrder}
                disabled={submitting}
                className="w-full py-3 px-4 text-sm font-semibold text-white bg-[#1D3C5C] rounded-lg hover:bg-[#142B43] transition-colors disabled:opacity-60 cursor-pointer"
              >
                {submitting ? 'Đang khởi tạo đơn hàng...' : `Đặt hàng (${groupedByShop.length} đơn con)`}
              </button>
            ) : (
              <button
                type="button"
                onClick={onOpenAuth}
                className="w-full py-3 px-4 text-sm font-semibold text-white bg-[#1D3C5C] rounded-lg hover:bg-[#142B43] transition-colors cursor-pointer"
              >
                Đăng nhập để thanh toán
              </button>
            )}
          </div>
        )}
      </div>

      {/* Sandbox Gateway Verification Modal */}
      {sandboxModal && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md bg-white rounded-xl border border-[#121316]/15 p-6 space-y-4 shadow-2xl">
            <div className="flex items-center gap-2.5 text-[#1D3C5C]">
              <CreditCard className="w-5 h-5" />
              <h3 className="font-display text-lg font-semibold text-[#121316]">Cổng Thanh Toán Sandbox</h3>
            </div>
            <p className="text-xs text-[#5A5D64] leading-relaxed">
              Đơn hàng tổng <strong className="font-mono text-[#121316]">{sandboxModal.masterOrder.orderCode}</strong> đã được tạo và tách thành{' '}
              <strong>{sandboxModal.masterOrder.subOrders.length} đơn con</strong>. Xác nhận kết quả callback từ cổng thanh toán:
            </p>
            <div className="p-3 bg-[#F4F4F1] border border-[#121316]/10 rounded-lg text-xs font-mono space-y-1">
              <div className="flex justify-between">
                <span className="text-[#5A5D64]">Mã giao dịch:</span>
                <span>{sandboxModal.transactionCode}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#5A5D64]">Số tiền:</span>
                <span className="font-semibold text-[#1D3C5C] tabular-nums">{formatVND(sandboxModal.amount)}</span>
              </div>
              <div className="flex items-center gap-1 text-[11px] text-[#5A5D64] pt-1">
                <ShieldCheck className="w-3.5 h-3.5 text-[#1D3C5C]" />
                <span className="truncate">Chữ ký HMAC: {sandboxModal.sandboxSignature.slice(0, 24)}...</span>
              </div>
            </div>
            <div className="flex gap-3">
              <button
                type="button"
                disabled={sandboxProcessing}
                onClick={() => handleSandboxCallback('SUCCEEDED')}
                className="flex-1 inline-flex items-center justify-center gap-1.5 py-2.5 px-4 text-xs font-semibold text-white bg-[#1D3C5C] rounded-lg hover:bg-[#142B43] cursor-pointer"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Xác nhận thành công</span>
              </button>
              <button
                type="button"
                disabled={sandboxProcessing}
                onClick={() => handleSandboxCallback('FAILED')}
                className="px-4 py-2.5 text-xs font-semibold text-rose-700 bg-rose-50 border border-rose-200 rounded-lg hover:bg-rose-100 cursor-pointer"
              >
                Mô phỏng lỗi
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
