import fs from "node:fs";
import path from "node:path";
import type {
  AccountState,
  DecisionExecutionRecord,
  ExecutionMode,
  ExecutionOrderRecord,
  ExecutionStateSnapshot,
  PositionSnapshot,
  Reservation,
} from "./types";

type PersistedState = {
  decisions: DecisionExecutionRecord[];
  orders: ExecutionOrderRecord[];
  reservations: Reservation[];
  snapshots: PositionSnapshot[];
  account: AccountState;
  killSwitch?: ExecutionStateSnapshot["killSwitch"];
  circuitBreaker?: ExecutionStateSnapshot["circuitBreaker"];
  metrics?: Record<string, number>;
};

const EMPTY_ACCOUNT: AccountState = {
  syncedAt: null,
  equity: 0,
  availableEquity: 0,
  balances: {},
  openOrders: [],
  fills: [],
};

export class ExecutionStateStore {
  private decisions = new Map<string, DecisionExecutionRecord>();
  private orders = new Map<string, ExecutionOrderRecord>();
  private reservations = new Map<string, Reservation>();
  private snapshots: PositionSnapshot[] = [];
  private account: AccountState = { ...EMPTY_ACCOUNT };
  private killSwitch: ExecutionStateSnapshot["killSwitch"] = {
    active: false,
    reason: null,
    updatedAt: null,
  };
  private circuitBreaker: ExecutionStateSnapshot["circuitBreaker"] = {
    state: "closed",
    failureCount: 0,
    openedAt: null,
  };
  private metrics: Record<string, number> = {};

  constructor(private readonly filePath: string) {
    this.load();
  }

  saveDecisionExecution(record: DecisionExecutionRecord) {
    const existing = this.decisions.get(record.decisionId);
    this.decisions.set(record.decisionId, {
      ...existing,
      ...record,
      updatedAt: record.updatedAt ?? new Date().toISOString(),
    });
    this.persist();
  }

  getDecisionExecution(decisionId: string) {
    return this.decisions.get(decisionId) ?? null;
  }

  getDecisionByClientOrderId(clientOrderId: string) {
    return this.records().decisions.find((decision) => decision.clientOrderId === clientOrderId) ?? null;
  }

  saveOrder(record: ExecutionOrderRecord) {
    this.orders.set(record.id, record);
    this.persist();
  }

  updateOrder(orderId: string, patch: Partial<ExecutionOrderRecord>) {
    const existing = this.orders.get(orderId);
    if (!existing) return null;
    const updated = {
      ...existing,
      ...patch,
      updatedAt: patch.updatedAt ?? new Date().toISOString(),
    };
    this.orders.set(orderId, updated);
    this.persist();
    return updated;
  }

  findOrder(orderId: string) {
    return this.orders.get(orderId) ??
      Array.from(this.orders.values()).find((order) => order.clientOrderId === orderId) ??
      null;
  }

  saveReservation(reservation: Reservation) {
    this.reservations.set(reservation.id, reservation);
    this.persist();
  }

  releaseReservation(reservationId: string) {
    const existing = this.reservations.get(reservationId);
    if (!existing || existing.status === "released") return existing ?? null;
    const released = {
      ...existing,
      status: "released" as const,
      releasedAt: new Date().toISOString(),
    };
    this.reservations.set(reservationId, released);
    this.persist();
    return released;
  }

  releaseReservationsForDecision(decisionId: string) {
    const released: Reservation[] = [];
    for (const reservation of this.reservations.values()) {
      if (reservation.decisionId === decisionId && reservation.status === "reserved") {
        released.push(this.releaseReservation(reservation.id) as Reservation);
      }
    }
    return released;
  }

  activeReservations() {
    return Array.from(this.reservations.values()).filter((reservation) => reservation.status === "reserved");
  }

  saveSnapshot(snapshot: PositionSnapshot) {
    this.snapshots.push(snapshot);
    this.snapshots = this.snapshots.slice(-500);
    this.persist();
  }

  saveAccountState(account: AccountState) {
    this.account = account;
    this.persist();
  }

  getAccountState() {
    return this.account;
  }

  markKillSwitch(value: ExecutionStateSnapshot["killSwitch"]) {
    this.killSwitch = value;
    this.persist();
  }

  markCircuitBreaker(value: ExecutionStateSnapshot["circuitBreaker"]) {
    this.circuitBreaker = value;
    this.persist();
  }

  saveMetrics(metrics: Record<string, number>) {
    this.metrics = metrics;
    this.persist();
  }

  hydrateRuntime() {
    return {
      killSwitch: this.killSwitch,
      circuitBreaker: this.circuitBreaker,
      metrics: this.metrics,
    };
  }

  records() {
    return {
      decisions: Array.from(this.decisions.values()),
      orders: Array.from(this.orders.values()),
      reservations: Array.from(this.reservations.values()),
      snapshots: this.snapshots.slice(),
      account: this.account,
    };
  }

  snapshot(mode: ExecutionMode, circuitBreaker: ExecutionStateSnapshot["circuitBreaker"], metrics: Record<string, number>): ExecutionStateSnapshot {
    return {
      mode,
      decisions: Array.from(this.decisions.values()),
      orders: Array.from(this.orders.values()),
      reservations: Array.from(this.reservations.values()),
      account: this.account,
      positions: this.snapshots.at(-1) ?? null,
      killSwitch: this.killSwitch,
      circuitBreaker,
      metrics,
    };
  }

  private load() {
    try {
      if (!fs.existsSync(this.filePath)) return;
      const parsed = JSON.parse(fs.readFileSync(this.filePath, "utf8")) as Partial<PersistedState>;
      for (const decision of parsed.decisions ?? []) this.decisions.set(decision.decisionId, decision);
      for (const order of parsed.orders ?? []) this.orders.set(order.id, order);
      for (const reservation of parsed.reservations ?? []) this.reservations.set(reservation.id, reservation);
      this.snapshots = Array.isArray(parsed.snapshots) ? parsed.snapshots : [];
      this.account = parsed.account ?? { ...EMPTY_ACCOUNT };
      this.killSwitch = parsed.killSwitch ?? this.killSwitch;
      this.circuitBreaker = parsed.circuitBreaker ?? this.circuitBreaker;
      this.metrics = parsed.metrics ?? {};
    } catch {
      this.decisions.clear();
      this.orders.clear();
      this.reservations.clear();
      this.snapshots = [];
      this.account = { ...EMPTY_ACCOUNT };
    }
  }

  private persist() {
    const payload: PersistedState = {
      decisions: Array.from(this.decisions.values()),
      orders: Array.from(this.orders.values()),
      reservations: Array.from(this.reservations.values()),
      snapshots: this.snapshots,
      account: this.account,
      killSwitch: this.killSwitch,
      circuitBreaker: this.circuitBreaker,
      metrics: this.metrics,
    };

    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    fs.writeFileSync(this.filePath, JSON.stringify(payload, null, 2), "utf8");
  }
}
