import React, { useEffect, useState } from 'react';
import { Copy, ExternalLink, MousePointerClick } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import type { AffiliateCommission, AffiliateProfile, Product } from '../../types';
import { formatDateTime, formatVND } from '../../utils/format';

interface AffiliatePanelProps {
  allProducts: Product[];
}

export function AffiliatePanel({ allProducts }: AffiliatePanelProps) {
  const { apiFetch, refreshAccount, setAffiliateRefCode, showToast } = useApp();
  const [affiliate, setAffiliate] = useState<AffiliateProfile | null>(null);
  const [commissions, setCommissions] = useState<AffiliateCommission[]>([]);
  const [summary, setSummary] = useState<{
    totalClicks: number;
    totalOrders: number;
    pendingAmount: number;
    approvedAmount: number;
    paidAmount: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  // Registration form
  const [refCodeInput, setRefCodeInput] = useState('');
  const [bankInfo, setBankInfo] = useState('');
  const [selectedProductId, setSelectedProductId] = useState<number>(allProducts[0]?.id || 1);

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await apiFetch<{
        affiliate: AffiliateProfile | null;
        commissions: AffiliateCommission[];
        summary: any;
      }>('/api/affiliate/me');
      setAffiliate(res.affiliate);
      setCommissions(res.commissions);
      setSummary(res.summary);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch('/api/affiliate/register', {
        method: 'POST',
        body: JSON.stringify({ refCode: refCodeInput, bankInfo }),
      });
      await refreshAccount();
      await loadData();
      showToast('Đã gửi đăng ký cộng tác viên Affiliate. Admin sẽ duyệt hồ sơ của bạn.');
    } catch (err: any) {
      showToast(err.message);
    }
  };

  if (loading) return <div className="h-40 bg-[#E6E7E2] rounded-xl animate-pulse" />;

  if (!affiliate) {
    return (
      <form onSubmit={handleRegister} className="max-w-lg bg-white border border-[#121316]/10 rounded-xl p-6 space-y-4">
        <h3 className="font-display text-xl font-semibold text-[#121316]">Đăng ký Cộng tác viên Tiếp thị Liên kết</h3>
        <p className="text-xs text-[#5A5D64] leading-relaxed">
          Sử dụng chính tài khoản hiện tại của bạn để quảng bá sản phẩm thủ công mỹ nghệ và nhận hoa hồng minh bạch trên mỗi đơn hàng hoàn tất (hệ thống tự động chặn đơn tự giới thiệu).
        </p>
        <div>
          <label className="block text-xs font-medium text-[#5A5D64] mb-1">Mã giới thiệu mong muốn (chữ &amp; số)</label>
          <input
            required
            value={refCodeInput}
            onChange={(e) => setRefCodeInput(e.target.value.toUpperCase())}
            placeholder="VD: CRAFTLOVER26"
            className="w-full px-3.5 py-2 text-sm font-mono bg-[#F4F4F1] border border-[#121316]/15 rounded-lg"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-[#5A5D64] mb-1">Tài khoản ngân hàng nhận đối soát</label>
          <input
            required
            value={bankInfo}
            onChange={(e) => setBankInfo(e.target.value)}
            placeholder="Ngân hàng - Số tài khoản - Chủ tài khoản"
            className="w-full px-3.5 py-2 text-sm bg-[#F4F4F1] border border-[#121316]/15 rounded-lg"
          />
        </div>
        <button
          type="submit"
          className="px-5 py-2.5 text-xs font-semibold text-white bg-[#1D3C5C] rounded-lg cursor-pointer"
        >
          Gửi đăng ký Affiliate
        </button>
      </form>
    );
  }

  const generatedLink = `${window.location.origin}/?ref=${affiliate.refCode}&pid=${selectedProductId}`;

  const handleCopyLink = () => {
    navigator.clipboard?.writeText(generatedLink).catch(() => {});
    showToast('Đã sao chép đường dẫn giới thiệu.');
  };

  const handleSimulateClick = async () => {
    try {
      await apiFetch('/api/affiliate/track-click', {
        method: 'POST',
        body: JSON.stringify({ refCode: affiliate.refCode, productId: selectedProductId }),
      });
      setAffiliateRefCode(affiliate.refCode);
      await loadData();
      showToast('Đã ghi nhận 1 lượt truy cập mới qua mã giới thiệu.');
    } catch (err: any) {
      showToast(err.message);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white border border-[#121316]/10 rounded-xl p-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs text-[#5A5D64]">
            Mã định danh Affiliate: <strong className="font-mono text-[#121316]">{affiliate.refCode}</strong> · Trạng thái:{' '}
            <strong className={affiliate.status === 'APPROVED' ? 'text-emerald-700' : 'text-amber-700'}>
              {affiliate.status}
            </strong>
          </p>
          <p className="text-xs text-[#5A5D64] mt-1">Tài khoản đối soát: {affiliate.bankInfo}</p>
        </div>
      </div>

      {/* 4 Metric Summary */}
      {summary && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white border border-[#121316]/10 rounded-xl p-4">
            <p className="text-xs text-[#5A5D64]">Lượt nhấp liên kết</p>
            <p className="font-mono text-xl font-semibold text-[#121316] tabular-nums mt-1">{summary.totalClicks}</p>
          </div>
          <div className="bg-white border border-[#121316]/10 rounded-xl p-4">
            <p className="text-xs text-[#5A5D64]">Hoa hồng chờ duyệt</p>
            <p className="font-mono text-xl font-semibold text-amber-700 tabular-nums mt-1">
              {formatVND(summary.pendingAmount)}
            </p>
          </div>
          <div className="bg-white border border-[#121316]/10 rounded-xl p-4">
            <p className="text-xs text-[#5A5D64]">Hoa hồng đã duyệt</p>
            <p className="font-mono text-xl font-semibold text-[#1D3C5C] tabular-nums mt-1">
              {formatVND(summary.approvedAmount)}
            </p>
          </div>
          <div className="bg-white border border-[#121316]/10 rounded-xl p-4">
            <p className="text-xs text-[#5A5D64]">Đã thanh toán</p>
            <p className="font-mono text-xl font-semibold text-emerald-700 tabular-nums mt-1">
              {formatVND(summary.paidAmount)}
            </p>
          </div>
        </div>
      )}

      {/* Link Generator */}
      <div className="bg-white border border-[#121316]/10 rounded-xl p-5 space-y-3">
        <h3 className="text-sm font-semibold text-[#121316]">Tạo đường dẫn quảng bá sản phẩm</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <select
            value={selectedProductId}
            onChange={(e) => setSelectedProductId(Number(e.target.value))}
            className="px-3 py-2 text-xs bg-[#F4F4F1] border border-[#121316]/15 rounded-lg"
          >
            {allProducts.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({formatVND(p.flashSalePrice ?? p.basePrice)})
              </option>
            ))}
          </select>

          <div className="flex gap-2">
            <input
              readOnly
              value={generatedLink}
              className="flex-1 px-3 py-2 text-xs font-mono bg-[#F4F4F1] border border-[#121316]/15 rounded-lg text-[#5A5D64]"
            />
            <button
              type="button"
              onClick={handleCopyLink}
              className="inline-flex items-center gap-1 px-3 py-2 text-xs font-semibold text-white bg-[#1D3C5C] rounded-lg whitespace-nowrap cursor-pointer"
            >
              <Copy className="w-3.5 h-3.5" />
              <span>Sao chép</span>
            </button>
            <button
              type="button"
              onClick={handleSimulateClick}
              title="Ghi nhận lượt click test"
              className="inline-flex items-center gap-1 px-3 py-2 text-xs font-medium text-[#121316] border border-[#121316]/15 rounded-lg hover:bg-[#E6E7E2] whitespace-nowrap cursor-pointer"
            >
              <MousePointerClick className="w-3.5 h-3.5" />
              <span>Test Click</span>
            </button>
          </div>
        </div>
        <p className="text-[11px] text-[#5A5D64] flex items-center gap-1">
          <ExternalLink className="w-3 h-3" />
          <span>Lưu ý chống gian lận: Đơn hàng do chính tài khoản Affiliate tự mua bằng mã của mình sẽ không được tính hoa hồng.</span>
        </p>
      </div>

      {/* Commission Table */}
      <div className="bg-white border border-[#121316]/10 rounded-xl overflow-hidden">
        <div className="px-5 py-3.5 border-b border-[#121316]/10">
          <h3 className="text-sm font-semibold text-[#121316]">Lịch sử hoa hồng giới thiệu</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-[#F4F4F1] text-[#5A5D64] border-b border-[#121316]/10">
              <tr>
                <th className="py-3 px-4 font-medium">Mã đơn con</th>
                <th className="py-3 px-4 font-medium">Sản phẩm</th>
                <th className="py-3 px-4 font-medium text-right">Giá trị đơn</th>
                <th className="py-3 px-4 font-medium text-right">Tỷ lệ</th>
                <th className="py-3 px-4 font-medium text-right">Hoa hồng</th>
                <th className="py-3 px-4 font-medium">Trạng thái</th>
                <th className="py-3 px-4 font-medium">Thời gian</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#121316]/8">
              {commissions.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-[#5A5D64]">
                    Chưa có đơn hàng phát sinh từ liên kết giới thiệu của bạn.
                  </td>
                </tr>
              ) : (
                commissions.map((c) => (
                  <tr key={c.id} className="hover:bg-[#F4F4F1]">
                    <td className="py-3 px-4 font-mono font-medium">{c.subOrderCode}</td>
                    <td className="py-3 px-4 max-w-xs truncate">{c.productSummary}</td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums">{formatVND(c.orderAmount)}</td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums">{c.commissionRate}%</td>
                    <td className="py-3 px-4 text-right font-mono font-semibold text-[#1D3C5C] tabular-nums">
                      {formatVND(c.commissionAmount)}
                    </td>
                    <td className="py-3 px-4 font-medium">{c.status}</td>
                    <td className="py-3 px-4 text-[#5A5D64] tabular-nums">{formatDateTime(c.createdAt)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
