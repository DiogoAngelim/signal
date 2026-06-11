import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  type BinanceExecutionDecision,
  BinanceRateLimitError,
  type BinanceSymbolInfo,
  CircuitBreaker,
  ExecutionMetrics,
  ExecutionStateStore,
  PositionReconciler,
  RateLimiter,
  allSymbolsAllowed,
  allocateProportionalNotional,
  canonicalQuery,
  createBinanceExecutionModule,
  createClientOrderId,
  loadBinanceExecutionConfig,
  mapStrategySignalToBinanceDecision,
  normalizePrice,
  normalizeQuantity,
  signQuery,
  validateOrderAgainstExchangeFilters,
} from "../index";

const symbolInfo: BinanceSymbolInfo = {
  symbol: "BTCUSDT",
  status: "TRADING",
  baseAsset: "BTC",
  quoteAsset: "USDT",
  filters: [
    {
      filterType: "LOT_SIZE",
      minQty: "0.001",
      maxQty: "100",
      stepSize: "0.001",
    },
    {
      filterType: "MARKET_LOT_SIZE",
      minQty: "0.001",
      maxQty: "100",
      stepSize: "0.001",
    },
    {
      filterType: "PRICE_FILTER",
      minPrice: "0.01",
      maxPrice: "1000000",
      tickSize: "0.01",
    },
    { filterType: "MIN_NOTIONAL", minNotional: "10" },
    { filterType: "NOTIONAL", minNotional: "10", maxNotional: "100000" },
    { filterType: "MAX_NUM_ORDERS", maxNumOrders: 2 },
    { filterType: "MAX_POSITION", maxPosition: "10" },
  ],
};

function stateFile(name: string) {
  const dir = fs.mkdtempSync(
    path.join(os.tmpdir(), `binance-execution-${name}-`),
  );
  return path.join(dir, "state.json");
}

function decision(
  overrides: Partial<BinanceExecutionDecision> & Record<string, unknown> = {},
): BinanceExecutionDecision {
  return {
    id: "decision-1",
    symbol: "BTCUSDT",
    action: "BUY",
    confidence: 0.92,
    trust: 0.91,
    appSizePct: 1,
    strategyId: "test-strategy",
    timestamp: new Date().toISOString(),
    ...overrides,
  } as BinanceExecutionDecision;
}

test("signer creates canonical signed payloads and idempotent client order ids", () => {
  const query = canonicalQuery({
    symbol: "BTCUSDT",
    side: "BUY",
    timestamp: 10,
    ignored: undefined,
  });
  const signature = signQuery(query, "secret");
  const clientOrderId = createClientOrderId({
    decisionId: "decision-1",
    strategyId: "strategy",
    symbol: "BTCUSDT",
    action: "BUY",
  });

  assert.equal(query, "side=BUY&symbol=BTCUSDT&timestamp=10");
  assert.equal(
    signature,
    "91840934ce0b3ad73dfa100fcb753aec5d66350692c25dac301400d0e871ab8a",
  );
  assert.equal(
    clientOrderId,
    createClientOrderId({
      decisionId: "decision-1",
      strategyId: "strategy",
      symbol: "BTCUSDT",
      action: "BUY",
    }),
  );
  assert.ok(clientOrderId.length <= 36);
});

test("config uses writable serverless state path on Vercel", () => {
  const config = loadBinanceExecutionConfig(
    {},
    {
      ...process.env,
      VERCEL: "1",
      BINANCE_MODE: "dry_run",
      BINANCE_ALLOWED_SYMBOLS: "BTCUSDT",
    },
  );

  assert.equal(
    config.stateFile,
    path.join(os.tmpdir(), "binance-execution-state.json"),
  );
});

