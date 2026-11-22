import React, { useEffect, useState } from 'react';
import { Send, X } from 'lucide-react';
import { useApp } from '../context/AppContext';
import type { ChatMessage } from '../types';
import { formatDateTime } from '../utils/format';

interface ChatDrawerProps {
  open: boolean;
  shopId: number | null;
  customerId?: number | null;
  productId?: number | null;
  onClose: () => void;
}

export function ChatDrawer({ open, shopId, customerId, productId, onClose }: ChatDrawerProps) {
  const { user, apiFetch, showToast } = useApp();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [content, setContent] = useState('');
  const [sending, setSending] = useState(false);

  const loadMessages = () => {
    if (!open || !shopId || !user) return;
    const targetCustomer = customerId || user.id;
    apiFetch<ChatMessage[]>(`/api/chat/messages?shopId=${shopId}&customerId=${targetCustomer}`)
      .then(setMessages)
      .catch(() => {});
  };

  useEffect(() => {
    loadMessages();
  }, [open, shopId, customerId, user]);

  if (!open || !shopId) return null;

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) return;
    setSending(true);
    try {
      const msg = await apiFetch<ChatMessage>('/api/chat/messages', {
        method: 'POST',
        body: JSON.stringify({
          shopId,
          customerId: customerId || user?.id,
          productId: productId || null,
          content,
        }),
      });
      setMessages((prev) => [...prev, msg]);
      setContent('');
    } catch (err: any) {
      showToast(err.message);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-end sm:p-6 bg-black/30">
      <div className="w-full sm:w-96 h-[500px] bg-white border border-[#121316]/15 rounded-t-xl sm:rounded-xl shadow-2xl flex flex-col overflow-hidden">
        <div className="px-4 py-3 border-b border-[#121316]/10 flex items-center justify-between bg-[#F4F4F1]">
          <div>
            <h3 className="text-sm font-semibold text-[#121316]">
              {messages[0]?.shopName || `Trao đổi với Gian hàng #${shopId}`}
            </h3>
            <p className="text-[11px] text-[#5A5D64]">Tư vấn kích thước, đặt làm theo yêu cầu</p>
          </div>
          <button type="button" onClick={onClose} className="p-1 text-[#5A5D64] hover:text-[#121316] cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-white">
          {messages.length === 0 ? (
            <p className="text-xs text-[#5A5D64] text-center py-8">
              Bắt đầu cuộc trò chuyện với nghệ nhân hoặc chủ gian hàng.
            </p>
          ) : (
            messages.map((m) => {
              const isMine = m.senderId === user?.id;
              return (
                <div key={m.id} className={`flex flex-col ${isMine ? 'items-end' : 'items-start'}`}>
                  <div
                    className={`max-w-[80%] px-3 py-2 rounded-lg text-xs leading-relaxed ${
                      isMine ? 'bg-[#1D3C5C] text-white' : 'bg-[#E6E7E2] text-[#121316]'
                    }`}
                  >
                    {m.content}
                  </div>
                  <span className="text-[10px] text-[#5A5D64] mt-1">{formatDateTime(m.createdAt)}</span>
                </div>
              );
            })
          )}
        </div>

        <form onSubmit={handleSend} className="p-3 border-t border-[#121316]/10 flex gap-2 bg-[#F4F4F1]">
          <input
            type="text"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Nhập tin nhắn..."
            className="flex-1 px-3 py-2 text-xs bg-white border border-[#121316]/15 rounded-lg focus:outline-none focus:border-[#1D3C5C]"
          />
          <button
            type="submit"
            disabled={sending}
            className="px-3 py-2 bg-[#1D3C5C] text-white rounded-lg hover:bg-[#142B43] cursor-pointer"
            aria-label="Gửi"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  );
}
