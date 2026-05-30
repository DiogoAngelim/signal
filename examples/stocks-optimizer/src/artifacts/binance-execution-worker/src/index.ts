import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import cors from "cors";
import express, { type Request, type Response } from "express";
import {
  createBinanceExecutionModule,
  type BinanceExecutionDecision,
  type ExecutionOrderRecord,
  type ExecutionResult,
} from "../../api-server/src/modules/binance-execution/index.js";

type RunOptions = {
  force?: boolean;
  limit?: number;
  market?: string;
  runtimeMode?: string;
  strategyId?: string;
  trigger?: string;
};

type DecisionPayload = {
  ok?: boolean;
  market?: string;
  strategyId?: string;
  decisions?: BinanceExecutionDecision[];
  signalCount?: number;
  limitedTo?: number;
};

type IgnoredSignalBaseline = {
  createdAt: string;
  fingerprints: string[];
  decisions: Array<{
    strategyId?: string;
    symbol: string;
    action: string;
    riskState?: string;
    sizingMode?: string;
    appSizePct: number;
  }>;
};

type TakeProfitOrderType = "LIMIT" | "LIMIT_MAKER";

type TakeProfitCandidate = {
  buyOrderId: string;
  buyClientOrderId: string;
  symbol: string;
  status: "skipped" | "triggered" | "failed";
  reason?: string;
  entryPrice?: number;
  currentPrice?: number;
  targetPrice?: number;
  expectedMovePct?: number;
  result?: ExecutionResult;
};

type TakeProfitCheckResult = {
  ok: boolean;
  enabled: boolean;
  trigger: string;
  checkedAt: string;
  inspectedOrderCount: number;
  candidates: TakeProfitCandidate[];
};

function parseBoolean(value: unknown, fallback = false) {
  if (value == null || value === "") return fallback;
  if (typeof value === "boolean") return value;
  return ["1", "true", "yes", "on"].includes(String(value).trim().toLowerCase());
}

