import React, { useEffect, useState } from 'react';
import { BarChart3, ImagePlus, MessageSquare, Package, Plus, RotateCcw, Store, Tag, Trash2, Truck, Upload, X } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import type { Category, Product, Shop, SubOrder, SupportTicket, Voucher } from '../../types';
import {
  formatVND,
  ORDER_STATUS_LABEL,
  PAYMENT_STATUS_LABEL,
  SHIPPING_STATUS_LABEL,
} from '../../utils/format';
import { ResilientImage } from '../ResilientImage';

interface SellerPanelProps {
  categories: Category[];
  onRefreshCatalog: () => void;
  onOpenChatThread: (shopId: number, customerId: number) => void;
}

const IMAGE_PRESETS = [
  { label: 'Gốm men ngọc', url: '/src/assets/images/prod_ceramic_vase_1795250373703.jpg' },
  { label: 'Túi mây Phú Vinh', url: '/src/assets/images/prod_rattan_bag_1795250373275.jpg' },
  { label: 'Khay sơn mài Hạ Thái', url: '/src/assets/images/prod_lacquer_tray_1795250373747.jpg' },
  { label: 'Khăn lụa Nha Xá', url: '/src/assets/images/prod_silk_scarf_1795250373557.jpg' },
  { label: 'Hộp trà gỗ hương', url: '/src/assets/images/prod_wood_tea_box_1795250373719.jpg' },
  { label: 'Bộ trà xưởng gốm', url: '/src/assets/images/hero_craft_atelier_1795250373033.jpg' },
];

