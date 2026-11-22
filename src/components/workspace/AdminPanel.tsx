import React, { useEffect, useState } from 'react';
import { useApp } from '../../context/AppContext';
import type {
  AffiliateCommission,
  AffiliateProfile,
  Category,
  MasterOrder,
  PaymentTransaction,
  Product,
  Review,
  Shop,
  SupportTicket,
  User,
  Voucher,
} from '../../types';
import { formatDateTime, formatVND } from '../../utils/format';

interface AdminOverviewData {
  stats: {
    gmv: number;
    platformCommissionRevenue: number;
    totalUsers: number;
    totalShops: number;
    totalProducts: number;
    totalOrders: number;
  };
  settings: {
    platformCommissionRate: number;
    affiliateCommissionRate: number;
    defaultShippingFee: number;
  };
  users: User[];
  shops: Shop[];
  products: Product[];
  categories: Category[];
  orders: MasterOrder[];
  transactions: PaymentTransaction[];
  vouchers: Voucher[];
  affiliates: AffiliateProfile[];
  commissions: AffiliateCommission[];
  reviews: Review[];
  tickets: SupportTicket[];
}

export function AdminPanel({ onRefreshCatalog }: { onRefreshCatalog: () => void }) {
  const { apiFetch, showToast } = useApp();
  const [tab, setTab] = useState<
    | 'report'
    | 'users'
    | 'shops'
    | 'products'
    | 'categories'
    | 'orders'
    | 'payments'
    | 'commission'
    | 'promotions'
    | 'affiliate'
    | 'reviews'
    | 'support'
  >('report');

  const [data, setData] = useState<AdminOverviewData | null>(null);
  const [loading, setLoading] = useState(true);

  const [catForm, setCatForm] = useState({ name: '', description: '', materialFocus: '' });
  const [settingsForm, setSettingsForm] = useState({
    platformCommissionRate: 8,
    affiliateCommissionRate: 5,
    defaultShippingFee: 30000,
  });
  const [voucherForm, setVoucherForm] = useState({
    code: '',
    title: '',
    discountType: 'PERCENT',
    discountValue: 10,
    maxDiscountAmount: 200000,
    minOrderValue: 500000,
  });

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await apiFetch<AdminOverviewData>('/api/admin/overview');
      setData(res);
      setSettingsForm(res.settings);
    } catch (err: any) {
      showToast(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  if (loading || !data) {
    return <div className="h-48 bg-[#E6E7E2] rounded-xl animate-pulse" />;
  }

  const runAction = async (fn: () => Promise<any>, msg: string, refreshCat = false) => {
    try {
      await fn();
      await loadData();
      if (refreshCat) onRefreshCatalog();
      showToast(msg);
    } catch (err: any) {
      showToast(err.message);
    }
  };

  const tabs: Array<{ id: typeof tab; label: string }> = [
    { id: 'report', label: 'Báo cáo' },
    { id: 'users', label: `User (${data.users.length})` },
    { id: 'shops', label: `Seller (${data.shops.length})` },
    { id: 'products', label: `Product (${data.products.length})` },
    { id: 'categories', label: `Category (${data.categories.length})` },
    { id: 'orders', label: `Order (${data.orders.length})` },
    { id: 'payments', label: `Payment (${data.transactions.length})` },
    { id: 'commission', label: 'Commission' },
    { id: 'promotions', label: `Promotion (${data.vouchers.length})` },
    { id: 'affiliate', label: `Affiliate (${data.affiliates.length})` },
    { id: 'reviews', label: `Review (${data.reviews.length})` },
    { id: 'support', label: `Support (${data.tickets.length})` },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-1.5 p-1 bg-[#E6E7E2] rounded-lg">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap shrink-0 cursor-pointer ${
              tab === t.id ? 'bg-white text-[#121316] shadow-sm' : 'text-[#5A5D64] hover:text-[#121316]'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* 1. REPORT */}
      {tab === 'report' && (
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="bg-white border border-[#121316]/10 rounded-xl p-5">
            <p className="text-xs text-[#5A5D64]">Tổng GMV toàn sàn</p>
            <p className="font-mono text-2xl font-semibold text-[#121316] tabular-nums mt-1">
              {formatVND(data.stats.gmv)}
            </p>
          </div>
          <div className="bg-white border border-[#121316]/10 rounded-xl p-5">
            <p className="text-xs text-[#5A5D64]">Doanh thu hoa hồng sàn</p>
            <p className="font-mono text-2xl font-semibold text-[#1D3C5C] tabular-nums mt-1">
              {formatVND(data.stats.platformCommissionRevenue)}
            </p>
          </div>
          <div className="bg-white border border-[#121316]/10 rounded-xl p-5">
            <p className="text-xs text-[#5A5D64]">Quy mô hệ sinh thái</p>
            <p className="font-mono text-lg font-semibold text-[#121316] tabular-nums mt-1">
              {data.stats.totalUsers} User · {data.stats.totalShops} Shop · {data.stats.totalOrders} Đơn tổng
            </p>
          </div>
        </div>
      )}

      {/* 2. USERS */}
      {tab === 'users' && (
        <div className="bg-white border border-[#121316]/10 rounded-xl overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-[#F4F4F1] text-[#5A5D64] border-b border-[#121316]/10">
              <tr>
                <th className="py-3 px-4">Họ tên</th>
                <th className="py-3 px-4">Email</th>
                <th className="py-3 px-4">Vai trò</th>
                <th className="py-3 px-4">Trạng thái</th>
                <th className="py-3 px-4 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#121316]/8">
              {data.users.map((u) => (
                <tr key={u.id}>
                  <td className="py-3 px-4 font-medium">{u.fullName}</td>
                  <td className="py-3 px-4">{u.email}</td>
                  <td className="py-3 px-4 font-mono">{u.roles.join(', ')}</td>
                  <td className="py-3 px-4">{u.isLocked ? 'Đang khóa' : 'Hoạt động'}</td>
                  <td className="py-3 px-4 text-right">
                    {!u.roles.includes('admin') && (
                      <button
                        type="button"
                        onClick={() =>
                          runAction(
                            () =>
                              apiFetch(`/api/admin/users/${u.id}/lock`, {
                                method: 'PATCH',
                                body: JSON.stringify({ isLocked: !u.isLocked }),
                              }),
                            u.isLocked ? 'Đã mở khóa tài khoản.' : 'Đã khóa tài khoản.'
                          )
                        }
                        className="px-2.5 py-1 border border-[#121316]/15 rounded cursor-pointer"
                      >
                        {u.isLocked ? 'Mở khóa' : 'Khóa tài khoản'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 3. SELLERS / SHOPS */}
      {tab === 'shops' && (
        <div className="bg-white border border-[#121316]/10 rounded-xl overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-[#F4F4F1] text-[#5A5D64] border-b border-[#121316]/10">
              <tr>
                <th className="py-3 px-4">Gian hàng</th>
                <th className="py-3 px-4">Làng nghề</th>
                <th className="py-3 px-4">Trạng thái</th>
                <th className="py-3 px-4 text-right">Kiểm duyệt</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#121316]/8">
              {data.shops.map((s) => (
                <tr key={s.id}>
                  <td className="py-3 px-4 font-medium">{s.name}</td>
                  <td className="py-3 px-4">{s.craftVillage}</td>
                  <td className="py-3 px-4 font-semibold">{s.status}</td>
                  <td className="py-3 px-4 text-right space-x-2">
                    <button
                      type="button"
                      onClick={() =>
                        runAction(
                          () =>
                            apiFetch(`/api/admin/shops/${s.id}/status`, {
                              method: 'PATCH',
                              body: JSON.stringify({ status: 'APPROVED' }),
                            }),
                          'Đã duyệt gian hàng.',
                          true
                        )
                      }
                      className="px-2.5 py-1 bg-[#1D3C5C] text-white rounded cursor-pointer"
                    >
                      Duyệt
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        runAction(
                          () =>
                            apiFetch(`/api/admin/shops/${s.id}/status`, {
                              method: 'PATCH',
                              body: JSON.stringify({ status: 'SUSPENDED' }),
                            }),
                          'Đã đình chỉ gian hàng.',
                          true
                        )
                      }
                      className="px-2.5 py-1 border border-rose-200 text-rose-700 rounded cursor-pointer"
                    >
                      Đình chỉ
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 4. PRODUCTS */}
      {tab === 'products' && (
        <div className="bg-white border border-[#121316]/10 rounded-xl overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-[#F4F4F1] text-[#5A5D64] border-b border-[#121316]/10">
              <tr>
                <th className="py-3 px-4">Sản phẩm</th>
                <th className="py-3 px-4">Gian hàng</th>
                <th className="py-3 px-4">Trạng thái</th>
                <th className="py-3 px-4">Quảng bá nổi bật</th>
                <th className="py-3 px-4 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#121316]/8">
              {data.products.map((p) => (
                <tr key={p.id}>
                  <td className="py-3 px-4 font-medium">{p.name}</td>
                  <td className="py-3 px-4">{p.shopName}</td>
                  <td className="py-3 px-4 font-semibold">{p.status}</td>
                  <td className="py-3 px-4">
                    <button
                      type="button"
                      onClick={() =>
                        runAction(
                          () =>
                            apiFetch(`/api/admin/products/${p.id}/moderate`, {
                              method: 'PATCH',
                              body: JSON.stringify({ isPromoted: !p.isPromoted }),
                            }),
                          'Đã cập nhật vị trí quảng bá.',
                          true
                        )
                      }
                      className="px-2 py-1 border rounded cursor-pointer"
                    >
                      {p.isPromoted ? 'Đang nổi bật' : 'Đưa lên nổi bật'}
                    </button>
                  </td>
                  <td className="py-3 px-4 text-right space-x-2">
                    <button
                      type="button"
                      onClick={() =>
                        runAction(
                          () =>
                            apiFetch(`/api/admin/products/${p.id}/moderate`, {
                              method: 'PATCH',
                              body: JSON.stringify({ status: 'APPROVED' }),
                            }),
                          'Đã duyệt sản phẩm.',
                          true
                        )
                      }
                      className="px-2.5 py-1 bg-[#1D3C5C] text-white rounded cursor-pointer"
                    >
                      Duyệt
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        runAction(
                          () =>
                            apiFetch(`/api/admin/products/${p.id}/moderate`, {
                              method: 'PATCH',
                              body: JSON.stringify({ status: 'HIDDEN' }),
                            }),
                          'Đã ẩn sản phẩm.',
                          true
                        )
                      }
                      className="px-2.5 py-1 border rounded cursor-pointer"
                    >
                      Ẩn
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        runAction(
                          () => apiFetch(`/api/admin/products/${p.id}`, { method: 'DELETE' }),
                          'Đã xóa sản phẩm vi phạm.',
                          true
                        )
                      }
                      className="px-2.5 py-1 text-rose-700 border border-rose-200 rounded cursor-pointer"
                    >
                      Xóa
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 5. CATEGORIES */}
      {tab === 'categories' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-7 bg-white border border-[#121316]/10 rounded-xl divide-y divide-[#121316]/8">
            {data.categories.map((c) => (
              <div key={c.id} className="p-4 flex items-center justify-between text-xs">
                <div>
                  <p className="font-semibold text-[#121316]">{c.name}</p>
                  <p className="text-[#5A5D64]">
                    {c.materialFocus} · {c.description}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    runAction(
                      () => apiFetch(`/api/admin/categories/${c.id}`, { method: 'DELETE' }),
                      'Đã xóa danh mục.',
                      true
                    )
                  }
                  className="text-rose-700 hover:underline cursor-pointer"
                >
                  Xóa
                </button>
              </div>
            ))}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              void runAction(
                () =>
                  apiFetch('/api/admin/categories', {
                    method: 'POST',
                    body: JSON.stringify(catForm),
                  }),
                'Đã thêm danh mục mới.',
                true
              );
              setCatForm({ name: '', description: '', materialFocus: '' });
            }}
            className="lg:col-span-5 bg-white border border-[#121316]/10 rounded-xl p-5 space-y-3"
          >
            <h4 className="text-sm font-semibold">Thêm danh mục thủ công</h4>
            <input
              required
              placeholder="Tên danh mục"
              value={catForm.name}
              onChange={(e) => setCatForm({ ...catForm, name: e.target.value })}
              className="w-full px-3 py-2 text-xs bg-[#F4F4F1] border rounded-lg"
            />
            <input
              placeholder="Chất liệu trọng tâm"
              value={catForm.materialFocus}
              onChange={(e) => setCatForm({ ...catForm, materialFocus: e.target.value })}
              className="w-full px-3 py-2 text-xs bg-[#F4F4F1] border rounded-lg"
            />
            <input
              placeholder="Mô tả ngắn"
              value={catForm.description}
              onChange={(e) => setCatForm({ ...catForm, description: e.target.value })}
              className="w-full px-3 py-2 text-xs bg-[#F4F4F1] border rounded-lg"
            />
            <button type="submit" className="w-full py-2 text-xs font-semibold text-white bg-[#1D3C5C] rounded-lg cursor-pointer">
              Tạo danh mục
            </button>
          </form>
        </div>
      )}

      {/* 6. ORDERS */}
      {tab === 'orders' && (
        <div className="space-y-3">
          {data.orders.map((m) => (
            <div key={m.id} className="bg-white border border-[#121316]/10 rounded-xl p-4 text-xs space-y-2">
              <div className="flex justify-between font-semibold">
                <span className="font-mono">
                  {m.orderCode} · {m.buyerName} · {m.paymentMethod} ({m.paymentStatus})
                </span>
                <span className="font-mono text-[#1D3C5C] tabular-nums">{formatVND(m.grandTotal)}</span>
              </div>
              <div className="pl-3 border-l border-[#121316]/15 space-y-1">
                {m.subOrders.map((s) => (
                  <div key={s.id} className="flex justify-between text-[#5A5D64]">
                    <span>
                      {s.subOrderCode} ({s.shopName}) · Đơn: {s.orderStatus} · Vận chuyển: {s.shippingStatus}
                    </span>
                    <span className="font-mono tabular-nums">
                      {formatVND(s.finalTotal)} (HH sàn: {formatVND(s.commissionFee)})
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 7. PAYMENTS */}
      {tab === 'payments' && (
        <div className="bg-white border border-[#121316]/10 rounded-xl overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-[#F4F4F1] text-[#5A5D64] border-b border-[#121316]/10">
              <tr>
                <th className="py-3 px-4">Mã giao dịch</th>
                <th className="py-3 px-4">Đơn tổng</th>
                <th className="py-3 px-4">Phương thức</th>
                <th className="py-3 px-4">Idempotency Key</th>
                <th className="py-3 px-4 text-right">Số tiền</th>
                <th className="py-3 px-4">Trạng thái</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#121316]/8">
              {data.transactions.map((t) => (
                <tr key={t.id}>
                  <td className="py-3 px-4 font-mono font-medium">{t.transactionCode}</td>
                  <td className="py-3 px-4 font-mono">{t.orderCode}</td>
                  <td className="py-3 px-4">{t.method}</td>
                  <td className="py-3 px-4 font-mono text-[#5A5D64]">{t.idempotencyKey}</td>
                  <td className="py-3 px-4 text-right font-mono tabular-nums">{formatVND(t.amount)}</td>
                  <td className="py-3 px-4 font-semibold">{t.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 8. COMMISSION SETTINGS */}
      {tab === 'commission' && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void runAction(
              () =>
                apiFetch('/api/admin/settings', {
                  method: 'PUT',
                  body: JSON.stringify(settingsForm),
                }),
              'Đã cập nhật cấu hình tỷ lệ hoa hồng & phí vận chuyển.'
            );
          }}
          className="max-w-md bg-white border border-[#121316]/10 rounded-xl p-6 space-y-4"
        >
          <h4 className="text-sm font-semibold text-[#121316]">Thiết lập tỷ lệ hoa hồng toàn sàn</h4>
          <div>
            <label className="block text-xs text-[#5A5D64] mb-1">Hoa hồng sàn thu từ Seller (%)</label>
            <input
              type="number"
              step="0.5"
              value={settingsForm.platformCommissionRate}
              onChange={(e) => setSettingsForm({ ...settingsForm, platformCommissionRate: Number(e.target.value) })}
              className="w-full px-3 py-2 text-xs font-mono bg-[#F4F4F1] border rounded-lg"
            />
          </div>
          <div>
            <label className="block text-xs text-[#5A5D64] mb-1">Hoa hồng chi trả Affiliate (%)</label>
            <input
              type="number"
              step="0.5"
              value={settingsForm.affiliateCommissionRate}
              onChange={(e) => setSettingsForm({ ...settingsForm, affiliateCommissionRate: Number(e.target.value) })}
              className="w-full px-3 py-2 text-xs font-mono bg-[#F4F4F1] border rounded-lg"
            />
          </div>
          <div>
            <label className="block text-xs text-[#5A5D64] mb-1">Phí vận chuyển mặc định mỗi đơn con (VNĐ)</label>
            <input
              type="number"
              value={settingsForm.defaultShippingFee}
              onChange={(e) => setSettingsForm({ ...settingsForm, defaultShippingFee: Number(e.target.value) })}
              className="w-full px-3 py-2 text-xs font-mono bg-[#F4F4F1] border rounded-lg"
            />
          </div>
          <button type="submit" className="px-5 py-2 text-xs font-semibold text-white bg-[#1D3C5C] rounded-lg cursor-pointer">
            Lưu cấu hình
          </button>
        </form>
      )}

      {/* 9. PROMOTIONS */}
      {tab === 'promotions' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-7 space-y-2.5">
            {data.vouchers.map((v) => (
              <div key={v.id} className="bg-white border border-[#121316]/10 rounded-xl p-4 flex justify-between text-xs">
                <div>
                  <p className="font-mono font-semibold text-[#1D3C5C]">
                    {v.code} · {v.scope} {v.shopName ? `(${v.shopName})` : ''}
                  </p>
                  <p>{v.title}</p>
                  <p className="text-[#5A5D64] tabular-nums">
                    Đã dùng {v.usedCount}/{v.usageLimit}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    runAction(
                      () => apiFetch(`/api/admin/vouchers/${v.id}/toggle`, { method: 'PATCH' }),
                      'Đã đổi trạng thái voucher.',
                      true
                    )
                  }
                  className="px-3 py-1 h-fit border rounded cursor-pointer"
                >
                  {v.isActive ? 'Tạm ngưng' : 'Kích hoạt'}
                </button>
              </div>
            ))}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              void runAction(
                () =>
                  apiFetch('/api/admin/vouchers', {
                    method: 'POST',
                    body: JSON.stringify(voucherForm),
                  }),
                'Đã tạo voucher toàn sàn.',
                true
              );
              setVoucherForm({
                code: '',
                title: '',
                discountType: 'PERCENT',
                discountValue: 10,
                maxDiscountAmount: 200000,
                minOrderValue: 500000,
              });
            }}
            className="lg:col-span-5 bg-white border border-[#121316]/10 rounded-xl p-5 space-y-3"
          >
            <h4 className="text-sm font-semibold">Tạo khuyến mãi toàn sàn</h4>
            <input
              required
              placeholder="Mã voucher"
              value={voucherForm.code}
              onChange={(e) => setVoucherForm({ ...voucherForm, code: e.target.value.toUpperCase() })}
              className="w-full px-3 py-2 text-xs font-mono bg-[#F4F4F1] border rounded-lg"
            />
            <input
              required
              placeholder="Tiêu đề khuyến mãi"
              value={voucherForm.title}
              onChange={(e) => setVoucherForm({ ...voucherForm, title: e.target.value })}
              className="w-full px-3 py-2 text-xs bg-[#F4F4F1] border rounded-lg"
            />
            <select
              value={voucherForm.discountType}
              onChange={(e) => setVoucherForm({ ...voucherForm, discountType: e.target.value })}
              className="w-full px-3 py-2 text-xs bg-[#F4F4F1] border rounded-lg"
            >
              <option value="PERCENT">Giảm theo %</option>
              <option value="FIXED">Giảm số tiền cố định</option>
              <option value="FREE_SHIP">Miễn phí vận chuyển</option>
            </select>
            <input
              type="number"
              required
              placeholder="Giá trị giảm"
              value={voucherForm.discountValue}
              onChange={(e) => setVoucherForm({ ...voucherForm, discountValue: Number(e.target.value) })}
              className="w-full px-3 py-2 text-xs font-mono bg-[#F4F4F1] border rounded-lg"
            />
            <button type="submit" className="w-full py-2 text-xs font-semibold text-white bg-[#1D3C5C] rounded-lg cursor-pointer">
              Phát hành Voucher toàn sàn
            </button>
          </form>
        </div>
      )}

      {/* 10. AFFILIATE */}
      {tab === 'affiliate' && (
        <div className="space-y-6">
          <div className="bg-white border border-[#121316]/10 rounded-xl overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-[#F4F4F1] text-[#5A5D64] border-b">
                <tr>
                  <th className="py-3 px-4">CTV</th>
                  <th className="py-3 px-4">Mã giới thiệu</th>
                  <th className="py-3 px-4">Clicks</th>
                  <th className="py-3 px-4">Trạng thái</th>
                  <th className="py-3 px-4 text-right">Duyệt</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {data.affiliates.map((a) => (
                  <tr key={a.id}>
                    <td className="py-3 px-4">{a.userName}</td>
                    <td className="py-3 px-4 font-mono font-semibold">{a.refCode}</td>
                    <td className="py-3 px-4 font-mono tabular-nums">{a.totalClicks}</td>
                    <td className="py-3 px-4 font-semibold">{a.status}</td>
                    <td className="py-3 px-4 text-right space-x-2">
                      <button
                        type="button"
                        onClick={() =>
                          runAction(
                            () =>
                              apiFetch(`/api/admin/affiliates/${a.id}/status`, {
                                method: 'PATCH',
                                body: JSON.stringify({ status: 'APPROVED' }),
                              }),
                            'Đã duyệt cộng tác viên.'
                          )
                        }
                        className="px-2.5 py-1 bg-[#1D3C5C] text-white rounded cursor-pointer"
                      >
                        Duyệt
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          runAction(
                            () =>
                              apiFetch(`/api/admin/affiliates/${a.id}/status`, {
                                method: 'PATCH',
                                body: JSON.stringify({ status: 'SUSPENDED' }),
                              }),
                            'Đã đình chỉ cộng tác viên.'
                          )
                        }
                        className="px-2.5 py-1 border border-rose-200 text-rose-700 rounded cursor-pointer"
                      >
                        Đình chỉ
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="bg-white border border-[#121316]/10 rounded-xl overflow-x-auto">
            <div className="px-4 py-3 border-b text-xs font-semibold">Chi trả hoa hồng Affiliate</div>
            <table className="w-full text-xs text-left">
              <thead className="bg-[#F4F4F1] text-[#5A5D64] border-b">
                <tr>
                  <th className="py-3 px-4">Mã Ref</th>
                  <th className="py-3 px-4">Đơn con</th>
                  <th className="py-3 px-4 text-right">Hoa hồng</th>
                  <th className="py-3 px-4">Trạng thái</th>
                  <th className="py-3 px-4 text-right">Thanh toán</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {data.commissions.map((c) => (
                  <tr key={c.id}>
                    <td className="py-3 px-4 font-mono">{c.refCode}</td>
                    <td className="py-3 px-4 font-mono">{c.subOrderCode}</td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums">{formatVND(c.commissionAmount)}</td>
                    <td className="py-3 px-4 font-semibold">{c.status}</td>
                    <td className="py-3 px-4 text-right">
                      {c.status === 'APPROVED' && (
                        <button
                          type="button"
                          onClick={() =>
                            runAction(
                              () => apiFetch(`/api/admin/affiliate-commissions/${c.id}/payout`, { method: 'PATCH' }),
                              'Đã xác nhận thanh toán hoa hồng.'
                            )
                          }
                          className="px-2.5 py-1 bg-[#1D3C5C] text-white rounded cursor-pointer"
                        >
                          Chi trả
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 11. REVIEWS */}
      {tab === 'reviews' && (
        <div className="space-y-3">
          {data.reviews.map((r) => (
            <div key={r.id} className="bg-white border border-[#121316]/10 rounded-xl p-4 flex justify-between gap-4 text-xs">
              <div>
                <p className="font-semibold">
                  {r.productName} · {r.buyerName} ({r.rating}★)
                </p>
                <p className="text-[#5A5D64] mt-1">{r.comment}</p>
                <p className="text-[11px] text-[#5A5D64] mt-1">{formatDateTime(r.createdAt)} · {r.status}</p>
              </div>
              <button
                type="button"
                onClick={() =>
                  runAction(
                    () =>
                      apiFetch(`/api/admin/reviews/${r.id}/status`, {
                        method: 'PATCH',
                        body: JSON.stringify({ status: r.status === 'VISIBLE' ? 'HIDDEN' : 'VISIBLE' }),
                      }),
                    'Đã cập nhật trạng thái đánh giá.'
                  )
                }
                className="px-3 py-1 h-fit border rounded cursor-pointer"
              >
                {r.status === 'VISIBLE' ? 'Ẩn đánh giá' : 'Hiện lại'}
              </button>
            </div>
          ))}
        </div>
      )}

      {/* 12. SUPPORT / REFUNDS */}
      {tab === 'support' && (
        <div className="space-y-3">
          {data.tickets.length === 0 ? (
            <div className="p-8 text-center bg-white border border-[#121316]/10 rounded-xl text-xs text-[#5A5D64]">
              Chưa có yêu cầu khiếu nại hoặc hoàn tiền nào.
            </div>
          ) : (
            data.tickets.map((t) => (
              <div key={t.id} className="bg-white border border-[#121316]/10 rounded-xl p-4 flex justify-between gap-4 text-xs">
                <div>
                  <p className="font-mono font-semibold">
                    {t.subOrderCode} · {t.shopName} · {t.buyerName} · {t.type}
                  </p>
                  <p className="text-[#5A5D64] mt-1">Lý do: {t.reason}</p>
                  <p className="font-medium text-[#1D3C5C] mt-1">Trạng thái: {t.status}</p>
                </div>
                {['OPEN', 'SELLER_APPROVED'].includes(t.status) && (
                  <div className="flex gap-2 h-fit">
                    <button
                      type="button"
                      onClick={() =>
                        runAction(
                          () =>
                            apiFetch(`/api/admin/tickets/${t.id}/resolve`, {
                              method: 'PATCH',
                              body: JSON.stringify({ action: 'REFUND' }),
                            }),
                          'Đã duyệt hoàn tiền cho khách hàng.'
                        )
                      }
                      className="px-3 py-1.5 bg-[#1D3C5C] text-white rounded-lg cursor-pointer"
                    >
                      Duyệt hoàn tiền
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        runAction(
                          () =>
                            apiFetch(`/api/admin/tickets/${t.id}/resolve`, {
                              method: 'PATCH',
                              body: JSON.stringify({ action: 'REJECT' }),
                            }),
                          'Đã từ chối yêu cầu.'
                        )
                      }
                      className="px-3 py-1.5 border border-rose-200 text-rose-700 rounded-lg cursor-pointer"
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
    </div>
  );
}
