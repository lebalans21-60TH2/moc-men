import { ArrowLeft, Heart, LogOut, Shield, Share2, Store, User as UserIcon } from 'lucide-react';
import { useApp } from '../context/AppContext';
import type { Category, Product } from '../types';
import { CustomerPanel, type CustomerPanelTab } from './workspace/CustomerPanel';
import { SellerPanel } from './workspace/SellerPanel';
import { AffiliatePanel } from './workspace/AffiliatePanel';
import { AdminPanel } from './workspace/AdminPanel';

export type WorkspaceRoleTab = 'customer' | 'seller' | 'affiliate' | 'admin';

interface WorkspaceHubProps {
  activeRole: WorkspaceRoleTab;
  onChangeRole: (role: WorkspaceRoleTab) => void;
  customerTab: CustomerPanelTab;
  onChangeCustomerTab: (tab: CustomerPanelTab) => void;
  allProducts: Product[];
  categories: Category[];
  onRefreshCatalog: () => void;
  onSelectProduct: (id: number) => void;
  onBackToStore: () => void;
  onOpenChatWithShop: (shopId: number, customerId?: number) => void;
}

export function WorkspaceHub({
  activeRole,
  onChangeRole,
  customerTab,
  onChangeCustomerTab,
  allProducts,
  categories,
  onRefreshCatalog,
  onSelectProduct,
  onBackToStore,
  onOpenChatWithShop,
}: WorkspaceHubProps) {
  const { user, wishlistIds, logout } = useApp();

  if (!user) return null;

  const isAdmin = user.roles.includes('admin');
  const savedCount = allProducts.filter((p) => wishlistIds.includes(p.id)).length || wishlistIds.length;

  const openCustomerSection = (tab: CustomerPanelTab) => {
    onChangeRole('customer');
    onChangeCustomerTab(tab);
  };

  return (
    <div className="max-w-[1320px] mx-auto px-6 py-8">
      <div className="flex flex-col lg:flex-row gap-8 items-start">
        {/* 260px Architectural Workspace Sidebar */}
        <aside className="w-full lg:w-[260px] shrink-0 bg-white border border-[#121316]/12 rounded-2xl overflow-hidden">
          <div className="p-5 bg-[#121316] text-[#F4F4F1]">
            <p className="text-[11px] text-[#A6AAB3] mb-1">Tài khoản thống nhất</p>
            <p className="font-display text-xl font-semibold truncate">{user.fullName}</p>
            <p className="text-xs text-[#A6AAB3] truncate mt-0.5">{user.email}</p>

            {/* Quick profile & favorites shortcuts right in the user profile header */}
            <div className="mt-4 pt-3 border-t border-white/12 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => openCustomerSection('profile')}
                className={`flex items-center justify-center gap-1.5 px-2.5 py-2 text-[11px] font-medium rounded-lg transition-colors cursor-pointer ${
                  activeRole === 'customer' && customerTab === 'profile'
                    ? 'bg-white text-[#121316]'
                    : 'bg-white/10 text-[#F4F4F1] hover:bg-white/18'
                }`}
              >
                <UserIcon className="w-3.5 h-3.5 shrink-0" />
                <span>Hồ sơ</span>
              </button>
              <button
                type="button"
                onClick={() => openCustomerSection('wishlist')}
                className={`flex items-center justify-center gap-1.5 px-2.5 py-2 text-[11px] font-medium rounded-lg transition-colors cursor-pointer ${
                  activeRole === 'customer' && customerTab === 'wishlist'
                    ? 'bg-white text-[#121316]'
                    : 'bg-white/10 text-[#F4F4F1] hover:bg-white/18'
                }`}
              >
                <Heart className={`w-3.5 h-3.5 shrink-0 ${savedCount > 0 ? 'fill-[#9E3B2B] text-[#9E3B2B]' : ''}`} />
                <span className="tabular-nums">Yêu thích ({savedCount})</span>
              </button>
            </div>
          </div>

          <div className="p-4 space-y-1">
            <p className="px-2.5 text-[11px] font-medium text-[#5A5D64] mb-1.5">Không gian làm việc</p>

            <button
              type="button"
              onClick={() => onChangeRole('customer')}
              className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                activeRole === 'customer' ? 'bg-[#1D3C5C] text-white' : 'text-[#121316] hover:bg-[#F4F4F1]'
              }`}
            >
              <UserIcon className="w-4 h-4" />
              <span>Khách hàng</span>
            </button>

            <button
              type="button"
              onClick={() => onChangeRole('seller')}
              className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                activeRole === 'seller' ? 'bg-[#1D3C5C] text-white' : 'text-[#121316] hover:bg-[#F4F4F1]'
              }`}
            >
              <Store className="w-4 h-4" />
              <span>Kênh Người Bán</span>
            </button>

            <button
              type="button"
              onClick={() => onChangeRole('affiliate')}
              className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                activeRole === 'affiliate' ? 'bg-[#1D3C5C] text-white' : 'text-[#121316] hover:bg-[#F4F4F1]'
              }`}
            >
              <Share2 className="w-4 h-4" />
              <span>Tiếp Thị Liên Kết</span>
            </button>

            {isAdmin && (
              <button
                type="button"
                onClick={() => onChangeRole('admin')}
                className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                  activeRole === 'admin' ? 'bg-[#1D3C5C] text-white' : 'text-[#121316] hover:bg-[#F4F4F1]'
                }`}
              >
                <Shield className="w-4 h-4" />
                <span>Quản Trị Hệ Thống</span>
              </button>
            )}
          </div>

          <div className="p-4 pt-3 border-t border-[#121316]/10 space-y-1">
            <button
              type="button"
              onClick={onBackToStore}
              className="w-full flex items-center gap-2 px-3 py-2 text-xs text-[#5A5D64] hover:text-[#121316] rounded-md hover:bg-[#F4F4F1] cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Về trang mua sắm</span>
            </button>
            <button
              type="button"
              onClick={() => {
                logout();
                onBackToStore();
              }}
              className="w-full flex items-center gap-2 px-3 py-2 text-xs text-[#9E3B2B] hover:bg-[#9E3B2B]/8 rounded-md cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
              <span>Đăng xuất</span>
            </button>
          </div>
        </aside>

        {/* Main Workspace Content */}
        <main className="flex-1 min-w-0 w-full">
          {activeRole === 'customer' && (
            <CustomerPanel
              allProducts={allProducts}
              activeTab={customerTab}
              onChangeTab={onChangeCustomerTab}
              onSelectProduct={onSelectProduct}
              onBackToStore={onBackToStore}
              onOpenChatWithShop={(sid) => onOpenChatWithShop(sid)}
            />
          )}
          {activeRole === 'seller' && (
            <SellerPanel
              categories={categories}
              onRefreshCatalog={onRefreshCatalog}
              onOpenChatThread={(sid, cid) => onOpenChatWithShop(sid, cid)}
            />
          )}
          {activeRole === 'affiliate' && <AffiliatePanel allProducts={allProducts} />}
          {activeRole === 'admin' && isAdmin && <AdminPanel onRefreshCatalog={onRefreshCatalog} />}
        </main>
      </div>
    </div>
  );
}