test("config requires explicit env approvals for live mode", () => {
  const blocked = loadBinanceExecutionConfig(
    {},
    {
      ...process.env,
      BINANCE_MODE: "live",
      BINANCE_API_KEY: "key",
      BINANCE_API_SECRET: "secret",
      BINANCE_ALLOWED_SYMBOLS: "BTCUSDT",
      BINANCE_LIVE_TRADING_ENABLED: "true",
      BINANCE_CONFIRM_LIVE_TRADING: "true",
      BINANCE_RISK_GUARD_LIVE_TRADING_APPROVED: "false",
    },
  );
  const approved = loadBinanceExecutionConfig(
    {},
    {
      ...process.env,
      BINANCE_MODE: "live",
      BINANCE_API_KEY: "key",
      BINANCE_API_SECRET: "secret",
      BINANCE_ALLOWED_SYMBOLS: "BTCUSDT",
      BINANCE_LIVE_TRADING_ENABLED: "true",
      BINANCE_CONFIRM_LIVE_TRADING: "true",
      BINANCE_RISK_GUARD_LIVE_TRADING_APPROVED: "true",
    },
  );

  assert.equal(
    blocked.validationErrors.includes("live_trading_not_approved"),
    true,
  );
  assert.equal(
    approved.validationErrors.includes("live_trading_not_approved"),
    false,
  );
});

test("config supports system-managed execution caps", () => {
  const config = loadBinanceExecutionConfig(
    {},
    {
      ...process.env,
      BINANCE_MODE: "live",
      BINANCE_API_KEY: "key",
      BINANCE_API_SECRET: "secret",
      BINANCE_ALLOWED_SYMBOLS: "*",
      BINANCE_LIVE_TRADING_ENABLED: "true",
      BINANCE_CONFIRM_LIVE_TRADING: "true",
      BINANCE_RISK_GUARD_LIVE_TRADING_APPROVED: "true",
      BINANCE_MAX_NOTIONAL_PER_ORDER: "system",
      BINANCE_MAX_DAILY_NOTIONAL: "system",
      BINANCE_MAX_OPEN_ORDERS: "system",
      BINANCE_ALLOCATION_MODE: "system_proportional",
    },
  );

  assert.equal(config.validationErrors.length, 0);
  assert.equal(config.maxNotionalPerOrder, Number.POSITIVE_INFINITY);
  assert.equal(config.maxDailyNotional, Number.POSITIVE_INFINITY);
  assert.equal(config.maxOpenOrders, Number.POSITIVE_INFINITY);
  assert.equal(config.allocationMode, "system_proportional");
});

test("all-symbol mode delegates symbol filtering to exchange info", async () => {
  const config = loadBinanceExecutionConfig(
    {},
    {
      ...process.env,
      BINANCE_MODE: "testnet",
      BINANCE_API_KEY: "key",
      BINANCE_API_SECRET: "secret",
      BINANCE_ALLOWED_SYMBOLS: "*",
    },
  );
  const module = createBinanceExecutionModule({
    mode: "dry_run",
    stateFile: stateFile("all-symbols"),
    allowedSymbols: ["*"],
    accountEquityOverride: 20,
    maxDailyNotional: 100,
    maxNotionalPerOrder: 100,
    minConfidence: 0.5,
    minTrust: 0.5,
  });
  const result = await module.executeDecision(
    decision({
      id: "doge-all-symbols",
      symbol: "DOGEUSDT",
      appSizePct: 0.5,
      price: 0.25,
    }),
  );

  assert.deepEqual(config.allowedSymbols, ["*"]);
  assert.equal(allSymbolsAllowed(config.allowedSymbols), true);
  assert.equal(result.status, "filled");
  assert.equal(result.order?.symbol, "DOGEUSDT");
});

