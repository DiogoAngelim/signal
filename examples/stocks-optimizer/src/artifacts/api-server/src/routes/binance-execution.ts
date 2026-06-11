import { type IRouter, type Request, Router } from "express";
import { getOrCreateMarketBacktest } from "../lib/market-backtest.js";
import {
  createBinanceExecutionModule,
  mapStrategySignalToBinanceDecision,
} from "../modules/binance-execution/index.js";

const router: IRouter = Router();
const executionModule = createBinanceExecutionModule();

function parseBoolean(value: unknown, fallback = false) {
  if (value == null || value === "") return fallback;
  if (typeof value === "boolean") return value;
  return ["1", "true", "yes", "on"].includes(
    String(value).trim().toLowerCase(),
  );
}

function hasExecutionAccess(req: Request) {
  const mode = String(process.env.BINANCE_MODE ?? "dry_run")
    .trim()
    .toLowerCase();
  const secret =
    process.env.BINANCE_EXECUTION_ADMIN_SECRET?.trim() ||
    process.env.ADMIN_SECRET?.trim();
  if (!secret) return mode === "dry_run";

  const authorization = String(req.headers.authorization ?? "");
  const bearerToken = authorization.toLowerCase().startsWith("bearer ")
    ? authorization.slice("bearer ".length).trim()
    : "";
  const headerToken = String(req.headers["x-binance-execution-secret"] ?? "");
  return bearerToken === secret || headerToken === secret;
}

function hasCronAccess(req: Request) {
  const cronSecret = process.env.CRON_SECRET?.trim();
  if (!cronSecret) return false;
  const authorization = String(req.headers.authorization ?? "");
  return authorization === `Bearer ${cronSecret}`;
}

function requireExecutionAccess(req: Request, res: any) {
  if (hasExecutionAccess(req)) return true;
  res.status(401).json({
    error: "Unauthorized",
    message:
      "Binance execution endpoints require BINANCE_EXECUTION_ADMIN_SECRET or ADMIN_SECRET outside dry_run.",
  });
  return false;
}

function requireAutomationAccess(req: Request, res: any) {
  if (hasExecutionAccess(req) || hasCronAccess(req)) return true;
  res.status(401).json({
    error: "Unauthorized",
    message:
      "Automatic Binance execution requires BINANCE_EXECUTION_ADMIN_SECRET, ADMIN_SECRET, or CRON_SECRET.",
  });
  return false;
}

async function buildStrategyDecisions(req: Request) {
  const query = req.query as Record<string, unknown>;
  const body = (req.body ?? {}) as Record<string, unknown>;
  const market = String(
    body.market ??
      query.market ??
      process.env.BINANCE_AUTO_EXECUTE_MARKET ??
      "BINANCE",
  )
    .trim()
    .toUpperCase();
  const strategyId = String(
    body.strategyId ??
      query.strategyId ??
      process.env.BINANCE_AUTO_EXECUTE_STRATEGY_ID ??
      "stocks-optimizer",
  ).trim();
  const limit = Math.max(
    1,
    Math.min(
      Number(
        body.limit ??
          query.limit ??
          process.env.BINANCE_AUTO_EXECUTE_LIMIT ??
          20,
      ),
      100,
    ),
  );
  const payload = await getOrCreateMarketBacktest(market, {
    force: body.force === true || query.force === "true",
    runtimeMode: String(
      body.runtimeMode ??
        query.runtimeMode ??
        process.env.BINANCE_AUTO_EXECUTE_RUNTIME_MODE ??
        "",
    ),
  });
  const signals = Array.isArray(payload?.signals) ? payload.signals : [];
  const decisions = signals
    .slice(0, limit)
    .map((signal: Record<string, unknown>) =>
      mapStrategySignalToBinanceDecision(signal, strategyId),
    );

  return {
    market,
    strategyId,
    decisions,
    signalCount: signals.length,
    limitedTo: limit,
  };
}

async function executeStrategySignals(req: Request) {
  const payload = await buildStrategyDecisions(req);
  const results = await executionModule.executeDecisions(payload.decisions);

  return {
    ok: results.every(
      (result) => result.status !== "failed" && result.status !== "rejected",
    ),
    market: payload.market,
    strategyId: payload.strategyId,
    decisions: payload.decisions,
    results,
  };
}

router.get("/binance-execution/health", async (_req, res) => {
  res.json(await executionModule.healthCheck());
});

router.get("/binance-execution/state", async (req, res) => {
  if (!requireExecutionAccess(req, res)) return;
  res.json(executionModule.getExecutionState());
});

router.post("/binance-execution/sync", async (req, res) => {
  if (!requireExecutionAccess(req, res)) return;
  res.json({ ok: true, account: await executionModule.syncAccountState() });
});

router.post("/binance-execution/execute", async (req, res) => {
  if (!requireExecutionAccess(req, res)) return;
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
    ok: results.every(
      (result) => result.status !== "failed" && result.status !== "rejected",
    ),
    results,
  });
});

router.post("/binance-execution/execute-strategy", async (req, res) => {
  if (!requireExecutionAccess(req, res)) return;
  res.json(await executeStrategySignals(req));
});

router.get("/binance-execution/decisions", async (req, res) => {
  if (!requireAutomationAccess(req, res)) return;
  res.json({ ok: true, ...(await buildStrategyDecisions(req)) });
});

router.post("/binance-execution/decisions", async (req, res) => {
  if (!requireAutomationAccess(req, res)) return;
  res.json({ ok: true, ...(await buildStrategyDecisions(req)) });
});

router.get("/binance-execution/auto-execute", async (req, res) => {
  if (!requireAutomationAccess(req, res)) return;
  if (!parseBoolean(process.env.BINANCE_AUTO_EXECUTE_SIGNALS, false)) {
    res.json({
      ok: true,
      skipped: true,
      reason: "auto_execution_disabled",
      mode: String(process.env.BINANCE_MODE ?? "dry_run"),
    });
    return;
  }

  res.json(await executeStrategySignals(req));
});

router.post("/binance-execution/kill-switch", async (req, res) => {
  if (!requireExecutionAccess(req, res)) return;
  const action = String(req.body?.action ?? req.query.action ?? "enable")
    .trim()
    .toLowerCase();
  const reason = String(
    req.body?.reason ?? req.query.reason ?? "operator_request",
  );
  const killSwitch =
    action === "disable"
      ? executionModule.disableKillSwitch(reason)
      : executionModule.enableKillSwitch(reason);
  res.json({ ok: true, killSwitch });
});

router.delete("/binance-execution/orders/:orderId", async (req, res) => {
  if (!requireExecutionAccess(req, res)) return;
  res.json(await executionModule.cancelOrder(req.params.orderId));
});

router.delete("/binance-execution/orders", async (req, res) => {
  if (!requireExecutionAccess(req, res)) return;
  const symbol = req.query.symbol
    ? String(req.query.symbol).trim().toUpperCase()
    : undefined;
  res.json({ cancelled: await executionModule.cancelAll(symbol) });
});

export default router;
