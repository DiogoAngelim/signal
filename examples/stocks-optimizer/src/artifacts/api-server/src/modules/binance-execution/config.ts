import path from "node:path";
import os from "node:os";
import type {
  BinanceExecutionConfig,
  BinanceExecutionConfigInput,
  ExecutionMode,
} from "./types";

const DEFAULT_ALLOWED_SYMBOLS = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT", "AAVEUSDT", "ADAUSDT"];

export function parseBoolean(value: unknown, fallback = false) {
  if (value == null || value === "") return fallback;
  if (typeof value === "boolean") return value;
  const normalized = String(value).trim().toLowerCase();
  return ["1", "true", "yes", "on"].includes(normalized);
}

export function parseNumber(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function parseLimit(value: unknown, fallback: number) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (["auto", "system", "unlimited", "infinite", "infinity", "none"].includes(normalized)) {
    return Number.POSITIVE_INFINITY;
  }
  return parseNumber(value, fallback);
}

export function parseAllocationMode(value: unknown): BinanceExecutionConfig["allocationMode"] {
  const normalized = String(value ?? "").trim().toLowerCase();
  return normalized === "system_proportional" || normalized === "system" || normalized === "proportional"
    ? "system_proportional"
    : "normalized";
}

export function parseAllowedSymbols(value: unknown, fallback = DEFAULT_ALLOWED_SYMBOLS) {
  const symbols = String(value ?? "")
    .split(",")
    .map((symbol) => symbol.trim().toUpperCase())
    .filter(Boolean);
  if (symbols.some((symbol) => symbol === "*" || symbol === "ALL")) return ["*"];
  return symbols.length ? Array.from(new Set(symbols)) : fallback.slice();
}

export function allSymbolsAllowed(symbols: readonly string[]) {
  return symbols.some((symbol) => symbol === "*" || symbol.toUpperCase() === "ALL");
}

export function modeFromEnv(value: unknown): ExecutionMode {
  const normalized = String(value ?? "dry_run").trim().toLowerCase();
  if (normalized === "testnet" || normalized === "live") return normalized;
  return "dry_run";
}

export function defaultExecutionStateFile(env: NodeJS.ProcessEnv = process.env) {
  if (env.VERCEL) return path.join(os.tmpdir(), "binance-execution-state.json");
  return path.resolve(process.cwd(), ".local-cache/binance-execution-state.json");
}

