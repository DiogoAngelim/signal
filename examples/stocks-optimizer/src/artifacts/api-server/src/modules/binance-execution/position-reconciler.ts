import type { ExecutionStateStore } from "./execution-state";
import { baseAssetForSymbol } from "./market-data";
import type { ExecutionMetrics } from "./metrics";
import type {
  AccountState,
  ExecutionOrderRecord,
  PositionSnapshot,
  Reservation,
} from "./types";

export class PositionReconciler {
  constructor(
    private readonly store: ExecutionStateStore,
    private readonly metrics: ExecutionMetrics,
    private readonly toleranceQty = 0.00000001,
  ) {}

  reconcile(account: AccountState = this.store.getAccountState()) {
    const records = this.store.records();
    const expectedPositions = expectedPositionsFromOrders(records.orders);
    const actualPositions = actualPositionsFromBalances(
      account,
      records.orders,
    );
    const reservedCapitalAmount = reservedCapital(records.reservations);
    const activeExposure = exposureFromOrders(records.orders);
    const driftReasons: string[] = [];

    for (const [symbol, expected] of Object.entries(expectedPositions)) {
      const actual = actualPositions[symbol] ?? 0;
      if (Math.abs(expected - actual) > this.toleranceQty) {
        driftReasons.push(`position_drift:${symbol}`);
      }
    }

    if (
      account.openOrders.length >
      records.orders.filter((order) =>
        ["NEW", "PARTIALLY_FILLED"].includes(order.status.toUpperCase()),
      ).length +
        5
    ) {
      driftReasons.push("open_order_drift");
    }

    const snapshot: PositionSnapshot = {
      expectedPositions,
      actualPositions,
      reservedCapital: reservedCapitalAmount,
      activeExposure,
      driftDetected: driftReasons.length > 0,
      driftReasons,
      createdAt: new Date().toISOString(),
    };

    if (snapshot.driftDetected) this.metrics.increment("reconciliation_drift");
    this.store.saveSnapshot(snapshot);
    return snapshot;
  }
}

function expectedPositionsFromOrders(orders: ExecutionOrderRecord[]) {
  const positions: Record<string, number> = {};
  for (const order of orders) {
    const status = order.status.toUpperCase();
    if (!["FILLED", "PARTIALLY_FILLED"].includes(status)) continue;
    const filledQuantity = order.quantity;
    positions[order.symbol] =
      (positions[order.symbol] ?? 0) +
      (order.side === "BUY" ? filledQuantity : -filledQuantity);
  }
  return positions;
}

function actualPositionsFromBalances(
  account: AccountState,
  orders: ExecutionOrderRecord[],
) {
  const positions: Record<string, number> = {};
  const symbols = new Set(orders.map((order) => order.symbol));
  for (const symbol of symbols) {
    const base = baseAssetForSymbol(symbol);
    const balance = account.balances[base];
    positions[symbol] = (balance?.free ?? 0) + (balance?.locked ?? 0);
  }
  return positions;
}

function reservedCapital(reservations: Reservation[]) {
  return reservations
    .filter((reservation) => reservation.status === "reserved")
    .reduce((sum, reservation) => sum + reservation.amount, 0);
}

function exposureFromOrders(orders: ExecutionOrderRecord[]) {
  return orders
    .filter((order) =>
      ["NEW", "PARTIALLY_FILLED", "FILLED"].includes(
        order.status.toUpperCase(),
      ),
    )
    .reduce((sum, order) => sum + order.notional, 0);
}
