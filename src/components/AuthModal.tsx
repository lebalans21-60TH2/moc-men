import React, { useEffect, useState } from 'react';
import { X, ShieldCheck } from 'lucide-react';
import { useApp } from '../context/AppContext';
import type { User } from '../types';

interface AuthModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export function AuthModal({ open, onClose, onSuccess }: AuthModalProps) {
  const { setSession, apiFetch, showToast } = useApp();
  const [tab, setTab] = useState<'login' | 'register' | 'admin'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [adminStatus, setAdminStatus] = useState<{ configured: boolean; mode: string } | null>(null);
  const [adminPassword, setAdminPassword] = useState('');
  const [adminConfirmPassword, setAdminConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open && tab === 'admin') {
      fetch('/api/auth/admin-status')
        .then((r) => r.json())
        .then(setAdminStatus)
        .catch(() => {});
    }
  }, [open, tab]);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      if (tab === 'login') {
        const res = await apiFetch<{ token: string; user: User }>('/api/auth/login', {
          method: 'POST',
          body: JSON.stringify({ email, password }),
        });
        setSession(res.token, res.user);
        showToast(`Chào mừng trở lại, ${res.user.fullName}.`);
        onSuccess?.();
        onClose();
      } else if (tab === 'register') {
        const res = await apiFetch<{ token: string; user: User }>('/api/auth/register', {
          method: 'POST',
          body: JSON.stringify({ email, password, fullName, phone }),
        });
        setSession(res.token, res.user);
        showToast('Đăng ký tài khoản thành công.');
        onSuccess?.();
        onClose();
      } else if (tab === 'admin') {
        if (adminStatus && !adminStatus.configured) {
          if (adminPassword !== adminConfirmPassword) {
            setError('Mật khẩu xác nhận không khớp.');
            setLoading(false);
            return;
          }
          const res = await apiFetch<{ token: string; user: User }>('/api/auth/claim-admin', {
            method: 'POST',
            body: JSON.stringify({ email, password: adminPassword, fullName: fullName || 'Quản trị viên Sàn' }),
          });
          setSession(res.token, res.user);
          showToast('Đã khởi tạo và kích hoạt tài khoản Quản trị viên.');
          onSuccess?.();
          onClose();
        } else {
          const res = await apiFetch<{ token: string; user: User }>('/api/auth/admin-login', {
            method: 'POST',
            body: JSON.stringify({ email, password: adminPassword }),
          });
          setSession(res.token, res.user);
          showToast(`Đăng nhập Quản trị viên thành công (${res.user.fullName}).`);
          onSuccess?.();
          onClose();
        }
      }
    } catch (err: any) {
      setError(err.message || 'Đã xảy ra lỗi.');
    } finally {
      setLoading(false);
    }
  };

  const quickLoginDemo = async (demoEmail: string) => {
    setError(null);
    setLoading(true);
    try {
      const res = await apiFetch<{ token: string; user: User }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: demoEmail, password: 'DemoCraft2026!' }),
      });
      setSession(res.token, res.user);
      showToast(`Đã đăng nhập: ${res.user.fullName}`);
      onSuccess?.();
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-[2px] p-4">
      <div className="w-full max-w-md bg-white border border-[#121316]/12 rounded-xl shadow-xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#121316]/10">
          <h2 className="font-display text-lg font-semibold text-[#121316]">Tài khoản Mộc &amp; Men</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng"
            className="p-1.5 text-[#5A5D64] hover:text-[#121316] rounded-md cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 pt-4">
          <div className="grid grid-cols-3 gap-1 p-1 bg-[#E6E7E2] rounded-lg text-xs font-medium">
            <button
              type="button"
              onClick={() => {
                setTab('login');
                setError(null);
              }}
              className={`py-2 rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                tab === 'login' ? 'bg-white text-[#121316] shadow-sm' : 'text-[#5A5D64] hover:text-[#121316]'
              }`}
            >
              Đăng nhập
            </button>
            <button
              type="button"
              onClick={() => {
                setTab('register');
                setError(null);
              }}
              className={`py-2 rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                tab === 'register' ? 'bg-white text-[#121316] shadow-sm' : 'text-[#5A5D64] hover:text-[#121316]'
              }`}
            >
              Đăng ký
            </button>
            <button
              type="button"
              onClick={() => {
                setTab('admin');
                setError(null);
              }}
              className={`py-2 rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                tab === 'admin' ? 'bg-white text-[#121316] shadow-sm' : 'text-[#5A5D64] hover:text-[#121316]'
              }`}
            >
              Quản trị sàn
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg">{error}</div>
          )}

          {tab === 'login' && (
            <>
              <div>
                <label className="block text-xs font-medium text-[#5A5D64] mb-1">Email</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="khachhang@mocmen.vn"
                  className="w-full px-3.5 py-2.5 text-sm bg-[#F4F4F1] border border-[#121316]/15 rounded-lg focus:outline-none focus:border-[#1D3C5C]"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#5A5D64] mb-1">Mật khẩu</label>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-3.5 py-2.5 text-sm bg-[#F4F4F1] border border-[#121316]/15 rounded-lg focus:outline-none focus:border-[#1D3C5C]"
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 px-4 text-sm font-semibold text-white bg-[#1D3C5C] rounded-lg hover:bg-[#142B43] transition-colors disabled:opacity-60 cursor-pointer"
              >
                {loading ? 'Đang xử lý...' : 'Đăng nhập'}
              </button>

              <div className="pt-3 border-t border-[#121316]/10">
                <p className="text-xs text-[#5A5D64] mb-2">Truy cập nhanh tài khoản mẫu (một tài khoản đa vai trò):</p>
                <div className="grid grid-cols-1 gap-1.5">
                  <button
                    type="button"
                    onClick={() => quickLoginDemo('khachhang@mocmen.vn')}
                    className="text-left px-3 py-2 text-xs bg-[#F4F4F1] hover:bg-[#E6E7E2] border border-[#121316]/10 rounded-lg transition-colors cursor-pointer"
                  >
                    <span className="font-semibold text-[#121316]">Khách hàng &amp; Affiliate:</span>{' '}
                    <span className="text-[#5A5D64]">khachhang@mocmen.vn</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => quickLoginDemo('gom@mocmen.vn')}
                    className="text-left px-3 py-2 text-xs bg-[#F4F4F1] hover:bg-[#E6E7E2] border border-[#121316]/10 rounded-lg transition-colors cursor-pointer"
                  >
                    <span className="font-semibold text-[#121316]">Seller A (Lò Gốm Minh Tâm):</span>{' '}
                    <span className="text-[#5A5D64]">gom@mocmen.vn</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => quickLoginDemo('maytre@mocmen.vn')}
                    className="text-left px-3 py-2 text-xs bg-[#F4F4F1] hover:bg-[#E6E7E2] border border-[#121316]/10 rounded-lg transition-colors cursor-pointer"
                  >
                    <span className="font-semibold text-[#121316]">Seller B (Mây Tre Phú Vinh):</span>{' '}
                    <span className="text-[#5A5D64]">maytre@mocmen.vn</span>
                  </button>
                </div>
              </div>
            </>
          )}

          {tab === 'register' && (
            <>
              <p className="text-xs text-[#5A5D64]">
                Một tài khoản duy nhất dùng để mua sắm, mở gian hàng nghệ nhân hoặc tham gia tiếp thị liên kết.
              </p>
              <div>
                <label className="block text-xs font-medium text-[#5A5D64] mb-1">Họ và tên</label>
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Nguyễn Văn An"
                  className="w-full px-3.5 py-2 text-sm bg-[#F4F4F1] border border-[#121316]/15 rounded-lg focus:outline-none focus:border-[#1D3C5C]"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[#5A5D64] mb-1">Email</label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="email@domain.vn"
                    className="w-full px-3.5 py-2 text-sm bg-[#F4F4F1] border border-[#121316]/15 rounded-lg focus:outline-none focus:border-[#1D3C5C]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#5A5D64] mb-1">Số điện thoại</label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="0901234567"
                    className="w-full px-3.5 py-2 text-sm bg-[#F4F4F1] border border-[#121316]/15 rounded-lg focus:outline-none focus:border-[#1D3C5C]"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-[#5A5D64] mb-1">Mật khẩu (tối thiểu 6 ký tự)</label>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-3.5 py-2 text-sm bg-[#F4F4F1] border border-[#121316]/15 rounded-lg focus:outline-none focus:border-[#1D3C5C]"
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 px-4 text-sm font-semibold text-white bg-[#1D3C5C] rounded-lg hover:bg-[#142B43] transition-colors disabled:opacity-60 cursor-pointer"
              >
                {loading ? 'Đang tạo tài khoản...' : 'Tạo tài khoản'}
              </button>
            </>
          )}

          {tab === 'admin' && (
            <>
              <div className="flex items-start gap-2.5 p-3 bg-[#F4F4F1] border border-[#121316]/10 rounded-lg text-xs text-[#5A5D64]">
                <ShieldCheck className="w-4 h-4 text-[#1D3C5C] shrink-0 mt-0.5" />
                <div>
                  {adminStatus && !adminStatus.configured
                    ? 'Khởi tạo lần đầu: Tạo tài khoản Quản trị viên bằng Email và Mật khẩu riêng (chỉ thực hiện 1 lần và tự khóa sau khi thiết lập).'
                    : 'Đăng nhập bằng tài khoản Email và Mật khẩu đã được cấp quyền Quản trị viên.'}
                </div>
              </div>

              {adminStatus && !adminStatus.configured && (
                <div>
                  <label className="block text-xs font-medium text-[#5A5D64] mb-1">Tên quản trị viên</label>
                  <input
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Quản trị viên Sàn"
                    className="w-full px-3.5 py-2 text-sm bg-[#F4F4F1] border border-[#121316]/15 rounded-lg focus:outline-none focus:border-[#1D3C5C]"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-[#5A5D64] mb-1">Email tài khoản quản trị</label>
                <input
                  type="email"
                  required
                  autoComplete="username"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@mocmen.vn"
                  className="w-full px-3.5 py-2 text-sm bg-[#F4F4F1] border border-[#121316]/15 rounded-lg focus:outline-none focus:border-[#1D3C5C]"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[#5A5D64] mb-1">
                  {adminStatus && !adminStatus.configured ? 'Mật khẩu quản trị (tối thiểu 6 ký tự)' : 'Mật khẩu tài khoản quản trị'}
                </label>
                <input
                  type="password"
                  required
                  minLength={6}
                  autoComplete={adminStatus && !adminStatus.configured ? 'new-password' : 'current-password'}
                  value={adminPassword}
                  onChange={(e) => setAdminPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-3.5 py-2 text-sm bg-[#F4F4F1] border border-[#121316]/15 rounded-lg focus:outline-none focus:border-[#1D3C5C]"
                />
              </div>

              {adminStatus && !adminStatus.configured && (
                <div>
                  <label className="block text-xs font-medium text-[#5A5D64] mb-1">Xác nhận mật khẩu</label>
                  <input
                    type="password"
                    required
                    minLength={6}
                    autoComplete="new-password"
                    value={adminConfirmPassword}
                    onChange={(e) => setAdminConfirmPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full px-3.5 py-2 text-sm bg-[#F4F4F1] border border-[#121316]/15 rounded-lg focus:outline-none focus:border-[#1D3C5C]"
                  />
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 px-4 text-sm font-semibold text-white bg-[#1D3C5C] rounded-lg hover:bg-[#142B43] transition-colors disabled:opacity-60 cursor-pointer"
              >
                {loading
                  ? 'Đang xác thực...'
                  : adminStatus && !adminStatus.configured
                    ? 'Thiết lập tài khoản Quản trị viên'
                    : 'Đăng nhập Quản trị viên'}
              </button>
            </>
          )}
        </form>
      </div>
    </div>
  );
}