function parseNumber(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function envString(name: string, fallback = "") {
  return String(process.env[name] ?? fallback).trim();
}

function binanceMode() {
  return envString("BINANCE_MODE", "dry_run").toLowerCase();
}

function takeProfitEnabled() {
  return parseBoolean(process.env.BINANCE_TAKE_PROFIT_ENABLED, false);
}

function takeProfitFeeBps() {
  return Math.max(0, parseNumber(process.env.BINANCE_TAKE_PROFIT_FEE_BPS, 20));
}

function takeProfitBufferBps() {
  return Math.max(0, parseNumber(process.env.BINANCE_TAKE_PROFIT_BUFFER_BPS, 5));
}

function takeProfitOrderType(): TakeProfitOrderType {
  const value = envString("BINANCE_TAKE_PROFIT_ORDER_TYPE", "LIMIT").toUpperCase();
  return value === "LIMIT_MAKER" ? "LIMIT_MAKER" : "LIMIT";
}

function binanceBaseUrl() {
  const mode = binanceMode();
  const fallback = mode === "testnet"
    ? "https://testnet.binance.vision"
    : "https://api.binance.com";
  const envName = mode === "testnet" ? "BINANCE_TESTNET_BASE_URL" : "BINANCE_BASE_URL";
  return envString(envName, fallback).replace(/\/+$/, "");
}

function safeEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function bearerToken(req: Request) {
  const authorization = String(req.headers.authorization ?? "");
  return authorization.toLowerCase().startsWith("bearer ")
    ? authorization.slice("bearer ".length).trim()
    : "";
}

function adminSecret() {
  return envString("BINANCE_WORKER_ADMIN_SECRET") ||
    envString("BINANCE_EXECUTION_ADMIN_SECRET") ||
    envString("ADMIN_SECRET");
}

function hasAdminAccess(req: Request) {
  const secret = adminSecret();
  if (!secret) return false;
  const headerToken = String(req.headers["x-binance-execution-secret"] ?? "").trim();
  return safeEqual(bearerToken(req), secret) || safeEqual(headerToken, secret);
}

function requireAdmin(req: Request, res: Response) {
  if (hasAdminAccess(req)) return true;
  res.status(401).json({
    error: "Unauthorized",
    message: "Binance execution worker requires BINANCE_WORKER_ADMIN_SECRET, BINANCE_EXECUTION_ADMIN_SECRET, or ADMIN_SECRET.",
  });
  return false;
}

function requestOptions(req: Request): RunOptions {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const query = req.query as Record<string, unknown>;
  return {
    force: body.force === true || query.force === "true",
    limit: parseNumber(body.limit ?? query.limit ?? process.env.BINANCE_WORKER_LIMIT, 20),
    market: envString("BINANCE_WORKER_MARKET", "BINANCE") ||
      String(body.market ?? query.market ?? "BINANCE").trim().toUpperCase(),
    runtimeMode: String(body.runtimeMode ?? query.runtimeMode ?? process.env.BINANCE_WORKER_RUNTIME_MODE ?? ""),
    strategyId: String(body.strategyId ?? query.strategyId ?? process.env.BINANCE_WORKER_STRATEGY_ID ?? "stocks-optimizer").trim(),
  };
}

function optimizerBaseUrl() {
  return envString("STOCKS_OPTIMIZER_BASE_URL", "https://stocks-optimizer.vercel.app").replace(/\/+$/, "");
}

function optimizerSecret() {
  return envString("STOCKS_OPTIMIZER_EXECUTION_SECRET") ||
    envString("BINANCE_EXECUTION_ADMIN_SECRET") ||
    envString("ADMIN_SECRET");
}

function ignoreBaselineFile() {
  return envString("BINANCE_WORKER_IGNORE_BASELINE_FILE") ||
    path.resolve(process.cwd(), ".local-cache/binance-execution/ignored-current-signals.json");
}

function readIgnoredBaseline(): IgnoredSignalBaseline | null {
  try {
    const file = ignoreBaselineFile();
    if (!fs.existsSync(file)) return null;
    const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as Partial<IgnoredSignalBaseline>;
    if (!Array.isArray(parsed.fingerprints)) return null;
    return {
      createdAt: String(parsed.createdAt ?? new Date(0).toISOString()),
      fingerprints: parsed.fingerprints.map(String),
      decisions: Array.isArray(parsed.decisions) ? parsed.decisions as IgnoredSignalBaseline["decisions"] : [],
    };
  } catch {
    return null;
  }
}

function writeIgnoredBaseline(decisions: BinanceExecutionDecision[]) {
  const baseline: IgnoredSignalBaseline = {
    createdAt: new Date().toISOString(),
    fingerprints: decisions.map(decisionFingerprint),
    decisions: decisions.map((decision) => ({
      strategyId: decision.strategyId,
      symbol: decision.symbol,
      action: decision.action,
      riskState: decision.riskState,
      sizingMode: decision.sizingMode,
      appSizePct: Number(decision.appSizePct),
    })),
  };
  const file = ignoreBaselineFile();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(baseline, null, 2), "utf8");
  return baseline;
}

function clearIgnoredBaseline() {
  try {
    fs.rmSync(ignoreBaselineFile(), { force: true });
  } catch {
    // Clearing the optional baseline should not prevent other worker actions.
  }
}

function decisionFingerprint(decision: BinanceExecutionDecision) {
  return [
    String(decision.strategyId ?? ""),
    String(decision.symbol ?? "").toUpperCase(),
    String(decision.action ?? "").toUpperCase(),
    String(decision.riskState ?? "").toLowerCase(),
    String(decision.sizingMode ?? "").toLowerCase(),
    Number(decision.appSizePct ?? 0).toFixed(8),
  ].join("|");
}

function filterIgnoredDecisions(decisions: BinanceExecutionDecision[]) {
  const baseline = readIgnoredBaseline();
  const ignored = new Set(baseline?.fingerprints ?? []);
  const accepted: BinanceExecutionDecision[] = [];
  const skipped: BinanceExecutionDecision[] = [];

  for (const decision of decisions) {
    if (ignored.has(decisionFingerprint(decision))) {
      skipped.push(decision);
    } else {
      accepted.push(decision);
    }
  }

  return {
    accepted,
    skipped,
    baseline,
  };
}

