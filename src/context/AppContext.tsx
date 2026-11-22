import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { AffiliateProfile, CartItem, Product, Shop, User } from '../types';

interface AppContextValue {
  token: string | null;
  user: User | null;
  shop: Shop | null;
  affiliate: AffiliateProfile | null;
  cart: CartItem[];
  wishlistIds: number[];
  affiliateRefCode: string;
  setAffiliateRefCode: (code: string) => void;
  setSession: (token: string, user: User) => void;
  logout: () => void;
  refreshAccount: () => Promise<void>;
  apiFetch: <T = any>(url: string, options?: RequestInit) => Promise<T>;
  addToCart: (product: Product, variantId: string, quantity: number) => void;
  updateCartQuantity: (productId: number, variantId: string, quantity: number) => void;
  removeFromCart: (productId: number, variantId: string) => void;
  clearCart: () => void;
  toggleWishlist: (productId: number) => Promise<void>;
  clearWishlist: () => Promise<void>;
  toast: string | null;
  showToast: (msg: string) => void;
}

const LOCAL_WISHLIST_KEY = 'mocmen_guest_wishlist';

function readLocalWishlist(): number[] {
  try {
    const raw = window.localStorage.getItem(LOCAL_WISHLIST_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return Array.from(new Set(parsed.map(Number).filter((id) => Number.isInteger(id) && id > 0)));
  } catch {
    return [];
  }
}

function writeLocalWishlist(ids: number[]) {
  try {
    if (ids.length === 0) {
      window.localStorage.removeItem(LOCAL_WISHLIST_KEY);
    } else {
      window.localStorage.setItem(LOCAL_WISHLIST_KEY, JSON.stringify(ids));
    }
  } catch {
    // ignore storage quota / privacy errors
  }
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  // Token kept strictly in React memory (never localStorage/sessionStorage)
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [shop, setShop] = useState<Shop | null>(null);
  const [affiliate, setAffiliate] = useState<AffiliateProfile | null>(null);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [wishlistIds, setWishlistIds] = useState<number[]>(() => readLocalWishlist());
  const [affiliateRefCode, setAffiliateRefCode] = useState<string>('');
  const [toast, setToast] = useState<string | null>(null);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => {
      setToast((prev) => (prev === msg ? null : prev));
    }, 3500);
  }, []);

  const apiFetch = useCallback(
    async <T = any>(url: string, options: RequestInit = {}, overrideToken?: string): Promise<T> => {
      const activeToken = overrideToken ?? token;
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...((options.headers as Record<string, string>) || {}),
      };
      if (activeToken) {
        headers.Authorization = `Bearer ${activeToken}`;
      }
      const res = await fetch(url, { ...options, headers });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || `Lỗi máy chủ (${res.status})`);
      }
      return data as T;
    },
    [token]
  );

  const loadAccountDetails = useCallback(
    async (activeToken: string) => {
      try {
        const me = await apiFetch<{ user: User; shop: Shop | null; affiliate: AffiliateProfile | null }>(
          '/api/auth/me',
          {},
          activeToken
        );
        setUser(me.user);
        setShop(me.shop);
        setAffiliate(me.affiliate);
        const guestIds = readLocalWishlist();
        if (guestIds.length > 0) {
          const merged = await apiFetch<{ wishlistIds: number[] }>(
            '/api/customer/wishlist/merge',
            { method: 'POST', body: JSON.stringify({ productIds: guestIds }) },
            activeToken
          );
          setWishlistIds(merged.wishlistIds);
          writeLocalWishlist([]);
        } else {
          const wl = await apiFetch<number[]>('/api/customer/wishlist', {}, activeToken);
          setWishlistIds(wl);
        }
      } catch {
        // Ignore silent failure if token expired
      }
    },
    [apiFetch]
  );

  const setSession = useCallback(
    (newToken: string, newUser: User) => {
      setToken(newToken);
      setUser(newUser);
      void loadAccountDetails(newToken);
    },
    [loadAccountDetails]
  );

  const refreshAccount = useCallback(async () => {
    if (!token) return;
    await loadAccountDetails(token);
  }, [token, loadAccountDetails]);

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
    setShop(null);
    setAffiliate(null);
    setWishlistIds(readLocalWishlist());
    showToast('Đã đăng xuất khỏi tài khoản.');
  }, [showToast]);

  // Capture ?ref=AFF_CODE from URL on arrival and record click
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ref = params.get('ref')?.trim().toUpperCase();
    const pid = params.get('pid') ? Number(params.get('pid')) : null;
    if (ref) {
      setAffiliateRefCode(ref);
      fetch('/api/affiliate/track-click', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refCode: ref, productId: pid }),
      }).catch(() => {});
    }
  }, []);

  const addToCart = useCallback(
    (product: Product, variantId: string, quantity: number) => {
      const variant = product.variants.find((v) => v.id === variantId) || product.variants[0];
      const base = product.flashSalePrice ?? product.basePrice;
      const delta = variant ? variant.priceDelta : 0;
      const unitPrice = base + delta;
      const variantLabel = variant ? `${variant.color} · ${variant.size}` : 'Tiêu chuẩn';

      setCart((prev) => {
        const existingIdx = prev.findIndex((i) => i.product.id === product.id && i.variantId === (variant?.id || variantId));
        if (existingIdx >= 0) {
          const copy = [...prev];
          copy[existingIdx] = {
            ...copy[existingIdx],
            quantity: copy[existingIdx].quantity + quantity,
          };
          return copy;
        }
        return [
          ...prev,
          {
            product,
            variantId: variant?.id || variantId,
            variantLabel,
            unitPrice,
            quantity,
          },
        ];
      });
      showToast(`Đã thêm "${product.name}" vào giỏ hàng.`);
    },
    [showToast]
  );

  const updateCartQuantity = useCallback((productId: number, variantId: string, quantity: number) => {
    setCart((prev) =>
      quantity <= 0
        ? prev.filter((i) => !(i.product.id === productId && i.variantId === variantId))
        : prev.map((i) => (i.product.id === productId && i.variantId === variantId ? { ...i, quantity } : i))
    );
  }, []);

  const removeFromCart = useCallback((productId: number, variantId: string) => {
    setCart((prev) => prev.filter((i) => !(i.product.id === productId && i.variantId === variantId)));
  }, []);

  const clearCart = useCallback(() => setCart([]), []);

  const toggleWishlist = useCallback(
    async (productId: number) => {
      if (!token) {
        let added = false;
        setWishlistIds((prev) => {
          const exists = prev.includes(productId);
          added = !exists;
          const next = exists ? prev.filter((id) => id !== productId) : [...prev, productId];
          writeLocalWishlist(next);
          return next;
        });
        showToast(
          added
            ? 'Đã lưu vào danh sách yêu thích (cục bộ). Đăng nhập để đồng bộ tài khoản.'
            : 'Đã bỏ khỏi danh sách yêu thích.'
        );
        return;
      }
      try {
        const res = await apiFetch<{ wishlisted: boolean }>(`/api/customer/wishlist/${productId}`, {
          method: 'POST',
        });
        setWishlistIds((prev) =>
          res.wishlisted ? [...new Set([...prev, productId])] : prev.filter((id) => id !== productId)
        );
        showToast(res.wishlisted ? 'Đã lưu vào danh sách yêu thích.' : 'Đã bỏ khỏi yêu thích.');
      } catch (err: any) {
        showToast(err.message || 'Không thể cập nhật danh sách yêu thích.');
      }
    },
    [token, apiFetch, showToast]
  );

  const clearWishlist = useCallback(async () => {
    if (!token) {
      writeLocalWishlist([]);
      setWishlistIds([]);
      showToast('Đã xóa toàn bộ danh sách yêu thích.');
      return;
    }
    try {
      await apiFetch('/api/customer/wishlist', { method: 'DELETE' });
      setWishlistIds([]);
      showToast('Đã xóa toàn bộ danh sách yêu thích.');
    } catch (err: any) {
      showToast(err.message || 'Không thể xóa danh sách yêu thích.');
    }
  }, [token, apiFetch, showToast]);

  return (
    <AppContext.Provider
      value={{
        token,
        user,
        shop,
        affiliate,
        cart,
        wishlistIds,
        affiliateRefCode,
        setAffiliateRefCode,
        setSession,
        logout,
        refreshAccount,
        apiFetch,
        addToCart,
        updateCartQuantity,
        removeFromCart,
        clearCart,
        toggleWishlist,
        clearWishlist,
        toast,
        showToast,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside AppProvider');
  return ctx;
}