test("sizing adapter preserves normalized exposure semantics", () => {
  const single = allocateProportionalNotional({
    decisions: [decision({ id: "single", appSizePct: 0.5 })],
    availableEquity: 20,
    strategyEquityCap: 20,
    maxDailyNotional: 20,
    maxOrderNotional: 20,
    minNotionalBySymbol: { BTCUSDT: 5 },
  });
  const multi = allocateProportionalNotional({
    decisions: [
      decision({ id: "btc", symbol: "BTCUSDT", appSizePct: 1 }),
      decision({ id: "eth", symbol: "ETHUSDT", appSizePct: 0.5 }),
      decision({ id: "sol", symbol: "SOLUSDT", appSizePct: 0.5 }),
    ],
    availableEquity: 20,
    strategyEquityCap: 20,
    maxDailyNotional: 20,
    maxOrderNotional: 20,
  });
  const tiny = allocateProportionalNotional({
    decisions: [decision({ id: "tiny", appSizePct: 0.1 })],
    availableEquity: 20,
    strategyEquityCap: 20,
    maxDailyNotional: 20,
    maxOrderNotional: 20,
    minNotionalBySymbol: { BTCUSDT: 5 },
  });
  const system = allocateProportionalNotional({
    decisions: [
      decision({ id: "exit", action: "EXIT", appSizePct: 1 }),
      decision({ id: "bnb", symbol: "BNBUSDT", appSizePct: 0.14 }),
      decision({ id: "sol", symbol: "SOLUSDT", appSizePct: 0.14 }),
    ],
    availableEquity: 20,
    strategyEquityCap: Number.POSITIVE_INFINITY,
    maxDailyNotional: Number.POSITIVE_INFINITY,
    maxOrderNotional: Number.POSITIVE_INFINITY,
    useFullAvailableEquity: true,
  });

  assert.equal(single[0].notional, 10);
  assert.deepEqual(
    multi.map((allocation) => allocation.notional),
    [10, 5, 5],
  );
  assert.equal(tiny[0].notional, 2);
  assert.equal(tiny[0].reasons.includes("below_min_notional"), true);
  assert.deepEqual(
    system.map((allocation) => allocation.notional),
    [0, 10, 10],
  );
  assert.equal(system[0].rejected, false);
});

test("exchange filter normalization rejects invalid orders before routing", () => {
  assert.equal(normalizeQuantity(0.123456, symbolInfo), 0.123);
  assert.equal(normalizePrice(100.019, symbolInfo), 100.01);

  const valid = validateOrderAgainstExchangeFilters(
    {
      decisionId: "d1",
      clientOrderId: "c1",
      symbol: "BTCUSDT",
      side: "BUY",
      type: "LIMIT_MAKER",
      quantity: 0.123456,
      price: 100.019,
      notional: 12.3,
    },
    symbolInfo,
  );
  const invalid = validateOrderAgainstExchangeFilters(
    {
      decisionId: "d2",
      clientOrderId: "c2",
      symbol: "BTCUSDT",
      side: "BUY",
      type: "LIMIT_MAKER",
      quantity: 0.0005,
      price: 100,
      notional: 0.05,
    },
    symbolInfo,
    { openOrderCount: 2, currentPositionQty: 10 },
  );
  const invalidPosition = validateOrderAgainstExchangeFilters(
    {
      decisionId: "d3",
      clientOrderId: "c3",
      symbol: "BTCUSDT",
      side: "BUY",
      type: "LIMIT_MAKER",
      quantity: 0.6,
      price: 100,
      notional: 60,
    },
    symbolInfo,
    { currentPositionQty: 9.5 },
  );
  const invalidSell = validateOrderAgainstExchangeFilters(
    {
      decisionId: "d4",
      clientOrderId: "c4",
      symbol: "BTCUSDT",
      side: "SELL",
      type: "LIMIT_MAKER",
      quantity: 2,
      price: 100,
      notional: 200,
    },
    symbolInfo,
    { currentPositionQty: 1 },
  );

  assert.equal(valid.ok, true);
  assert.equal(invalid.ok, false);
  assert.equal(invalid.reasons.includes("quantity_below_min"), true);
  assert.equal(invalid.reasons.includes("notional_below_min"), true);
  assert.equal(invalid.reasons.includes("max_num_orders_exceeded"), true);
  assert.equal(invalidPosition.reasons.includes("max_position_exceeded"), true);
  assert.equal(invalidSell.reasons.includes("insufficient_position"), true);
});

