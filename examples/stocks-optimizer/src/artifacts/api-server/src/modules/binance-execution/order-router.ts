import type { BinanceHttpClient } from "./client";
import type { ExecutionMetrics } from "./metrics";
import { DryRunSimulator } from "./market-data";
import {
  normalizePrice,
  normalizeQuantity,
  validateOrderAgainstExchangeFilters,
} from "./order-validator";
import { createClientOrderId } from "./signer";
import type { ExecutionStateStore } from "./execution-state";
import type {
  AccountState,
  BinanceExecutionConfig,
  BinanceExecutionDecision,
  BinanceOpenOrder,
  BinanceSymbolInfo,
  ExecutionOrderRecord,
  ExecutionResult,
  NormalizedOrderRequest,
  Reservation,
} from "./types";

export class OrderRouter {
  private readonly simulator: DryRunSimulator;

  constructor(
    private readonly config: BinanceExecutionConfig,
    private readonly store: ExecutionStateStore,
    private readonly metrics: ExecutionMetrics,
    private readonly client?: BinanceHttpClient,
    simulator?: DryRunSimulator,
  ) {
    this.simulator = simulator ?? new DryRunSimulator();
  }

  buildOrder(input: {
    decision: BinanceExecutionDecision;
    notional: number;
    symbolInfo: BinanceSymbolInfo;
    account: AccountState;
  }): NormalizedOrderRequest {
    const decision = input.decision;
    const side = decision.action === "BUY" ? "BUY" : "SELL";
    const requestedType = String(decision.orderType ?? "").toUpperCase();
    const type = requestedType === "LIMIT" || requestedType === "MARKET" ? requestedType : "LIMIT_MAKER";
    const rawPrice =
      Number(decision.limitPrice) ||
      Number(decision.price) ||
      this.simulator.referencePrice(decision.symbol, 1);
    const price = type === "MARKET" ? undefined : normalizePrice(rawPrice, input.symbolInfo);
    const accountQuantity = input.account.balances[input.symbolInfo.baseAsset ?? ""]?.free ?? 0;
    const requestedExitQuantity = Number(decision.exitQuantity);
    const rawQuantity = decision.action === "EXIT" && accountQuantity > 0
      ? Math.min(
          accountQuantity,
          Number.isFinite(requestedExitQuantity) && requestedExitQuantity > 0
            ? requestedExitQuantity
            : accountQuantity,
        )
      : (input.notional / (price ?? rawPrice));
    const quantity = normalizeQuantity(rawQuantity, input.symbolInfo, type === "MARKET");
    const notional = Number(((price ?? rawPrice) * quantity).toFixed(8));

    return {
      decisionId: decision.id,
      clientOrderId: createClientOrderId({
        decisionId: decision.id,
        strategyId: decision.strategyId,
        symbol: decision.symbol,
        action: decision.action,
      }),
      symbol: decision.symbol,
      side,
      type,
      quantity,
      price,
      timeInForce: type === "LIMIT" ? "GTC" : undefined,
      notional,
      strategyId: decision.strategyId,
      dryRun: this.config.mode === "dry_run",
    };
  }

  validateOrder(order: NormalizedOrderRequest, symbolInfo: BinanceSymbolInfo, account: AccountState) {
    const baseBalance = account.balances[symbolInfo.baseAsset ?? ""]?.free ?? 0;
    return validateOrderAgainstExchangeFilters(order, symbolInfo, {
      openOrderCount: account.openOrders.filter((openOrder) => openOrder.symbol === order.symbol).length,
      currentPositionQty: baseBalance,
    });
  }