export function SellerPanel({ categories, onRefreshCatalog, onOpenChatThread }: SellerPanelProps) {
  const { token, shop, apiFetch, refreshAccount, showToast } = useApp();
  const [tab, setTab] = useState<'analytics' | 'orders' | 'products' | 'vouchers' | 'tickets' | 'chat' | 'shop'>(
    'analytics'
  );
  const [integrations, setIntegrations] = useState<{ database: 'mongodb' | 'sqlite'; cloudinaryConfigured: boolean }>({
    database: 'sqlite',
    cloudinaryConfigured: false,
  });
  const [uploadingTarget, setUploadingTarget] = useState<'product' | 'logo' | 'banner' | null>(null);
  const [customImageUrl, setCustomImageUrl] = useState('');

  // Registration form (if no shop yet)
  const [regForm, setRegForm] = useState({
    name: '',
    craftVillage: '',
    description: '',
    contactPhone: '',
    contactEmail: '',
  });

  const [analytics, setAnalytics] = useState<any>(null);
  const [subOrders, setSubOrders] = useState<SubOrder[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [vouchers, setVouchers] = useState<Voucher[]>([]);
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [threads, setThreads] = useState<Array<{ shopId: number; customerId: number; customerName: string }>>([]);

  // Shop update form
  const [shopEdit, setShopEdit] = useState({
    name: shop?.name || '',
    craftVillage: shop?.craftVillage || '',
    description: shop?.description || '',
    contactPhone: shop?.contactPhone || '',
    contactEmail: shop?.contactEmail || '',
    logoUrl: shop?.logoUrl || IMAGE_PRESETS[0].url,
    bannerUrl: shop?.bannerUrl || IMAGE_PRESETS[5].url,
  });

  // New Product form
  const [showAddProduct, setShowAddProduct] = useState(false);
  const [prodForm, setProdForm] = useState({
    name: '',
    categoryId: categories[0]?.id || 1,
    material: '',
    originVillage: shop?.craftVillage || '',
    basePrice: 850000,
    flashSalePrice: '',
    stock: 10,
    isMadeToOrder: false,
    productionDays: 5,
    quantityDiscountMin: '',
    quantityDiscountPercent: '',
    description: '',
    artisanStory: '',
    images: [IMAGE_PRESETS[0].url] as string[],
    variantColor: 'Nguyên bản',
    variantSize: 'Tiêu chuẩn',
  });

  // Shipping modal for dispatch
  const [dispatchSubId, setDispatchSubId] = useState<number | null>(null);
  const [carrierName, setCarrierName] = useState('Giao Hàng Nhanh');
  const [trackingCode, setTrackingCode] = useState('');

  // New Voucher form
  const [voucherForm, setVoucherForm] = useState({
    code: '',
    title: '',
    discountType: 'FIXED',
    discountValue: 50000,
    minOrderValue: 500000,
    usageLimit: 100,
  });

  const loadSellerData = async () => {
    if (!shop) return;
    try {
      const [ana, ords, prods, vchs, tks, ths] = await Promise.all([
        apiFetch('/api/seller/analytics'),
        apiFetch<SubOrder[]>('/api/seller/sub-orders'),
        apiFetch<Product[]>('/api/seller/products'),
        apiFetch<Voucher[]>('/api/seller/vouchers'),
        apiFetch<SupportTicket[]>('/api/seller/tickets'),
        apiFetch<any[]>('/api/chat/threads'),
      ]);
      setAnalytics(ana);
      setSubOrders(ords);
      setProducts(prods);
      setVouchers(vchs);
      setTickets(tks);
      setThreads(ths.filter((t) => t.shopId === shop.id));
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    apiFetch<{ database: 'mongodb' | 'sqlite'; cloudinaryConfigured: boolean }>('/api/system/integrations')
      .then((info) => setIntegrations(info))
      .catch(() => {});
  }, [apiFetch]);

  useEffect(() => {
    if (shop) {
      setShopEdit({
        name: shop.name,
        craftVillage: shop.craftVillage,
        description: shop.description,
        contactPhone: shop.contactPhone,
        contactEmail: shop.contactEmail,
        logoUrl: shop.logoUrl || IMAGE_PRESETS[0].url,
        bannerUrl: shop.bannerUrl || IMAGE_PRESETS[5].url,
      });
      void loadSellerData();
    }
  }, [shop]);

  const uploadFilesToCloudinary = async (files: FileList | null, target: 'product' | 'logo' | 'banner') => {
    if (!files || files.length === 0) return;
    if (!token) {
      showToast('Vui lòng đăng nhập lại để tải ảnh.');
      return;
    }

    const formData = new FormData();
    const limit = target === 'product' ? 6 : 1;
    Array.from(files)
      .slice(0, limit)
      .forEach((file) => formData.append('images', file));
    formData.append('folder', target === 'product' ? 'moc-men/crafts' : 'moc-men/shops');

    setUploadingTarget(target);
    try {
      const res = await fetch('/api/upload/images', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'Tải ảnh lên Cloudinary thất bại.');
      }
      const urls: string[] = Array.isArray(data.urls) ? data.urls : [];
      if (urls.length === 0) {
        throw new Error('Không nhận được đường dẫn ảnh từ Cloudinary.');
      }

      if (target === 'product') {
        setProdForm((prev) => ({
          ...prev,
          images: [...new Set([...prev.images, ...urls])].slice(0, 6),
        }));
        showToast(`Đã tải ${urls.length} ảnh sản phẩm lên Cloudinary.`);
      } else if (target === 'logo') {
        setShopEdit((prev) => ({ ...prev, logoUrl: urls[0] }));
        showToast('Đã tải logo gian hàng lên Cloudinary. Nhấn "Cập nhật gian hàng" để lưu.');
      } else {
        setShopEdit((prev) => ({ ...prev, bannerUrl: urls[0] }));
        showToast('Đã tải ảnh bìa gian hàng lên Cloudinary. Nhấn "Cập nhật gian hàng" để lưu.');
      }
    } catch (err: any) {
      showToast(err.message);
    } finally {
      setUploadingTarget(null);
    }
  };

  const handleRegisterShop = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch('/api/seller/register-shop', {
        method: 'POST',
        body: JSON.stringify(regForm),
      });
      await refreshAccount();
      showToast('Đã gửi đăng ký mở gian hàng. Vui lòng chờ Admin phê duyệt.');
    } catch (err: any) {
      showToast(err.message);
    }
  };

  if (!shop) {
    return (
      <form onSubmit={handleRegisterShop} className="max-w-xl bg-white border border-[#121316]/10 rounded-xl p-6 space-y-4">
        <h3 className="font-display text-xl font-semibold text-[#121316]">Đăng ký mở Gian hàng Nghệ nhân</h3>
        <p className="text-xs text-[#5A5D64] leading-relaxed">
          Tài khoản hiện tại của bạn sẽ được bổ sung vai trò Nhà bán hàng. Sau khi Admin duyệt gian hàng, sản phẩm của bạn sẽ hiển thị trên sàn.
        </p>
        <div>
          <label className="block text-xs font-medium text-[#5A5D64] mb-1">Tên gian hàng / Xưởng thủ công</label>
          <input
            required
            value={regForm.name}
            onChange={(e) => setRegForm({ ...regForm, name: e.target.value })}
            placeholder="VD: Gốm Sứ Chu Đậu Hải Dương"
            className="w-full px-3.5 py-2 text-sm bg-[#F4F4F1] border border-[#121316]/15 rounded-lg"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-[#5A5D64] mb-1">Làng nghề / Địa chỉ xưởng</label>
          <input
            required
            value={regForm.craftVillage}
            onChange={(e) => setRegForm({ ...regForm, craftVillage: e.target.value })}
            placeholder="VD: Nam Sách, Hải Dương"
            className="w-full px-3.5 py-2 text-sm bg-[#F4F4F1] border border-[#121316]/15 rounded-lg"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-[#5A5D64] mb-1">SĐT liên hệ</label>
            <input
              required
              value={regForm.contactPhone}
              onChange={(e) => setRegForm({ ...regForm, contactPhone: e.target.value })}
              className="w-full px-3.5 py-2 text-sm bg-[#F4F4F1] border border-[#121316]/15 rounded-lg"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-[#5A5D64] mb-1">Email gian hàng</label>
            <input
              type="email"
              required
              value={regForm.contactEmail}
              onChange={(e) => setRegForm({ ...regForm, contactEmail: e.target.value })}
              className="w-full px-3.5 py-2 text-sm bg-[#F4F4F1] border border-[#121316]/15 rounded-lg"
            />
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-[#5A5D64] mb-1">Mô tả nghề &amp; câu chuyện xưởng</label>
          <textarea
            required
            rows={3}
            value={regForm.description}
            onChange={(e) => setRegForm({ ...regForm, description: e.target.value })}
            className="w-full px-3.5 py-2 text-sm bg-[#F4F4F1] border border-[#121316]/15 rounded-lg"
          />
        </div>
        <button
          type="submit"
          className="px-5 py-2.5 text-xs font-semibold text-white bg-[#1D3C5C] rounded-lg cursor-pointer"
        >
          Đăng ký mở gian hàng
        </button>
      </form>
    );
  }

  const handleOrderAction = async (subId: number, action: string, extra?: { trackingCode?: string; carrierName?: string }) => {
    try {
      await apiFetch(`/api/seller/sub-orders/${subId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ action, ...extra }),
      });
      await loadSellerData();
      showToast('Đã cập nhật trạng thái đơn hàng con.');
    } catch (err: any) {
      showToast(err.message);
    }
  };

  const handleCreateProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch('/api/seller/products', {
        method: 'POST',
        body: JSON.stringify({
          name: prodForm.name,
          categoryId: prodForm.categoryId,
          material: prodForm.material,
          originVillage: prodForm.originVillage,
          basePrice: prodForm.basePrice,
          flashSalePrice: prodForm.flashSalePrice ? Number(prodForm.flashSalePrice) : null,
          stock: prodForm.stock,
          isMadeToOrder: prodForm.isMadeToOrder,
          productionDays: prodForm.productionDays,
          quantityDiscountMin: prodForm.quantityDiscountMin ? Number(prodForm.quantityDiscountMin) : null,
          quantityDiscountPercent: prodForm.quantityDiscountPercent ? Number(prodForm.quantityDiscountPercent) : null,
          description: prodForm.description,
          artisanStory: prodForm.artisanStory,
          images: prodForm.images.length > 0 ? prodForm.images : [IMAGE_PRESETS[0].url],
          variants: [
            {
              id: `v-${Date.now()}`,
              color: prodForm.variantColor,
              size: prodForm.variantSize,
              material: prodForm.material,
              priceDelta: 0,
              stock: prodForm.stock,
            },
          ],
        }),
      });
      setShowAddProduct(false);
      setProdForm((prev) => ({
        ...prev,
        name: '',
        material: '',
        description: '',
        artisanStory: '',
        images: [IMAGE_PRESETS[0].url],
      }));
      await loadSellerData();
      onRefreshCatalog();
      showToast('Đã thêm sản phẩm và gửi Admin kiểm duyệt.');
    } catch (err: any) {
      showToast(err.message);
    }
  };

  const handleQuickStockUpdate = async (prod: Product, newStock: number) => {
    try {
      await apiFetch(`/api/seller/products/${prod.id}`, {
        method: 'PUT',
        body: JSON.stringify({ stock: Math.max(0, newStock) }),
      });
      await loadSellerData();
      onRefreshCatalog();
    } catch (err: any) {
      showToast(err.message);
    }
  };

  const handleDeleteProduct = async (id: number) => {
    try {
      await apiFetch(`/api/seller/products/${id}`, { method: 'DELETE' });
      await loadSellerData();
      onRefreshCatalog();
      showToast('Đã xóa sản phẩm.');
    } catch (err: any) {
      showToast(err.message);
    }
  };

  const handleCreateVoucher = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch('/api/seller/vouchers', {
        method: 'POST',
        body: JSON.stringify(voucherForm),
      });
      setVoucherForm({ code: '', title: '', discountType: 'FIXED', discountValue: 50000, minOrderValue: 500000, usageLimit: 100 });
      await loadSellerData();
      showToast('Đã tạo mã khuyến mãi riêng cho Shop.');
    } catch (err: any) {
      showToast(err.message);
    }
  };

  const handleUpdateShop = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch<Shop>('/api/seller/shop', {
        method: 'PUT',
        body: JSON.stringify(shopEdit),
      });
      await refreshAccount();
      showToast('Đã cập nhật hồ sơ gian hàng.');
    } catch (err: any) {
      showToast(err.message);
    }
  };

  const handleTicketDecision = async (ticketId: number, approve: boolean) => {
    try {
      await apiFetch(`/api/seller/tickets/${ticketId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          approve,
          resolutionNote: approve ? 'Shop đồng ý tiếp nhận đổi trả.' : 'Shop từ chối yêu cầu.',
        }),
      });
      await loadSellerData();
      showToast('Đã cập nhật phản hồi yêu cầu đổi trả.');
    } catch (err: any) {
      showToast(err.message);
    }
  };

  return (
    <div className="space-y-6">
      {/* Shop Status Bar */}
      <div className="bg-white border border-[#121316]/10 rounded-xl px-5 py-3.5 flex flex-wrap items-center justify-between gap-4">
        <div className="text-xs">
          <span className="font-semibold text-sm text-[#121316] mr-2">{shop.name}</span>
          <span className="text-[#5A5D64]">· {shop.craftVillage} · Trạng thái duyệt: </span>
          <strong className={shop.status === 'APPROVED' ? 'text-emerald-700' : 'text-amber-700'}>{shop.status}</strong>
        </div>
      </div>

      {/* Sub-navigation */}
      <div className="flex flex-wrap gap-1.5 p-1 bg-[#E6E7E2] rounded-lg w-fit">
        {[
          { id: 'analytics', label: 'Doanh thu & Đối soát', icon: BarChart3 },
          { id: 'orders', label: `Đơn hàng con (${subOrders.length})`, icon: Truck },
          { id: 'products', label: `Sản phẩm (${products.length})`, icon: Package },
          { id: 'vouchers', label: `Khuyến mãi (${vouchers.length})`, icon: Tag },
          { id: 'tickets', label: `Đổi trả (${tickets.length})`, icon: RotateCcw },
          { id: 'chat', label: `Tin nhắn (${threads.length})`, icon: MessageSquare },
          { id: 'shop', label: 'Hồ sơ Shop', icon: Store },
        ].map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id as any)}
              className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-md whitespace-nowrap shrink-0 cursor-pointer ${
                tab === item.id ? 'bg-white text-[#121316] shadow-sm' : 'text-[#5A5D64] hover:text-[#121316]'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>

      {/* TAB 1: ANALYTICS */}
      {tab === 'analytics' && analytics && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white border border-[#121316]/10 rounded-xl p-4">
              <p className="text-xs text-[#5A5D64]">Doanh số hàng hóa</p>
              <p className="font-mono text-xl font-semibold text-[#121316] tabular-nums mt-1">
                {formatVND(analytics.grossMerchandise)}
              </p>
            </div>
            <div className="bg-white border border-[#121316]/10 rounded-xl p-4">
              <p className="text-xs text-[#5A5D64]">Phí hoa hồng sàn</p>
              <p className="font-mono text-xl font-semibold text-amber-700 tabular-nums mt-1">
                -{formatVND(analytics.totalCommissionFee)}
              </p>
            </div>
            <div className="bg-white border border-[#121316]/10 rounded-xl p-4">
              <p className="text-xs text-[#5A5D64]">Thực nhận đã đối soát</p>
              <p className="font-mono text-xl font-semibold text-emerald-700 tabular-nums mt-1">
                {formatVND(analytics.settledNetRevenue)}
              </p>
            </div>
            <div className="bg-white border border-[#121316]/10 rounded-xl p-4">
              <p className="text-xs text-[#5A5D64]">Chờ đối soát · Tồn kho thấp</p>
              <p className="font-mono text-xl font-semibold text-[#1D3C5C] tabular-nums mt-1">
                {formatVND(analytics.pendingSettlement)} <span className="text-xs text-[#5A5D64]">({analytics.lowStockCount} SP)</span>
              </p>
            </div>
          </div>

          <div className="bg-white border border-[#121316]/10 rounded-xl overflow-hidden">
            <div className="px-5 py-3.5 border-b border-[#121316]/10">
              <h3 className="text-sm font-semibold text-[#121316]">Sản phẩm bán chạy của xưởng</h3>
            </div>
            <table className="w-full text-xs text-left">
              <thead className="bg-[#F4F4F1] text-[#5A5D64] border-b border-[#121316]/10">
                <tr>
                  <th className="py-3 px-4 font-medium">Sản phẩm</th>
                  <th className="py-3 px-4 font-medium text-right">Giá bán</th>
                  <th className="py-3 px-4 font-medium text-right">Đã bán</th>
                  <th className="py-3 px-4 font-medium text-right">Tồn kho</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#121316]/8">
                {analytics.topProducts.map((p: Product) => (
                  <tr key={p.id}>
                    <td className="py-3 px-4 font-medium text-[#121316]">{p.name}</td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums">{formatVND(p.flashSalePrice ?? p.basePrice)}</td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums">{p.soldCount}</td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums">
                      {p.isMadeToOrder ? 'Đặt chế tác' : p.stock}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 2: SUB-ORDERS & SHIPPING */}
      {tab === 'orders' && (
        <div className="space-y-4">
          {subOrders.length === 0 ? (
            <div className="p-10 text-center bg-white border border-[#121316]/10 rounded-xl text-sm text-[#5A5D64]">
              Chưa có đơn hàng con nào thuộc gian hàng của bạn.
            </div>
          ) : (
            subOrders.map((sub) => (
              <div key={sub.id} className="bg-white border border-[#121316]/10 rounded-xl p-5 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="text-xs space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-semibold text-[#121316]">{sub.subOrderCode}</span>
                      <span className="text-[#5A5D64]">·</span>
                      <span>Khách: {sub.buyerName}</span>
                      {sub.trackingCode && (
                        <>
                          <span className="text-[#5A5D64]">·</span>
                          <span className="font-mono text-[#1D3C5C]">
                            {sub.carrierName}: {sub.trackingCode}
                          </span>
                        </>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-3">
                      <span className={ORDER_STATUS_LABEL[sub.orderStatus].tone}>
                        Đơn: {ORDER_STATUS_LABEL[sub.orderStatus].text}
                      </span>
                      <span className={PAYMENT_STATUS_LABEL[sub.paymentStatus].tone}>
                        TT: {PAYMENT_STATUS_LABEL[sub.paymentStatus].text}
                      </span>
                      <span className={SHIPPING_STATUS_LABEL[sub.shippingStatus].tone}>
                        Vận chuyển: {SHIPPING_STATUS_LABEL[sub.shippingStatus].text}
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {sub.orderStatus === 'PENDING_CONFIRM' && (
                      <>
                        <button
                          type="button"
                          onClick={() => handleOrderAction(sub.id, 'CONFIRM')}
                          className="px-3 py-1.5 text-xs font-semibold text-white bg-[#1D3C5C] rounded-lg cursor-pointer"
                        >
                          Xác nhận đơn
                        </button>
                        <button
                          type="button"
                          onClick={() => handleOrderAction(sub.id, 'CANCEL')}
                          className="px-3 py-1.5 text-xs font-medium text-rose-700 border border-rose-200 rounded-lg cursor-pointer"
                        >
                          Từ chối đơn
                        </button>
                      </>
                    )}
                    {sub.shippingStatus === 'CONFIRMED' && (
                      <button
                        type="button"
                        onClick={() => handleOrderAction(sub.id, 'PREPARE')}
                        className="px-3 py-1.5 text-xs font-semibold text-white bg-[#1D3C5C] rounded-lg cursor-pointer"
                      >
                        Bắt đầu chế tác / đóng gói
                      </button>
                    )}
                    {sub.shippingStatus === 'PREPARING_CRAFT' && (
                      <button
                        type="button"
                        onClick={() => {
                          setDispatchSubId(sub.id);
                          setTrackingCode(`MM-${sub.id}${Math.floor(1000 + Math.random() * 8999)}`);
                        }}
                        className="px-3 py-1.5 text-xs font-semibold text-white bg-[#1D3C5C] rounded-lg cursor-pointer"
                      >
                        Tạo vận đơn &amp; Giao hàng
                      </button>
                    )}
                    {['IN_TRANSIT', 'RETRY_DELIVERY'].includes(sub.shippingStatus) && (
                      <>
                        <button
                          type="button"
                          onClick={() => handleOrderAction(sub.id, 'DELIVERED')}
                          className="px-3 py-1.5 text-xs font-semibold text-white bg-emerald-700 rounded-lg cursor-pointer"
                        >
                          Đã giao hàng
                        </button>
                        <button
                          type="button"
                          onClick={() => handleOrderAction(sub.id, 'DELIVERY_FAILED')}
                          className="px-3 py-1.5 text-xs text-rose-700 border border-rose-200 rounded-lg cursor-pointer"
                        >
                          Giao thất bại
                        </button>
                      </>
                    )}
                    {sub.shippingStatus === 'DELIVERY_FAILED' && (
                      <button
                        type="button"
                        onClick={() => handleOrderAction(sub.id, 'RETRY_DELIVERY')}
                        className="px-3 py-1.5 text-xs font-semibold text-amber-800 bg-amber-50 border border-amber-200 rounded-lg cursor-pointer"
                      >
                        Lên lịch giao lại
                      </button>
                    )}
                    {sub.shippingStatus === 'DELIVERED' && sub.orderStatus !== 'COMPLETED' && (
                      <button
                        type="button"
                        onClick={() => handleOrderAction(sub.id, 'COMPLETE')}
                        className="px-3 py-1.5 text-xs font-semibold text-white bg-[#1D3C5C] rounded-lg cursor-pointer"
                      >
                        Hoàn thành &amp; Đối soát
                      </button>
                    )}
                    {sub.orderStatus === 'RETURN_REQUESTED' && (
                      <button
                        type="button"
                        onClick={() => handleOrderAction(sub.id, 'APPROVE_RETURN')}
                        className="px-3 py-1.5 text-xs font-semibold text-rose-700 border border-rose-200 rounded-lg cursor-pointer"
                      >
                        Chấp nhận hoàn trả
                      </button>
                    )}
                  </div>
                </div>

                <div className="space-y-1.5 pt-2 border-t border-[#121316]/8 text-xs">
                  {sub.items.map((it, idx) => (
                    <div key={idx} className="flex justify-between">
                      <span>
                        {it.productName} ({it.variantLabel}) x{it.quantity}
                      </span>
                      <span className="font-mono tabular-nums">{formatVND(it.lineSubtotal)}</span>
                    </div>
                  ))}
                  <div className="flex justify-between pt-2 text-[#5A5D64] font-mono tabular-nums">
                    <span>Hoa hồng sàn ({sub.commissionRate}%): -{formatVND(sub.commissionFee)}</span>
                    <span className="font-semibold text-[#1D3C5C]">Thực nhận Shop: {formatVND(sub.sellerNetAmount)}</span>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* TAB 3: PRODUCTS CRUD */}
      {tab === 'products' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-sm font-semibold text-[#121316]">Danh sách sản phẩm của xưởng</h3>
            <button
              type="button"
              onClick={() => setShowAddProduct((s) => !s)}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#1D3C5C] rounded-lg cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Thêm sản phẩm mới</span>
            </button>
          </div>

          {showAddProduct && (
            <form onSubmit={handleCreateProduct} className="bg-white border border-[#121316]/12 rounded-xl p-5 space-y-4">
              <h4 className="text-sm font-semibold text-[#121316]">Tạo sản phẩm thủ công mới (gửi Admin kiểm duyệt)</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <input
                  required
                  placeholder="Tên sản phẩm"
                  value={prodForm.name}
                  onChange={(e) => setProdForm({ ...prodForm, name: e.target.value })}
                  className="px-3 py-2 text-xs bg-[#F4F4F1] border border-[#121316]/15 rounded-lg"
                />
                <select
                  value={prodForm.categoryId}
                  onChange={(e) => setProdForm({ ...prodForm, categoryId: Number(e.target.value) })}
                  className="px-3 py-2 text-xs bg-[#F4F4F1] border border-[#121316]/15 rounded-lg"
                >
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <input
                  required
                  placeholder="Chất liệu chính (vd: Gốm men tro trấu)"
                  value={prodForm.material}
                  onChange={(e) => setProdForm({ ...prodForm, material: e.target.value })}
                  className="px-3 py-2 text-xs bg-[#F4F4F1] border border-[#121316]/15 rounded-lg"
                />
                <input
                  required
                  placeholder="Làng nghề xuất xứ"
                  value={prodForm.originVillage}
                  onChange={(e) => setProdForm({ ...prodForm, originVillage: e.target.value })}
                  className="px-3 py-2 text-xs bg-[#F4F4F1] border border-[#121316]/15 rounded-lg"
                />
                <input
                  type="number"
                  required
                  min={1000}
                  placeholder="Giá bán (VNĐ)"
                  value={prodForm.basePrice}
                  onChange={(e) => setProdForm({ ...prodForm, basePrice: Number(e.target.value) })}
                  className="px-3 py-2 text-xs font-mono bg-[#F4F4F1] border border-[#121316]/15 rounded-lg"
                />
                <input
                  type="number"
                  placeholder="Giá Flash Sale (nếu có)"
                  value={prodForm.flashSalePrice}
                  onChange={(e) => setProdForm({ ...prodForm, flashSalePrice: e.target.value })}
                  className="px-3 py-2 text-xs font-mono bg-[#F4F4F1] border border-[#121316]/15 rounded-lg"
                />
                <input
                  type="number"
                  required
                  min={0}
                  placeholder="Tồn kho"
                  value={prodForm.stock}
                  onChange={(e) => setProdForm({ ...prodForm, stock: Number(e.target.value) })}
                  className="px-3 py-2 text-xs font-mono bg-[#F4F4F1] border border-[#121316]/15 rounded-lg"
                />
                <input
                  placeholder="Biến thể màu sắc"
                  value={prodForm.variantColor}
                  onChange={(e) => setProdForm({ ...prodForm, variantColor: e.target.value })}
                  className="px-3 py-2 text-xs bg-[#F4F4F1] border border-[#121316]/15 rounded-lg"
                />
                <input
                  placeholder="Biến thể kích thước"
                  value={prodForm.variantSize}
                  onChange={(e) => setProdForm({ ...prodForm, variantSize: e.target.value })}
                  className="px-3 py-2 text-xs bg-[#F4F4F1] border border-[#121316]/15 rounded-lg"
                />
              </div>

              {/* Multi-image Cloudinary upload + Presets */}
              <div className="p-4 rounded-xl bg-[#F4F4F1] border border-[#121316]/10 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-xs font-semibold text-[#121316]">Thư viện hình ảnh sản phẩm (tối đa 6 ảnh)</p>
                    <p className="text-[11px] text-[#5A5D64]">
                      Hỗ trợ tải nhiều ảnh trực tiếp lên Cloudinary (JPG, PNG, WEBP, tối đa 5MB/ảnh) hoặc chọn ảnh xưởng mẫu.
                    </p>
                  </div>
                  <label className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-[#1D3C5C] rounded-lg cursor-pointer hover:bg-[#142B43]">
                    <Upload className="w-3.5 h-3.5" />
                    <span>{uploadingTarget === 'product' ? 'Đang tải lên Cloudinary...' : 'Tải ảnh lên Cloudinary'}</span>
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/avif"
                      multiple
                      disabled={uploadingTarget !== null}
                      onChange={(e) => {
                        void uploadFilesToCloudinary(e.target.files, 'product');
                        e.currentTarget.value = '';
                      }}
                      className="hidden"
                    />
                  </label>
                </div>

                {!integrations.cloudinaryConfigured && (
                  <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                    Lưu ý: Để bật tải ảnh trực tiếp lên Cloudinary, vui lòng cấu hình{' '}
                    <span className="font-mono">CLOUDINARY_CLOUD_NAME</span>,{' '}
                    <span className="font-mono">CLOUDINARY_API_KEY</span> và{' '}
                    <span className="font-mono">CLOUDINARY_API_SECRET</span> trong Settings &gt; Secrets. Hiện vẫn có thể thêm URL ảnh hoặc chọn ảnh mẫu bên dưới.
                  </p>
                )}

                <div className="flex flex-wrap gap-2.5">
                  {prodForm.images.map((imgUrl, idx) => (
                    <div key={`${imgUrl}-${idx}`} className="relative w-20 h-20 rounded-lg overflow-hidden border border-[#121316]/15 bg-white">
                      <ResilientImage src={imgUrl} alt={`Ảnh ${idx + 1}`} className="w-full h-full object-cover" />
                      <button
                        type="button"
                        onClick={() =>
                          setProdForm((prev) => ({
                            ...prev,
                            images: prev.images.filter((_, i) => i !== idx),
                          }))
                        }
                        className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/70 text-white flex items-center justify-center cursor-pointer"
                        aria-label="Xóa ảnh"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  <select
                    value=""
                    onChange={(e) => {
                      const val = e.target.value;
                      if (!val) return;
                      setProdForm((prev) => ({
                        ...prev,
                        images: [...new Set([...prev.images, val])].slice(0, 6),
                      }));
                    }}
                    className="px-3 py-2 text-xs bg-white border border-[#121316]/15 rounded-lg"
                  >
                    <option value="">+ Thêm nhanh từ bộ ảnh xưởng mẫu...</option>
                    {IMAGE_PRESETS.map((img) => (
                      <option key={img.url} value={img.url}>
                        {img.label}
                      </option>
                    ))}
                  </select>
                  <div className="flex gap-1.5">
                    <input
                      value={customImageUrl}
                      onChange={(e) => setCustomImageUrl(e.target.value)}
                      placeholder="Hoặc dán URL ảnh https://..."
                      className="flex-1 px-3 py-2 text-xs bg-white border border-[#121316]/15 rounded-lg"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const trimmed = customImageUrl.trim();
                        if (!trimmed.startsWith('https://') && !trimmed.startsWith('http://')) {
                          showToast('Vui lòng nhập đường dẫn ảnh bắt đầu bằng https://');
                          return;
                        }
                        setProdForm((prev) => ({
                          ...prev,
                          images: [...new Set([...prev.images, trimmed])].slice(0, 6),
                        }));
                        setCustomImageUrl('');
                      }}
                      className="px-3 py-2 text-xs font-medium bg-white border border-[#121316]/15 rounded-lg hover:bg-[#E6E7E2] cursor-pointer"
                    >
                      Thêm URL
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-4 text-xs">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={prodForm.isMadeToOrder}
                    onChange={(e) => setProdForm({ ...prodForm, isMadeToOrder: e.target.checked })}
                  />
                  <span>Sản phẩm đặt chế tác theo yêu cầu</span>
                </label>
                {prodForm.isMadeToOrder && (
                  <input
                    type="number"
                    min={1}
                    value={prodForm.productionDays}
                    onChange={(e) => setProdForm({ ...prodForm, productionDays: Number(e.target.value) })}
                    className="w-28 px-2.5 py-1.5 bg-[#F4F4F1] border border-[#121316]/15 rounded"
                    placeholder="Số ngày làm"
                  />
                )}
              </div>

              <textarea
                required
                rows={2}
                placeholder="Mô tả chi tiết sản phẩm"
                value={prodForm.description}
                onChange={(e) => setProdForm({ ...prodForm, description: e.target.value })}
                className="w-full px-3 py-2 text-xs bg-[#F4F4F1] border border-[#121316]/15 rounded-lg"
              />
              <textarea
                rows={2}
                placeholder="Câu chuyện người làm / quy trình chế tác"
                value={prodForm.artisanStory}
                onChange={(e) => setProdForm({ ...prodForm, artisanStory: e.target.value })}
                className="w-full px-3 py-2 text-xs bg-[#F4F4F1] border border-[#121316]/15 rounded-lg"
              />
              <button
                type="submit"
                className="px-5 py-2 text-xs font-semibold text-white bg-[#1D3C5C] rounded-lg cursor-pointer"
              >
                Lưu &amp; gửi kiểm duyệt
              </button>
            </form>
          )}

          <div className="bg-white border border-[#121316]/10 rounded-xl overflow-hidden">
            <table className="w-full text-xs text-left">
              <thead className="bg-[#F4F4F1] text-[#5A5D64] border-b border-[#121316]/10">
                <tr>
                  <th className="py-3 px-4 font-medium">Sản phẩm</th>
                  <th className="py-3 px-4 font-medium">Trạng thái duyệt</th>
                  <th className="py-3 px-4 font-medium text-right">Giá bán</th>
                  <th className="py-3 px-4 font-medium text-right">Tồn kho</th>
                  <th className="py-3 px-4 font-medium text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#121316]/8">
                {products.map((p) => (
                  <tr key={p.id}>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-8 rounded overflow-hidden bg-[#E6E7E2] shrink-0">
                          <ResilientImage src={p.images[0]} alt={p.name} className="w-full h-full object-cover" />
                        </div>
                        <span className="font-medium text-[#121316]">{p.name}</span>
                      </div>
                    </td>
                    <td className="py-3 px-4 font-medium">{p.status}</td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums">{formatVND(p.basePrice)}</td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums">
                      {p.isMadeToOrder ? (
                        `Đặt (${p.productionDays}d)`
                      ) : (
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleQuickStockUpdate(p, p.stock - 1)}
                            className="w-5 h-5 border rounded text-center cursor-pointer"
                          >
                            −
                          </button>
                          <span>{p.stock}</span>
                          <button
                            type="button"
                            onClick={() => handleQuickStockUpdate(p, p.stock + 1)}
                            className="w-5 h-5 border rounded text-center cursor-pointer"
                          >
                            +
                          </button>
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button
                        type="button"
                        onClick={() => handleDeleteProduct(p.id)}
                        className="p-1.5 text-[#5A5D64] hover:text-rose-600 cursor-pointer"
                        aria-label="Xóa"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 4: SHOP VOUCHERS */}
      {tab === 'vouchers' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-7 space-y-3">
            {vouchers.map((v) => (
              <div key={v.id} className="bg-white border border-[#121316]/10 rounded-xl p-4 flex justify-between text-xs">
                <div>
                  <p className="font-mono font-semibold text-[#1D3C5C]">{v.code}</p>
                  <p className="text-[#121316] mt-0.5">{v.title}</p>
                  <p className="text-[#5A5D64] mt-0.5 tabular-nums">
                    Đơn tối thiểu {formatVND(v.minOrderValue)} · Đã dùng {v.usedCount}/{v.usageLimit}
                  </p>
                </div>
              </div>
            ))}
          </div>

          <form onSubmit={handleCreateVoucher} className="lg:col-span-5 bg-white border border-[#121316]/10 rounded-xl p-5 space-y-3">
            <h4 className="text-sm font-semibold text-[#121316]">Tạo Voucher riêng của Shop</h4>
            <input
              required
              placeholder="Mã voucher (VD: GOM100K)"
              value={voucherForm.code}
              onChange={(e) => setVoucherForm({ ...voucherForm, code: e.target.value.toUpperCase() })}
              className="w-full px-3 py-2 text-xs font-mono bg-[#F4F4F1] border border-[#121316]/15 rounded-lg"
            />
            <input
              required
              placeholder="Mô tả ưu đãi"
              value={voucherForm.title}
              onChange={(e) => setVoucherForm({ ...voucherForm, title: e.target.value })}
              className="w-full px-3 py-2 text-xs bg-[#F4F4F1] border border-[#121316]/15 rounded-lg"
            />
            <div className="grid grid-cols-2 gap-2">
              <select
                value={voucherForm.discountType}
                onChange={(e) => setVoucherForm({ ...voucherForm, discountType: e.target.value })}
                className="px-3 py-2 text-xs bg-[#F4F4F1] border border-[#121316]/15 rounded-lg"
              >
                <option value="FIXED">Giảm tiền (VNĐ)</option>
                <option value="PERCENT">Giảm %</option>
              </select>
              <input
                type="number"
                required
                value={voucherForm.discountValue}
                onChange={(e) => setVoucherForm({ ...voucherForm, discountValue: Number(e.target.value) })}
                className="px-3 py-2 text-xs font-mono bg-[#F4F4F1] border border-[#121316]/15 rounded-lg"
              />
            </div>
            <input
              type="number"
              placeholder="Đơn tối thiểu (VNĐ)"
              value={voucherForm.minOrderValue}
              onChange={(e) => setVoucherForm({ ...voucherForm, minOrderValue: Number(e.target.value) })}
              className="w-full px-3 py-2 text-xs font-mono bg-[#F4F4F1] border border-[#121316]/15 rounded-lg"
            />
            <button
              type="submit"
              className="w-full py-2 text-xs font-semibold text-white bg-[#1D3C5C] rounded-lg cursor-pointer"
            >
              Phát hành Voucher Shop
            </button>
          </form>
        </div>
      )}

      {/* TAB 5: RETURN TICKETS */}
      {tab === 'tickets' && (
        <div className="space-y-3">
          {tickets.length === 0 ? (
            <div className="p-8 text-center bg-white border border-[#121316]/10 rounded-xl text-xs text-[#5A5D64]">
              Chưa có yêu cầu đổi trả hoặc hủy đơn nào.
            </div>
          ) : (
            tickets.map((t) => (
              <div key={t.id} className="bg-white border border-[#121316]/10 rounded-xl p-4 flex flex-wrap justify-between gap-4 text-xs">
                <div>
                  <p className="font-mono font-semibold text-[#121316]">
                    {t.subOrderCode} · {t.buyerName} · {t.type}
                  </p>
                  <p className="text-[#5A5D64] mt-1">Lý do: {t.reason}</p>
                  <p className="text-[#1D3C5C] mt-1 font-medium">Trạng thái: {t.status}</p>
                </div>
                {t.status === 'OPEN' && (
                  <div className="flex gap-2 items-start">
                    <button
                      type="button"
                      onClick={() => handleTicketDecision(t.id, true)}
                      className="px-3 py-1.5 text-xs font-semibold text-white bg-[#1D3C5C] rounded-lg cursor-pointer"
                    >
                      Chấp nhận
                    </button>
                    <button
                      type="button"
                      onClick={() => handleTicketDecision(t.id, false)}
                      className="px-3 py-1.5 text-xs text-rose-700 border border-rose-200 rounded-lg cursor-pointer"
                    >
                      Từ chối
                    </button>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* TAB 6: SELLER CHAT */}
      {tab === 'chat' && (
        <div className="space-y-3">
          {threads.length === 0 ? (
            <div className="p-8 text-center bg-white border border-[#121316]/10 rounded-xl text-xs text-[#5A5D64]">
              Chưa có khách hàng nào nhắn tin cho gian hàng.
            </div>
          ) : (
            threads.map((th) => (
              <div
                key={`${th.shopId}-${th.customerId}`}
                className="bg-white border border-[#121316]/10 rounded-xl p-4 flex items-center justify-between"
              >
                <div className="text-xs">
                  <p className="font-semibold text-[#121316]">Khách hàng: {th.customerName}</p>
                  <p className="text-[#5A5D64]">Hội thoại tư vấn sản phẩm</p>
                </div>
                <button
                  type="button"
                  onClick={() => onOpenChatThread(th.shopId, th.customerId)}
                  className="px-3.5 py-2 text-xs font-semibold text-white bg-[#1D3C5C] rounded-lg cursor-pointer"
                >
                  Mở khung chat
                </button>
              </div>
            ))
          )}
        </div>
      )}

      {/* TAB 7: SHOP PROFILE */}
      {tab === 'shop' && (
        <form onSubmit={handleUpdateShop} className="max-w-2xl bg-white border border-[#121316]/10 rounded-xl p-6 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-base font-semibold text-[#121316]">Thông tin &amp; Hình ảnh Gian hàng</h3>
            <span className="text-[11px] text-[#5A5D64]">
              Cơ sở dữ liệu: <strong className="font-mono text-[#121316]">{integrations.database === 'mongodb' ? 'MongoDB' : 'SQLite (Local Preview)'}</strong>
            </span>
          </div>

          {/* Logo & Banner Cloudinary Upload */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-3.5 rounded-xl bg-[#F4F4F1] border border-[#121316]/10 space-y-2.5">
              <p className="text-xs font-medium text-[#121316]">Logo gian hàng</p>
              <div className="flex items-center gap-3">
                <div className="w-14 h-14 rounded-lg overflow-hidden border border-[#121316]/15 bg-white shrink-0">
                  <ResilientImage src={shopEdit.logoUrl} alt="Logo" className="w-full h-full object-cover" />
                </div>
                <label className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-white border border-[#121316]/15 rounded-lg cursor-pointer hover:bg-[#E6E7E2]">
                  <ImagePlus className="w-3.5 h-3.5 text-[#1D3C5C]" />
                  <span>{uploadingTarget === 'logo' ? 'Đang tải...' : 'Tải logo (Cloudinary)'}</span>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/avif"
                    disabled={uploadingTarget !== null}
                    onChange={(e) => {
                      void uploadFilesToCloudinary(e.target.files, 'logo');
                      e.currentTarget.value = '';
                    }}
                    className="hidden"
                  />
                </label>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-[#F4F4F1] border border-[#121316]/10 space-y-2.5">
              <p className="text-xs font-medium text-[#121316]">Ảnh bìa xưởng</p>
              <div className="flex items-center gap-3">
                <div className="w-24 h-14 rounded-lg overflow-hidden border border-[#121316]/15 bg-white shrink-0">
                  <ResilientImage src={shopEdit.bannerUrl} alt="Banner" className="w-full h-full object-cover" />
                </div>
                <label className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-white border border-[#121316]/15 rounded-lg cursor-pointer hover:bg-[#E6E7E2]">
                  <ImagePlus className="w-3.5 h-3.5 text-[#1D3C5C]" />
                  <span>{uploadingTarget === 'banner' ? 'Đang tải...' : 'Tải ảnh bìa (Cloudinary)'}</span>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/avif"
                    disabled={uploadingTarget !== null}
                    onChange={(e) => {
                      void uploadFilesToCloudinary(e.target.files, 'banner');
                      e.currentTarget.value = '';
                    }}
                    className="hidden"
                  />
                </label>
              </div>
            </div>
          </div>

          <input
            required
            value={shopEdit.name}
            onChange={(e) => setShopEdit({ ...shopEdit, name: e.target.value })}
            placeholder="Tên gian hàng"
            className="w-full px-3.5 py-2 text-sm bg-[#F4F4F1] border border-[#121316]/15 rounded-lg"
          />
          <input
            required
            value={shopEdit.craftVillage}
            onChange={(e) => setShopEdit({ ...shopEdit, craftVillage: e.target.value })}
            placeholder="Làng nghề"
            className="w-full px-3.5 py-2 text-sm bg-[#F4F4F1] border border-[#121316]/15 rounded-lg"
          />
          <div className="grid grid-cols-2 gap-3">
            <input
              value={shopEdit.contactPhone}
              onChange={(e) => setShopEdit({ ...shopEdit, contactPhone: e.target.value })}
              placeholder="SĐT"
              className="px-3.5 py-2 text-sm bg-[#F4F4F1] border border-[#121316]/15 rounded-lg"
            />
            <input
              value={shopEdit.contactEmail}
              onChange={(e) => setShopEdit({ ...shopEdit, contactEmail: e.target.value })}
              placeholder="Email"
              className="px-3.5 py-2 text-sm bg-[#F4F4F1] border border-[#121316]/15 rounded-lg"
            />
          </div>
          <textarea
            rows={3}
            value={shopEdit.description}
            onChange={(e) => setShopEdit({ ...shopEdit, description: e.target.value })}
            className="w-full px-3.5 py-2 text-sm bg-[#F4F4F1] border border-[#121316]/15 rounded-lg"
          />
          <button type="submit" className="px-5 py-2.5 text-xs font-semibold text-white bg-[#1D3C5C] rounded-lg cursor-pointer">
            Cập nhật gian hàng
          </button>
        </form>
      )}

      {/* Shipping Dispatch Modal */}
      {dispatchSubId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm bg-white border border-[#121316]/15 rounded-xl p-6 space-y-4 shadow-xl">
            <h4 className="font-display text-lg font-semibold text-[#121316]">Tạo yêu cầu giao hàng</h4>
            <div>
              <label className="block text-xs font-medium text-[#5A5D64] mb-1">Đơn vị vận chuyển</label>
              <select
                value={carrierName}
                onChange={(e) => setCarrierName(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-[#F4F4F1] border border-[#121316]/15 rounded-lg"
              >
                <option value="Giao Hàng Nhanh">Giao Hàng Nhanh (GHN)</option>
                <option value="Giao Hàng Tiết Kiệm">Giao Hàng Tiết Kiệm (GHTK)</option>
                <option value="Viettel Post">Viettel Post</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-[#5A5D64] mb-1">Mã vận đơn</label>
              <input
                value={trackingCode}
                onChange={(e) => setTrackingCode(e.target.value)}
                className="w-full px-3 py-2 text-xs font-mono bg-[#F4F4F1] border border-[#121316]/15 rounded-lg"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDispatchSubId(null)}
                className="px-4 py-2 text-xs border border-[#121316]/15 rounded-lg cursor-pointer"
              >
                Đóng
              </button>
              <button
                type="button"
                onClick={() => {
                  const id = dispatchSubId;
                  setDispatchSubId(null);
                  void handleOrderAction(id, 'SHIP', { carrierName, trackingCode });
                }}
                className="px-4 py-2 text-xs font-semibold text-white bg-[#1D3C5C] rounded-lg cursor-pointer"
              >
                Xác nhận gửi hàng
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