export function loadBinanceExecutionConfig(
  input: BinanceExecutionConfigInput = {},
  env: NodeJS.ProcessEnv = process.env,
): BinanceExecutionConfig {
  const mode = input.mode ?? modeFromEnv(env.BINANCE_MODE);
  const allowedSymbols = input.allowedSymbols ?? parseAllowedSymbols(env.BINANCE_ALLOWED_SYMBOLS);
  const fetchImpl = input.fetch ?? globalThis.fetch;
  const config: BinanceExecutionConfig = {
    mode,
    apiKey: input.apiKey ?? env.BINANCE_API_KEY,
    apiSecret: input.apiSecret ?? env.BINANCE_API_SECRET,
    baseUrl: input.baseUrl ?? env.BINANCE_BASE_URL ?? "https://api.binance.com",
    testnetBaseUrl: input.testnetBaseUrl ?? env.BINANCE_TESTNET_BASE_URL ?? "https://testnet.binance.vision",
    allowedSymbols,
    maxNotionalPerOrder: input.maxNotionalPerOrder ?? parseLimit(env.BINANCE_MAX_NOTIONAL_PER_ORDER, 100),
    maxDailyNotional: input.maxDailyNotional ?? parseLimit(env.BINANCE_MAX_DAILY_NOTIONAL, 500),
    maxOpenOrders: input.maxOpenOrders ?? parseLimit(env.BINANCE_MAX_OPEN_ORDERS, 5),
    allocationMode: input.allocationMode ?? parseAllocationMode(env.BINANCE_ALLOCATION_MODE),
    minConfidence: input.minConfidence ?? parseNumber(env.BINANCE_MIN_CONFIDENCE, 0.55),
    minTrust: input.minTrust ?? parseNumber(env.BINANCE_MIN_TRUST, 0.55),
    strategyEquityCap: input.strategyEquityCap ?? parseNumber(env.BINANCE_STRATEGY_EQUITY_CAP, Number.POSITIVE_INFINITY),
    accountEquityOverride: input.accountEquityOverride ?? parseNumber(env.BINANCE_ACCOUNT_EQUITY_OVERRIDE, 20),
    staleDecisionMs: input.staleDecisionMs ?? parseNumber(env.BINANCE_STALE_DECISION_MS, 5 * 60_000),
    staleSyncMs: input.staleSyncMs ?? parseNumber(env.BINANCE_STALE_SYNC_MS, 2 * 60_000),
    cooldownMs: input.cooldownMs ?? parseNumber(env.BINANCE_DECISION_COOLDOWN_MS, 15_000),
    recvWindow: input.recvWindow ?? parseNumber(env.BINANCE_RECV_WINDOW_MS, 5_000),
    allowMarketOrders: input.allowMarketOrders ?? parseBoolean(env.ALLOW_MARKET_ORDERS, false),
    confirmLiveTrading: input.confirmLiveTrading ?? parseBoolean(env.BINANCE_CONFIRM_LIVE_TRADING, false),
    liveTradingEnabled: input.liveTradingEnabled ?? parseBoolean(env.BINANCE_LIVE_TRADING_ENABLED, false),
    riskGuard: {
      liveTradingApproved:
        input.riskGuard?.liveTradingApproved === true ||
        parseBoolean(env.BINANCE_RISK_GUARD_LIVE_TRADING_APPROVED, false),
      marketOrdersApproved:
        input.riskGuard?.marketOrdersApproved === true ||
        parseBoolean(env.BINANCE_RISK_GUARD_MARKET_ORDERS_APPROVED, false),
    },
    stateFile:
      input.stateFile ??
      env.BINANCE_EXECUTION_STATE_FILE ??
      defaultExecutionStateFile(env),
    exchangeInfoTtlMs: input.exchangeInfoTtlMs ?? parseNumber(env.BINANCE_EXCHANGE_INFO_TTL_MS, 30 * 60_000),
    requestTimeoutMs: input.requestTimeoutMs ?? parseNumber(env.BINANCE_REQUEST_TIMEOUT_MS, 10_000),
    fetch: fetchImpl,
    validationErrors: [],
  };

  config.validationErrors = validateBinanceExecutionConfig(config);
  return config;
}

export function validateBinanceExecutionConfig(config: BinanceExecutionConfig) {
  const errors: string[] = [];

  if (!["dry_run", "testnet", "live"].includes(config.mode)) {
    errors.push("invalid_mode");
  }

  if (!config.fetch) {
    errors.push("fetch_unavailable");
  }

  if (!config.allowedSymbols.length) {
    errors.push("allowed_symbols_required");
  }

  for (const [key, value] of Object.entries({
    maxNotionalPerOrder: config.maxNotionalPerOrder,
    maxDailyNotional: config.maxDailyNotional,
    maxOpenOrders: config.maxOpenOrders,
  })) {
    if ((!Number.isFinite(value) && value !== Number.POSITIVE_INFINITY) || value < 0) errors.push(`${key}_invalid`);
  }

  for (const [key, value] of Object.entries({
    minConfidence: config.minConfidence,
    minTrust: config.minTrust,
    staleDecisionMs: config.staleDecisionMs,
    staleSyncMs: config.staleSyncMs,
    recvWindow: config.recvWindow,
  })) {
    if (!Number.isFinite(value) || value < 0) errors.push(`${key}_invalid`);
  }

  if (config.mode === "testnet" || config.mode === "live") {
    if (!config.apiKey) errors.push("api_key_required");
    if (!config.apiSecret) errors.push("api_secret_required");
  }

  if (config.mode === "live") {
    if (config.liveTradingEnabled !== true) errors.push("live_trading_env_disabled");
    if (config.confirmLiveTrading !== true) errors.push("live_trading_not_confirmed");
    if (config.riskGuard.liveTradingApproved !== true) errors.push("live_trading_not_approved");
  }

  return errors;
}
