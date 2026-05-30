import type { BinanceHttpClient } from "./client";
import { allSymbolsAllowed } from "./config";
import { baseAssetForSymbol, quoteAssetForSymbol } from "./market-data";
import type { ExecutionStateStore } from "./execution-state";
import type {
  AccountState,
  BinanceExecutionConfig,
  BinanceOpenOrder,
  BinanceTrade,
} from "./types";

const DEFAULT_SPOT_QUOTE_ASSETS = ["USDT", "USDC", "FDUSD", "BUSD"];

export class AccountSync {
  constructor(
    private readonly config: BinanceExecutionConfig,
    private readonly store: ExecutionStateStore,
    private readonly client?: BinanceHttpClient,
  ) {}

  async sync() {
    const account = this.config.mode === "dry_run"
      ? this.dryRunAccount()
      : await this.binanceAccount();
    this.store.saveAccountState(account);
    return account;
  }

  private dryRunAccount(): AccountState {
    const records = this.store.records();
    const reserved = records.reservations
      .filter((reservation) => reservation.status === "reserved")
      .reduce((sum, reservation) => sum + reservation.amount, 0);
    const equity = this.config.accountEquityOverride;
    const quoteAsset = "USDT";
    const balances: AccountState["balances"] = {
      [quoteAsset]: {
        free: Math.max(0, equity - reserved),
        locked: reserved,
      },
    };

    for (const order of records.orders) {
      if (!["FILLED", "PARTIALLY_FILLED"].includes(order.status.toUpperCase())) continue;
      const base = baseAssetForSymbol(order.symbol);
      const current = balances[base] ?? { free: 0, locked: 0 };
      current.free += order.side === "BUY" ? order.quantity : -order.quantity;
      balances[base] = current;
    }

    return {
      syncedAt: new Date().toISOString(),
      equity,
      availableEquity: Math.max(0, equity - reserved),
      balances,
      openOrders: records.orders
        .filter((order) => ["NEW", "PARTIALLY_FILLED"].includes(order.status.toUpperCase()))
        .map((order): BinanceOpenOrder => ({
          symbol: order.symbol,
          orderId: Number(order.id.replace(/\D/g, "")) || 0,
          clientOrderId: order.clientOrderId,
          price: String(order.price ?? 0),
          origQty: String(order.quantity),
          executedQty: order.status.toUpperCase() === "PARTIALLY_FILLED" ? String(order.quantity) : "0",
          status: order.status,
          side: order.side,
          type: order.type,
        })),
      fills: records.orders
        .filter((order) => ["FILLED", "PARTIALLY_FILLED"].includes(order.status.toUpperCase()))
        .map((order): BinanceTrade => ({
          id: Number(order.id.replace(/\D/g, "")) || 0,
          orderId: Number(order.id.replace(/\D/g, "")) || 0,
          price: String(order.price ?? 0),
          qty: String(order.quantity),
          quoteQty: String(order.notional),
          commission: "0",
          commissionAsset: quoteAssetForSymbol(order.symbol),
          time: Date.parse(order.createdAt),
          isBuyer: order.side === "BUY",
        })),
    };
  }

  private async binanceAccount(): Promise<AccountState> {
    if (!this.client) return this.dryRunAccount();
    await this.client.syncTime();
    const [account, openOrders] = await Promise.all([
      this.client.account(),
      this.client.openOrders(),
    ]);
    const balances: AccountState["balances"] = {};
    for (const balance of account.balances ?? []) {
      balances[balance.asset] = {
        free: Number(balance.free) || 0,
        locked: Number(balance.locked) || 0,
      };
    }
    const quoteAssets = new Set(
      allSymbolsAllowed(this.config.allowedSymbols)
        ? DEFAULT_SPOT_QUOTE_ASSETS
        : this.config.allowedSymbols.map(quoteAssetForSymbol),
    );
    const equity = Array.from(quoteAssets).reduce((sum, asset) => {
      const balance = balances[asset];
      return sum + (balance?.free ?? 0) + (balance?.locked ?? 0);
    }, 0);

    const fills = await this.loadRecentTrades(openOrders ?? []);
    this.refreshTrackedOrderStatuses(openOrders ?? [], fills);
    return {
      syncedAt: new Date().toISOString(),
      equity,
      availableEquity: Array.from(quoteAssets).reduce((sum, asset) => sum + (balances[asset]?.free ?? 0), 0),
      balances,
      openOrders: openOrders ?? [],
      fills,
    };
  }

  private async loadRecentTrades(openOrders: BinanceOpenOrder[] = []) {
    if (!this.client) return [];
    const trades: BinanceTrade[] = [];
    const symbols = allSymbolsAllowed(this.config.allowedSymbols)
      ? trackedSymbols(this.store, openOrders)
      : this.config.allowedSymbols;
    for (const symbol of symbols.slice(0, 20)) {
      try {
        trades.push(...await this.client.myTrades({ symbol, limit: 100 }));
      } catch {
        // Trade history is useful for reconciliation, but account sync should still return balances/open orders.
      }
    }
    return trades;
  }

  private refreshTrackedOrderStatuses(openOrders: BinanceOpenOrder[], fills: BinanceTrade[]) {
    const openByClientOrderId = new Map(openOrders.map((order) => [order.clientOrderId, order]));
    const openByOrderId = new Map(openOrders.map((order) => [String(order.orderId), order]));
    const fillsByOrderId = new Map<string, BinanceTrade[]>();

    for (const fill of fills) {
      const orderId = String(fill.orderId);
      fillsByOrderId.set(orderId, [...(fillsByOrderId.get(orderId) ?? []), fill]);
    }

    for (const order of this.store.records().orders) {
      const status = order.status.toUpperCase();
      if (!["NEW", "PARTIALLY_FILLED"].includes(status)) continue;

      const openOrder = openByClientOrderId.get(order.clientOrderId) ?? openByOrderId.get(order.id);
      if (openOrder) {
        const executedQty = Number(openOrder.executedQty) || 0;
        const price = Number(openOrder.price) || order.price;
        this.store.updateOrder(order.id, {
          status: openOrder.status,
          quantity: executedQty > 0 ? executedQty : order.quantity,
          price,
          notional: price ? Number((price * (executedQty > 0 ? executedQty : order.quantity)).toFixed(8)) : order.notional,
        });
        continue;
      }

      const orderFills = fillsByOrderId.get(order.id) ?? [];
      const filledQuantity = orderFills.reduce((sum, fill) => sum + (Number(fill.qty) || 0), 0);
      if (filledQuantity <= 0) continue;

      const quoteQuantity = orderFills.reduce((sum, fill) => sum + (Number(fill.quoteQty) || 0), 0);
      const averagePrice = quoteQuantity > 0 ? quoteQuantity / filledQuantity : order.price;
      this.store.updateOrder(order.id, {
        status: filledQuantity + 1e-12 >= order.quantity ? "FILLED" : "PARTIALLY_FILLED",
        quantity: Number(filledQuantity.toFixed(12)),
        price: averagePrice,
        notional: quoteQuantity > 0 ? Number(quoteQuantity.toFixed(8)) : order.notional,
      });
    }
  }
}

function trackedSymbols(store: ExecutionStateStore, openOrders: BinanceOpenOrder[]) {
  const symbols = new Set<string>();
  for (const order of store.records().orders) symbols.add(order.symbol);
  for (const reservation of store.records().reservations) symbols.add(reservation.symbol);
  for (const order of openOrders) symbols.add(order.symbol);
  return Array.from(symbols).filter(Boolean);
}
