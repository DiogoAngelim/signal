import type { Position } from "../portfolio-risk/types";
import { AccountSync } from "./account-sync";
import { CircuitBreaker } from "./circuit-breaker";
import { BinanceHttpClient } from "./client";
import { allSymbolsAllowed, loadBinanceExecutionConfig } from "./config";
import { BinanceApiError, BinanceRateLimitError, errorMessage } from "./errors";
import { ExchangeInfoCache } from "./exchange-cache";
import { ExecutionStateStore } from "./execution-state";
import { KillSwitch } from "./kill-switch";
import { binanceExecutionLogger } from "./logger";
import { ExecutionMetrics } from "./metrics";
import { OrderRouter } from "./order-router";
import { minNotionalFor } from "./order-validator";
import { PositionReconciler } from "./position-reconciler";
import { RateLimiter } from "./rate-limit";
import { RiskGuard } from "./risk-guard";
import {
  allocateProportionalNotional,
  computeAvailableStrategyEquity,
} from "./sizing-adapter";
import type {
  AccountState,
  BinanceExchangeInfo,
  BinanceExecutionConfigInput,
  BinanceExecutionDecision,
  BinanceSymbolInfo,
  ExecutionResult,
} from "./types";

export * from "./types";
export * from "./config";
export * from "./signer";
export * from "./sizing-adapter";
export * from "./order-validator";
export * from "./risk-guard";
export * from "./kill-switch";
export * from "./rate-limit";
export * from "./circuit-breaker";
export * from "./execution-state";
export * from "./metrics";
export * from "./errors";
export * from "./position-reconciler";

export function createBinanceExecutionModule(
  configInput: BinanceExecutionConfigInput = {},
) {
  return new BinanceExecutionModule(configInput);
}

export class BinanceExecutionModule {
  private readonly config;
  private readonly store;
  private readonly metrics;
  private readonly killSwitch;
  private readonly circuitBreaker;
  private readonly rateLimiter: RateLimiter;
  private readonly client?: BinanceHttpClient;
  private readonly exchangeCache;
  private readonly accountSync: AccountSync;
  private readonly reconciler;
  private readonly riskGuard;
  private readonly orderRouter: OrderRouter;

  constructor(private readonly configInput: BinanceExecutionConfigInput = {}) {
    this.config = loadBinanceExecutionConfig(this.configInput);
    this.store = new ExecutionStateStore(this.config.stateFile);
    this.metrics = new ExecutionMetrics();
    this.killSwitch = new KillSwitch(this.metrics);
    this.circuitBreaker = new CircuitBreaker();
    this.exchangeCache = new ExchangeInfoCache(this.config.exchangeInfoTtlMs);
    const runtime = this.store.hydrateRuntime();
    this.metrics.hydrate(runtime.metrics);
    this.killSwitch.hydrate(runtime.killSwitch);
    this.circuitBreaker.hydrate(runtime.circuitBreaker);

    this.rateLimiter = new RateLimiter({
      metrics: this.metrics,
      onIpBan: (reason) => {
        this.enableKillSwitch(`binance_418:${reason}`);
      },
    });
    this.client =
      this.config.mode === "dry_run"
        ? undefined
        : new BinanceHttpClient(this.config, this.rateLimiter);
    this.accountSync = new AccountSync(this.config, this.store, this.client);
    this.reconciler = new PositionReconciler(this.store, this.metrics);
    this.riskGuard = new RiskGuard(this.config, this.store, this.killSwitch);
    this.orderRouter = new OrderRouter(
      this.config,
      this.store,
      this.metrics,
      this.client,
    );

    if (this.config.validationErrors.length > 0) {
      this.enableKillSwitch(
        `config_invalid:${this.config.validationErrors.join(",")}`,
      );
    }
  }

  /**
   * @deprecated Use executePositions() instead.
   *
   * Executing a single decision bypasses the Portfolio & Risk layer.
   * The canonical path is: Signal → RiskEngine → Position → executePositions()
   */
  async executeDecision(
    decision: BinanceExecutionDecision,
  ): Promise<ExecutionResult> {
    const [result] = await this.executeDecisions([decision]);
    return result;
  }

