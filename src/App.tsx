import { useCallback, useEffect, useState } from 'react';
import { AppProvider, useApp } from './context/AppContext';
import type { Category, Product, Shop, Voucher } from './types';
import { Navbar, type ActiveRoute } from './components/Navbar';
import { StorefrontHome } from './components/StorefrontHome';
import { ProductDetailView } from './components/ProductDetailView';
import { CartCheckoutDrawer } from './components/CartCheckoutDrawer';
import { AuthModal } from './components/AuthModal';
import { ChatDrawer } from './components/ChatDrawer';
import { WorkspaceHub, type WorkspaceRoleTab } from './components/WorkspaceHub';
import type { CustomerPanelTab } from './components/workspace/CustomerPanel';

function MainApp() {
  const { user, toast, affiliateRefCode } = useApp();

  const [route, setRoute] = useState<ActiveRoute>('home');
  const [selectedProductId, setSelectedProductId] = useState<number | null>(null);
  const [workspaceRole, setWorkspaceRole] = useState<WorkspaceRoleTab>('customer');
  const [customerTab, setCustomerTab] = useState<CustomerPanelTab>('orders');

  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [shops, setShops] = useState<Shop[]>([]);
  const [vouchers, setVouchers] = useState<Voucher[]>([]);
  const [loading, setLoading] = useState(true);

  const [cartOpen, setCartOpen] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [chatState, setChatState] = useState<{
    open: boolean;
    shopId: number | null;
    customerId?: number | null;
    productId?: number | null;
  }>({ open: false, shopId: null });

  const loadCatalog = useCallback(async () => {
    try {
      const [prods, cats, shs, vchs] = await Promise.all([
        fetch('/api/products').then((r) => r.json()),
        fetch('/api/categories').then((r) => r.json()),
        fetch('/api/shops').then((r) => r.json()),
        fetch('/api/vouchers/active').then((r) => r.json()),
      ]);
      setProducts(Array.isArray(prods) ? prods : []);
      setCategories(Array.isArray(cats) ? cats : []);
      setShops(Array.isArray(shs) ? shs : []);
      setVouchers(Array.isArray(vchs) ? vchs : []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadCatalog();
    const params = new URLSearchParams(window.location.search);
    const pid = params.get('pid');
    if (pid && Number(pid) > 0) {
      setSelectedProductId(Number(pid));
      setRoute('product');
    }
  }, [loadCatalog]);

  const handleNavigateHome = (sectionId?: string) => {
    setRoute('home');
    if (sectionId) {
      window.setTimeout(() => {
        document.getElementById(sectionId)?.scrollIntoView({ behavior: 'smooth' });
      }, 60);
    } else {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleSelectProduct = (id: number) => {
    setSelectedProductId(id);
    setRoute('product');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleOpenWorkspace = (initialRole?: string, initialCustomerTab?: CustomerPanelTab) => {
    if (!user) {
      setAuthOpen(true);
      return;
    }
    if (initialCustomerTab) {
      setCustomerTab(initialCustomerTab);
    }
    if (initialRole === 'seller' || initialRole === 'affiliate' || initialRole === 'admin' || initialRole === 'customer') {
      setWorkspaceRole(initialRole);
    } else if (user.roles.includes('admin')) {
      setWorkspaceRole('admin');
    } else if (user.roles.includes('seller')) {
      setWorkspaceRole('seller');
    } else {
      setWorkspaceRole('customer');
    }
    setRoute('workspace');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#F4F4F1] text-[#121316]">
      <Navbar
        activeRoute={route}
        onNavigateHome={handleNavigateHome}
        onOpenWorkspace={() => handleOpenWorkspace()}
        onOpenCart={() => setCartOpen(true)}
        onOpenAuth={() => setAuthOpen(true)}
      />

      {affiliateRefCode && (
        <div className="bg-[#121316] text-[#F4F4F1] text-center py-1.5 px-4 text-xs">
          Đang áp dụng mã cộng tác viên:{' '}
          <span className="font-mono font-semibold text-white">{affiliateRefCode}</span>
        </div>
      )}

      <main className="flex-1">
        {loading ? (
          <div className="max-w-[1320px] mx-auto px-6 py-12 space-y-6">
            <div className="h-[420px] bg-[#E6E7E2] rounded-2xl animate-pulse" />
            <div className="grid grid-cols-1 md:grid-cols-3 gap-7">
              <div className="h-72 bg-[#E6E7E2] rounded-xl animate-pulse" />
              <div className="h-72 bg-[#E6E7E2] rounded-xl animate-pulse" />
              <div className="h-72 bg-[#E6E7E2] rounded-xl animate-pulse" />
            </div>
          </div>
        ) : route === 'home' ? (
          <StorefrontHome
            products={products}
            categories={categories}
            shops={shops}
            vouchers={vouchers}
            onSelectProduct={handleSelectProduct}
            onOpenAuth={() => setAuthOpen(true)}
            onOpenWorkspace={handleOpenWorkspace}
          />
        ) : route === 'product' && selectedProductId ? (
          <ProductDetailView
            productId={selectedProductId}
            allProducts={products}
            onBack={() => setRoute('home')}
            onSelectProduct={handleSelectProduct}
            onOpenAuth={() => setAuthOpen(true)}
            onOpenChatWithShop={(shopId, productId) =>
              setChatState({ open: true, shopId, productId })
            }
          />
        ) : (
          <WorkspaceHub
            activeRole={workspaceRole}
            onChangeRole={setWorkspaceRole}
            customerTab={customerTab}
            onChangeCustomerTab={setCustomerTab}
            allProducts={products}
            categories={categories}
            onRefreshCatalog={() => void loadCatalog()}
            onSelectProduct={handleSelectProduct}
            onBackToStore={() => handleNavigateHome('catalog-section')}
            onOpenChatWithShop={(shopId, customerId) =>
              setChatState({ open: true, shopId, customerId })
            }
          />
        )}
      </main>

      <footer className="border-t border-[#121316]/12 bg-white mt-16">
        <div className="max-w-[1320px] mx-auto px-6 py-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="space-y-1">
            <p className="font-display text-2xl font-semibold text-[#121316] tracking-tight">Mộc &amp; Men</p>
            <p className="text-xs text-[#5A5D64]">
              Sàn thương mại điện tử đa nhà bán hàng thủ công mỹ nghệ Việt Nam · Kết nối trực tiếp từ xưởng nghệ nhân
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-7 text-xs font-medium text-[#5A5D64]">
            <button type="button" onClick={() => handleNavigateHome('catalog-section')} className="hover:text-[#121316] transition-colors cursor-pointer">
              Bộ sưu tập
            </button>
            <button type="button" onClick={() => handleOpenWorkspace('seller')} className="hover:text-[#121316] transition-colors cursor-pointer">
              Kênh nghệ nhân
            </button>
            <button type="button" onClick={() => handleOpenWorkspace('affiliate')} className="hover:text-[#121316] transition-colors cursor-pointer">
              Tiếp thị liên kết
            </button>
            <button type="button" onClick={() => (user?.roles.includes('admin') ? handleOpenWorkspace('admin') : setAuthOpen(true))} className="hover:text-[#121316] transition-colors cursor-pointer">
              Quản trị sàn
            </button>
          </div>
        </div>
      </footer>

      <CartCheckoutDrawer
        open={cartOpen}
        onClose={() => setCartOpen(false)}
        vouchers={vouchers}
        onOpenAuth={() => {
          setCartOpen(false);
          setAuthOpen(true);
        }}
        onOrderCompleted={() => {
          void loadCatalog();
          setWorkspaceRole('customer');
          setRoute('workspace');
        }}
      />

      <AuthModal
        open={authOpen}
        onClose={() => setAuthOpen(false)}
      />

      <ChatDrawer
        open={chatState.open}
        shopId={chatState.shopId}
        customerId={chatState.customerId}
        productId={chatState.productId}
        onClose={() => setChatState({ open: false, shopId: null })}
      />

      {toast && (
        <div className="fixed bottom-5 right-5 z-60 max-w-sm px-4 py-3 text-xs font-medium text-[#F4F4F1] bg-[#121316] border border-white/10 rounded-lg shadow-xl">
          {toast}
        </div>
      )}
    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <MainApp />
    </AppProvider>
  );
}
