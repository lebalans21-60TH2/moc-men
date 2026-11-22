import React, { useMemo, useState } from 'react';
import { ArrowRight, ArrowUpRight, Heart, Search, Sparkles, Store } from 'lucide-react';
import { useApp } from '../context/AppContext';
import type { Category, Product, Shop, SmartRecommendationItem, Voucher } from '../types';
import { formatVND } from '../utils/format';
import { ResilientImage } from './ResilientImage';

interface StorefrontHomeProps {
  products: Product[];
  categories: Category[];
  shops: Shop[];
  vouchers: Voucher[];
  onSelectProduct: (productId: number) => void;
  onOpenAuth: () => void;
  onOpenWorkspace: (initialRole?: string) => void;
}

export function StorefrontHome({
  products,
  categories,
  shops,
  vouchers,
  onSelectProduct,
  onOpenAuth,
  onOpenWorkspace,
}: StorefrontHomeProps) {
  const { addToCart, toggleWishlist, wishlistIds, user, cart, apiFetch, showToast } = useApp();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | 'all'>('all');
  const [selectedShopId, setSelectedShopId] = useState<number | 'all'>('all');
  const [selectedMaterial, setSelectedMaterial] = useState<string>('all');
  const [priceCeiling, setPriceCeiling] = useState<number | 'all'>('all');
  const [sortBy, setSortBy] = useState<'featured' | 'price_asc' | 'price_desc' | 'bestseller'>('featured');

  // Smart Gemini Curator state
  const [aiQuery, setAiQuery] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [aiItems, setAiItems] = useState<SmartRecommendationItem[]>([]);
  const [aiError, setAiError] = useState<string | null>(null);

  const materials = useMemo(() => {
    const set = new Set<string>();
    products.forEach((p) => {
      if (p.material) set.add(p.material);
    });
    return Array.from(set);
  }, [products]);

  const filteredProducts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return products
      .filter((p) => {
        const price = p.flashSalePrice ?? p.basePrice;
        if (q) {
          const hay = `${p.name} ${p.material} ${p.originVillage} ${p.shopName || ''} ${p.categoryName || ''}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        if (selectedCategoryId !== 'all' && p.categoryId !== selectedCategoryId) return false;
        if (selectedShopId !== 'all' && p.shopId !== selectedShopId) return false;
        if (selectedMaterial !== 'all' && p.material !== selectedMaterial) return false;
        if (priceCeiling !== 'all' && price > priceCeiling) return false;
        return true;
      })
      .sort((a, b) => {
        if (sortBy === 'price_asc') return (a.flashSalePrice ?? a.basePrice) - (b.flashSalePrice ?? b.basePrice);
        if (sortBy === 'price_desc') return (b.flashSalePrice ?? b.basePrice) - (a.flashSalePrice ?? a.basePrice);
        if (sortBy === 'bestseller') return b.soldCount - a.soldCount;
        if (a.isPromoted !== b.isPromoted) return a.isPromoted ? -1 : 1;
        return b.soldCount - a.soldCount;
      });
  }, [products, searchQuery, selectedCategoryId, selectedShopId, selectedMaterial, priceCeiling, sortBy]);

  const handleAskAI = async (customPrompt?: string) => {
    const q = (customPrompt ?? aiQuery).trim();
    if (customPrompt) setAiQuery(customPrompt);
    setAiLoading(true);
    setAiError(null);
    try {
      const res = await apiFetch<{ summary: string; recommendations: SmartRecommendationItem[] }>(
        '/api/recommendations',
        {
          method: 'POST',
          body: JSON.stringify({
            query: q || 'Gợi ý bộ sưu tập thủ công mỹ nghệ tinh tế để trang trí phòng khách và tiếp trà',
            cartProductNames: cart.map((c) => c.product.name),
          }),
        }
      );
      setAiSummary(res.summary);
      setAiItems(res.recommendations);
    } catch (err: any) {
      setAiError(err.message || 'Không thể tải gợi ý lúc này.');
    } finally {
      setAiLoading(false);
    }
  };

  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div className="space-y-20 pb-16">
      {/* SECTION 1: DARK EXHIBITION HERO + ARCHITECTURAL INDEX STRIP */}
      <section className="max-w-[1320px] mx-auto px-6 pt-6">
        <div className="bg-[#121316] text-[#F4F4F1] rounded-2xl overflow-hidden grid grid-cols-1 lg:grid-cols-12 items-stretch">
          <div className="lg:col-span-5 p-8 lg:p-11 flex flex-col justify-between gap-8">
            <div>
              <p className="text-xs font-medium tracking-wide text-[#B6B9C0] mb-4">
                Sàn thủ công đa nhà bán · Triển lãm Làng nghề Việt
              </p>
              <h1
                className="font-display text-4xl lg:text-[52px] font-medium text-[#F4F4F1] leading-[1.08] tracking-tight mb-5"
                style={{ textWrap: 'balance' }}
              >
                Tinh hoa mỹ nghệ <em className="italic font-normal text-[#D4C3A3]">trực tiếp từ xưởng</em> nghệ nhân
              </h1>
              <p className="text-sm text-[#A6AAB3] leading-relaxed">
                Gốm men rạn Bát Tràng, mây tre Phú Vinh, sơn mài Hạ Thái và lụa tơ tằm Nha Xá quy tụ trong một giỏ hàng thống nhất — tự động chia đơn minh bạch tới từng xưởng chế tác.
              </p>
            </div>

            <div className="space-y-7">
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => scrollTo('catalog-section')}
                  className="inline-flex items-center gap-2 px-5 py-3 text-xs font-semibold text-[#121316] bg-[#F4F4F1] rounded-md hover:bg-white transition-colors whitespace-nowrap cursor-pointer"
                >
                  <span>Khám phá tác phẩm</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => scrollTo('ai-curator-section')}
                  className="inline-flex items-center gap-2 px-5 py-3 text-xs font-semibold text-[#F4F4F1] border border-white/20 rounded-md hover:bg-white/10 transition-colors whitespace-nowrap cursor-pointer"
                >
                  <span>Cố vấn bài trí AI</span>
                </button>
              </div>

              <div className="pt-5 border-t border-white/12 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-[#A6AAB3]">
                <span>01 Bát Tràng</span>
                <span aria-hidden="true">·</span>
                <span>02 Phú Vinh</span>
                <span aria-hidden="true">·</span>
                <span>03 Hạ Thái</span>
                <span aria-hidden="true">·</span>
                <span>04 Nha Xá</span>
                <span aria-hidden="true">·</span>
                <span>05 Đồng Kỵ</span>
              </div>
            </div>
          </div>

          <div className="lg:col-span-7 relative min-h-[320px] lg:min-h-[500px]">
            <ResilientImage
              src="/src/assets/images/gallery_hero_craft_1795252005365.jpg"
              alt="Trưng bày bình gốm men rạn, khay sơn mài khảm trai và bình mây tre trên bục đá phiến"
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[#121316]/85 via-transparent to-transparent pointer-events-none" />
            <div className="absolute bottom-5 left-6 right-6 flex flex-wrap items-center justify-between gap-2 text-xs text-[#E6E7E2]">
              <span>Tuyển chọn trực tiếp từ các lò gốm và xưởng mây tre truyền thống</span>
              <span className="font-mono tabular-nums text-[11px] text-[#D4C3A3]">
                {products.length} tác phẩm đang mở bán
              </span>
            </div>
          </div>
        </div>

        {/* 4-Column Architectural Index Strip */}
        <div className="mt-6 grid grid-cols-2 lg:grid-cols-4 border-y border-[#121316]/12 divide-y lg:divide-y-0 lg:divide-x divide-[#121316]/12">
          <div className="py-5 lg:pr-6">
            <p className="font-mono text-xs text-[#1D3C5C] font-medium mb-1">01</p>
            <p className="text-sm font-semibold text-[#121316]">5+ Làng nghề truyền thống</p>
            <p className="text-xs text-[#5A5D64] mt-0.5">Xác thực xuất xứ từ xưởng gia truyền</p>
          </div>
          <div className="py-5 lg:px-6">
            <p className="font-mono text-xs text-[#1D3C5C] font-medium mb-1">02</p>
            <p className="text-sm font-semibold text-[#121316]">Tách đơn đa nhà bán</p>
            <p className="text-xs text-[#5A5D64] mt-0.5">Thanh toán 1 lần, tách vận đơn theo từng Shop</p>
          </div>
          <div className="py-5 lg:px-6">
            <p className="font-mono text-xs text-[#1D3C5C] font-medium mb-1">03</p>
            <p className="text-sm font-semibold text-[#121316]">Chế tác theo yêu cầu</p>
            <p className="text-xs text-[#5A5D64] mt-0.5">Lịch hẹn hoàn thiện rõ ràng từ nghệ nhân</p>
          </div>
          <div className="py-5 lg:pl-6">
            <p className="font-mono text-xs text-[#1D3C5C] font-medium mb-1">04</p>
            <p className="text-sm font-semibold text-[#121316]">Đối soát Affiliate minh bạch</p>
            <p className="text-xs text-[#5A5D64] mt-0.5">Ghi nhận hoa hồng theo từng đơn hàng con</p>
          </div>
        </div>
      </section>

      {/* SECTION 2: GALLERY COLLECTION & ARCHITECTURAL FILTER */}
      <section id="catalog-section" className="max-w-[1320px] mx-auto px-6">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-6">
          <div>
            <p className="text-xs font-medium text-[#1D3C5C] mb-1">Danh mục trưng bày</p>
            <h2 className="font-display text-3xl lg:text-4xl font-semibold text-[#121316]">
              Bộ sưu tập thủ công tuyển chọn
            </h2>
          </div>
          {vouchers.length > 0 && (
            <div className="flex items-center gap-3 text-xs bg-white border border-[#121316]/12 px-4 py-2.5 rounded-lg">
              <span className="font-medium text-[#5A5D64]">Mã ưu đãi sàn:</span>
              <span className="font-mono font-semibold text-[#1D3C5C]">{vouchers[0].code}</span>
              <span className="text-[#5A5D64] hidden sm:inline">· {vouchers[0].title}</span>
            </div>
          )}
        </div>

        {/* Sleek Architectural Filter Ribbon */}
        <div className="border-y border-[#121316]/12 py-4 mb-9 space-y-4">
          <div className="flex flex-col lg:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-[#5A5D64] absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Tìm tác phẩm theo tên, chất liệu, làng nghề hoặc xưởng..."
                className="w-full pl-10 pr-4 py-2.5 text-sm bg-white border border-[#121316]/12 rounded-md focus:outline-none focus:border-[#1D3C5C]"
              />
            </div>

            <select
              value={selectedShopId}
              onChange={(e) => setSelectedShopId(e.target.value === 'all' ? 'all' : Number(e.target.value))}
              className="px-3.5 py-2.5 text-xs font-medium bg-white border border-[#121316]/12 rounded-md focus:outline-none focus:border-[#1D3C5C]"
            >
              <option value="all">Tất cả gian hàng</option>
              {shops.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>

            <select
              value={selectedMaterial}
              onChange={(e) => setSelectedMaterial(e.target.value)}
              className="px-3.5 py-2.5 text-xs font-medium bg-white border border-[#121316]/12 rounded-md focus:outline-none focus:border-[#1D3C5C]"
            >
              <option value="all">Tất cả chất liệu</option>
              {materials.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>

            <select
              value={priceCeiling}
              onChange={(e) => setPriceCeiling(e.target.value === 'all' ? 'all' : Number(e.target.value))}
              className="px-3.5 py-2.5 text-xs font-medium bg-white border border-[#121316]/12 rounded-md focus:outline-none focus:border-[#1D3C5C]"
            >
              <option value="all">Mọi mức giá</option>
              <option value={1000000}>Dưới 1.000.000đ</option>
              <option value={2000000}>Dưới 2.000.000đ</option>
              <option value={3000000}>Dưới 3.000.000đ</option>
            </select>

            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="px-3.5 py-2.5 text-xs font-medium bg-white border border-[#121316]/12 rounded-md focus:outline-none focus:border-[#1D3C5C]"
            >
              <option value="featured">Nổi bật</option>
              <option value="bestseller">Bán chạy nhất</option>
              <option value="price_asc">Giá tăng dần</option>
              <option value="price_desc">Giá giảm dần</option>
            </select>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => setSelectedCategoryId('all')}
              className={`px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                selectedCategoryId === 'all'
                  ? 'bg-[#121316] text-[#F4F4F1]'
                  : 'bg-white text-[#5A5D64] border border-[#121316]/10 hover:text-[#121316]'
              }`}
            >
              Tất cả ({products.length})
            </button>
            {categories.map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setSelectedCategoryId(cat.id)}
                className={`px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  selectedCategoryId === cat.id
                    ? 'bg-[#121316] text-[#F4F4F1]'
                    : 'bg-white text-[#5A5D64] border border-[#121316]/10 hover:text-[#121316]'
                }`}
              >
                {cat.name}
              </button>
            ))}
          </div>
        </div>

        {/* Masonry Gallery Product Showcase */}
        {filteredProducts.length === 0 ? (
          <div className="py-16 text-center bg-white border border-[#121316]/10 rounded-3xl shadow-[0_6px_24px_-6px_rgba(18,19,22,0.06)]">
            <p className="text-base font-medium text-[#121316]">Không tìm thấy tác phẩm phù hợp bộ lọc</p>
            <p className="text-sm text-[#5A5D64] mt-1 mb-4">Hãy thử thay đổi chất liệu hoặc đặt lại bộ lọc tìm kiếm.</p>
            <button
              type="button"
              onClick={() => {
                setSearchQuery('');
                setSelectedCategoryId('all');
                setSelectedShopId('all');
                setSelectedMaterial('all');
                setPriceCeiling('all');
              }}
              className="px-5 py-2.5 text-xs font-semibold text-white bg-[#1D3C5C] rounded-xl cursor-pointer"
            >
              Đặt lại bộ lọc
            </button>
          </div>
        ) : (
          <div className="columns-1 md:columns-2 lg:columns-3 gap-7">
            {filteredProducts.map((product, idx) => {
              const activePrice = product.flashSalePrice ?? product.basePrice;
              const isWished = wishlistIds.includes(product.id);
              const defaultVariantId = product.variants[0]?.id || 'default';
              const hasSecondaryImage = product.images.length > 1;
              const masonryAspect = [
                'aspect-[4/5]',
                'aspect-[4/3]',
                'aspect-square',
                'aspect-[5/4]',
                'aspect-[4/5]',
                'aspect-[4/3]',
              ][idx % 6];

              return (
                <article
                  key={product.id}
                  className="group break-inside-avoid mb-7 bg-white border border-[#121316]/8 rounded-3xl p-3 shadow-[0_6px_24px_-6px_rgba(18,19,22,0.07),0_2px_6px_-2px_rgba(18,19,22,0.04)] hover:-translate-y-1.5 hover:shadow-[0_22px_44px_-14px_rgba(29,60,92,0.16),0_8px_18px_-6px_rgba(18,19,22,0.08)] hover:border-[#1D3C5C]/20 transition-all duration-300 ease-out"
                >
                  <div
                    onClick={() => onSelectProduct(product.id)}
                    className={`relative ${masonryAspect} rounded-2xl bg-[#E6E7E2] overflow-hidden cursor-pointer`}
                  >
                    <ResilientImage
                      src={product.images[0]}
                      alt={product.name}
                      className={`w-full h-full object-cover transition-all duration-500 ${
                        hasSecondaryImage ? 'group-hover:opacity-0' : 'group-hover:scale-[1.04]'
                      }`}
                    />
                    {hasSecondaryImage && (
                      <ResilientImage
                        src={product.images[1]}
                        alt={`${product.name} góc nhìn thứ hai`}
                        className="absolute inset-0 w-full h-full object-cover opacity-0 group-hover:opacity-100 transition-opacity duration-500"
                      />
                    )}
                    <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-[#121316]/65 via-[#121316]/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-end p-4 pointer-events-none">
                      <span className="text-[11px] font-medium text-[#F4F4F1] inline-flex items-center gap-1">
                        <span>Xem hồ sơ chế tác</span>
                        <ArrowRight className="w-3 h-3" />
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        void toggleWishlist(product.id);
                      }}
                      aria-label={isWished ? 'Bỏ khỏi yêu thích' : 'Lưu vào yêu thích'}
                      aria-pressed={isWished}
                      title={isWished ? 'Bỏ khỏi yêu thích' : 'Lưu vào yêu thích'}
                      className="absolute top-3 right-3 w-9 h-9 rounded-full bg-white/88 backdrop-blur-md border border-[#121316]/10 shadow-sm flex items-center justify-center text-[#121316] hover:bg-white hover:scale-105 transition-all cursor-pointer"
                    >
                      <Heart className={`w-4 h-4 ${isWished ? 'fill-[#9E3B2B] text-[#9E3B2B]' : ''}`} />
                    </button>
                  </div>

                  <div className="px-2.5 pt-4 pb-2 flex flex-col">
                    <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] text-[#5A5D64] mb-1.5">
                      <span>{product.categoryName}</span>
                      <span aria-hidden="true">·</span>
                      <span>{product.originVillage}</span>
                      {product.isMadeToOrder && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="text-[#8C6D32] font-medium">Chế tác {product.productionDays} ngày</span>
                        </>
                      )}
                    </div>

                    <h3
                      onClick={() => onSelectProduct(product.id)}
                      className="font-display text-[22px] font-semibold text-[#121316] leading-snug cursor-pointer hover:text-[#1D3C5C] transition-colors mb-1.5"
                    >
                      {product.name}
                    </h3>

                    <p className="text-xs text-[#5A5D64] leading-relaxed line-clamp-2 mb-3">
                      {product.description}
                    </p>

                    <p className="text-[11px] text-[#5A5D64] mb-3.5">
                      <span className="font-medium text-[#121316]">{product.shopName}</span>
                      <span className="mx-1.5" aria-hidden="true">·</span>
                      <span>{product.material}</span>
                      <span className="mx-1.5" aria-hidden="true">·</span>
                      <span className="tabular-nums">Đã bán {product.soldCount}</span>
                    </p>

                    <div className="pt-3.5 border-t border-[#121316]/8 flex items-center justify-between gap-3">
                      <div className="flex flex-wrap items-baseline gap-2">
                        <span
                          className={`font-mono text-[15px] font-semibold tabular-nums ${
                            product.flashSalePrice && product.flashSalePrice < product.basePrice
                              ? 'text-[#9E3B2B]'
                              : 'text-[#121316]'
                          }`}
                        >
                          {formatVND(activePrice)}
                        </span>
                        {product.flashSalePrice && product.flashSalePrice < product.basePrice && (
                          <span className="font-mono text-xs text-[#5A5D64] line-through tabular-nums">
                            {formatVND(product.basePrice)}
                          </span>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={() => addToCart(product, defaultVariantId, 1)}
                        className="px-4 py-2 text-xs font-semibold text-[#F4F4F1] bg-[#1D3C5C] rounded-xl shadow-sm hover:bg-[#142B43] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        Thêm giỏ hàng
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* SECTION 3: DARK ATELIER WORKSHOP ROSTER */}
      <section id="villages-section" className="max-w-[1320px] mx-auto px-6">
        <div className="bg-[#161B22] text-[#F4F4F1] rounded-2xl overflow-hidden">
          <div className="grid grid-cols-1 lg:grid-cols-12 items-stretch border-b border-white/12">
            <div className="lg:col-span-7 min-h-[260px] lg:min-h-[320px] relative">
              <ResilientImage
                src="/src/assets/images/atelier_artisan_hands_1795252005110.jpg"
                alt="Nghệ nhân tạo hình gốm thủ công trên bàn xoay tại xưởng truyền thống"
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-r from-transparent to-[#161B22]/60 hidden lg:block pointer-events-none" />
            </div>
            <div className="lg:col-span-5 p-8 lg:p-10 flex flex-col justify-between gap-6">
              <div>
                <p className="text-xs font-medium text-[#D4C3A3] mb-2">Đối tác làng nghề</p>
                <h2 className="font-display text-3xl lg:text-4xl font-semibold text-[#F4F4F1] leading-tight mb-3">
                  Xưởng nghệ nhân trực tiếp vận hành
                </h2>
                <p className="text-sm text-[#A6AAB3] leading-relaxed">
                  Mỗi gian hàng là một xưởng thủ công độc lập tự quản lý sản phẩm, biến thể chất liệu, đóng gói riêng và đối soát doanh thu minh bạch.
                </p>
              </div>
              <div>
                <button
                  type="button"
                  onClick={() => (user ? onOpenWorkspace('seller') : onOpenAuth())}
                  className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-semibold text-[#121316] bg-[#F4F4F1] rounded-md hover:bg-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Store className="w-4 h-4" />
                  <span>Mở gian hàng / Kênh nghệ nhân</span>
                </button>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-white/12">
            {shops.map((s, idx) => (
              <div key={s.id} className="p-7 flex flex-col justify-between gap-5 hover:bg-white/[0.03] transition-colors">
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <span className="font-mono text-xs text-[#D4C3A3] tabular-nums">
                      Xưởng {String(idx + 1).padStart(2, '0')}
                    </span>
                    <div className="w-11 h-11 rounded-md overflow-hidden border border-white/15 bg-[#121316]">
                      <ResilientImage src={s.logoUrl} alt={s.name} className="w-full h-full object-cover" />
                    </div>
                  </div>
                  <h3 className="font-display text-2xl font-semibold text-[#F4F4F1] mb-1">{s.name}</h3>
                  <p className="text-xs text-[#A6AAB3] mb-3">{s.craftVillage}</p>
                  <p className="text-xs text-[#C5C8CE] leading-relaxed line-clamp-3">{s.description}</p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedShopId(s.id);
                    scrollTo('catalog-section');
                    showToast(`Đang lọc sản phẩm của ${s.name}`);
                  }}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#D4C3A3] hover:text-white transition-colors cursor-pointer w-fit"
                >
                  <span>Xem tác phẩm của xưởng</span>
                  <ArrowUpRight className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* SECTION 4: EDITORIAL SMART AI CONSULTATION DESK */}
      <section id="ai-curator-section" className="max-w-[1320px] mx-auto px-6">
        <div className="bg-white border border-[#121316]/12 rounded-2xl p-8 lg:p-10">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
            <div className="lg:col-span-5 space-y-5">
              <div>
                <p className="text-xs font-medium text-[#1D3C5C] mb-1.5">Tư vấn phối hợp chất liệu &amp; không gian</p>
                <h2 className="font-display text-3xl lg:text-4xl font-semibold text-[#121316] mb-2">
                  Cố vấn lựa chọn sản phẩm AI
                </h2>
                <p className="text-sm text-[#5A5D64] leading-relaxed">
                  Nhập nhu cầu bày trí, tặng quà ngoại giao hoặc ngân sách dự kiến — hệ thống đối chiếu danh mục thực tế để đề xuất bộ sản phẩm hài hòa.
                </p>
              </div>

              <div className="space-y-2.5">
                <input
                  type="text"
                  value={aiQuery}
                  onChange={(e) => setAiQuery(e.target.value)}
                  placeholder="Ví dụ: Quà tặng tân gia gốm và sơn mài dưới 2 triệu..."
                  className="w-full px-4 py-3 text-sm bg-[#F4F4F1] border border-[#121316]/15 rounded-md focus:outline-none focus:border-[#1D3C5C]"
                />
                <button
                  type="button"
                  onClick={() => handleAskAI()}
                  disabled={aiLoading}
                  className="w-full inline-flex items-center justify-center gap-2 px-5 py-3 text-xs font-semibold text-white bg-[#1D3C5C] rounded-md hover:bg-[#142B43] transition-colors disabled:opacity-60 cursor-pointer"
                >
                  <Sparkles className="w-4 h-4" />
                  <span>{aiLoading ? 'Đang phân tích danh mục...' : 'Nhận gợi ý phối hợp AI'}</span>
                </button>
              </div>

              <div className="pt-2 border-t border-[#121316]/10 space-y-2">
                <p className="text-[11px] font-medium text-[#5A5D64]">Kịch bản tư vấn nhanh</p>
                {[
                  'Quà biếu đối tác nước ngoài mang đậm bản sắc Việt',
                  'Trang trí bàn trà đạo phong cách tối giản dưới 2 triệu',
                  'Phụ kiện thủ công thời trang từ mây tre và lụa tơ tằm',
                ].map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => handleAskAI(preset)}
                    className="w-full flex items-center justify-between gap-2 py-2 px-3 text-left text-xs text-[#121316] bg-[#F4F4F1] hover:bg-[#E6E7E2] rounded-md transition-colors cursor-pointer"
                  >
                    <span className="truncate">{preset}</span>
                    <ArrowRight className="w-3.5 h-3.5 text-[#5A5D64] shrink-0" />
                  </button>
                ))}
              </div>
            </div>

            <div className="lg:col-span-7 flex flex-col justify-center">
              {aiError && (
                <div className="p-4 text-sm text-[#9E3B2B] bg-[#9E3B2B]/5 border border-[#9E3B2B]/20 rounded-lg">
                  {aiError}
                </div>
              )}

              {aiSummary ? (
                <div className="space-y-5">
                  <p className="text-sm text-[#121316] leading-relaxed pb-4 border-b border-[#121316]/10">{aiSummary}</p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    {aiItems.map((rec) => {
                      const prod = products.find((p) => p.id === rec.productId);
                      if (!prod) return null;
                      return (
                        <div
                          key={prod.id}
                          onClick={() => onSelectProduct(prod.id)}
                          className="bg-[#F4F4F1] border border-[#121316]/8 rounded-2xl p-2.5 shadow-[0_4px_16px_-4px_rgba(18,19,22,0.06)] hover:-translate-y-1 hover:shadow-[0_14px_28px_-10px_rgba(29,60,92,0.14)] cursor-pointer transition-all duration-300 flex flex-col"
                        >
                          <div className="aspect-[4/3] rounded-xl overflow-hidden mb-3 bg-[#E6E7E2]">
                            <ResilientImage src={prod.images[0]} alt={prod.name} className="w-full h-full object-cover" />
                          </div>
                          <h4 className="text-xs font-semibold text-[#121316] line-clamp-2 mb-1">{prod.name}</h4>
                          <p className="font-mono text-xs font-semibold text-[#1D3C5C] tabular-nums mb-2">
                            {formatVND(prod.flashSalePrice ?? prod.basePrice)}
                          </p>
                          <p className="text-[11px] text-[#5A5D64] leading-relaxed mb-1.5">{rec.reason}</p>
                          <p className="text-[11px] text-[#8C6D32] font-medium mt-auto">Phối hợp: {rec.pairingTip}</p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                !aiError && (
                  <div className="h-full min-h-[260px] bg-[#F4F4F1] border border-[#121316]/10 rounded-xl p-8 flex flex-col justify-between">
                    <div className="space-y-2">
                      <p className="font-mono text-xs text-[#1D3C5C]">Bàn tư vấn giám tuyển</p>
                      <h3 className="font-display text-2xl font-semibold text-[#121316]">
                        Chọn một kịch bản hoặc nhập yêu cầu của bạn
                      </h3>
                      <p className="text-xs text-[#5A5D64] leading-relaxed max-w-lg">
                        Trợ lý AI sẽ đối chiếu các tác phẩm hiện có theo chất liệu (gốm men rạn, sơn mài, mây tre, gỗ hương, lụa tơ tằm) và gợi ý cách bài trí đồng bộ.
                      </p>
                    </div>
                    <div className="grid grid-cols-3 gap-3 pt-6 border-t border-[#121316]/10">
                      {products.slice(0, 3).map((p) => (
                        <div
                          key={p.id}
                          onClick={() => onSelectProduct(p.id)}
                          className="aspect-[4/3] rounded-lg overflow-hidden border border-[#121316]/10 cursor-pointer bg-white"
                        >
                          <ResilientImage src={p.images[0]} alt={p.name} className="w-full h-full object-cover hover:scale-[1.03] transition-transform" />
                        </div>
                      ))}
                    </div>
                  </div>
                )
              )}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