  async executeDecisions(
    decisions: BinanceExecutionDecision[],
  ): Promise<ExecutionResult[]> {
    const normalizedDecisions = decisions.map(normalizeDecision);
    for (const decision of normalizedDecisions)
      this.metrics.increment("decisions_received");

    const account = await this.syncAccountState();
    const exchangeInfo = await this.loadExchangeInfo();
    const positionSnapshot = this.reconciler.reconcile(account);
    if (positionSnapshot.driftDetected) {
      this.enableKillSwitch(
        `reconciliation_drift:${positionSnapshot.driftReasons.join(",")}`,
      );
    }

    const availableEquity = computeAvailableStrategyEquity({
      accountEquity: account.equity,
      availableEquity: account.availableEquity,
      strategyEquityCap: this.config.strategyEquityCap,
      reservedCapital: this.store
        .activeReservations()
        .reduce((sum, reservation) => sum + reservation.amount, 0),
    });
    const minNotionalBySymbol = Object.fromEntries(
      exchangeInfo.symbols.map((symbol) => [
        symbol.symbol,
        minNotionalFor(symbol),
      ]),
    );
    const allocations = allocateProportionalNotional({
      decisions: normalizedDecisions,
      availableEquity,
      strategyEquityCap: this.config.strategyEquityCap,
      maxDailyNotional: this.config.maxDailyNotional,
      maxOrderNotional: this.config.maxNotionalPerOrder,
      useFullAvailableEquity:
        this.config.allocationMode === "system_proportional",
      usedDailyNotional: this.riskGuard.dailyNotional(),
      minNotionalBySymbol,
    });

    const results: ExecutionResult[] = [];
    for (const allocation of allocations) {
      results.push(
        await this.executeAllocatedDecision({
          decision: allocation.decision,
          notional: allocation.notional,
          allocationRejected: allocation.rejected,
          allocationReasons: allocation.reasons,
          account,
          positionSnapshot,
        }),
      );
    }

    this.persistRuntime();
    return results;
  }

  /**
   * Execute Position objects from the Portfolio & Risk layer.
   *
   * This is the NEW canonical entry point for the 4-layer architecture:
   *   Signal → Portfolio & Risk → Position → Execution
   *
   * Execution MUST NOT interpret signals or risk logic.
   * It only converts Position → Order and submits.
   */
  async executePositions(positions: Position[]): Promise<ExecutionResult[]> {
    const decisions = positions.map(positionToDecision);
    return this.executeDecisions(decisions);
  }

  async cancelOrder(orderId: string) {
    const result = await this.orderRouter.cancelOrder(orderId);
    this.persistRuntime();
    return result;
  }

  async cancelAll(symbol?: string) {
    const result = await this.orderRouter.cancelAll(symbol?.toUpperCase());
    this.persistRuntime();
    return result;
  }

  async syncAccountState() {
    if (!this.circuitBreaker.canAttempt()) {
      return this.store.getAccountState();
    }

    try {
      const account = await this.accountSync.sync();
      this.circuitBreaker.recordSuccess();
      this.persistRuntime();
      return account;
    } catch (error) {
      this.metrics.increment("api_failures");
      this.circuitBreaker.recordFailure();
      binanceExecutionLogger.warn(
        {
          error: errorMessage(error),
          status: error instanceof BinanceApiError ? error.status : undefined,
          code: error instanceof Error ? error.name : "UnknownError",
        },
        "binance account sync failed",
      );
      if (error instanceof BinanceRateLimitError && error.banned) {
        this.enableKillSwitch(`binance_418:${error.message}`);
      }
      this.persistRuntime();
      return this.store.getAccountState();
    }
  }

  getExecutionState() {
    return this.store.snapshot(
      this.config.mode,
      this.circuitBreaker.snapshot(),
      this.metrics.snapshot(),
    );
  }