  async placeOrder(order: NormalizedOrderRequest): Promise<ExecutionResult> {
    this.metrics.increment("orders_attempted");
    const reservation = this.reserve(order);
    const startedAt = Date.now();

    try {
      const response = this.config.mode === "dry_run"
        ? this.simulator.placeOrder(order)
        : await this.client!.createOrder(order);
      const record = this.toOrderRecord(order, response);
      this.store.saveOrder(record);
      this.metrics.increment(record.status === "FILLED" ? "orders_filled" : "orders_accepted");
      this.metrics.record("order_latency_ms", Date.now() - startedAt);

      if (record.status === "REJECTED" || record.status === "CANCELED") {
        this.store.releaseReservation(reservation.id);
        this.metrics.increment("capital_released", reservation.amount);
      }

      return {
        decisionId: order.decisionId,
        status: resultStatus(record.status),
        mode: this.config.mode,
        order: record,
        clientOrderId: order.clientOrderId,
        reasons: [],
      };
    } catch (error) {
      this.store.releaseReservation(reservation.id);
      this.metrics.increment("capital_released", reservation.amount);
      this.metrics.increment("api_failures");
      return {
        decisionId: order.decisionId,
        status: "failed",
        mode: this.config.mode,
        clientOrderId: order.clientOrderId,
        reasons: [error instanceof Error ? error.message : String(error)],
      };
    }
  }

  async cancelOrder(orderId: string) {
    const existing = this.store.findOrder(orderId);
    if (!existing) {
      return {
        status: "rejected" as const,
        reasons: ["order_not_found"],
      };
    }

    if (this.config.mode !== "dry_run") {
      await this.client!.cancelOrder({
        symbol: existing.symbol,
        orderId: /^\d+$/.test(orderId) ? orderId : undefined,
        origClientOrderId: /^\d+$/.test(orderId) ? undefined : orderId,
      });
    }

    const updated = this.store.updateOrder(existing.id, { status: "CANCELED" });
    this.store.releaseReservationsForDecision(existing.decisionId);
    this.metrics.increment("orders_cancelled");
    this.metrics.increment("capital_released", existing.notional);
    return {
      status: "cancelled" as const,
      order: updated,
      reasons: [],
    };
  }

  async cancelAll(symbol?: string) {
    if (this.config.mode !== "dry_run") await this.client!.cancelAll(symbol);
    const cancelled: ExecutionOrderRecord[] = [];
    for (const order of this.store.records().orders) {
      if (symbol && order.symbol !== symbol) continue;
      if (!["NEW", "PARTIALLY_FILLED"].includes(order.status.toUpperCase())) continue;
      const updated = this.store.updateOrder(order.id, { status: "CANCELED" });
      if (updated) cancelled.push(updated);
      this.store.releaseReservationsForDecision(order.decisionId);
    }
    this.metrics.increment("orders_cancelled", cancelled.length);
    return cancelled;
  }

  private reserve(order: NormalizedOrderRequest): Reservation {
    const reservation: Reservation = {
      id: `res_${order.clientOrderId}`,
      decisionId: order.decisionId,
      symbol: order.symbol,
      amount: order.side === "BUY" ? order.notional : 0,
      side: order.side,
      status: "reserved",
      createdAt: new Date().toISOString(),
    };
    this.store.saveReservation(reservation);
    this.metrics.increment("capital_reserved", reservation.amount);
    return reservation;
  }

  private toOrderRecord(order: NormalizedOrderRequest, response: BinanceOpenOrder): ExecutionOrderRecord {
    const status = response.status ?? "NEW";
    const now = new Date().toISOString();
    return {
      id: String(response.orderId || order.clientOrderId),
      decisionId: order.decisionId,
      clientOrderId: response.clientOrderId || order.clientOrderId,
      symbol: order.symbol,
      side: order.side,
      type: order.type,
      status,
      quantity: Number(response.executedQty) > 0 ? Number(response.executedQty) : order.quantity,
      price: Number(response.price) || order.price,
      notional: order.notional,
      mode: this.config.mode,
      createdAt: now,
      updatedAt: now,
      raw: response,
    };
  }
}

function resultStatus(status: string): ExecutionResult["status"] {
  const normalized = status.toUpperCase();
  if (normalized === "FILLED") return "filled";
  if (normalized === "PARTIALLY_FILLED") return "partially_filled";
  if (normalized === "CANCELED") return "cancelled";
  if (normalized === "REJECTED") return "rejected";
  return "accepted";
}
