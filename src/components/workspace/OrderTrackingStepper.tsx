import { AlertTriangle, Check, CheckCircle2, Clock, Hammer, Home, PackageCheck, Truck, XCircle } from 'lucide-react';
import type { OrderStatus, ShippingStatus } from '../../types';
import { formatDateTime } from '../../utils/format';

interface OrderTrackingStepperProps {
  orderStatus: OrderStatus;
  shippingStatus: ShippingStatus;
  trackingCode: string | null;
  carrierName: string | null;
  updatedAt: string;
  isHighlighted?: boolean;
}

const TRACKING_STAGES = [
  {
    key: 'CONFIRMED',
    codeLabel: 'Confirmed',
    viLabel: 'Đã xác nhận',
    description: 'Xưởng đã tiếp nhận đơn',
    icon: PackageCheck,
  },
  {
    key: 'PREPARING',
    codeLabel: 'Preparing',
    viLabel: 'Đang chuẩn bị',
    description: 'Chế tác & đóng gói an toàn',
    icon: Hammer,
  },
  {
    key: 'IN_TRANSIT',
    codeLabel: 'In Transit',
    viLabel: 'Đang vận chuyển',
    description: 'Đơn vị vận chuyển đang giao',
    icon: Truck,
  },
  {
    key: 'DELIVERED',
    codeLabel: 'Delivered',
    viLabel: 'Đã giao hàng',
    description: 'Giao thành công tới người nhận',
    icon: Home,
  },
] as const;

function resolveStageIndex(orderStatus: OrderStatus, shippingStatus: ShippingStatus): number {
  if (shippingStatus === 'DELIVERED' || shippingStatus === 'COMPLETED' || orderStatus === 'COMPLETED') {
    return 3;
  }
  if (shippingStatus === 'IN_TRANSIT' || shippingStatus === 'RETRY_DELIVERY' || shippingStatus === 'DELIVERY_FAILED') {
    return 2;
  }
  if (shippingStatus === 'PREPARING_CRAFT' || orderStatus === 'PROCESSING') {
    return 1;
  }
  if (shippingStatus === 'CONFIRMED' || orderStatus === 'CONFIRMED') {
    return 0;
  }
  return -1; // AWAITING_CONFIRM / PENDING_CONFIRM
}

export function OrderTrackingStepper({
  orderStatus,
  shippingStatus,
  trackingCode,
  carrierName,
  updatedAt,
  isHighlighted = false,
}: OrderTrackingStepperProps) {
  const isCancelled = shippingStatus === 'CANCELLED' || orderStatus === 'CANCELLED';
  const isReturned = shippingStatus === 'RETURNED' || orderStatus === 'RETURNED';
  const isDeliveryFailed = shippingStatus === 'DELIVERY_FAILED';
  const isRetryDelivery = shippingStatus === 'RETRY_DELIVERY';
  const currentStageIndex = resolveStageIndex(orderStatus, shippingStatus);

  return (
    <div
      className={`rounded-2xl border p-4 transition-colors duration-500 ${
        isHighlighted
          ? 'bg-[#1D3C5C]/[0.04] border-[#1D3C5C]/35'
          : 'bg-[#F4F4F1]/75 border-[#121316]/10'
      }`}
    >
      {/* Top Status & Carrier Row */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-3 mb-4 border-b border-[#121316]/8 text-[11px]">
        <div className="flex flex-wrap items-center gap-2 text-[#121316]">
          {isCancelled ? (
            <span className="inline-flex items-center gap-1.5 font-semibold text-[#9E3B2B]">
              <XCircle className="w-3.5 h-3.5" />
              <span>Đơn hàng đã hủy</span>
            </span>
          ) : isReturned ? (
            <span className="inline-flex items-center gap-1.5 font-semibold text-[#5A5D64]">
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>Đã hoàn hàng về xưởng</span>
            </span>
          ) : currentStageIndex === -1 ? (
            <span className="inline-flex items-center gap-1.5 font-semibold text-amber-800">
              <Clock className="w-3.5 h-3.5" />
              <span>Chờ xưởng xác nhận đơn hàng</span>
            </span>
          ) : currentStageIndex === 3 ? (
            <span className="inline-flex items-center gap-1.5 font-semibold text-emerald-700">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Trạng thái hiện tại: Delivered (Đã giao hàng)</span>
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 font-semibold text-[#1D3C5C]">
              <span>
                Trạng thái hiện tại: {TRACKING_STAGES[currentStageIndex].codeLabel} ({TRACKING_STAGES[currentStageIndex].viLabel})
              </span>
            </span>
          )}

          {isDeliveryFailed && (
            <span className="text-[#9E3B2B] font-medium">· Giao hàng tạm thất bại, chờ lên lịch giao lại</span>
          )}
          {isRetryDelivery && (
            <span className="text-amber-700 font-medium">· Đang tiến hành giao lại</span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3 text-[#5A5D64] font-mono tabular-nums">
          {trackingCode && (
            <span className="text-[#121316]">
              {carrierName || 'Vận chuyển'}: <strong>{trackingCode}</strong>
            </span>
          )}
          <span>Cập nhật: {formatDateTime(updatedAt)}</span>
        </div>
      </div>

      {/* 4-Stage Transition Stepper: Confirmed -> Preparing -> In Transit -> Delivered */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 relative">
        {TRACKING_STAGES.map((stage, idx) => {
          const StageIcon = stage.icon;
          const isCompleted = !isCancelled && !isReturned && currentStageIndex > idx;
          const isActive = !isCancelled && !isReturned && currentStageIndex === idx;
          const isDoneOrActive = isCompleted || isActive;

          return (
            <div key={stage.key} className="relative flex flex-col">
              {/* Connector bar on desktop */}
              {idx < TRACKING_STAGES.length - 1 && (
                <div
                  aria-hidden="true"
                  className={`hidden md:block absolute top-4 left-[calc(50%+20px)] right-[calc(-50%+20px)] h-[2px] transition-colors duration-300 ${
                    !isCancelled && !isReturned && currentStageIndex > idx
                      ? 'bg-[#1D3C5C]'
                      : 'bg-[#121316]/12'
                  }`}
                />
              )}

              <div className="flex md:flex-col items-start md:items-center gap-2.5 md:text-center relative z-10">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 border transition-all duration-300 ${
                    isCompleted
                      ? 'bg-[#1D3C5C] border-[#1D3C5C] text-white'
                      : isActive
                        ? 'bg-white border-2 border-[#1D3C5C] text-[#1D3C5C] shadow-[0_0_0_4px_rgba(29,60,92,0.12)]'
                        : 'bg-white border-[#121316]/15 text-[#5A5D64]/60'
                  }`}
                >
                  {isCompleted ? <Check className="w-4 h-4" /> : <StageIcon className="w-3.5 h-3.5" />}
                </div>

                <div className="min-w-0">
                  <p
                    className={`font-mono text-[10px] uppercase tracking-wider font-semibold ${
                      isDoneOrActive ? 'text-[#1D3C5C]' : 'text-[#5A5D64]/70'
                    }`}
                  >
                    {stage.codeLabel}
                  </p>
                  <p
                    className={`text-xs font-semibold leading-tight mt-0.5 ${
                      isDoneOrActive ? 'text-[#121316]' : 'text-[#5A5D64]'
                    }`}
                  >
                    {stage.viLabel}
                  </p>
                  <p className="text-[11px] text-[#5A5D64] leading-snug mt-0.5 hidden sm:block">
                    {stage.description}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