  async healthCheck() {
    const reasons: string[] = [];
    const account = this.store.getAccountState();
    const lastSyncAt = account.syncedAt;
    const staleState =
      !lastSyncAt ||
      Date.now() - Date.parse(lastSyncAt) > this.config.staleSyncMs;
    const positions = this.getExecutionState().positions;
    const exchangeReachable = await this.exchangeReachable();
    const killSwitchActive = this.killSwitch.isActive();
    const accountSynced = Boolean(lastSyncAt) && !staleState;
    const reconciliationHealthy = !positions?.driftDetected;

    if (!exchangeReachable) reasons.push("exchange_unreachable");
    if (!accountSynced) reasons.push("account_not_synced");
    if (!reconciliationHealthy) reasons.push("reconciliation_drift");
    if (killSwitchActive) reasons.push("kill_switch_active");
    if (staleState) reasons.push("stale_state");
    for (const error of this.config.validationErrors)
      reasons.push(`config:${error}`);

    return {
      ok: reasons.length === 0,
      mode: this.config.mode,
      accountSynced,
      exchangeReachable,
      reconciliationHealthy,
      killSwitchActive,
      staleState,
      lastSyncAt,
      reasons,
    };
  }

  enableKillSwitch(reason: string) {
    const snapshot = this.killSwitch.enable(reason);
    this.store.markKillSwitch(snapshot);
    this.persistRuntime();
    return snapshot;
  }

  disableKillSwitch(reason: string) {
    const snapshot = this.killSwitch.disable(reason);
    this.store.markKillSwitch(snapshot);
    this.persistRuntime();
    return snapshot;
  }

  private async executeAllocatedDecision(input: {
    decision: BinanceExecutionDecision;
    notional: number;
    allocationRejected: boolean;
    allocationReasons: string[];
    account: AccountState;
    positionSnapshot: ReturnType<PositionReconciler["reconcile"]>;
  }): Promise<ExecutionResult> {
    const { decision } = input;
    const now = new Date().toISOString();

    if (input.allocationRejected) {
      return this.rejectDecision(decision, input.allocationReasons, now);
    }

    const symbolInfo =
      this.exchangeCache.symbol(decision.symbol) ??
      (this.config.mode === "dry_run" &&
      allSymbolsAllowed(this.config.allowedSymbols)
        ? dryRunSymbolInfo(decision.symbol)
        : null);
    if (!symbolInfo)
      return this.rejectDecision(decision, ["symbol_not_found"], now);

    const order = this.orderRouter.buildOrder({
      decision,
      notional: input.notional,
      symbolInfo,
      account: input.account,
    });
    const exchangeValidation = this.orderRouter.validateOrder(
      order,
      symbolInfo,
      input.account,
    );
    const risk = this.riskGuard.evaluate({
      decision,
      order: exchangeValidation.normalized ?? order,
      account: input.account,
      positionSnapshot: input.positionSnapshot,
      exchangeValidation,
    });

    if (!risk.ok) {
      return this.rejectDecision(
        decision,
        risk.reasons.map((reason) => reason.code),
        now,
      );
    }

    this.metrics.increment("decisions_approved");
    this.store.saveDecisionExecution({
      decisionId: decision.id,
      clientOrderId: order.clientOrderId,
      status: "approved",
      reasons: [],
      decision,
      createdAt: now,
      updatedAt: now,
    });

    const result = await this.orderRouter.placeOrder(
      exchangeValidation.normalized ?? order,
    );
    this.store.saveDecisionExecution({
      decisionId: decision.id,
      clientOrderId: order.clientOrderId,
      status:
        result.status === "failed"
          ? "failed"
          : result.status === "rejected"
            ? "rejected"
            : "accepted",
      reasons: result.reasons,
      decision,
      createdAt: now,
      updatedAt: new Date().toISOString(),
    });
    return result;
  }

  private rejectDecision(
    decision: BinanceExecutionDecision,
    reasons: string[],
    now = new Date().toISOString(),
  ): ExecutionResult {
    this.metrics.increment("decisions_rejected");
    this.store.saveDecisionExecution({
      decisionId: decision.id,
      status: "rejected",
      reasons,
      decision,
      createdAt: now,
      updatedAt: now,
    });
    return {
      decisionId: decision.id,
      status: "rejected",
      mode: this.config.mode,
      reasons,
    };
  }

