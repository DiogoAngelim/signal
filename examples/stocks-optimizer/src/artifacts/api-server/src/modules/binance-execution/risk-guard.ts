import { allSymbolsAllowed } from "./config";
import type { ExecutionStateStore } from "./execution-state";
import type { KillSwitch } from "./kill-switch";
import type {
  AccountState,
  BinanceExecutionConfig,
  BinanceExecutionDecision,
  NormalizedOrderRequest,
  OrderValidationResult,
  PositionSnapshot,
  RiskGuardResult,
  RiskRejection,
} from "./types";

export class RiskGuard {
  constructor(
    private readonly config: BinanceExecutionConfig,
    private readonly store: ExecutionStateStore,
    private readonly killSwitch: KillSwitch,
  ) {}

  evaluate(input: {
    decision: BinanceExecutionDecision;
    order?: NormalizedOrderRequest;
    account: AccountState;
    positionSnapshot?: PositionSnapshot | null;
    exchangeValidation?: OrderValidationResult;
  }): RiskGuardResult {
    const reasons: RiskRejection[] = [];
    const { decision, order, account, positionSnapshot, exchangeValidation } =
      input;

    if (this.killSwitch.isActive())
      reject(reasons, "kill_switch_active", "Kill switch is active.");
    for (const error of this.config.validationErrors) {
      reject(
        reasons,
        "config_invalid",
        `Configuration validation failed: ${error}.`,
      );
    }
    this.validateLiveMode(reasons);
    this.validateMarketOrders(order, reasons);

    if (
      !account.syncedAt ||
      Date.now() - Date.parse(account.syncedAt) > this.config.staleSyncMs
    ) {
      reject(reasons, "stale_sync", "Account sync is stale.");
    }

    if (
      !decision.timestamp ||
      Date.now() - Date.parse(decision.timestamp) > this.config.staleDecisionMs
    ) {
      reject(reasons, "stale_decision", "Decision is stale.");
    }

    if (
      normalizedScore(decision.confidence) <
      normalizedThreshold(this.config.minConfidence)
    ) {
      reject(
        reasons,
        "confidence_below_threshold",
        "Decision confidence is below execution threshold.",
      );
    }

    if (
      normalizedScore(decision.trust) <
      normalizedThreshold(this.config.minTrust)
    ) {
      reject(
        reasons,
        "trust_below_threshold",
        "Decision trust is below execution threshold.",
      );
    }

    if (
      !allSymbolsAllowed(this.config.allowedSymbols) &&
      !this.config.allowedSymbols.includes(decision.symbol.toUpperCase())
    ) {
      reject(
        reasons,
        "symbol_not_allowed",
        "Symbol is not allowed for Binance execution.",
      );
    }

    if (decision.action === "HOLD") {
      reject(reasons, "hold_decision", "HOLD decisions are not executable.");
    }

    if (this.store.getDecisionExecution(decision.id)) {
      reject(
        reasons,
        "duplicate_decision",
        "Decision has already been processed.",
      );
    }

    if (this.cooldownActive(decision)) {
      reject(reasons, "cooldown_active", "Symbol/action cooldown is active.");
    }

    if (account.openOrders.length >= this.config.maxOpenOrders) {
      reject(
        reasons,
        "open_order_limit_exceeded",
        "Open order limit would be exceeded.",
      );
    }

    const dailyNotional = this.dailyNotional();
    if (
      order &&
      dailyNotional + order.notional > this.config.maxDailyNotional
    ) {
      reject(
        reasons,
        "daily_notional_exceeded",
        "Daily notional limit would be exceeded.",
      );
    }

    if (order && order.notional > this.config.maxNotionalPerOrder) {
      reject(
        reasons,
        "max_order_notional_exceeded",
        "Order notional exceeds per-order limit.",
      );
    }

    if (
      order &&
      this.config.strategyEquityCap !== Number.POSITIVE_INFINITY &&
      order.notional > this.config.strategyEquityCap
    ) {
      reject(
        reasons,
        "strategy_equity_cap_exceeded",
        "Order notional exceeds strategy equity cap.",
      );
    }

    if (positionSnapshot?.driftDetected) {
      reject(
        reasons,
        "reconciliation_drift",
        "Reconciliation drift is detected.",
      );
    }

    if (exchangeValidation && !exchangeValidation.ok) {
      for (const reason of exchangeValidation.reasons) {
        reject(
          reasons,
          "exchange_filter_violation",
          `Exchange filter violation: ${reason}.`,
        );
      }
    }

    return {
      ok: reasons.length === 0,
      reasons,
    };
  }

  dailyNotional(date = new Date()) {
    const day = date.toISOString().slice(0, 10);
    return this.store
      .records()
      .orders.filter((order) => order.createdAt.slice(0, 10) === day)
      .reduce((sum, order) => sum + order.notional, 0);
  }

  private validateLiveMode(reasons: RiskRejection[]) {
    if (this.config.mode !== "live") return;
    if (this.config.liveTradingEnabled !== true)
      reject(
        reasons,
        "live_env_disabled",
        "BINANCE_LIVE_TRADING_ENABLED is not true.",
      );
    if (this.config.confirmLiveTrading !== true)
      reject(reasons, "live_not_confirmed", "confirmLiveTrading is not true.");
    if (this.config.riskGuard.liveTradingApproved !== true)
      reject(
        reasons,
        "live_not_approved",
        "Risk guard has not approved live trading.",
      );
  }

  private validateMarketOrders(
    order: NormalizedOrderRequest | undefined,
    reasons: RiskRejection[],
  ) {
    if (!order || order.type !== "MARKET") return;
    if (this.config.allowMarketOrders !== true)
      reject(
        reasons,
        "market_orders_disabled",
        "Market orders are disabled in config.",
      );
    if (process.env.ALLOW_MARKET_ORDERS !== "true")
      reject(
        reasons,
        "market_orders_env_disabled",
        "ALLOW_MARKET_ORDERS is not true.",
      );
    if (this.config.riskGuard.marketOrdersApproved !== true)
      reject(
        reasons,
        "market_orders_not_approved",
        "Risk guard has not approved market orders.",
      );
  }

  private cooldownActive(decision: BinanceExecutionDecision) {
    const last = this.store
      .records()
      .decisions.filter(
        (record) =>
          record.decision.symbol === decision.symbol &&
          record.decision.action === decision.action,
      )
      .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))[0];
    return last
      ? Date.now() - Date.parse(last.updatedAt) < this.config.cooldownMs
      : false;
  }
}

function reject(reasons: RiskRejection[], code: string, message: string) {
  reasons.push({ code, message });
}

function normalizedThreshold(value: number) {
  return value > 1 ? value / 100 : value;
}

function normalizedScore(value: number) {
  return value > 1 ? value / 100 : value;
}