function decisionUrl(options: RunOptions) {
  const url = new URL("/api/binance-execution/decisions", optimizerBaseUrl());
  url.searchParams.set("market", options.market ?? "BINANCE");
  url.searchParams.set("strategyId", options.strategyId ?? "stocks-optimizer");
  url.searchParams.set("limit", String(Math.max(1, Math.min(options.limit ?? 20, 100))));
  if (options.force) url.searchParams.set("force", "true");
  if (options.runtimeMode) url.searchParams.set("runtimeMode", options.runtimeMode);
  return url;
}

async function fetchDecisionPayload(options: RunOptions) {
  const secret = optimizerSecret();
  if (!secret) {
    throw new Error("STOCKS_OPTIMIZER_EXECUTION_SECRET or BINANCE_EXECUTION_ADMIN_SECRET is required to fetch decisions");
  }

  const response = await fetch(decisionUrl(options), {
    headers: {
      Authorization: `Bearer ${secret}`,
      "User-Agent": "stocks-optimizer-binance-worker",
    },
  });

  const text = await response.text();
  const payload = text ? JSON.parse(text) as DecisionPayload : {};
  if (!response.ok) {
    throw new Error(`decision fetch failed: ${response.status} ${JSON.stringify(payload)}`);
  }

  return {
    ...payload,
    decisions: Array.isArray(payload.decisions) ? payload.decisions : [],
  };
}

function takeProfitDecisionId(order: ExecutionOrderRecord) {
  return `tp:${order.clientOrderId}`;
}

function decisionForOrder(order: ExecutionOrderRecord, decisions: Array<{ decisionId: string; decision: BinanceExecutionDecision }>) {
  return decisions.find((record) => record.decisionId === order.decisionId)?.decision ?? null;
}

function expectedMovePctFor(decision: BinanceExecutionDecision | null) {
  const value = Number(decision?.expectedMovePct);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function entryPriceFor(order: ExecutionOrderRecord, decision: BinanceExecutionDecision | null) {
  const candidates = [
    order.price,
    decision?.price,
    order.quantity > 0 ? order.notional / order.quantity : undefined,
  ];
  for (const candidate of candidates) {
    const value = Number(candidate);
    if (Number.isFinite(value) && value > 0) return value;
  }
  return null;
}

function takeProfitTargetPrice(entryPrice: number, expectedMovePct: number) {
  const expectedMoveFraction = expectedMovePct / 100;
  const costFraction = (takeProfitFeeBps() + takeProfitBufferBps()) / 10_000;
  return Number((entryPrice * (1 + expectedMoveFraction) * (1 + costFraction)).toFixed(12));
}

function existingTakeProfitCreated(
  order: ExecutionOrderRecord,
  state: { decisions: Array<{ decisionId: string }>; orders: ExecutionOrderRecord[] },
) {
  const decisionId = takeProfitDecisionId(order);
  return state.decisions.some((decision) => decision.decisionId === decisionId) ||
    state.orders.some((existing) => existing.decisionId === decisionId);
}

async function tickerPrice(symbol: string, fallback: number) {
  const symbolOverride = envString(`BINANCE_TAKE_PROFIT_PRICE_${symbol.toUpperCase()}`);
  const dryRunOverride = envString("BINANCE_TAKE_PROFIT_DRY_RUN_PRICE");
  const override = symbolOverride || dryRunOverride;
  const overridePrice = Number(override);
  if (Number.isFinite(overridePrice) && overridePrice > 0) return overridePrice;
  if (binanceMode() === "dry_run") return fallback;

  const url = new URL("/api/v3/ticker/price", binanceBaseUrl());
  url.searchParams.set("symbol", symbol);
  const timeoutMs = Math.max(1_000, parseNumber(process.env.BINANCE_REQUEST_TIMEOUT_MS, 10_000));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      headers: { "User-Agent": "stocks-optimizer-binance-worker" },
      signal: controller.signal,
    });
    if (response.status === 418) {
      executionModule.enableKillSwitch("binance_418:take_profit_ticker");
      throw new Error("Binance IP ban protection activated during take-profit ticker check");
    }
    const payload = await response.json() as { price?: string };
    if (!response.ok) {
      throw new Error(`take-profit ticker failed: ${response.status}`);
    }
    const price = Number(payload.price);
    if (!Number.isFinite(price) || price <= 0) {
      throw new Error(`take-profit ticker returned invalid price for ${symbol}`);
    }
    return price;
  } finally {
    clearTimeout(timer);
  }
}