  private async loadExchangeInfo() {
    if (this.exchangeCache.fresh && this.exchangeCache.get())
      return this.exchangeCache.get() as BinanceExchangeInfo;
    const exchangeInfo =
      this.config.mode === "dry_run"
        ? dryRunExchangeInfo(this.config.allowedSymbols)
        : await this.client?.exchangeInfo();
    this.exchangeCache.set(exchangeInfo);
    return exchangeInfo;
  }

  private async exchangeReachable() {
    if (this.config.mode === "dry_run") return true;
    if (!this.circuitBreaker.canAttempt()) return false;
    try {
      await this.client?.syncTime();
      this.circuitBreaker.recordSuccess();
      return true;
    } catch (error) {
      this.circuitBreaker.recordFailure();
      this.metrics.increment("api_failures");
      binanceExecutionLogger.warn(
        {
          error: errorMessage(error),
          status: error instanceof BinanceApiError ? error.status : undefined,
          code: error instanceof Error ? error.name : "UnknownError",
        },
        "binance exchange health check failed",
      );
      if (error instanceof BinanceRateLimitError && error.banned) {
        this.enableKillSwitch(`binance_418:${error.message}`);
      }
      return false;
    } finally {
      this.persistRuntime();
    }
  }

  private persistRuntime() {
    this.store.markKillSwitch(this.killSwitch.snapshot());
    this.store.markCircuitBreaker(this.circuitBreaker.snapshot());
    this.store.saveMetrics(this.metrics.snapshot());
  }
}

function normalizeDecision(
  decision: BinanceExecutionDecision,
): BinanceExecutionDecision {
  return {
    ...decision,
    id: String(decision.id ?? "").trim(),
    symbol: String(decision.symbol ?? "")
      .trim()
      .toUpperCase(),
    action: String(decision.action ?? "HOLD")
      .trim()
      .toUpperCase() as BinanceExecutionDecision["action"],
    confidence: Number(decision.confidence),
    trust: Number(decision.trust),
    appSizePct: Number(decision.appSizePct),
    expectedMovePct: Number.isFinite(Number(decision.expectedMovePct))
      ? Number(decision.expectedMovePct)
      : undefined,
    price: Number.isFinite(Number(decision.price))
      ? Number(decision.price)
      : undefined,
    limitPrice: Number.isFinite(Number(decision.limitPrice))
      ? Number(decision.limitPrice)
      : undefined,
    exitQuantity: Number.isFinite(Number(decision.exitQuantity))
      ? Number(decision.exitQuantity)
      : undefined,
    timestamp: decision.timestamp || new Date(0).toISOString(),
  };
}

function dryRunExchangeInfo(symbols: string[]): BinanceExchangeInfo {
  return {
    timezone: "UTC",
    serverTime: Date.now(),
    symbols: symbols.map(dryRunSymbolInfo),
  };
}

function dryRunSymbolInfo(symbol: string): BinanceSymbolInfo {
  const quoteAsset = symbol.endsWith("USDT")
    ? "USDT"
    : symbol.endsWith("USDC")
      ? "USDC"
      : "USDT";
  return {
    symbol,
    status: "TRADING",
    baseAsset: symbol.slice(0, -quoteAsset.length),
    quoteAsset,
    filters: [
      {
        filterType: "LOT_SIZE",
        minQty: "0.00001",
        maxQty: "100000",
        stepSize: "0.00001",
      },
      {
        filterType: "MARKET_LOT_SIZE",
        minQty: "0.00001",
        maxQty: "100000",
        stepSize: "0.00001",
      },
      {
        filterType: "PRICE_FILTER",
        minPrice: "0.00001",
        maxPrice: "10000000",
        tickSize: "0.00001",
      },
      { filterType: "MIN_NOTIONAL", minNotional: "5", applyToMarket: true },
      { filterType: "NOTIONAL", minNotional: "5", maxNotional: "10000000" },
      { filterType: "MAX_NUM_ORDERS", maxNumOrders: 200 },
      { filterType: "MAX_POSITION", maxPosition: "100000" },
    ],
  };
}

