import { GoogleGenAI, Type, ThinkingLevel } from '@google/genai';
import type { Product, SmartRecommendationItem } from '../src/types.ts';

function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    throw new Error('GEMINI_API_KEY_MISSING');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

export async function generateSmartRecommendations(params: {
  query: string;
  currentProduct?: Product | null;
  cartProductNames: string[];
  catalog: Product[];
}): Promise<{ summary: string; recommendations: SmartRecommendationItem[] }> {
  const ai = getGeminiClient();

  const compactCatalog = params.catalog.map((p) => ({
    id: p.id,
    name: p.name,
    category: p.categoryName,
    material: p.material,
    originVillage: p.originVillage,
    shopName: p.shopName,
    priceVND: p.flashSalePrice ?? p.basePrice,
    isMadeToOrder: p.isMadeToOrder,
    ratingAvg: p.ratingAvg,
    soldCount: p.soldCount,
  }));

  const contextLines = [
    params.query ? `Nhu cầu người dùng: "${params.query}"` : 'Nhu cầu: Gợi ý phối hợp sản phẩm thủ công mỹ nghệ phù hợp nhất.',
    params.currentProduct
      ? `Đang xem sản phẩm: #${params.currentProduct.id} - ${params.currentProduct.name} (${params.currentProduct.material}, làng nghề ${params.currentProduct.originVillage})`
      : '',
    params.cartProductNames.length > 0
      ? `Trong giỏ hàng hiện có: ${params.cartProductNames.join(', ')}`
      : '',
  ]
    .filter(Boolean)
    .join('\n');

  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: `${contextLines}\n\nDanh sách sản phẩm hiện có trên sàn (JSON):\n${JSON.stringify(compactCatalog)}`,
    config: {
      systemInstruction:
        'Bạn là chuyên gia tư vấn mỹ nghệ truyền thống Việt Nam của sàn Mộc & Men. Hãy phân tích ngữ cảnh mua sắm và chọn tối đa 3 sản phẩm phù hợp nhất CHỈ TỪ danh sách JSON được cung cấp (dùng đúng id số nguyên). Giải thích lý do ngắn gọn, tinh tế bằng tiếng Việt tự nhiên và gợi ý cách bài trí/kết hợp cùng không gian sống hoặc làm quà tặng.',
      thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          summary: {
            type: Type.STRING,
            description: 'Nhận xét tổng quan ngắn gọn 1-2 câu về gu thẩm mỹ hoặc gợi ý phối hợp.',
          },
          recommendations: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                productId: {
                  type: Type.INTEGER,
                  description: 'ID chính xác của sản phẩm từ danh mục được cung cấp.',
                },
                reason: {
                  type: Type.STRING,
                  description: 'Lý do gợi ý sản phẩm này (tối đa 25 từ).',
                },
                pairingTip: {
                  type: Type.STRING,
                  description: 'Mẹo bài trí hoặc kết hợp sử dụng (tối đa 20 từ).',
                },
              },
              required: ['productId', 'reason', 'pairingTip'],
            },
          },
        },
        required: ['summary', 'recommendations'],
      },
    },
  });

  const rawText = (response.text ?? '{}').trim();
  const parsed = JSON.parse(rawText) as {
    summary?: string;
    recommendations?: SmartRecommendationItem[];
  };

  const validIds = new Set(params.catalog.map((p) => p.id));
  const filtered = (parsed.recommendations || []).filter((item) => validIds.has(item.productId)).slice(0, 3);

  return {
    summary: parsed.summary || 'Gợi ý tuyển chọn dựa trên chất liệu và câu chuyện làng nghề.',
    recommendations: filtered,
  };
}
