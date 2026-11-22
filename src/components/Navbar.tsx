import { ShoppingBag } from 'lucide-react';
import { useApp } from '../context/AppContext';

export type ActiveRoute = 'home' | 'product' | 'workspace';

interface NavbarProps {
  activeRoute: ActiveRoute;
  onNavigateHome: (sectionId?: string) => void;
  onOpenWorkspace: () => void;
  onOpenCart: () => void;
  onOpenAuth: () => void;
}

export function Navbar({
  onNavigateHome,
  onOpenWorkspace,
  onOpenCart,
  onOpenAuth,
}: NavbarProps) {
  const { user, cart } = useApp();
  const totalQty = cart.reduce((acc, item) => acc + item.quantity, 0);

  return (
    <header className="sticky top-0 z-40 bg-[#F4F4F1]/92 backdrop-blur-md border-b border-[#121316]/12">
      <div className="max-w-[1320px] mx-auto px-6 h-16 flex items-center justify-between gap-8">
        {/* Zone 1: Single text element wordmark */}
        <button
          type="button"
          onClick={() => onNavigateHome()}
          className="font-display text-2xl font-semibold tracking-tight text-[#121316] whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-[#1D3C5C]"
        >
          Mộc &amp; Men
        </button>

        {/* Zone 2: 4 concise single-line navigation links */}
        <nav className="hidden md:flex items-center gap-8 text-[13px] font-medium text-[#5A5D64]">
          <button
            type="button"
            onClick={() => onNavigateHome('catalog-section')}
            className="hover:text-[#121316] hover:underline underline-offset-8 decoration-[#1D3C5C] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            Tác phẩm
          </button>
          <button
            type="button"
            onClick={() => onNavigateHome('villages-section')}
            className="hover:text-[#121316] hover:underline underline-offset-8 decoration-[#1D3C5C] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            Xưởng nghệ nhân
          </button>
          <button
            type="button"
            onClick={() => onNavigateHome('ai-curator-section')}
            className="hover:text-[#121316] hover:underline underline-offset-8 decoration-[#1D3C5C] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            Cố vấn AI
          </button>
          <button
            type="button"
            onClick={() => (user ? onOpenWorkspace() : onOpenAuth())}
            className="hover:text-[#121316] hover:underline underline-offset-8 decoration-[#1D3C5C] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            {user ? `Không gian · ${user.fullName.split(' ').slice(-1)[0]}` : 'Đăng nhập'}
          </button>
        </nav>

        {/* Zone 3: 1 primary action */}
        <div className="flex items-center shrink-0">
          <button
            type="button"
            onClick={onOpenCart}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-[#F4F4F1] bg-[#121316] rounded-md hover:bg-[#1D3C5C] transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1D3C5C]"
          >
            <ShoppingBag className="w-3.5 h-3.5" />
            <span className="tabular-nums">Giỏ hàng ({totalQty})</span>
          </button>
        </div>
      </div>
    </header>
  );
}