/**
 * @deprecated Use the Portfolio & Risk layer instead.
 *
 * This function bypasses the Portfolio & Risk layer by converting signals
 * directly to execution decisions. The canonical path is:
 *   Signal → SignalAdapter → RiskEngine → Position → executePositions()
 *
 * This function is retained for backward compatibility only.
 * New code MUST route through the Portfolio & Risk layer.
 */
export function mapStrategySignalToBinanceDecision(
  signal: Record<string, unknown>,
  strategyId = "stocks-optimizer",
): BinanceExecutionDecision {
  const symbol = String(signal.symbol ?? signal.ticker ?? "")
    .trim()
    .toUpperCase();
  const actionText = String(
    signal.allocationAction ?? signal.signalAction ?? "Hold",
  )
    .trim()
    .toUpperCase();
  const riskState = String(signal.riskState ?? signal.signalStatus ?? "");
  const action =
    actionText === "BUY"
      ? "BUY"
      : actionText === "SELL" ||
          actionText === "EXIT" ||
          riskState.toLowerCase() === "risk-exit"
        ? "EXIT"
        : "HOLD";
  const suggestedExposure = Number(signal.suggestedExposure ?? 0);
  const maxPositionPct = Number(signal.maxPositionPct ?? suggestedExposure);
  const normalizedSize = Number.isFinite(Number(signal.appSizePct))
    ? Number(signal.appSizePct)
    : action === "EXIT"
      ? 1
      : maxPositionPct > 0
        ? suggestedExposure / maxPositionPct
        : suggestedExposure > 0
          ? 1
          : 0;
  const expectedMovePct = firstFiniteNumber([
    signal.expectedMovePct,
    signal.expectedMove,
    signal.signalReturnPercent,
    signal.expectedReturnPct,
    signal.targetMovePct,
  ]);
  return {
    id: String(
      signal.decisionId ??
        `${strategyId}:${symbol}:${action}:${signal.timestamp ?? signal.updatedAt ?? Date.now()}`,
    ),
    symbol,
    action,
    confidence: Number(
      signal.signalConfidence ?? signal.confidence ?? signal.setupQuality ?? 0,
    ),
    trust: Number(signal.trustworthiness ?? signal.trust ?? 0),
    calibratedConfidence: Number(
      signal.calibratedConfidence ?? signal.signalConfidence ?? 0,
    ),
    appSizePct: normalizedSize,
    suggestedNotional: Number.isFinite(Number(signal.suggestedNotional))
      ? Number(signal.suggestedNotional)
      : undefined,
    expectedMovePct,
    riskState,
    sizingMode: String(signal.sizingMode ?? ""),
    strategyId,
    timestamp: String(
      signal.timestamp ?? signal.updatedAt ?? new Date().toISOString(),
    ),
    ...(Number.isFinite(Number(signal.price))
      ? { price: Number(signal.price) }
      : {}),
  } as BinanceExecutionDecision;
}

function firstFiniteNumber(values: unknown[]) {
  for (const value of values) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

/**
 * Convert a Position (from Portfolio & Risk layer) to a BinanceExecutionDecision.
 *
 * This is the bridge between the Portfolio & Risk layer and the Execution layer.
 * Execution MUST NOT interpret signals or risk logic — it only converts
 * Position → Order and submits.
 */
function positionToDecision(position: Position): BinanceExecutionDecision {
  const action =
    position.direction === "long"
      ? "BUY"
      : position.direction === "short"
        ? "EXIT"
        : "HOLD";
  return {
    id: `position:${position.asset}:${action}:${Date.now()}`,
    symbol: position.asset.toUpperCase(),
    action,
    confidence: 0,
    trust: 0,
    appSizePct: position.size > 0 ? 1 : 0,
    suggestedNotional: position.size > 0 ? position.size : undefined,
    timestamp: new Date().toISOString(),
  } as BinanceExecutionDecision;
}