async function checkTakeProfitOrders(trigger = "manual"): Promise<TakeProfitCheckResult> {
  const checkedAt = new Date().toISOString();
  if (!takeProfitEnabled()) {
    return {
      ok: true,
      enabled: false,
      trigger,
      checkedAt,
      inspectedOrderCount: 0,
      candidates: [],
    };
  }

  await executionModule.syncAccountState();
  const state = executionModule.getExecutionState();
  const buyOrders = state.orders.filter((order) =>
    order.side === "BUY" &&
    order.status.toUpperCase() === "FILLED" &&
    !order.decisionId.startsWith("tp:"));
  const candidates: TakeProfitCandidate[] = [];

  for (const order of buyOrders) {
    const decision = decisionForOrder(order, state.decisions);
    const baseCandidate = {
      buyOrderId: order.id,
      buyClientOrderId: order.clientOrderId,
      symbol: order.symbol,
    };

    if (existingTakeProfitCreated(order, state)) {
      candidates.push({ ...baseCandidate, status: "skipped", reason: "take_profit_already_created" });
      continue;
    }

    const expectedMovePct = expectedMovePctFor(decision);
    if (expectedMovePct == null) {
      candidates.push({ ...baseCandidate, status: "skipped", reason: "missing_expected_move" });
      continue;
    }

    const entryPrice = entryPriceFor(order, decision);
    if (entryPrice == null) {
      candidates.push({ ...baseCandidate, status: "skipped", reason: "missing_entry_price", expectedMovePct });
      continue;
    }

    const targetPrice = takeProfitTargetPrice(entryPrice, expectedMovePct);
    try {
      const currentPrice = await tickerPrice(order.symbol, entryPrice);
      if (currentPrice < targetPrice) {
        candidates.push({
          ...baseCandidate,
          status: "skipped",
          reason: "target_not_reached",
          entryPrice,
          currentPrice,
          targetPrice,
          expectedMovePct,
        });
        continue;
      }

      const now = new Date().toISOString();
      const result = await executionModule.executeDecision({
        id: takeProfitDecisionId(order),
        symbol: order.symbol,
        action: "EXIT",
        confidence: 1,
        trust: 1,
        calibratedConfidence: 1,
        appSizePct: 1,
        suggestedNotional: Number((order.quantity * targetPrice).toFixed(8)),
        expectedMovePct,
        price: targetPrice,
        limitPrice: targetPrice,
        orderType: takeProfitOrderType(),
        exitQuantity: order.quantity,
        riskState: "take-profit",
        sizingMode: "take_profit",
        strategyId: order.strategyId,
        timestamp: now,
      });

      candidates.push({
        ...baseCandidate,
        status: result.status === "failed" || result.status === "rejected" ? "failed" : "triggered",
        reason: result.reasons[0],
        entryPrice,
        currentPrice,
        targetPrice,
        expectedMovePct,
        result,
      });
    } catch (error) {
      candidates.push({
        ...baseCandidate,
        status: "failed",
        reason: error instanceof Error ? error.message : String(error),
        entryPrice,
        targetPrice,
        expectedMovePct,
      });
    }
  }

  return {
    ok: candidates.every((candidate) => candidate.status !== "failed"),
    enabled: true,
    trigger,
    checkedAt,
    inspectedOrderCount: buyOrders.length,
    candidates,
  };
}