test("strategy sell signals map to risk-reducing exits", () => {
  const mapped = mapStrategySignalToBinanceDecision({
    symbol: "BTCUSDT",
    allocationAction: "Sell",
    signalConfidence: 86,
    trustworthiness: 82,
    expectedMove: 3.2,
    price: 100,
    suggestedExposure: 0,
    signalStatus: "risk-exit",
    timestamp: "2026-05-30T12:00:00.000Z",
  });

  assert.equal(mapped.action, "EXIT");
  assert.equal(mapped.appSizePct, 1);
  assert.equal(mapped.expectedMovePct, 3.2);
  assert.equal(mapped.price, 100);
  assert.equal(mapped.riskState, "risk-exit");
});

test("dry_run execution covers BUY, HOLD, stale, duplicate, kill switch, and min notional rejection", async () => {
  const module = createBinanceExecutionModule({
    mode: "dry_run",
    stateFile: stateFile("dry-run"),
    allowedSymbols: ["BTCUSDT"],
    accountEquityOverride: 20,
    maxDailyNotional: 100,
    maxNotionalPerOrder: 100,
    minConfidence: 0.5,
    minTrust: 0.5,
    staleSyncMs: 60_000,
  });

  const buy = await module.executeDecision(
    decision({ id: "buy-1", appSizePct: 0.5, price: 100 }),
  );
  const hold = await module.executeDecision(
    decision({ id: "hold-1", action: "HOLD", appSizePct: 1, price: 100 }),
  );
  const duplicate = await module.executeDecision(
    decision({ id: "buy-1", appSizePct: 0.5, price: 100 }),
  );
  const stale = await module.executeDecision(
    decision({
      id: "stale-1",
      appSizePct: 0.5,
      price: 100,
      timestamp: new Date(Date.now() - 600_000).toISOString(),
    }),
  );

  module.enableKillSwitch("test");
  const killed = await module.executeDecision(
    decision({ id: "killed-1", appSizePct: 0.5, price: 100 }),
  );
  module.disableKillSwitch("test-complete");

  const tiny = await createBinanceExecutionModule({
    mode: "dry_run",
    stateFile: stateFile("tiny"),
    allowedSymbols: ["BTCUSDT"],
    accountEquityOverride: 20,
  }).executeDecision(decision({ id: "tiny-1", appSizePct: 0.1, price: 100 }));

  assert.equal(buy.status, "filled");
  assert.equal(buy.order?.notional, 10);
  assert.equal(hold.status, "rejected");
  assert.equal(hold.reasons.includes("hold_decision"), true);
  assert.equal(duplicate.status, "rejected");
  assert.equal(duplicate.reasons.includes("duplicate_decision"), true);
  assert.equal(stale.status, "rejected");
  assert.equal(stale.reasons.includes("stale_decision"), true);
  assert.equal(killed.status, "rejected");
  assert.equal(killed.reasons.includes("kill_switch_active"), true);
  assert.equal(tiny.status, "rejected");
  assert.equal(tiny.reasons.includes("below_min_notional"), true);
});

test("dry_run EXIT uses actual reconciled position and cancel releases reservations", async () => {
  const module = createBinanceExecutionModule({
    mode: "dry_run",
    stateFile: stateFile("exit"),
    allowedSymbols: ["BTCUSDT"],
    accountEquityOverride: 20,
    maxDailyNotional: 100,
    maxNotionalPerOrder: 100,
    minConfidence: 0.5,
    minTrust: 0.5,
  });

  const buy = await module.executeDecision(
    decision({ id: "exit-buy", appSizePct: 1, price: 100 }),
  );
  await module.syncAccountState();
  const exit = await module.executeDecision(
    decision({ id: "exit-sell", action: "EXIT", appSizePct: 1, price: 100 }),
  );
  const cancelled = await module.cancelOrder(buy.clientOrderId ?? "");

  assert.equal(buy.status, "filled");
  assert.equal(exit.status, "filled");
  assert.equal(exit.order?.side, "SELL");
  assert.equal(cancelled.status, "cancelled");
});

