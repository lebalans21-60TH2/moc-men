import type { Response } from 'express';
import type { MasterOrder, SubOrder } from '../src/types.ts';

export type OrderRealtimeEvent =
  | {
      type: 'connected';
      buyerId: number;
      serverTime: string;
    }
  | {
      type: 'order:created';
      masterOrder: MasterOrder;
      serverTime: string;
    }
  | {
      type: 'order:updated';
      subOrder: SubOrder;
      masterOrder?: MasterOrder | null;
      serverTime: string;
    };

class OrderRealtimeBroker {
  private clientsByBuyer = new Map<number, Set<Response>>();
  private heartbeatTimer: NodeJS.Timeout | null = null;

  constructor() {
    this.heartbeatTimer = setInterval(() => {
      for (const clients of this.clientsByBuyer.values()) {
        for (const res of clients) {
          try {
            res.write(': keepalive\n\n');
          } catch {
            // Connection cleanup handled on close
          }
        }
      }
    }, 25000);
    this.heartbeatTimer.unref?.();
  }

  subscribe(buyerId: number, res: Response): () => void {
    let set = this.clientsByBuyer.get(buyerId);
    if (!set) {
      set = new Set();
      this.clientsByBuyer.set(buyerId, set);
    }
    set.add(res);

    this.sendToClient(res, {
      type: 'connected',
      buyerId,
      serverTime: new Date().toISOString(),
    });

    return () => {
      const current = this.clientsByBuyer.get(buyerId);
      if (!current) return;
      current.delete(res);
      if (current.size === 0) {
        this.clientsByBuyer.delete(buyerId);
      }
    };
  }

  emitOrderCreated(buyerId: number, masterOrder: MasterOrder) {
    this.broadcastToBuyer(buyerId, {
      type: 'order:created',
      masterOrder,
      serverTime: new Date().toISOString(),
    });
  }

  emitSubOrderUpdated(buyerId: number, subOrder: SubOrder, masterOrder?: MasterOrder | null) {
    this.broadcastToBuyer(buyerId, {
      type: 'order:updated',
      subOrder,
      masterOrder: masterOrder ?? undefined,
      serverTime: new Date().toISOString(),
    });
  }

  private broadcastToBuyer(buyerId: number, payload: OrderRealtimeEvent) {
    const clients = this.clientsByBuyer.get(Number(buyerId));
    if (!clients || clients.size === 0) return;
    for (const res of clients) {
      this.sendToClient(res, payload);
    }
  }

  private sendToClient(res: Response, payload: OrderRealtimeEvent) {
    try {
      res.write(`event: ${payload.type}\n`);
      res.write(`data: ${JSON.stringify(payload)}\n\n`);
    } catch {
      // Closed sockets will be pruned by close handler
    }
  }
}

export const orderRealtime = new OrderRealtimeBroker();