const app = express();
const executionModule = createBinanceExecutionModule();
const autoExecute = parseBoolean(process.env.BINANCE_WORKER_AUTO_EXECUTE, false);
const requireIgnoredBaseline = parseBoolean(
  process.env.BINANCE_WORKER_REQUIRE_IGNORE_BASELINE ??
    process.env.BINANCE_WORKER_IGNORE_BASELINE_REQUIRED,
  false,
);
const intervalMs = Math.max(10_000, parseNumber(process.env.BINANCE_WORKER_INTERVAL_MS, 60_000));
let runInFlight = false;
let lastRun: unknown = null;
let lastRunAt: string | null = null;

app.use(cors());
app.use(express.json({ limit: "2mb" }));

async function runOnce(options: RunOptions = {}) {
  if (runInFlight) {
    return {
      ok: true,
      skipped: true,
      reason: "run_in_flight",
      lastRunAt,
    };
  }

  runInFlight = true;
  try {
    const decisionPayload = await fetchDecisionPayload(options);
    const decisions = decisionPayload.decisions ?? [];
    const filtered = filterIgnoredDecisions(decisions);
    if (requireIgnoredBaseline && !filtered.baseline) {
      const takeProfit = await checkTakeProfitOrders(options.trigger ?? "manual");
      lastRunAt = new Date().toISOString();
      lastRun = {
        ok: takeProfit.ok,
        skipped: true,
        reason: "ignored_signal_baseline_missing",
        trigger: options.trigger ?? "manual",
        market: decisionPayload.market ?? options.market,
        strategyId: decisionPayload.strategyId ?? options.strategyId,
        signalCount: decisionPayload.signalCount ?? decisions.length,
        decisionCount: decisions.length,
        acceptedDecisionCount: 0,
        ignoredDecisionCount: 0,
        takeProfit,
        ranAt: lastRunAt,
      };
      return lastRun;
    }

    const results = filtered.accepted.length
      ? await executionModule.executeDecisions(filtered.accepted)
      : (await executionModule.syncAccountState(), []);
    const takeProfit = await checkTakeProfitOrders(options.trigger ?? "manual");
    const ok = results.every((result) => result.status !== "failed" && result.status !== "rejected") && takeProfit.ok;
    lastRunAt = new Date().toISOString();
    lastRun = {
      ok,
      trigger: options.trigger ?? "manual",
      market: decisionPayload.market ?? options.market,
      strategyId: decisionPayload.strategyId ?? options.strategyId,
      signalCount: decisionPayload.signalCount ?? decisions.length,
      decisionCount: decisions.length,
      acceptedDecisionCount: filtered.accepted.length,
      ignoredDecisionCount: filtered.skipped.length,
      ignoredBaselineCreatedAt: filtered.baseline?.createdAt ?? null,
      results,
      takeProfit,
      ranAt: lastRunAt,
    };
    return lastRun;
  } finally {
    runInFlight = false;
  }
}

app.get("/livez", (_req, res) => {
  res.json({
    ok: true,
    service: "binance-execution-worker",
    autoExecute,
    takeProfitEnabled: takeProfitEnabled(),
    runInFlight,
    lastRunAt,
  });
});

app.get("/health", async (_req, res) => {
  res.json({
    workerOk: true,
    autoExecute,
    requireIgnoredBaseline,
    takeProfitEnabled: takeProfitEnabled(),
    runInFlight,
    lastRunAt,
    execution: await executionModule.healthCheck(),
  });
});

app.get("/state", async (req, res) => {
  if (!requireAdmin(req, res)) return;
  res.json({
    worker: {
      autoExecute,
      requireIgnoredBaseline,
      takeProfitEnabled: takeProfitEnabled(),
      runInFlight,
      lastRunAt,
      lastRun,
      optimizerBaseUrl: optimizerBaseUrl(),
      ignoredBaseline: readIgnoredBaseline(),
    },
    execution: executionModule.getExecutionState(),
  });
});

app.get("/ignored-signals", async (req, res) => {
  if (!requireAdmin(req, res)) return;
  res.json({
    ok: true,
    file: ignoreBaselineFile(),
    baseline: readIgnoredBaseline(),
  });
});

