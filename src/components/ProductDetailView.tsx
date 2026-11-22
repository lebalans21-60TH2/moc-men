import React, { useEffect, useState } from 'react';
import { ArrowLeft, Heart, MessageSquare, Sparkles, Star, Truck } from 'lucide-react';
import { useApp } from '../context/AppContext';
import type { Product, Review, Shop, SmartRecommendationItem } from '../types';
import { formatDateTime, formatVND } from '../utils/format';
import { ResilientImage } from './ResilientImage';

interface ProductDetailViewProps {
  productId: number;
  allProducts: Product[];
  onBack: () => void;
  onSelectProduct: (id: number) => void;
  onOpenAuth: () => void;
  onOpenChatWithShop: (shopId: number, productId: number) => void;
}

export function ProductDetailView({
  productId,
  allProducts,
  onBack,
  onSelectProduct,
  onOpenAuth,
  onOpenChatWithShop,
}: ProductDetailViewProps) {
  const { addToCart, toggleWishlist, wishlistIds, token, apiFetch, showToast } = useApp();

  const [product, setProduct] = useState<Product | null>(null);
  const [shop, setShop] = useState<Shop | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedImageIdx, setSelectedImageIdx] = useState(0);
  const [selectedVariantId, setSelectedVariantId] = useState('');
  const [quantity, setQuantity] = useState(1);

  // Review form
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [submittingReview, setSubmittingReview] = useState(false);

  // AI complementary recommendations
  const [aiLoading, setAiLoading] = useState(false);
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [aiRecs, setAiRecs] = useState<SmartRecommendationItem[]>([]);

  useEffect(() => {
    setLoading(true);
    setSelectedImageIdx(0);
    setQuantity(1);
    setAiSummary(null);
    setAiRecs([]);
    fetch(`/api/products/${productId}`)
      .then((r) => r.json())
      .then((data) => {
        setProduct(data.product);
        setShop(data.shop);
        setReviews(data.reviews || []);
        setSelectedVariantId(data.product?.variants?.[0]?.id || 'default');
      })
      .finally(() => setLoading(false));
  }, [productId]);

  if (loading || !product) {
    return (
      <div className="max-w-[1320px] mx-auto px-6 py-16">
        <div className="h-96 bg-[#E6E7E2] rounded-2xl animate-pulse" />
      </div>
    );
  }

  const activeVariant = product.variants.find((v) => v.id === selectedVariantId) || product.variants[0];
  const baseUnit = (product.flashSalePrice ?? product.basePrice) + (activeVariant?.priceDelta || 0);
  const bulkDiscountEligible =
    product.quantityDiscountMin && product.quantityDiscountPercent && quantity >= product.quantityDiscountMin;
  const finalUnitPrice = bulkDiscountEligible
    ? Math.round(baseUnit * (1 - (product.quantityDiscountPercent || 0) / 100))
    : baseUnit;

  const isWished = wishlistIds.includes(product.id);

  const handleSubmitReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) {
      onOpenAuth();
      return;
    }
    setSubmittingReview(true);
    try {
      const created = await apiFetch<Review>('/api/customer/reviews', {
        method: 'POST',
        body: JSON.stringify({ productId: product.id, rating, comment }),
      });
      setReviews((prev) => [created, ...prev]);
      setComment('');
      showToast('Cảm ơn bạn đã gửi đánh giá xác thực.');
    } catch (err: any) {
      showToast(err.message);
    } finally {
      setSubmittingReview(false);
    }
  };

  const handleLoadAIRecs = async () => {
    setAiLoading(true);
    try {
      const res = await apiFetch<{ summary: string; recommendations: SmartRecommendationItem[] }>(
        '/api/recommendations',
        {
          method: 'POST',
          body: JSON.stringify({
            query: `Gợi ý sản phẩm thủ công mỹ nghệ phối hợp hài hòa cùng "${product.name}"`,
            currentProductId: product.id,
          }),
        }
      );
      setAiSummary(res.summary);
      setAiRecs(res.recommendations);
    } catch (err: any) {
      showToast(err.message);
    } finally {
      setAiLoading(false);
    }
  };

  return (
    <div className="max-w-[1320px] mx-auto px-6 py-10 space-y-16">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-2 text-xs font-semibold text-[#5A5D64] hover:text-[#121316] cursor-pointer"
      >
        <ArrowLeft className="w-4 h-4" />
        <span>Quay lại bộ sưu tập</span>
      </button>

      {/* Contiguous Purchase Module: Sticky Gallery Left + Purchase Ledger Right */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">
        <div className="lg:col-span-7 lg:sticky lg:top-24 space-y-3">
          <div className="aspect-[4/3] rounded-2xl overflow-hidden bg-[#E6E7E2] border border-[#121316]/10">
            <ResilientImage
              src={product.images[selectedImageIdx] || product.images[0]}
              alt={product.name}
              className="w-full h-full object-cover"
            />
          </div>
          {product.images.length > 1 && (
            <div className="flex flex-wrap gap-3">
              {product.images.map((img, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setSelectedImageIdx(idx)}
                  className={`w-20 aspect-[4/3] rounded-lg overflow-hidden border cursor-pointer transition-all ${
                    selectedImageIdx === idx ? 'border-[#1D3C5C] ring-2 ring-[#1D3C5C]/25' : 'border-[#121316]/12 opacity-80 hover:opacity-100'
                  }`}
                >
                  <ResilientImage src={img} alt={`${product.name} ${idx + 1}`} className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="lg:col-span-5 bg-white border border-[#121316]/12 rounded-2xl p-7 space-y-5">
          <div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-[#5A5D64] mb-2">
              <span>{product.categoryName}</span>
              <span aria-hidden="true">·</span>
              <span>{product.originVillage}</span>
              <span aria-hidden="true">·</span>
              <span className="tabular-nums">
                {product.ratingAvg.toFixed(1)} ★ ({product.reviewCount} đánh giá)
              </span>
            </div>
            <h1 className="font-display text-3xl lg:text-4xl font-semibold text-[#121316] leading-[1.15]">
              {product.name}
            </h1>
          </div>

          <div className="flex items-baseline gap-3 pb-4 border-b border-[#121316]/10">
            <span className="font-mono text-2xl font-semibold text-[#1D3C5C] tabular-nums">
              {formatVND(finalUnitPrice)}
            </span>
            {product.flashSalePrice && product.flashSalePrice < product.basePrice && (
              <span className="font-mono text-sm text-[#5A5D64] line-through tabular-nums">
                {formatVND(product.basePrice + (activeVariant?.priceDelta || 0))}
              </span>
            )}
            {bulkDiscountEligible && (
              <span className="text-xs font-medium text-[#8C6D32]">
                Giảm {product.quantityDiscountPercent}% từ {product.quantityDiscountMin} SP
              </span>
            )}
          </div>

          <p className="text-sm text-[#5A5D64] leading-relaxed">{product.description}</p>

          {/* Variant Selector */}
          {product.variants.length > 0 && (
            <div>
              <label className="block text-xs font-semibold text-[#121316] mb-2">Phiên bản &amp; kích thước</label>
              <div className="grid grid-cols-1 gap-2">
                {product.variants.map((v) => (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => setSelectedVariantId(v.id)}
                    className={`flex items-center justify-between px-3.5 py-2.5 text-xs rounded-md border transition-colors cursor-pointer ${
                      selectedVariantId === v.id
                        ? 'border-[#1D3C5C] bg-[#1D3C5C]/6 text-[#121316]'
                        : 'border-[#121316]/12 bg-[#F4F4F1] text-[#5A5D64] hover:text-[#121316]'
                    }`}
                  >
                    <span className="font-medium">
                      {v.color} · {v.size} ({v.material})
                    </span>
                    <span className="font-mono tabular-nums">
                      {v.priceDelta > 0 ? `+${formatVND(v.priceDelta)}` : 'Tiêu chuẩn'} · Kho: {v.stock}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Made to order or Stock info */}
          <div className="flex items-center gap-2.5 text-xs text-[#5A5D64] p-3.5 bg-[#F4F4F1] rounded-md border border-[#121316]/8">
            <Truck className="w-4 h-4 text-[#1D3C5C] shrink-0" />
            {product.isMadeToOrder ? (
              <span>
                Chế tác theo yêu cầu — hoàn thiện trong{' '}
                <strong className="text-[#121316]">{product.productionDays} ngày</strong> trước khi bàn giao vận chuyển.
              </span>
            ) : (
              <span>
                Sẵn sàng giao từ {product.originVillage} · Còn{' '}
                <strong className="text-[#121316] tabular-nums">{activeVariant?.stock ?? product.stock}</strong> tác phẩm.
              </span>
            )}
          </div>

          {product.quantityDiscountMin && product.quantityDiscountPercent && (
            <p className="text-xs text-[#8C6D32]">
              Ưu đãi đặt số lượng: Giảm {product.quantityDiscountPercent}% khi mua từ {product.quantityDiscountMin} sản phẩm.
            </p>
          )}

          {/* Quantity & Actions */}
          <div className="flex items-center gap-3 pt-2">
            <div className="flex items-center border border-[#121316]/15 rounded-md bg-[#F4F4F1]">
              <button
                type="button"
                onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                className="px-3 py-2.5 text-sm font-semibold text-[#121316] cursor-pointer"
              >
                −
              </button>
              <span className="px-3 font-mono text-sm font-semibold tabular-nums">{quantity}</span>
              <button
                type="button"
                onClick={() => setQuantity((q) => q + 1)}
                className="px-3 py-2.5 text-sm font-semibold text-[#121316] cursor-pointer"
              >
                +
              </button>
            </div>

            <button
              type="button"
              onClick={() => addToCart(product, selectedVariantId, quantity)}
              className="flex-1 py-3 px-5 text-xs font-semibold text-[#F4F4F1] bg-[#121316] rounded-md hover:bg-[#1D3C5C] transition-colors cursor-pointer"
            >
              Thêm vào giỏ hàng
            </button>

            <button
              type="button"
              onClick={() => void toggleWishlist(product.id)}
              aria-label={isWished ? 'Bỏ khỏi yêu thích' : 'Lưu vào yêu thích'}
              aria-pressed={isWished}
              title={isWished ? 'Bỏ khỏi yêu thích' : 'Lưu vào yêu thích'}
              className="p-3 border border-[#121316]/15 rounded-md hover:bg-[#F4F4F1] transition-colors cursor-pointer"
            >
              <Heart className={`w-4 h-4 ${isWished ? 'fill-[#9E3B2B] text-[#9E3B2B]' : 'text-[#121316]'}`} />
            </button>
          </div>

          {/* Seller Info + Chat Trigger */}
          {shop && (
            <div className="pt-4 border-t border-[#121316]/10 flex items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-[#121316] truncate">{shop.name}</p>
                <p className="text-xs text-[#5A5D64] truncate">{shop.craftVillage}</p>
              </div>
              <button
                type="button"
                onClick={() => (token ? onOpenChatWithShop(shop.id, product.id) : onOpenAuth())}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-[#1D3C5C] border border-[#1D3C5C]/35 rounded-md hover:bg-[#1D3C5C]/5 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <MessageSquare className="w-3.5 h-3.5" />
                <span>Nhắn tin với Shop</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Artisan Story & Verified Reviews */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 pt-10 border-t border-[#121316]/12">
        <div className="lg:col-span-5 space-y-3">
          <p className="text-xs font-medium text-[#1D3C5C]">Hồ sơ chế tác</p>
          <h2 className="font-display text-3xl font-semibold text-[#121316]">Câu chuyện người làm</h2>
          <p className="text-xs text-[#5A5D64]">
            Chất liệu: {product.material} · Nguồn gốc: {product.originVillage}
          </p>
          <p className="text-sm text-[#121316]/90 leading-relaxed pt-2">{product.artisanStory}</p>
        </div>

        <div className="lg:col-span-7 space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-3xl font-semibold text-[#121316]">Đánh giá từ người mua</h2>
            <span className="text-xs font-mono text-[#5A5D64] tabular-nums">{reviews.length} nhận xét</span>
          </div>

          <form onSubmit={handleSubmitReview} className="bg-white border border-[#121316]/12 rounded-xl p-5 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-[#5A5D64]">Gửi đánh giá (yêu cầu đã mua &amp; nhận hàng):</span>
              <div className="flex items-center gap-1">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    onClick={() => setRating(star)}
                    className="p-0.5 cursor-pointer"
                  >
                    <Star
                      className={`w-4 h-4 ${star <= rating ? 'fill-[#8C6D32] text-[#8C6D32]' : 'text-[#121316]/20'}`}
                    />
                  </button>
                ))}
              </div>
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Chia sẻ trải nghiệm thực tế về chất liệu và độ hoàn thiện..."
                className="flex-1 px-3.5 py-2 text-sm bg-[#F4F4F1] border border-[#121316]/12 rounded-md focus:outline-none focus:border-[#1D3C5C]"
              />
              <button
                type="submit"
                disabled={submittingReview}
                className="px-4 py-2 text-xs font-semibold text-white bg-[#1D3C5C] rounded-md hover:bg-[#142B43] whitespace-nowrap shrink-0 cursor-pointer"
              >
                {submittingReview ? 'Đang gửi...' : 'Gửi đánh giá'}
              </button>
            </div>
          </form>

          <div className="space-y-3">
            {reviews.length === 0 ? (
              <p className="text-sm text-[#5A5D64]">Chưa có đánh giá nào cho sản phẩm này.</p>
            ) : (
              reviews.map((rev) => (
                <div key={rev.id} className="bg-white border border-[#121316]/10 rounded-xl p-4">
                  <div className="flex items-center justify-between text-xs text-[#5A5D64] mb-1.5">
                    <span className="font-semibold text-[#121316]">{rev.buyerName}</span>
                    <span className="tabular-nums">{formatDateTime(rev.createdAt)}</span>
                  </div>
                  <div className="flex items-center gap-0.5 mb-1.5">
                    {Array.from({ length: rev.rating }).map((_, idx) => (
                      <Star key={idx} className="w-3.5 h-3.5 fill-[#8C6D32] text-[#8C6D32]" />
                    ))}
                  </div>
                  <p className="text-sm text-[#121316] leading-relaxed">{rev.comment}</p>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Contextual Gemini AI Recommendations */}
      <div className="pt-10 border-t border-[#121316]/12">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <h2 className="font-display text-3xl font-semibold text-[#121316]">Gợi ý phối hợp cùng tác phẩm này</h2>
            <p className="text-xs text-[#5A5D64] mt-1">
              Phân tích tương đồng chất liệu và phong cách bày trí bởi cố vấn AI.
            </p>
          </div>
          <button
            type="button"
            onClick={handleLoadAIRecs}
            disabled={aiLoading}
            className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-semibold text-white bg-[#1D3C5C] rounded-md hover:bg-[#142B43] whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Sparkles className="w-4 h-4" />
            <span>{aiLoading ? 'Đang gợi ý...' : 'Gợi ý phối hợp AI'}</span>
          </button>
        </div>

        {aiSummary && <p className="text-sm text-[#121316] mb-4">{aiSummary}</p>}

        {aiRecs.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {aiRecs.map((rec) => {
              const p = allProducts.find((item) => item.id === rec.productId);
              if (!p) return null;
              return (
                <div
                  key={p.id}
                  onClick={() => onSelectProduct(p.id)}
                  className="bg-white border border-[#121316]/8 rounded-3xl p-3 shadow-[0_6px_24px_-6px_rgba(18,19,22,0.07)] hover:-translate-y-1 hover:shadow-[0_18px_36px_-12px_rgba(29,60,92,0.14)] cursor-pointer transition-all duration-300"
                >
                  <div className="aspect-[4/3] rounded-2xl overflow-hidden mb-3 bg-[#E6E7E2]">
                    <ResilientImage src={p.images[0]} alt={p.name} className="w-full h-full object-cover" />
                  </div>
                  <h4 className="text-sm font-semibold text-[#121316] line-clamp-1">{p.name}</h4>
                  <p className="font-mono text-xs font-semibold text-[#1D3C5C] tabular-nums my-1">
                    {formatVND(p.flashSalePrice ?? p.basePrice)}
                  </p>
                  <p className="text-xs text-[#5A5D64]">{rec.reason}</p>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