test("dry_run EXIT can be capped to a requested filled buy quantity", async () => {
  const module = createBinanceExecutionModule({
    mode: "dry_run",
    stateFile: stateFile("exit-quantity"),
    allowedSymbols: ["BTCUSDT"],
    accountEquityOverride: 20,
    maxDailyNotional: 100,
    maxNotionalPerOrder: 100,
    minConfidence: 0.5,
    minTrust: 0.5,
  });

  const buy = await module.executeDecision(
    decision({ id: "exit-quantity-buy", appSizePct: 1, price: 100 }),
  );
  await module.syncAccountState();
  const exit = await module.executeDecision(
    decision({
      id: "exit-quantity-sell",
      action: "EXIT",
      appSizePct: 1,
      price: 100,
      exitQuantity: 0.1,
    }),
  );

  assert.equal(buy.status, "filled");
  assert.equal(exit.status, "filled");
  assert.equal(exit.order?.side, "SELL");
  assert.equal(exit.order?.quantity, 0.1);
  assert.equal(exit.order?.notional, 10);
});

test("state persistence survives restart and reconciliation drift is detected", () => {
  const file = stateFile("store");
  const store = new ExecutionStateStore(file);
  const now = new Date().toISOString();
  store.saveDecisionExecution({
    decisionId: "persisted",
    status: "approved",
    reasons: [],
    decision: decision({ id: "persisted" }),
    createdAt: now,
    updatedAt: now,
  });
  store.saveOrder({
    id: "order-1",
    decisionId: "persisted",
    clientOrderId: "client-1",
    symbol: "BTCUSDT",
    side: "BUY",
    type: "LIMIT_MAKER",
    status: "FILLED",
    quantity: 1,
    price: 10,
    notional: 10,
    mode: "dry_run",
    createdAt: now,
    updatedAt: now,
  });
  store.saveAccountState({
    syncedAt: now,
    equity: 20,
    availableEquity: 20,
    balances: { USDT: { free: 20, locked: 0 } },
    openOrders: [],
    fills: [],
  });

  const restarted = new ExecutionStateStore(file);
  const reconciler = new PositionReconciler(restarted, new ExecutionMetrics());
  const snapshot = reconciler.reconcile();

  assert.equal(restarted.getDecisionExecution("persisted")?.status, "approved");
  assert.equal(snapshot.driftDetected, true);
  assert.equal(snapshot.driftReasons.includes("position_drift:BTCUSDT"), true);
});

test("rate limiter retries 429s and opens kill path on 418 bans", async () => {
  let attempts = 0;
  const limiter = new RateLimiter({
    maxRetries: 1,
    baseDelayMs: 0,
    sleep: async () => undefined,
  });
  const result = await limiter.schedule(async () => {
    attempts += 1;
    if (attempts === 1)
      throw new BinanceRateLimitError("slow down", { retryAfterMs: 0 });
    return "ok";
  });

  let banned = false;
  const banLimiter = new RateLimiter({
    onIpBan: () => {
      banned = true;
    },
    sleep: async () => undefined,
  });

  await assert.rejects(
    () =>
      banLimiter.schedule(async () => {
        throw new BinanceRateLimitError("banned", { banned: true });
      }),
    /banned/,
  );

  assert.equal(result, "ok");
  assert.equal(attempts, 2);
  assert.equal(banned, true);
});

test("circuit breaker moves closed, open, half-open, and closed again", () => {
  const breaker = new CircuitBreaker({ failureThreshold: 2, coolDownMs: 0 });
  breaker.recordFailure();
  assert.equal(breaker.state, "closed");
  breaker.recordFailure();
  assert.equal(breaker.state, "open");
  assert.equal(breaker.canAttempt(), true);
  assert.equal(breaker.state, "half-open");
  breaker.recordSuccess();
  assert.equal(breaker.state, "closed");
});

test("testnet API ban activates kill switch and fails closed", async () => {
  const module = createBinanceExecutionModule({
    mode: "testnet",
    apiKey: "key",
    apiSecret: "secret",
    stateFile: stateFile("ban"),
    allowedSymbols: ["BTCUSDT"],
    fetch: async () =>
      new Response(JSON.stringify({ msg: "ip banned" }), { status: 418 }),
  });

  await module.syncAccountState();
  const state = module.getExecutionState();

  assert.equal(state.killSwitch.active, true);
  assert.match(state.killSwitch.reason ?? "", /binance_418/);
});