app.post("/ignore-current", async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const options = requestOptions(req);
  const decisionPayload = await fetchDecisionPayload(options);
  const decisions = decisionPayload.decisions ?? [];
  const baseline = writeIgnoredBaseline(decisions);
  res.json({
    ok: true,
    market: decisionPayload.market ?? options.market,
    strategyId: decisionPayload.strategyId ?? options.strategyId,
    ignoredDecisionCount: baseline.fingerprints.length,
    baseline,
  });
});

app.delete("/ignored-signals", async (req, res) => {
  if (!requireAdmin(req, res)) return;
  clearIgnoredBaseline();
  res.json({ ok: true, cleared: true, file: ignoreBaselineFile() });
});

app.post("/sync", async (req, res) => {
  if (!requireAdmin(req, res)) return;
  res.json({ ok: true, account: await executionModule.syncAccountState() });
});

app.get("/take-profit/check", async (req, res) => {
  if (!requireAdmin(req, res)) return;
  res.json(await checkTakeProfitOrders("manual"));
});

app.post("/take-profit/check", async (req, res) => {
  if (!requireAdmin(req, res)) return;
  res.json(await checkTakeProfitOrders("manual"));
});

app.post("/execute", async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const decisions = Array.isArray(req.body?.decisions)
    ? req.body.decisions
    : req.body?.decision
      ? [req.body.decision]
      : [];
  if (!decisions.length) {
    res.status(400).json({ error: "decision or decisions is required" });
    return;
  }

  const results = await executionModule.executeDecisions(decisions);
  res.json({
    ok: results.every((result) => result.status !== "failed" && result.status !== "rejected"),
    results,
  });
});

app.get("/run-once", async (req, res) => {
  if (!requireAdmin(req, res)) return;
  res.json(await runOnce({ ...requestOptions(req), trigger: "manual" }));
});

app.post("/run-once", async (req, res) => {
  if (!requireAdmin(req, res)) return;
  res.json(await runOnce({ ...requestOptions(req), trigger: "manual" }));
});

app.post("/kill-switch", async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const action = String(req.body?.action ?? req.query.action ?? "enable").trim().toLowerCase();
  const reason = String(req.body?.reason ?? req.query.reason ?? "operator_request");
  const killSwitch = action === "disable"
    ? executionModule.disableKillSwitch(reason)
    : executionModule.enableKillSwitch(reason);
  res.json({ ok: true, killSwitch });
});

app.delete("/orders/:orderId", async (req, res) => {
  if (!requireAdmin(req, res)) return;
  res.json(await executionModule.cancelOrder(req.params.orderId));
});

app.delete("/orders", async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const symbol = req.query.symbol ? String(req.query.symbol).trim().toUpperCase() : undefined;
  res.json({ cancelled: await executionModule.cancelAll(symbol) });
});

function scheduleNextRun(delayMs = intervalMs) {
  setTimeout(async () => {
    try {
      await runOnce({
        limit: parseNumber(process.env.BINANCE_WORKER_LIMIT, 20),
        market: envString("BINANCE_WORKER_MARKET", "BINANCE"),
        runtimeMode: envString("BINANCE_WORKER_RUNTIME_MODE"),
        strategyId: envString("BINANCE_WORKER_STRATEGY_ID", "stocks-optimizer"),
        trigger: "interval",
      });
    } catch (error) {
      console.warn("binance worker auto-run failed", {
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      scheduleNextRun();
    }
  }, Math.max(0, delayMs)).unref();
}

if (autoExecute) {
  scheduleNextRun(0);
}

const port = parseNumber(process.env.PORT, 8787);
app.listen(port, () => {
  console.log("binance execution worker listening", {
    port,
    mode: process.env.BINANCE_MODE ?? "dry_run",
    autoExecute,
    requireIgnoredBaseline,
    takeProfitEnabled: takeProfitEnabled(),
    intervalMs,
    optimizerBaseUrl: optimizerBaseUrl(),
  });
});
