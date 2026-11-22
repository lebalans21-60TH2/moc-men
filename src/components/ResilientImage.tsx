import { useState } from 'react';
import { Package } from 'lucide-react';
import { isSafeImageUrl } from '../utils/format';

interface ResilientImageProps {
  src?: string | null;
  alt: string;
  className?: string;
}

export function ResilientImage({ src, alt, className = '' }: ResilientImageProps) {
  const [failed, setFailed] = useState(false);

  if (!src || !isSafeImageUrl(src) || failed) {
    return (
      <div
        className={`flex flex-col items-center justify-center bg-[#E6E7E2] text-[#5A5D64] p-4 text-center ${className}`}
        role="img"
        aria-label={alt}
      >
        <Package className="w-6 h-6 mb-1.5 opacity-60" />
        <span className="text-xs font-medium line-clamp-2 max-w-[160px]">{alt}</span>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={className}
    />
  );
}
