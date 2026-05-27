const crypto = require("crypto");
const { query } = require("./_lib/db.js");
const { getCache, setCache, acquireLock } = require("./_quote-cache.js");
const {
  buildBacktestFromSharedEngine,
  runStrategyForMarketAtIndex,
  computeMetrics,
  numeric,
  generateConservativeConfigs,
  optimizeConfigsOnBars,
} = require("./_strategy/engine.js");



const STRATEGY_ENGINE_VERSION = "2026.05.25-v1";
const CONFIG_SCHEMA_VERSION = "1";
const INDICATOR_MODEL_VERSION = "core-indicators-v1";
const ALLOCATION_MODEL_VERSION = "constrained-shrinkage-mpt-v1";
const EXECUTION_MODEL_VERSION = "long-only-next-bar-spread-slippage-v1";

function strategyVersionPayload() {
  return {
    strategyEngineVersion: STRATEGY_ENGINE_VERSION,
    configSchemaVersion: CONFIG_SCHEMA_VERSION,
    indicatorModelVersion: INDICATOR_MODEL_VERSION,
    allocationModelVersion: ALLOCATION_MODEL_VERSION,
    executionModelVersion: EXECUTION_MODEL_VERSION,
  };
}

const WRITE_ACTIONS = new Set([
  "migrate",
  "live-market",
  "backtest-market",
  "optimize-market",
  "walk-forward-market",
  "forward-validate",
  "cron-backtest",
  "cron-optimize",
  "cron-walk-forward",
  "cron-forward-validate",
  "create-job",
  "run-job",
  "cancel-job",
  "claim-next-job",
  "set-control",
  "retire-config",
  "force-cash",
]);

const READ_ACTIONS = new Set([
  "signals",
  "best-configs",
  "backtest-summary",
  "backtest-history",
  "walk-forward-summary",
  "walk-forward-history",
  "walk-forward-signals",
  "walk-forward-trades",
  "job-status",
  "control-state",
  "audit-log",
]);

function requestAction(req) {
  const url = new URL(req.url, "https://stocks-optimizer.vercel.app");
  return String(url.searchParams.get("action") || "").trim();
}

function bearerToken(req) {
  const header = req.headers?.authorization || req.headers?.Authorization || "";
  const value = Array.isArray(header) ? header[0] : header;
  return String(value).replace(/^Bearer\s+/i, "").trim();
}

function isCronAuthorized(req) {
  const url = new URL(req.url, "https://stocks-optimizer.vercel.app");
  const secret = url.searchParams.get("secret");
  return Boolean(process.env.CRON_SECRET && secret === process.env.CRON_SECRET);
}

function isAdminAuthorized(req) {
  if (!process.env.ADMIN_SECRET) return true;
  return bearerToken(req) === process.env.ADMIN_SECRET || isCronAuthorized(req);
}

function requireAdmin(req, res) {
  const action = requestAction(req);

  if (!WRITE_ACTIONS.has(action)) return true;

  if (isAdminAuthorized(req)) return true;

  res.status(401).json({
    error: "UNAUTHORIZED_ADMIN_ROUTE",
    action,
    message: "This strategy route requires ADMIN_SECRET authorization.",
  });

  return false;
}

function jsonSafe(value) {
  try {
    return JSON.stringify(value ?? {});
  } catch {
    return JSON.stringify({ serializationError: true });
  }
}

async function createStrategyJob({ market, jobType, status = "queued", params = {}, createdBy = "system" }) {
  const result = await query(
    `
    INSERT INTO strategy_jobs (
      market,
      job_type,
      status,
      params,
      created_by,
      created_at,
      updated_at
    )
    VALUES ($1,$2,$3,$4,$5,now(),now())
    RETURNING id
    `,
    [market, jobType, status, jsonSafe(params), createdBy],
  );

  return result.rows[0]?.id;
}

async function updateStrategyJob(jobId, patch = {}) {
  if (!jobId) return;

  await query(
    `
    UPDATE strategy_jobs
    SET
      status = COALESCE($2, status),
      progress = COALESCE($3, progress),
      cursor_value = COALESCE($4, cursor_value),
      error = COALESCE($5, error),
      summary = COALESCE($6, summary),
      started_at = COALESCE($7, started_at),
      completed_at = COALESCE($8, completed_at),
      updated_at = now()
    WHERE id = $1
    `,
    [
      jobId,
      patch.status ?? null,
      patch.progress ?? null,
      patch.cursorValue ?? null,
      patch.error ?? null,
      patch.summary == null ? null : jsonSafe(patch.summary),
      patch.startedAt ?? null,
      patch.completedAt ?? null,
    ],
  );
}

async function auditStrategyEvent({
  market,
  eventType,
  configId = null,
  previousConfigId = null,
  decision = null,
  reason = null,
  payload = {},
}) {
  await query(
    `
    INSERT INTO strategy_audit_log (
      market,
      event_type,
      config_id,
      previous_config_id,
      decision,
      reason,
      payload,
      created_at
    )
    VALUES ($1,$2,$3,$4,$5,$6,$7,now())
    `,
    [
      market,
      eventType,
      configId,
      previousConfigId,
      decision,
      reason,
      jsonSafe({
        ...strategyVersionPayload(),
        ...(payload || {}),
      }),
    ],
  );
}

async function getStrategyControls(market) {
  const { rows } = await query(
    `
    SELECT *
    FROM strategy_controls
    WHERE market = $1 OR market = '*'
    ORDER BY CASE WHEN market = $1 THEN 0 ELSE 1 END
    LIMIT 1
    `,
    [market],
  );

  const row = rows[0];

  return {
    market,
    disableLiveSignals: Boolean(row?.disable_live_signals),
    disableAutoPromotion: Boolean(row?.disable_auto_promotion),
    forceCashMode: Boolean(row?.force_cash_mode),
    pauseMarket: Boolean(row?.pause_market),
    maxLiveDrawdownPct: row?.max_live_drawdown_pct == null ? 8 : Number(row.max_live_drawdown_pct),
    staleSignalMinutes: row?.stale_signal_minutes == null ? 180 : Number(row.stale_signal_minutes),
    payload: row?.payload ?? {},
  };
}

async function ensureMarketIsAllowedForWrite(market, res) {
  const controls = await getStrategyControls(market);

  if (controls.pauseMarket) {
    res.status(423).json({
      error: "MARKET_PAUSED",
      market,
      controls,
    });
    return null;
  }

  return controls;
}

async function latestBarFreshness(market) {
  try {
    const { rows } = await query(
      `
      SELECT
        MAX(date) AS latest_bar_date,
        COUNT(DISTINCT symbol)::int AS symbols
      FROM stock_price_history
      WHERE market = $1
      `,
      [market],
    );

    const row = rows[0] || {};
    const latest = row.latest_bar_date ? new Date(row.latest_bar_date) : null;

    if (!latest) {
      return {
        fresh: false,
        reason: "NO_BARS",
        latestBarDate: null,
        symbols: 0,
        ageDays: null,
      };
    }

    const ageDays = Math.max(0, (Date.now() - latest.getTime()) / 86_400_000);

    return {
      fresh: ageDays <= 7,
      reason: ageDays <= 7 ? "FRESH" : "STALE_BARS",
      latestBarDate: latest.toISOString().slice(0, 10),
      symbols: Number(row.symbols || 0),
      ageDays,
    };
  } catch (error) {
    return {
      fresh: false,
      reason: "FRESHNESS_CHECK_FAILED",
      error: error.message,
    };
  }
}



const ADMIN_READ_ACTIONS = new Set([
  "audit-log",
  "job-status",
  "best-configs",
  "control-state",
  "walk-forward-signals",
  "walk-forward-trades",
]);

function isAdminReadAction(action) {
  return ADMIN_READ_ACTIONS.has(action);
}

function requireReadAccess(req, res) {
  const action = requestAction(req);

  if (WRITE_ACTIONS.has(action)) return true;

  if (!isAdminReadAction(action)) return true;

  if (isAdminAuthorized(req)) return true;

  if (process.env.PUBLIC_READ_SECRET) {
    const token = bearerToken(req);
    if (token === process.env.PUBLIC_READ_SECRET) return true;
  }

  res.status(401).json({
    error: "UNAUTHORIZED_READ_ROUTE",
    action,
    message: "This route exposes internal strategy data and requires authorization.",
  });

  return false;
}

function hashIdempotencyKey(value) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function explicitIdempotencyKey(req, fallbackPayload) {
  const header =
    req.headers?.["idempotency-key"] ||
    req.headers?.["Idempotency-Key"] ||
    req.headers?.["x-idempotency-key"] ||
    req.headers?.["X-Idempotency-Key"];

  const raw = Array.isArray(header) ? header[0] : header;

  if (raw) return String(raw).trim();

  return hashIdempotencyKey(fallbackPayload);
}

function normalizeSymbol(value) {
  return String(value || "").trim().toUpperCase();
}

function parseSymbolList(value) {
  if (!value) return [];

  if (Array.isArray(value)) {
    return value.map(normalizeSymbol).filter(Boolean);
  }

  if (typeof value === "string") {
    return value.split(",").map(normalizeSymbol).filter(Boolean);
  }

  return [];
}

function applySymbolControls(symbols, controls) {
  const payload = controls?.payload || {};
  const whitelist = parseSymbolList(payload.whitelistedSymbols || payload.symbolWhitelist);
  const blacklist = parseSymbolList(payload.blacklistedSymbols || payload.symbolBlacklist);
  const maxSymbols = Number(payload.maxSymbols || 0);

  let next = symbols.map(normalizeSymbol).filter(Boolean);

  if (whitelist.length) {
    const allow = new Set(whitelist);
    next = next.filter((symbol) => allow.has(symbol));
  }

  if (blacklist.length) {
    const deny = new Set(blacklist);
    next = next.filter((symbol) => !deny.has(symbol));
  }

  if (Number.isFinite(maxSymbols) && maxSymbols > 0) {
    next = next.slice(0, maxSymbols);
  }

  return next;
}

function sanitizePublicSignal(signal) {
  return {
    market: signal.market,
    symbol: signal.symbol,
    ticker: signal.ticker || signal.symbol,
    signalAction: signal.signalAction,
    allocationAction: signal.allocationAction,
    suggestedExposure: signal.suggestedExposure,
    setupQuality: signal.setupQuality,
    riskPressure: signal.riskPressure,
    expectedMove: signal.expectedMove,
    price: signal.price,
    regime: signal.regime,
    source: signal.source,
  };
}

function sanitizePublicConfig(config) {
  return {
    market: config.market,
    configId: config.configId,
    name: config.name,
    status: config.status,
    score: config.score,
    promotedAt: config.promotedAt,
    updatedAt: config.updatedAt,
    forward: config.forward
      ? {
          observations: config.forward.observations,
          buySignals: config.forward.buySignals,
          promotionEligible: config.forward.promotionEligible,
          promotionReason: config.forward.promotionReason,
          promotedToLiveAt: config.forward.promotedToLiveAt,
        }
      : undefined,
  };
}



const HEAVY_JOB_TYPES = new Set([
  "history-sync",
  "backtest-market",
  "optimize-market",
  "walk-forward-market",
  "cron-walk-forward",
  "cron-optimize",
]);

const HEAVY_ACTION_TO_JOB_TYPE = {
  "backtest-market": "backtest-market",
  "optimize-market": "optimize-market",
  "walk-forward-market": "walk-forward-market",
  "cron-walk-forward": "cron-walk-forward",
  "cron-optimize": "cron-optimize",
};

function workerId() {
  return process.env.WORKER_ID || process.env.VERCEL_REGION || `api-${process.pid}`;
}

function retryDelaySeconds(attempts) {
  const safeAttempts = Math.max(0, Number(attempts || 0));
  return Math.min(3600, Math.round(30 * 2 ** safeAttempts));
}

async function findActiveJob({ market, jobType }) {
  const { rows } = await query(
    `
    SELECT id, status, created_at, updated_at, locked_until, attempts
    FROM strategy_jobs
    WHERE market = $1
      AND job_type = $2
      AND status IN ('queued', 'running', 'partial')
      AND (
        locked_until IS NULL
        OR locked_until > now()
        OR status IN ('queued', 'partial')
      )
    ORDER BY created_at DESC
    LIMIT 1
    `,
    [market, jobType],
  );

  return rows[0] || null;
}

async function enforceHeavyJobRateLimit({
  market,
  jobType,
  cooldownSeconds = 60,
  allowResume = true,
}) {
  if (!HEAVY_JOB_TYPES.has(jobType)) {
    return {
      allowed: true,
    };
  }

  const active = await findActiveJob({ market, jobType });

  if (active) {
    return {
      allowed: false,
      reason: "ACTIVE_JOB_EXISTS",
      activeJob: active,
      resumable: allowResume && active.status === "partial",
    };
  }

  const { rows } = await query(
    `
    SELECT id, status, completed_at, updated_at
    FROM strategy_jobs
    WHERE market = $1
      AND job_type = $2
      AND status IN ('completed', 'failed', 'cancelled', 'skipped')
    ORDER BY updated_at DESC
    LIMIT 1
    `,
    [market, jobType],
  );

  const recent = rows[0];

  if (recent?.updated_at) {
    const elapsedSeconds = (Date.now() - new Date(recent.updated_at).getTime()) / 1000;

    if (elapsedSeconds < cooldownSeconds) {
      return {
        allowed: false,
        reason: "COOLDOWN_ACTIVE",
        recentJob: recent,
        retryAfterSeconds: Math.ceil(cooldownSeconds - elapsedSeconds),
      };
    }
  }

  return {
    allowed: true,
  };
}

async function acquireJobLease(jobId, { leaseSeconds = 300 } = {}) {
  const lockedBy = workerId();

  const { rows } = await query(
    `
    UPDATE strategy_jobs
    SET
      status = 'running',
      attempts = attempts + 1,
      locked_until = now() + ($2::int * INTERVAL '1 second'),
      locked_by = $3,
      started_at = COALESCE(started_at, now()),
      updated_at = now()
    WHERE id = $1
      AND (
        locked_until IS NULL
        OR locked_until < now()
        OR locked_by = $3
      )
      AND status IN ('queued', 'running', 'partial')
      AND attempts < max_attempts
    RETURNING *
    `,
    [jobId, leaseSeconds, lockedBy],
  );

  return rows[0] || null;
}

async function markJobFailedWithRetry(jobId, error, summary = {}) {
  const { rows } = await query(
    `
    SELECT attempts, max_attempts
    FROM strategy_jobs
    WHERE id = $1
    `,
    [jobId],
  );

  const job = rows[0];
  const attempts = Number(job?.attempts || 0);
  const maxAttempts = Number(job?.max_attempts || 3);
  const canRetry = attempts < maxAttempts;
  const delay = retryDelaySeconds(attempts);

  await updateStrategyJob(jobId, {
    status: canRetry ? "queued" : "failed",
    error: error?.message || String(error),
    completedAt: canRetry ? null : new Date().toISOString(),
    summary: {
      ...summary,
      canRetry,
      nextRetryInSeconds: canRetry ? delay : null,
    },
  });

  if (canRetry) {
    await query(
      `
      UPDATE strategy_jobs
      SET
        next_run_at = now() + ($2::int * INTERVAL '1 second'),
        locked_until = NULL,
        locked_by = NULL,
        updated_at = now()
      WHERE id = $1
      `,
      [jobId, delay],
    );
  }
}

async function releaseJobLease(jobId) {
  if (!jobId) return;

  await query(
    `
    UPDATE strategy_jobs
    SET locked_until = NULL,
        locked_by = NULL,
        updated_at = now()
    WHERE id = $1
    `,
    [jobId],
  );
}


function marketKey(value) {
  return String(value || "").trim().toUpperCase();
}

function routeName(req) {
  const url = new URL(req.url, "https://stocks-optimizer.vercel.app");
  return String(url.searchParams.get("action") || "").trim();
}

function getBody(req) {
  if (!req.body) return {};
  if (typeof req.body === "string") return JSON.parse(req.body || "{}");
  return req.body;
}

function normalizeDate(value) {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

async function handleMigrate(req, res) {
  await query(`
    CREATE TABLE IF NOT EXISTS strategy_live_signals (
      market TEXT NOT NULL,
      symbol TEXT NOT NULL,
      timestamp TIMESTAMPTZ NOT NULL,
      signal_action TEXT NOT NULL,
      allocation_action TEXT NOT NULL,
      signal_status TEXT NOT NULL DEFAULT 'provided',
      suggested_exposure NUMERIC NOT NULL DEFAULT 0,
      setup_quality NUMERIC,
      risk_pressure NUMERIC,
      trend_quality NUMERIC,
      timing_quality NUMERIC,
      expected_move NUMERIC,
      price NUMERIC,
      regime TEXT,
      payload JSONB,
      source TEXT NOT NULL DEFAULT 'shared-strategy-engine',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (market, symbol)
    );

    CREATE TABLE IF NOT EXISTS strategy_backtest_equity_curve (
      market TEXT NOT NULL,
      config_id TEXT NOT NULL DEFAULT 'default',
      date DATE NOT NULL,
      equity NUMERIC NOT NULL,
      return_pct NUMERIC NOT NULL,
      deployed_pct NUMERIC NOT NULL,
      cash_pct NUMERIC NOT NULL,
      positions_count INTEGER NOT NULL DEFAULT 0,
      regime TEXT,
      source TEXT NOT NULL DEFAULT 'shared-strategy-engine',
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (market, config_id, date)
    );

    CREATE TABLE IF NOT EXISTS strategy_backtest_metrics (
      market TEXT NOT NULL,
      config_id TEXT NOT NULL DEFAULT 'default',
      total_return_pct NUMERIC,
      annualized_sharpe NUMERIC,
      average_duration_days NUMERIC,
      profit_factor NUMERIC,
      win_rate_pct NUMERIC,
      max_drawdown_pct NUMERIC,
      equity NUMERIC,
      source TEXT NOT NULL DEFAULT 'shared-strategy-engine',
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (market, config_id)
    );

    CREATE TABLE IF NOT EXISTS strategy_backtest_signals (
      market TEXT NOT NULL,
      config_id TEXT NOT NULL DEFAULT 'default',
      symbol TEXT NOT NULL,
      timestamp DATE NOT NULL,
      signal_action TEXT NOT NULL,
      allocation_action TEXT NOT NULL,
      suggested_exposure NUMERIC NOT NULL DEFAULT 0,
      setup_quality NUMERIC,
      risk_pressure NUMERIC,
      trend_quality NUMERIC,
      timing_quality NUMERIC,
      expected_move NUMERIC,
      price NUMERIC,
      regime TEXT,
      source TEXT NOT NULL DEFAULT 'shared-strategy-engine',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (market, config_id, symbol, timestamp)
    );

    CREATE INDEX IF NOT EXISTS idx_strategy_live_signals_market
      ON strategy_live_signals (market, allocation_action, setup_quality DESC);

    CREATE INDEX IF NOT EXISTS idx_strategy_backtest_equity_market_date
      ON strategy_backtest_equity_curve (market, config_id, date);

    CREATE INDEX IF NOT EXISTS idx_strategy_backtest_signals_market_date
      ON strategy_backtest_signals (market, config_id, timestamp);

    CREATE TABLE IF NOT EXISTS strategy_configs (
      market TEXT NOT NULL,
      config_id TEXT NOT NULL,
      name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'candidate',
      config JSONB NOT NULL,
      score NUMERIC,
      train_score NUMERIC,
      test_score NUMERIC,
      metrics JSONB,
      promoted_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (market, config_id)
    );

    CREATE TABLE IF NOT EXISTS strategy_optimization_runs (
      id BIGSERIAL PRIMARY KEY,
      market TEXT NOT NULL,
      status TEXT NOT NULL,
      config_limit INTEGER NOT NULL,
      symbol_limit INTEGER NOT NULL,
      best_config_id TEXT,
      best_score NUMERIC,
      summary JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      completed_at TIMESTAMPTZ
    );

    CREATE INDEX IF NOT EXISTS idx_strategy_configs_market_status
      ON strategy_configs (market, status, score DESC);

    CREATE TABLE IF NOT EXISTS strategy_walkforward_segments (
      id BIGSERIAL PRIMARY KEY,
      market TEXT NOT NULL,
      config_id TEXT NOT NULL,
      segment_index INTEGER NOT NULL,
      train_start DATE NOT NULL,
      train_end DATE NOT NULL,
      test_start DATE NOT NULL,
      test_end DATE NOT NULL,
      train_score NUMERIC,
      test_score NUMERIC,
      selected_config JSONB,
      metrics JSONB,
      source TEXT NOT NULL DEFAULT 'walk-forward-shared-engine',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (market, config_id, segment_index)
    );

    CREATE TABLE IF NOT EXISTS strategy_walkforward_equity_curve (
      market TEXT NOT NULL,
      config_id TEXT NOT NULL DEFAULT 'rolling',
      date DATE NOT NULL,
      equity NUMERIC NOT NULL,
      return_pct NUMERIC NOT NULL,
      deployed_pct NUMERIC NOT NULL,
      cash_pct NUMERIC NOT NULL,
      positions_count INTEGER NOT NULL DEFAULT 0,
      segment_index INTEGER NOT NULL,
      selected_config_id TEXT,
      regime TEXT,
      source TEXT NOT NULL DEFAULT 'walk-forward-shared-engine',
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (market, config_id, date)
    );

    CREATE TABLE IF NOT EXISTS strategy_walkforward_metrics (
      market TEXT NOT NULL,
      config_id TEXT NOT NULL DEFAULT 'rolling',
      total_return_pct NUMERIC,
      annualized_sharpe NUMERIC,
      average_duration_days NUMERIC,
      profit_factor NUMERIC,
      win_rate_pct NUMERIC,
      max_drawdown_pct NUMERIC,
      equity NUMERIC,
      segments INTEGER,
      source TEXT NOT NULL DEFAULT 'walk-forward-shared-engine',
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (market, config_id)
    );

    CREATE INDEX IF NOT EXISTS idx_strategy_walkforward_equity_market_date
      ON strategy_walkforward_equity_curve (market, config_id, date);

    CREATE INDEX IF NOT EXISTS idx_strategy_walkforward_segments_market
      ON strategy_walkforward_segments (market, config_id, segment_index);

    CREATE TABLE IF NOT EXISTS strategy_walkforward_signals (
      market TEXT NOT NULL,
      run_id TEXT NOT NULL DEFAULT 'rolling',
      segment_index INTEGER NOT NULL,
      symbol TEXT NOT NULL,
      timestamp DATE NOT NULL,
      selected_config_id TEXT NOT NULL,
      signal_action TEXT NOT NULL,
      allocation_action TEXT NOT NULL,
      suggested_exposure NUMERIC NOT NULL DEFAULT 0,
      setup_quality NUMERIC,
      risk_pressure NUMERIC,
      trend_quality NUMERIC,
      timing_quality NUMERIC,
      expected_move NUMERIC,
      price NUMERIC,
      regime TEXT,
      payload JSONB,
      source TEXT NOT NULL DEFAULT 'walk-forward-shared-engine',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (market, run_id, segment_index, symbol, timestamp)
    );

    CREATE INDEX IF NOT EXISTS idx_strategy_walkforward_signals_market_date
      ON strategy_walkforward_signals (market, run_id, timestamp);

    CREATE INDEX IF NOT EXISTS idx_strategy_walkforward_signals_action
      ON strategy_walkforward_signals (market, run_id, allocation_action, setup_quality DESC);

    CREATE TABLE IF NOT EXISTS strategy_walkforward_trades (
      id BIGSERIAL PRIMARY KEY,
      market TEXT NOT NULL,
      run_id TEXT NOT NULL DEFAULT 'rolling',
      segment_index INTEGER NOT NULL,
      symbol TEXT NOT NULL,
      selected_config_id TEXT NOT NULL,
      side TEXT NOT NULL DEFAULT 'long',
      entry_date DATE NOT NULL,
      exit_date DATE,
      entry_price NUMERIC NOT NULL,
      exit_price NUMERIC,
      entry_exposure NUMERIC NOT NULL DEFAULT 0,
      exit_reason TEXT,
      pnl_pct NUMERIC,
      source TEXT NOT NULL DEFAULT 'walk-forward-stateful-long-only',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS idx_strategy_walkforward_trades_market_run
      ON strategy_walkforward_trades (market, run_id, segment_index, symbol);

    CREATE INDEX IF NOT EXISTS idx_strategy_walkforward_trades_dates
      ON strategy_walkforward_trades (market, run_id, entry_date, exit_date);
  `);

  res.status(200).json({
    ok: true,
    migrated: true,
    tables: [
      "strategy_live_signals",
      "strategy_backtest_equity_curve",
      "strategy_backtest_metrics",
      "strategy_backtest_signals",
    ],
  });
}

async function loadBarsBySymbol({ market, limitSymbols = 50, controls = null }) {
  const effectiveControls = controls || (await getStrategyControls(market));

  const { rows: symbols } = await query(
    `
    SELECT symbol, COUNT(*)::int AS rows
    FROM stock_price_history
    WHERE market = $1
      AND date >= CURRENT_DATE - INTERVAL '4 years'
    GROUP BY symbol
    HAVING COUNT(*) > 80
    ORDER BY rows DESC, symbol ASC
    LIMIT $2
    `,
    [market, Math.max(limitSymbols * 3, limitSymbols)],
  );

  const rawSymbolList = symbols.map((row) => row.symbol);
  const symbolList = applySymbolControls(rawSymbolList, effectiveControls).slice(0, limitSymbols);

  if (!symbolList.length) return new Map();

  const { rows } = await query(
    `
    SELECT symbol, date, open, high, low, close, volume
    FROM stock_price_history
    WHERE market = $1
      AND symbol = ANY($2)
      AND date >= CURRENT_DATE - INTERVAL '4 years'
    ORDER BY symbol ASC, date ASC
    `,
    [market, symbolList],
  );

  const bySymbol = new Map();

  for (const row of rows) {
    const symbol = row.symbol;

    if (!bySymbol.has(symbol)) {
      bySymbol.set(symbol, []);
    }

    bySymbol.get(symbol).push({
      symbol,
      timestamp: normalizeDate(row.date),
      date: normalizeDate(row.date),
      open: Number(row.open ?? row.close),
      high: Number(row.high ?? row.close),
      low: Number(row.low ?? row.close),
      close: Number(row.close),
      volume: Number(row.volume ?? 0),
    });
  }

  return bySymbol;
}


async function saveLiveSignals(market, result) {
  for (const signal of result.signals) {
    await query(
      `
      INSERT INTO strategy_live_signals (
        market,
        symbol,
        timestamp,
        signal_action,
        allocation_action,
        signal_status,
        suggested_exposure,
        setup_quality,
        risk_pressure,
        trend_quality,
        timing_quality,
        expected_move,
        price,
        regime,
        payload,
        source,
        created_at
      )
      VALUES ($1,$2,now(),$3,$4,'provided',$5,$6,$7,$8,$9,$10,$11,$12,$13,'shared-strategy-engine',now())
      ON CONFLICT (market, symbol)
      DO UPDATE SET
        timestamp = EXCLUDED.timestamp,
        signal_action = EXCLUDED.signal_action,
        allocation_action = EXCLUDED.allocation_action,
        signal_status = EXCLUDED.signal_status,
        suggested_exposure = EXCLUDED.suggested_exposure,
        setup_quality = EXCLUDED.setup_quality,
        risk_pressure = EXCLUDED.risk_pressure,
        trend_quality = EXCLUDED.trend_quality,
        timing_quality = EXCLUDED.timing_quality,
        expected_move = EXCLUDED.expected_move,
        price = EXCLUDED.price,
        regime = EXCLUDED.regime,
        payload = EXCLUDED.payload,
        source = EXCLUDED.source,
        created_at = now()
      `,
      [
        market,
        signal.symbol,
        signal.signalAction,
        signal.allocationAction,
        signal.suggestedExposure,
        signal.setupQuality,
        signal.riskPressure,
        signal.trendQuality,
        signal.timingQuality,
        signal.expectedMove,
        signal.price,
        signal.regime,
        JSON.stringify(signal),
      ],
    );
  }
}


async function loadPromotedConfig(market) {
  const { rows } = await query(
    `
    SELECT config_id, config
    FROM strategy_configs
    WHERE market = $1
      AND status = 'promoted'
    ORDER BY promoted_at DESC NULLS LAST, score DESC NULLS LAST
    LIMIT 1
    `,
    [market],
  );

  if (!rows[0]) {
    return {
      configId: "default",
      config: {},
    };
  }

  return {
    configId: rows[0].config_id,
    config: rows[0].config || {},
  };
}

async function saveConfigResult(market, evaluation, status = "candidate") {
  const config = evaluation.config;

  await query(
    `
    INSERT INTO strategy_configs (
      market,
      config_id,
      name,
      status,
      config,
      score,
      train_score,
      test_score,
      metrics,
      updated_at
    )
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,now())
    ON CONFLICT (market, config_id)
    DO UPDATE SET
      name = EXCLUDED.name,
      status = EXCLUDED.status,
      config = EXCLUDED.config,
      score = EXCLUDED.score,
      train_score = EXCLUDED.train_score,
      test_score = EXCLUDED.test_score,
      metrics = EXCLUDED.metrics,
      strategy_engine_version = EXCLUDED.strategy_engine_version,
      config_schema_version = EXCLUDED.config_schema_version,
      indicator_model_version = EXCLUDED.indicator_model_version,
      allocation_model_version = EXCLUDED.allocation_model_version,
      execution_model_version = EXCLUDED.execution_model_version,
      updated_at = now()
    `,
    [
      market,
      config.id,
      config.name || config.id,
      status,
      JSON.stringify(config),
      evaluation.score,
      evaluation.trainScore,
      evaluation.testScore,
      JSON.stringify({
        train: evaluation.trainMetrics,
        test: evaluation.testMetrics,
        full: evaluation.fullMetrics,
        signalCount: evaluation.signalCount,
      }),
    ],
  );
}

async function promoteConfig(market, configId, status = "paper_promoted") {
  if (!["paper_promoted", "live_promoted", "promoted", "candidate", "retired"].includes(status)) {
    status = "paper_promoted";
  }

  const normalizedStatus = status === "promoted" ? "paper_promoted" : status;

  if (normalizedStatus === "paper_promoted") {
    await query(
      `
      UPDATE strategy_configs
      SET status = 'candidate',
          updated_at = now()
      WHERE market = $1
        AND status = 'paper_promoted'
      `,
      [market],
    );
  }

  if (normalizedStatus === "live_promoted") {
    await query(
      `
      UPDATE strategy_configs
      SET status = 'retired',
          updated_at = now()
      WHERE market = $1
        AND status = 'live_promoted'
      `,
      [market],
    );
  }

  await query(
    `
    UPDATE strategy_configs
    SET status = $3,
        promoted_at = now(),
        updated_at = now()
    WHERE market = $1
      AND config_id = $2
    `,
    [market, configId, normalizedStatus],
  );

  await auditStrategyEvent({
    market,
    eventType: "CONFIG_PROMOTION",
    configId,
    decision: normalizedStatus,
    reason: "PROMOTION_HELPER",
    payload: {
      status: normalizedStatus,
    },
  });
}


async function handleLiveMarket(req, res) {
  const body = req.method === "POST" ? getBody(req) : {};
  const url = new URL(req.url, "https://stocks-optimizer.vercel.app");
  const market = marketKey(body.market || url.searchParams.get("market"));
  const limitSymbols = Math.min(200, Math.max(2, Number(body.limitSymbols || url.searchParams.get("limitSymbols") || 80)));

  if (!market) {
    res.status(400).json({ error: "MARKET_REQUIRED" });
    return;
  }

  const controls = await getStrategyControls(market);

  if (controls.pauseMarket || controls.disableLiveSignals || controls.forceCashMode) {
    await auditStrategyEvent({
      market,
      eventType: "LIVE_SIGNALS_BLOCKED",
      decision: "blocked",
      reason: controls.forceCashMode
        ? "FORCE_CASH_MODE"
        : controls.disableLiveSignals
          ? "LIVE_SIGNALS_DISABLED"
          : "MARKET_PAUSED",
      payload: controls,
    });

    res.status(200).json({
      ok: true,
      market,
      regime: {
        regime: "Force Cash / Paused",
        avgQuality: 0,
        avgRisk: 100,
        breadth: 0,
        confidence: 0,
        targetExposure: 0,
      },
      signals: [],
      items: [],
      total: 0,
      controls,
      source: "strategy-controls",
    });
    return;
  }

  const freshness = await latestBarFreshness(market);

  if (!freshness.fresh) {
    await auditStrategyEvent({
      market,
      eventType: "LIVE_SIGNALS_STALE_DATA",
      decision: "blocked",
      reason: freshness.reason,
      payload: freshness,
    });

    res.status(409).json({
      error: "STALE_MARKET_DATA",
      market,
      freshness,
    });
    return;
  }

  const quality = await requireDataQualityPass(market, res, {
    minSymbols: Number(body.minQualitySymbols || 3),
    minBarsPerSymbol: Number(body.minQualityBarsPerSymbol || 80),
    maxLatestBarAgeDays: Number(body.maxLatestBarAgeDays || 7),
  });
  if (!quality) return;

  const lock = await acquireLock(`lock:strategy-live-market:${market}`, 90);

  if (!lock.acquired) {
    const cached = await getCache(`strategy:live:${market}`);
    res.status(202).json(cached || { ok: true, market, status: "already_running" });
    return;
  }

  const barsBySymbol = await loadBarsBySymbol({ market, limitSymbols });

  if (!barsBySymbol.size) {
    res.status(200).json({
      ok: false,
      market,
      reason: "NO_PRICE_HISTORY",
      signals: [],
      message: "No price history found. Run history-sync/cron-refresh first.",
    });
    return;
  }

  const indexBySymbol = new Map();

  for (const [symbol, bars] of barsBySymbol.entries()) {
    indexBySymbol.set(symbol, bars.length - 1);
  }

  const promoted = await loadPromotedConfig(market);

  const result = runStrategyForMarketAtIndex({
    market,
    barsBySymbol,
    indexBySymbol,
    config: promoted.config,
  });

  await saveLiveSignals(market, result);

  if (promoted.configId !== "default") {
    await saveForwardSignalEvents({
      market,
      configId: promoted.configId,
      configStatus: promoted.status,
      result,
    });
  }

  const payload = {
    ok: true,
    market,
    regime: result.regimeState,
    signals: result.signals,
    items: result.signals,
    total: result.signals.length,
    updatedAt: Date.now(),
    configId: promoted.configId,
    configStatus: promoted.status,
    source: "shared-strategy-engine",
  };

  await setCache(`strategy:live:${market}`, payload, 60 * 10);

  res.status(200).json(payload);
}

async function saveBacktest(market, configId, result) {
  for (const point of result.curve) {
    await query(
      `
      INSERT INTO strategy_backtest_equity_curve (
        market,
        config_id,
        date,
        equity,
        return_pct,
        deployed_pct,
        cash_pct,
        positions_count,
        regime,
        updated_at
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,now())
      ON CONFLICT (market, config_id, date)
      DO UPDATE SET
        equity = EXCLUDED.equity,
        return_pct = EXCLUDED.return_pct,
        deployed_pct = EXCLUDED.deployed_pct,
        cash_pct = EXCLUDED.cash_pct,
        positions_count = EXCLUDED.positions_count,
        regime = EXCLUDED.regime,
        updated_at = now()
      `,
      [
        market,
        configId,
        point.date,
        point.equity,
        point.returnPct,
        point.deployedPct,
        point.cashPct,
        point.positionsCount,
        point.regime || null,
      ],
    );
  }

  const metrics = result.metrics;

  await query(
    `
    INSERT INTO strategy_backtest_metrics (
      market,
      config_id,
      total_return_pct,
      annualized_sharpe,
      average_duration_days,
      profit_factor,
      win_rate_pct,
      max_drawdown_pct,
      equity,
      updated_at
    )
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,now())
    ON CONFLICT (market, config_id)
    DO UPDATE SET
      total_return_pct = EXCLUDED.total_return_pct,
      annualized_sharpe = EXCLUDED.annualized_sharpe,
      average_duration_days = EXCLUDED.average_duration_days,
      profit_factor = EXCLUDED.profit_factor,
      win_rate_pct = EXCLUDED.win_rate_pct,
      max_drawdown_pct = EXCLUDED.max_drawdown_pct,
      equity = EXCLUDED.equity,
      updated_at = now()
    `,
    [
      market,
      configId,
      metrics.totalReturnPct,
      metrics.annualizedSharpe,
      metrics.averageDurationDays,
      metrics.profitFactor,
      metrics.winRatePct,
      metrics.maxDrawdownPct,
      metrics.equity,
    ],
  );

  for (const signal of result.signals.slice(-50_000)) {
    await query(
      `
      INSERT INTO strategy_backtest_signals (
        market,
        config_id,
        symbol,
        timestamp,
        signal_action,
        allocation_action,
        suggested_exposure,
        setup_quality,
        risk_pressure,
        trend_quality,
        timing_quality,
        expected_move,
        price,
        regime
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
      ON CONFLICT (market, config_id, symbol, timestamp)
      DO UPDATE SET
        signal_action = EXCLUDED.signal_action,
        allocation_action = EXCLUDED.allocation_action,
        suggested_exposure = EXCLUDED.suggested_exposure,
        setup_quality = EXCLUDED.setup_quality,
        risk_pressure = EXCLUDED.risk_pressure,
        trend_quality = EXCLUDED.trend_quality,
        timing_quality = EXCLUDED.timing_quality,
        expected_move = EXCLUDED.expected_move,
        price = EXCLUDED.price,
        regime = EXCLUDED.regime
      `,
      [
        market,
        configId,
        signal.symbol,
        normalizeDate(signal.timestamp),
        signal.signalAction,
        signal.allocationAction,
        signal.suggestedExposure,
        signal.setupQuality,
        signal.riskPressure,
        signal.trendQuality,
        signal.timingQuality,
        signal.expectedMove,
        signal.price,
        signal.regime,
      ],
    );
  }
}

async function handleBacktestMarket(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "METHOD_NOT_ALLOWED" });
    return;
  }

  const body = getBody(req);
  const market = marketKey(body.market);
  const requestedConfigId = body.configId ? String(body.configId) : null;
  const promoted = requestedConfigId
    ? { configId: requestedConfigId, config: body.config || {} }
    : await loadPromotedConfig(market);

  const configId = requestedConfigId || promoted.configId || "default";
  const limitSymbols = Math.min(200, Math.max(2, Number(body.limitSymbols || 30)));

  if (!market) {
    res.status(400).json({ error: "MARKET_REQUIRED" });
    return;
  }

  const lock = await acquireLock(`lock:strategy-backtest-market:${market}:${configId}`, 180);

  if (!lock.acquired) {
    res.status(202).json({
      ok: true,
      market,
      configId,
      status: "already_backtesting",
    });
    return;
  }

  const barsBySymbol = await loadBarsBySymbol({ market, limitSymbols });

  if (!barsBySymbol.size) {
    res.status(200).json({
      ok: false,
      market,
      configId,
      reason: "NO_PRICE_HISTORY",
      message: "No price history found. Run history-sync/cron-refresh first.",
    });
    return;
  }

  const result = buildBacktestFromSharedEngine({
    market,
    barsBySymbol,
    config: promoted.config || {},
  });

  if (result.curve.length < 2) {
    res.status(200).json({
      ok: false,
      market,
      configId,
      reason: "INSUFFICIENT_CURVE",
      points: result.curve.length,
    });
    return;
  }

  await saveBacktest(market, configId, result);

  await setCache(
    `strategy:backtest:summary:${market}:${configId}`,
    {
      market,
      configId,
      ...result.metrics,
      updatedAt: Date.now(),
      source: "shared-strategy-engine",
    },
    60 * 10,
  );

  await setCache(
    `strategy:backtest:history:${market}:${configId}`,
    {
      market,
      configId,
      data: result.curve,
      items: result.curve,
      total: result.curve.length,
      updatedAt: Date.now(),
      source: "shared-strategy-engine",
    },
    60 * 10,
  );

  await updateStrategyJob(jobId, {
    status: endSegment >= plannedSegments.length ? "completed" : "partial",
    progress: Math.round((endSegment / Math.max(1, plannedSegments.length)) * 100),
    cursorValue: String(endSegment),
    completedAt: new Date().toISOString(),
    summary: {
      points: curve.length,
      segments: segments.length,
      metrics,
      benchmarkComparison,
      promotionDecision,
      quality,
      versions: strategyVersionPayload(),
    },
  });

  await releaseJobLease(jobId);

  res.status(200).json({
    ok: true,
    jobId,
    market,
    configId,
    symbols: barsBySymbol.size,
    points: result.curve.length,
    signals: result.signals.length,
    metrics: result.metrics,
    source: "shared-strategy-engine",
  });
}

async function handleSignals(req, res) {
  const url = new URL(req.url, "https://stocks-optimizer.vercel.app");
  const market = marketKey(url.searchParams.get("market"));

  if (!market) {
    res.status(400).json({ error: "MARKET_REQUIRED" });
    return;
  }

  const cached = await getCache(`strategy:live:${market}`);

  if (cached?.signals?.length) {
    res.status(200).json({ ...cached, cached: true });
    return;
  }

  const { rows } = await query(
    `
    SELECT *
    FROM strategy_live_signals
    WHERE market = $1
    ORDER BY setup_quality DESC NULLS LAST
    `,
    [market],
  );

  const signals = rows.map((row) => ({
    market: row.market,
    symbol: row.symbol,
    ticker: row.symbol,
    timestamp: row.timestamp,
    signalAction: row.signal_action,
    allocationAction: row.allocation_action,
    signalStatus: row.signal_status,
    suggestedExposure: Number(row.suggested_exposure),
    setupQuality: Number(row.setup_quality),
    riskPressure: Number(row.risk_pressure),
    trendQuality: Number(row.trend_quality),
    timingQuality: Number(row.timing_quality),
    expectedMove: Number(row.expected_move),
    price: Number(row.price),
    regime: row.regime,
    source: row.source,
  }));

  const publicSignals = isAdminAuthorized(req) ? signals : signals.map(sanitizePublicSignal);

  res.status(200).json({
    ok: true,
    market,
    signals: publicSignals,
    items: publicSignals,
    total: publicSignals.length,
    cached: false,
  });
}



function isForwardValidationEligible(metrics) {
  const observations = Number(metrics.observations || 0);
  const buySignals = Number(metrics.buySignals || 0);
  const avgSetupQuality = Number(metrics.avgSetupQuality);
  const avgRiskPressure = Number(metrics.avgRiskPressure);
  const daysObserved = Number(metrics.daysObserved || 0);

  if (daysObserved < 7) {
    return {
      eligible: false,
      reason: "FORWARD_WINDOW_TOO_SHORT",
    };
  }

  if (observations < 50) {
    return {
      eligible: false,
      reason: "INSUFFICIENT_FORWARD_OBSERVATIONS",
    };
  }

  if (buySignals < 5) {
    return {
      eligible: false,
      reason: "INSUFFICIENT_FORWARD_BUY_SIGNALS",
    };
  }

  if (!Number.isFinite(avgSetupQuality) || avgSetupQuality < 58) {
    return {
      eligible: false,
      reason: "LOW_FORWARD_SETUP_QUALITY",
    };
  }

  if (Number.isFinite(avgRiskPressure) && avgRiskPressure > 70) {
    return {
      eligible: false,
      reason: "HIGH_FORWARD_RISK_PRESSURE",
    };
  }

  return {
    eligible: true,
    reason: "FORWARD_VALIDATION_PASSED",
  };
}

async function evaluateForwardValidation({ market, configId, autoPromote = true }) {
  const { rows } = await query(
    `
    SELECT
      COUNT(*)::int AS observations,
      COUNT(*) FILTER (WHERE allocation_action = 'Buy')::int AS buy_signals,
      MIN(emitted_at) AS first_seen_at,
      MAX(emitted_at) AS last_seen_at,
      AVG(setup_quality)::float AS avg_setup_quality,
      AVG(risk_pressure)::float AS avg_risk_pressure,
      AVG(expected_move)::float AS avg_expected_move
    FROM strategy_forward_signal_events
    WHERE market = $1
      AND config_id = $2
    `,
    [market, configId],
  );

  const row = rows[0] || {};
  const firstSeenAt = row.first_seen_at;
  const lastSeenAt = row.last_seen_at;

  const daysObserved =
    firstSeenAt && lastSeenAt
      ? Math.max(
          0,
          (new Date(lastSeenAt).getTime() - new Date(firstSeenAt).getTime()) / 86_400_000,
        )
      : 0;

  const metrics = {
    observations: Number(row.observations || 0),
    buySignals: Number(row.buy_signals || 0),
    firstSeenAt,
    lastSeenAt,
    daysObserved,
    avgSetupQuality: row.avg_setup_quality == null ? null : Number(row.avg_setup_quality),
    avgRiskPressure: row.avg_risk_pressure == null ? null : Number(row.avg_risk_pressure),
    avgExpectedMove: row.avg_expected_move == null ? null : Number(row.avg_expected_move),
  };

  const decision = isForwardValidationEligible(metrics);

  await query(
    `
    INSERT INTO strategy_forward_validation_metrics (
      market,
      config_id,
      config_status,
      observations,
      buy_signals,
      first_seen_at,
      last_seen_at,
      avg_setup_quality,
      avg_risk_pressure,
      avg_expected_move,
      promotion_eligible,
      promotion_reason,
      promoted_to_live_at,
      metrics,
      updated_at
    )
    VALUES ($1,$2,'paper_promoted',$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,now())
    ON CONFLICT (market, config_id)
    DO UPDATE SET
      config_status = EXCLUDED.config_status,
      observations = EXCLUDED.observations,
      buy_signals = EXCLUDED.buy_signals,
      first_seen_at = EXCLUDED.first_seen_at,
      last_seen_at = EXCLUDED.last_seen_at,
      avg_setup_quality = EXCLUDED.avg_setup_quality,
      avg_risk_pressure = EXCLUDED.avg_risk_pressure,
      avg_expected_move = EXCLUDED.avg_expected_move,
      promotion_eligible = EXCLUDED.promotion_eligible,
      promotion_reason = EXCLUDED.promotion_reason,
      promoted_to_live_at = COALESCE(strategy_forward_validation_metrics.promoted_to_live_at, EXCLUDED.promoted_to_live_at),
      metrics = EXCLUDED.metrics,
      updated_at = now()
    `,
    [
      market,
      configId,
      metrics.observations,
      metrics.buySignals,
      metrics.firstSeenAt,
      metrics.lastSeenAt,
      metrics.avgSetupQuality,
      metrics.avgRiskPressure,
      metrics.avgExpectedMove,
      decision.eligible,
      decision.reason,
      decision.eligible && autoPromote ? new Date().toISOString() : null,
      JSON.stringify(metrics),
    ],
  );

  const controls = await getStrategyControls(market);

  if (decision.eligible && autoPromote && !controls.disableAutoPromotion && !controls.pauseMarket) {
    await promoteConfig(market, configId, "live_promoted");

    await auditStrategyEvent({
      market,
      eventType: "FORWARD_LIVE_PROMOTION",
      configId,
      decision: "live_promoted",
      reason: decision.reason,
      payload: {
        metrics,
        decision,
      },
    });
  } else if (decision.eligible && autoPromote) {
    await auditStrategyEvent({
      market,
      eventType: "FORWARD_PROMOTION_BLOCKED",
      configId,
      decision: "blocked",
      reason: controls.pauseMarket ? "MARKET_PAUSED" : "DISABLE_AUTO_PROMOTION",
      payload: {
        metrics,
        decision,
        controls,
      },
    });
  }

  return {
    market,
    configId,
    metrics,
    decision,
    promotedToLive: decision.eligible && autoPromote,
  };
}



async function handleForwardValidate(req, res) {
  const body = req.method === "POST" ? getBody(req) : {};
  const url = new URL(req.url, "https://stocks-optimizer.vercel.app");

  const market = marketKey(body.market || url.searchParams.get("market"));
  const autoPromote = String(body.autoPromote ?? url.searchParams.get("autoPromote") ?? "true") !== "false";

  if (!market) {
    res.status(400).json({ error: "MARKET_REQUIRED" });
    return;
  }

  const promoted = await loadPromotedConfig(market, ["paper_promoted"]);

  if (!promoted || promoted.configId === "default") {
    res.status(200).json({
      ok: false,
      market,
      reason: "NO_PAPER_PROMOTED_CONFIG",
    });
    return;
  }

  const result = await evaluateForwardValidation({
    market,
    configId: promoted.configId,
    autoPromote,
  });

  res.status(200).json({
    ok: true,
    ...result,
  });
}



async function handleSetControl(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "METHOD_NOT_ALLOWED" });
    return;
  }

  const body = getBody(req);
  const market = marketKey(body.market || "*");

  await query(
    `
    INSERT INTO strategy_controls (
      market,
      disable_live_signals,
      disable_auto_promotion,
      force_cash_mode,
      pause_market,
      max_live_drawdown_pct,
      stale_signal_minutes,
      payload,
      updated_at
    )
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,now())
    ON CONFLICT (market)
    DO UPDATE SET
      disable_live_signals = EXCLUDED.disable_live_signals,
      disable_auto_promotion = EXCLUDED.disable_auto_promotion,
      force_cash_mode = EXCLUDED.force_cash_mode,
      pause_market = EXCLUDED.pause_market,
      max_live_drawdown_pct = EXCLUDED.max_live_drawdown_pct,
      stale_signal_minutes = EXCLUDED.stale_signal_minutes,
      payload = EXCLUDED.payload,
      updated_at = now()
    `,
    [
      market,
      Boolean(body.disableLiveSignals),
      Boolean(body.disableAutoPromotion),
      Boolean(body.forceCashMode),
      Boolean(body.pauseMarket),
      Number(body.maxLiveDrawdownPct ?? 8),
      Number(body.staleSignalMinutes ?? 180),
      jsonSafe(body.payload || {}),
    ],
  );

  await auditStrategyEvent({
    market,
    eventType: "CONTROL_UPDATED",
    decision: "updated",
    reason: "ADMIN_CONTROL_CHANGE",
    payload: body,
  });

  res.status(200).json({
    ok: true,
    market,
    controls: await getStrategyControls(market),
  });
}

async function handleControlState(req, res) {
  const url = new URL(req.url, "https://stocks-optimizer.vercel.app");
  const market = marketKey(url.searchParams.get("market") || "*");

  res.status(200).json({
    ok: true,
    market,
    controls: await getStrategyControls(market),
  });
}

async function handleForceCash(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "METHOD_NOT_ALLOWED" });
    return;
  }

  const body = getBody(req);
  const market = marketKey(body.market);

  if (!market) {
    res.status(400).json({ error: "MARKET_REQUIRED" });
    return;
  }

  await query(
    `
    INSERT INTO strategy_controls (market, force_cash_mode, disable_live_signals, payload, updated_at)
    VALUES ($1,true,true,$2,now())
    ON CONFLICT (market)
    DO UPDATE SET
      force_cash_mode = true,
      disable_live_signals = true,
      payload = EXCLUDED.payload,
      updated_at = now()
    `,
    [market, jsonSafe({ reason: body.reason || "manual_force_cash" })],
  );

  await auditStrategyEvent({
    market,
    eventType: "FORCE_CASH",
    decision: "enabled",
    reason: body.reason || "manual_force_cash",
    payload: body,
  });

  res.status(200).json({
    ok: true,
    market,
    controls: await getStrategyControls(market),
  });
}



async function handleCreateJob(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "METHOD_NOT_ALLOWED" });
    return;
  }

  const body = getBody(req);
  const market = marketKey(body.market);
  const jobType = String(body.jobType || body.type || "").trim();

  if (!market || !jobType) {
    res.status(400).json({ error: "MARKET_AND_JOB_TYPE_REQUIRED" });
    return;
  }

  const jobRecord = await createStrategyJob({
    market,
    jobType,
    status: "queued",
    params: body.params || body,
    createdBy: "admin",
    maxAttempts: Math.min(10, Math.max(1, Number(body.maxAttempts || 3))),
    nextRunAt: body.nextRunAt || null,
    idempotencyKey: explicitIdempotencyKey(req, {
      action: "create-job",
      market,
      jobType,
      params: body.params || body,
    }),
  });
  const id = jobRecord.id;

  await auditStrategyEvent({
    market,
    eventType: "JOB_CREATED",
    decision: "queued",
    reason: jobType,
    payload: {
      jobId: id,
      params: body.params || body,
    },
  });

  res.status(200).json({
    ok: true,
    jobId: id,
    market,
    jobType,
    status: "queued",
  });
}



async function handleClaimNextJob(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "METHOD_NOT_ALLOWED" });
    return;
  }

  const body = getBody(req);
  const jobType = body.jobType ? String(body.jobType) : null;
  const market = body.market ? marketKey(body.market) : null;
  const leaseSeconds = Math.min(1800, Math.max(30, Number(body.leaseSeconds || 300)));
  const lockedBy = workerId();

  const params = [];
  let filters = `
    status IN ('queued', 'partial')
    AND (next_run_at IS NULL OR next_run_at <= now())
    AND (locked_until IS NULL OR locked_until < now())
    AND attempts < max_attempts
  `;

  if (jobType) {
    params.push(jobType);
    filters += ` AND job_type = $${params.length}`;
  }

  if (market) {
    params.push(market);
    filters += ` AND market = $${params.length}`;
  }

  params.push(leaseSeconds);
  params.push(lockedBy);

  const { rows } = await query(
    `
    WITH next_job AS (
      SELECT id
      FROM strategy_jobs
      WHERE ${filters}
      ORDER BY created_at ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    )
    UPDATE strategy_jobs j
    SET
      status = 'running',
      attempts = attempts + 1,
      locked_until = now() + ($${params.length - 1}::int * INTERVAL '1 second'),
      locked_by = $${params.length},
      started_at = COALESCE(started_at, now()),
      updated_at = now()
    FROM next_job
    WHERE j.id = next_job.id
    RETURNING j.*
    `,
    params,
  );

  res.status(200).json({
    ok: true,
    job: rows[0] || null,
  });
}


async function handleRunJob(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "METHOD_NOT_ALLOWED" });
    return;
  }

  const body = getBody(req);
  const jobId = body.jobId;

  if (!jobId) {
    res.status(400).json({ error: "JOB_ID_REQUIRED" });
    return;
  }

  const { rows } = await query(`SELECT * FROM strategy_jobs WHERE id = $1`, [jobId]);
  const job = rows[0];

  if (!job) {
    res.status(404).json({ error: "JOB_NOT_FOUND", jobId });
    return;
  }

  if (job.job_type !== "walk-forward-market") {
    res.status(400).json({
      error: "UNSUPPORTED_JOB_TYPE",
      jobType: job.job_type,
    });
    return;
  }

  if (job.next_run_at && new Date(job.next_run_at).getTime() > Date.now()) {
    res.status(202).json({
      ok: false,
      error: "JOB_RETRY_NOT_READY",
      jobId,
      nextRunAt: job.next_run_at,
    });
    return;
  }

  if (Number(job.attempts || 0) >= Number(job.max_attempts || 3)) {
    res.status(409).json({
      ok: false,
      error: "JOB_MAX_ATTEMPTS_REACHED",
      jobId,
      attempts: Number(job.attempts || 0),
      maxAttempts: Number(job.max_attempts || 3),
    });
    return;
  }

  const params = job.params || {};
  const nextSegment = job.cursor_value == null ? undefined : Number(job.cursor_value);

  const fakeReq = {
    ...req,
    method: "POST",
    body: {
      ...params,
      market: job.market,
      resume: true,
      reset: false,
      startSegment: Number.isFinite(nextSegment) ? nextSegment : params.startSegment,
    },
    headers: req.headers,
    url: "/api/strategy?action=walk-forward-market",
  };

  await handleWalkForwardMarket(fakeReq, res);
}

async function handleCancelJob(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "METHOD_NOT_ALLOWED" });
    return;
  }

  const body = getBody(req);
  const jobId = body.jobId;

  if (!jobId) {
    res.status(400).json({ error: "JOB_ID_REQUIRED" });
    return;
  }

  await updateStrategyJob(jobId, {
    status: "cancelled",
    completedAt: new Date().toISOString(),
    summary: {
      reason: body.reason || "manual_cancel",
    },
  });

  res.status(200).json({
    ok: true,
    jobId,
    status: "cancelled",
  });
}


async function handleJobStatus(req, res) {
  const url = new URL(req.url, "https://stocks-optimizer.vercel.app");
  const id = url.searchParams.get("jobId");
  const market = url.searchParams.get("market");

  if (id) {
    const { rows } = await query(`SELECT * FROM strategy_jobs WHERE id = $1`, [id]);
    res.status(200).json({ ok: true, job: rows[0] || null });
    return;
  }

  if (market) {
    const { rows } = await query(
      `
      SELECT *
      FROM strategy_jobs
      WHERE market = $1
      ORDER BY created_at DESC
      LIMIT 25
      `,
      [marketKey(market)],
    );
    res.status(200).json({ ok: true, jobs: rows });
    return;
  }

  const { rows } = await query(
    `
    SELECT *
    FROM strategy_jobs
    ORDER BY created_at DESC
    LIMIT 25
    `,
  );

  res.status(200).json({ ok: true, jobs: rows });
}

async function handleAuditLog(req, res) {
  const url = new URL(req.url, "https://stocks-optimizer.vercel.app");
  const market = marketKey(url.searchParams.get("market") || "");
  const limit = Math.min(200, Math.max(1, Number(url.searchParams.get("limit") || 50)));

  const params = [];
  let filter = "";

  if (market) {
    params.push(market);
    filter = "WHERE market = $1";
  }

  params.push(limit);

  const { rows } = await query(
    `
    SELECT *
    FROM strategy_audit_log
    ${filter}
    ORDER BY created_at DESC
    LIMIT $${params.length}
    `,
    params,
  );

  res.status(200).json({
    ok: true,
    market: market || null,
    events: rows,
  });
}



async function handleRetireConfig(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "METHOD_NOT_ALLOWED" });
    return;
  }

  const body = getBody(req);
  const market = marketKey(body.market);
  const configId = String(body.configId || "").trim();

  if (!market || !configId) {
    res.status(400).json({ error: "MARKET_AND_CONFIG_REQUIRED" });
    return;
  }

  await query(
    `
    UPDATE strategy_configs
    SET status = 'retired',
        updated_at = now()
    WHERE market = $1
      AND config_id = $2
    `,
    [market, configId],
  );

  await auditStrategyEvent({
    market,
    eventType: "CONFIG_RETIRED",
    configId,
    decision: "retired",
    reason: body.reason || "manual_retire",
    payload: body,
  });

  res.status(200).json({
    ok: true,
    market,
    configId,
    status: "retired",
  });
}



async function handleDataQuality(req, res) {
  const url = new URL(req.url, "https://stocks-optimizer.vercel.app");
  const market = marketKey(url.searchParams.get("market"));

  if (!market) {
    res.status(400).json({ error: "MARKET_REQUIRED" });
    return;
  }

  const quality = await evaluateDataQuality(market, {
    minSymbols: Number(url.searchParams.get("minSymbols") || 5),
    minBarsPerSymbol: Number(url.searchParams.get("minBarsPerSymbol") || 120),
    maxLatestBarAgeDays: Number(url.searchParams.get("maxLatestBarAgeDays") || 7),
    maxExtremeJumpPct: Number(url.searchParams.get("maxExtremeJumpPct") || 80),
  });

  res.status(200).json({
    ok: true,
    quality,
  });
}


async function handleBestConfigs(req, res) {
  const url = new URL(req.url, "https://stocks-optimizer.vercel.app");
  const market = marketKey(url.searchParams.get("market"));
  const limit = Math.min(20, Math.max(1, Number(url.searchParams.get("limit") || 10)));

  if (!market) {
    res.status(400).json({ error: "MARKET_REQUIRED" });
    return;
  }

  const { rows } = await query(
    `
    SELECT
      c.market,
      c.config_id,
      c.name,
      c.status,
      c.config,
      c.score,
      c.train_score,
      c.test_score,
      c.metrics,
      c.promoted_at,
      c.updated_at,
      f.observations AS forward_observations,
      f.buy_signals AS forward_buy_signals,
      f.promotion_eligible AS forward_promotion_eligible,
      f.promotion_reason AS forward_promotion_reason,
      f.promoted_to_live_at
    FROM strategy_configs c
    LEFT JOIN strategy_forward_validation_metrics f
      ON f.market = c.market
      AND f.config_id = c.config_id
    WHERE c.market = $1
    ORDER BY
      CASE
        WHEN c.status = 'live_promoted' THEN 0
        WHEN c.status = 'paper_promoted' THEN 1
        WHEN c.status = 'promoted' THEN 2
        ELSE 3
      END,
      c.score DESC NULLS LAST
    LIMIT $2
    `,
    [market, limit],
  );

  const configs = rows.map((row) => ({
    market: row.market,
    configId: row.config_id,
    name: row.name,
    status: row.status,
    config: row.config,
    score: Number(row.score),
    trainScore: Number(row.train_score),
    testScore: Number(row.test_score),
    metrics: row.metrics,
    promotedAt: row.promoted_at,
    updatedAt: row.updated_at,
    forward: {
      observations: row.forward_observations == null ? 0 : Number(row.forward_observations),
      buySignals: row.forward_buy_signals == null ? 0 : Number(row.forward_buy_signals),
      promotionEligible: row.forward_promotion_eligible,
      promotionReason: row.forward_promotion_reason,
      promotedToLiveAt: row.promoted_to_live_at,
    },
  }));

  const responseConfigs = isAdminAuthorized(req) ? configs : configs.map(sanitizePublicConfig);

  res.status(200).json({
    ok: true,
    market,
    configs: responseConfigs,
  });
}





async function handleWalkForwardTrades(req, res) {
  const url = new URL(req.url, "https://stocks-optimizer.vercel.app");
  const market = marketKey(url.searchParams.get("market"));
  const runId = String(url.searchParams.get("configId") || url.searchParams.get("runId") || "rolling");
  const limit = Math.min(5000, Math.max(1, Number(url.searchParams.get("limit") || 500)));

  if (!market) {
    res.status(400).json({ error: "MARKET_REQUIRED" });
    return;
  }

  const { rows } = await query(
    `
    SELECT
      market,
      run_id,
      segment_index,
      symbol,
      selected_config_id,
      side,
      entry_date,
      exit_date,
      entry_price,
      exit_price,
      entry_exposure,
      exit_reason,
      pnl_pct,
      source
    FROM strategy_walkforward_trades
    WHERE market = $1
      AND run_id = $2
    ORDER BY entry_date ASC, symbol ASC
    LIMIT $3
    `,
    [market, runId, limit],
  );

  const trades = rows.map((row) => ({
    market: row.market,
    runId: row.run_id,
    segmentIndex: Number(row.segment_index),
    symbol: row.symbol,
    ticker: row.symbol,
    selectedConfigId: row.selected_config_id,
    side: row.side,
    entryDate: normalizeDate(row.entry_date),
    exitDate: row.exit_date ? normalizeDate(row.exit_date) : null,
    entryPrice: Number(row.entry_price),
    exitPrice: row.exit_price == null ? null : Number(row.exit_price),
    entryExposure: Number(row.entry_exposure),
    exitReason: row.exit_reason,
    pnlPct: row.pnl_pct == null ? null : Number(row.pnl_pct),
    source: row.source,
  }));

  res.status(200).json({
    ok: true,
    market,
    runId,
    trades,
    items: trades,
    total: trades.length,
    source: "walk-forward-stateful-long-only",
  });
}


async function handleWalkForwardSignals(req, res) {
  const url = new URL(req.url, "https://stocks-optimizer.vercel.app");
  const market = marketKey(url.searchParams.get("market"));
  const runId = String(url.searchParams.get("configId") || url.searchParams.get("runId") || "rolling");
  const action = url.searchParams.get("allocationAction");
  const limit = Math.min(5000, Math.max(1, Number(url.searchParams.get("limit") || 500)));

  if (!market) {
    res.status(400).json({ error: "MARKET_REQUIRED" });
    return;
  }

  const params = [market, runId];
  let filter = "";

  if (action) {
    params.push(String(action));
    filter = `AND allocation_action = $${params.length}`;
  }

  params.push(limit);

  const { rows } = await query(
    `
    SELECT
      market,
      run_id,
      segment_index,
      symbol,
      timestamp,
      selected_config_id,
      signal_action,
      allocation_action,
      suggested_exposure,
      setup_quality,
      risk_pressure,
      trend_quality,
      timing_quality,
      expected_move,
      price,
      regime,
      source
    FROM strategy_walkforward_signals
    WHERE market = $1
      AND run_id = $2
      ${filter}
    ORDER BY timestamp ASC, setup_quality DESC NULLS LAST
    LIMIT $${params.length}
    `,
    params,
  );

  const signals = rows.map((row) => ({
    market: row.market,
    runId: row.run_id,
    segmentIndex: Number(row.segment_index),
    symbol: row.symbol,
    ticker: row.symbol,
    timestamp: normalizeDate(row.timestamp),
    selectedConfigId: row.selected_config_id,
    signalAction: row.signal_action,
    allocationAction: row.allocation_action,
    suggestedExposure: Number(row.suggested_exposure),
    setupQuality: Number(row.setup_quality),
    riskPressure: Number(row.risk_pressure),
    trendQuality: Number(row.trend_quality),
    timingQuality: Number(row.timing_quality),
    expectedMove: Number(row.expected_move),
    price: Number(row.price),
    regime: row.regime,
    source: row.source,
  }));

  res.status(200).json({
    ok: true,
    market,
    runId,
    signals,
    items: signals,
    total: signals.length,
    source: "walk-forward-shared-engine",
  });
}


async function handleWalkForwardSummary(req, res) {
  const url = new URL(req.url, "https://stocks-optimizer.vercel.app");
  const market = marketKey(url.searchParams.get("market"));
  const configId = String(url.searchParams.get("configId") || "rolling");

  if (!market) {
    res.status(400).json({ error: "MARKET_REQUIRED" });
    return;
  }

  const cached = await getCache(`strategy:walkforward:summary:${market}:${configId}`);

  if (cached) {
    res.status(200).json({ ...cached, cached: true });
    return;
  }

  const { rows } = await query(
    `
    SELECT *
    FROM strategy_walkforward_metrics
    WHERE market = $1
      AND config_id = $2
    `,
    [market, configId],
  );

  const row = rows[0];

  res.status(200).json(
    row
      ? {
          market,
          configId,
          totalReturnPct: Number(row.total_return_pct),
          annualizedSharpe: Number(row.annualized_sharpe),
          averageDurationDays: Number(row.average_duration_days),
          profitFactor: Number(row.profit_factor),
          winRatePct: Number(row.win_rate_pct),
          maxDrawdownPct: Number(row.max_drawdown_pct),
          equity: Number(row.equity),
          segments: Number(row.segments),
          benchmarkReturnPct: row.benchmark_return_pct == null ? null : Number(row.benchmark_return_pct),
          benchmarkSharpe: row.benchmark_sharpe == null ? null : Number(row.benchmark_sharpe),
          excessReturnPct: row.excess_return_pct == null ? null : Number(row.excess_return_pct),
          excessSharpe: row.excess_sharpe == null ? null : Number(row.excess_sharpe),
          cashReturnPct: 0,
          excessReturnVsCashPct: row.total_return_pct == null ? null : Number(row.total_return_pct),
          promotionEligible: row.promotion_eligible,
          promotionReason: row.promotion_reason,
          updatedAt: row.updated_at,
          source: row.source,
        }
      : {
          market,
          configId,
          totalReturnPct: null,
          annualizedSharpe: null,
          averageDurationDays: null,
          profitFactor: null,
          winRatePct: null,
          maxDrawdownPct: null,
          equity: null,
          segments: 0,
          benchmarkReturnPct: null,
          benchmarkSharpe: null,
          excessReturnPct: null,
          excessSharpe: null,
          cashReturnPct: 0,
          excessReturnVsCashPct: null,
          promotionEligible: false,
          promotionReason: "NO_WALK_FORWARD_METRICS",
          updatedAt: null,
          source: "walk-forward-shared-engine",
        },
  );
}

async function handleWalkForwardHistory(req, res) {
  const url = new URL(req.url, "https://stocks-optimizer.vercel.app");
  const market = marketKey(url.searchParams.get("market"));
  const configId = String(url.searchParams.get("configId") || "rolling");

  if (!market) {
    res.status(400).json({ error: "MARKET_REQUIRED" });
    return;
  }

  const cached = await getCache(`strategy:walkforward:history:${market}:${configId}`);

  if (cached?.data?.length) {
    res.status(200).json({ ...cached, cached: true });
    return;
  }

  const { rows } = await query(
    `
    SELECT
      date,
      equity,
      return_pct,
      deployed_pct,
      cash_pct,
      positions_count,
      segment_index,
      selected_config_id,
      regime
    FROM strategy_walkforward_equity_curve
    WHERE market = $1
      AND config_id = $2
    ORDER BY date ASC
    `,
    [market, configId],
  );

  const data = rows.map((row, index) => ({
    index,
    date: normalizeDate(row.date),
    equity: Number(row.equity),
    returnPct: Number(row.return_pct),
    deployedPct: Number(row.deployed_pct),
    cashPct: Number(row.cash_pct),
    positionsCount: Number(row.positions_count),
    segmentIndex: Number(row.segment_index),
    selectedConfigId: row.selected_config_id,
    regime: row.regime,
  }));

  res.status(200).json({
    market,
    configId,
    data,
    items: data,
    total: data.length,
    source: "walk-forward-shared-engine",
  });
}


async function handleBacktestSummary(req, res) {
  const url = new URL(req.url, "https://stocks-optimizer.vercel.app");
  const market = marketKey(url.searchParams.get("market"));
  const configId = String(url.searchParams.get("configId") || "default");

  if (!market) {
    res.status(400).json({ error: "MARKET_REQUIRED" });
    return;
  }

  const cached = await getCache(`strategy:backtest:summary:${market}:${configId}`);

  if (cached) {
    res.status(200).json({ ...cached, cached: true });
    return;
  }

  const { rows } = await query(
    `
    SELECT *
    FROM strategy_backtest_metrics
    WHERE market = $1
      AND config_id = $2
    `,
    [market, configId],
  );

  const row = rows[0];

  res.status(200).json(
    row
      ? {
          market,
          configId,
          totalReturnPct: Number(row.total_return_pct),
          annualizedSharpe: Number(row.annualized_sharpe),
          averageDurationDays: Number(row.average_duration_days),
          profitFactor: Number(row.profit_factor),
          winRatePct: Number(row.win_rate_pct),
          maxDrawdownPct: Number(row.max_drawdown_pct),
          equity: Number(row.equity),
          updatedAt: row.updated_at,
          source: row.source,
        }
      : {
          market,
          configId,
          totalReturnPct: null,
          annualizedSharpe: null,
          averageDurationDays: null,
          profitFactor: null,
          winRatePct: null,
          maxDrawdownPct: null,
          equity: null,
          updatedAt: null,
          source: "shared-strategy-engine",
        },
  );
}

async function handleBacktestHistory(req, res) {
  const url = new URL(req.url, "https://stocks-optimizer.vercel.app");
  const market = marketKey(url.searchParams.get("market"));
  const configId = String(url.searchParams.get("configId") || "default");

  if (!market) {
    res.status(400).json({ error: "MARKET_REQUIRED" });
    return;
  }

  const cached = await getCache(`strategy:backtest:history:${market}:${configId}`);

  if (cached?.data?.length) {
    res.status(200).json({ ...cached, cached: true });
    return;
  }

  const { rows } = await query(
    `
    SELECT date, equity, return_pct, deployed_pct, cash_pct, positions_count, regime
    FROM strategy_backtest_equity_curve
    WHERE market = $1
      AND config_id = $2
    ORDER BY date ASC
    `,
    [market, configId],
  );

  const data = rows.map((row, index) => ({
    index,
    date: normalizeDate(row.date),
    equity: Number(row.equity),
    returnPct: Number(row.return_pct),
    deployedPct: Number(row.deployed_pct),
    cashPct: Number(row.cash_pct),
    positionsCount: Number(row.positions_count),
    regime: row.regime,
  }));

  res.status(200).json({
    market,
    configId,
    data,
    items: data,
    total: data.length,
    source: "shared-strategy-engine",
  });
}



function collectAllDates(barsBySymbol) {
  return Array.from(
    new Set(
      Array.from(barsBySymbol.values())
        .flat()
        .map((bar) => normalizeDate(bar.timestamp || bar.date))
        .filter(Boolean),
    ),
  ).sort();
}

function addDays(dateText, days) {
  const date = new Date(`${dateText}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function filterBarsByDateRange(barsBySymbol, startDate, endDate) {
  const next = new Map();

  for (const [symbol, bars] of barsBySymbol.entries()) {
    const filtered = bars.filter((bar) => {
      const date = normalizeDate(bar.timestamp || bar.date);
      return date >= startDate && date <= endDate;
    });

    if (filtered.length >= 30) {
      next.set(symbol, filtered);
    }
  }

  return next;
}

function filterBarsThroughDate(barsBySymbol, endDate, minBars = 80) {
  const next = new Map();

  for (const [symbol, bars] of barsBySymbol.entries()) {
    const filtered = bars.filter((bar) => {
      const date = normalizeDate(bar.timestamp || bar.date);
      return date <= endDate;
    });

    if (filtered.length >= minBars) {
      next.set(symbol, filtered);
    }
  }

  return next;
}

function rebaseCurveSegment({ segmentCurve, testStart, startingEquity, segmentIndex, selectedConfigId }) {
  const usable = segmentCurve.filter((point) => normalizeDate(point.date) >= testStart);

  if (usable.length < 2) return [];

  const base = Number(usable[0].equity);

  if (!Number.isFinite(base) || base <= 0) return [];

  return usable.map((point) => {
    const equity = startingEquity * (Number(point.equity) / base);

    return {
      ...point,
      date: normalizeDate(point.date),
      equity,
      returnPct: ((equity - 1000) / 1000) * 100,
      segmentIndex,
      selectedConfigId,
    };
  });
}


function buildEqualWeightBenchmarkCurve({
  barsBySymbol,
  dates,
  startingEquity = 1000,
  totalExposureCap = 65,
  maxSymbols = 30,
}) {
  const eligibleSymbols = Array.from(barsBySymbol.entries())
    .filter(([, bars]) => Array.isArray(bars) && bars.length >= 30)
    .map(([symbol]) => symbol)
    .slice(0, maxSymbols);

  if (!eligibleSymbols.length || dates.length < 2) {
    return [];
  }

  let equity = startingEquity;
  const curve = [
    {
      index: 0,
      date: dates[0],
      equity,
      returnPct: 0,
      deployedPct: totalExposureCap,
      cashPct: 100 - totalExposureCap,
      positionsCount: eligibleSymbols.length,
      source: "equal-weight-benchmark",
    },
  ];

  const perSymbolWeight = (totalExposureCap / 100) / eligibleSymbols.length;
  const cashFraction = 1 - totalExposureCap / 100;

  for (let i = 0; i < dates.length - 1; i += 1) {
    const date = dates[i];
    const nextDate = dates[i + 1];

    let weightedReturn = 0;
    let available = 0;

    for (const symbol of eligibleSymbols) {
      const today = markPriceForSymbolAtDate(barsBySymbol, symbol, date);
      const next = markPriceForSymbolAtDate(barsBySymbol, symbol, nextDate);

      if (!today || !next || today <= 0 || next <= 0) continue;

      weightedReturn += perSymbolWeight * (next / today - 1);
      available += 1;
    }

    if (!available) {
      curve.push({
        index: i + 1,
        date: nextDate,
        equity,
        returnPct: ((equity - startingEquity) / startingEquity) * 100,
        deployedPct: 0,
        cashPct: 100,
        positionsCount: 0,
        source: "equal-weight-benchmark",
      });
      continue;
    }

    equity = equity * (cashFraction + totalExposureCap / 100 + weightedReturn);

    curve.push({
      index: i + 1,
      date: nextDate,
      equity,
      returnPct: ((equity - startingEquity) / startingEquity) * 100,
      deployedPct: totalExposureCap,
      cashPct: 100 - totalExposureCap,
      positionsCount: available,
      source: "equal-weight-benchmark",
    });
  }

  return curve;
}

function summarizeBenchmarkComparison(strategyMetrics, benchmarkMetrics) {
  const strategyReturn = Number(strategyMetrics?.totalReturnPct);
  const benchmarkReturn = Number(benchmarkMetrics?.totalReturnPct);
  const strategySharpe = Number(strategyMetrics?.annualizedSharpe);
  const benchmarkSharpe = Number(benchmarkMetrics?.annualizedSharpe);

  return {
    benchmarkReturnPct: Number.isFinite(benchmarkReturn) ? benchmarkReturn : null,
    benchmarkSharpe: Number.isFinite(benchmarkSharpe) ? benchmarkSharpe : null,
    excessReturnPct:
      Number.isFinite(strategyReturn) && Number.isFinite(benchmarkReturn)
        ? strategyReturn - benchmarkReturn
        : null,
    excessSharpe:
      Number.isFinite(strategySharpe) && Number.isFinite(benchmarkSharpe)
        ? strategySharpe - benchmarkSharpe
        : null,
  };
}

function isWalkForwardPromotionEligible({
  candidateMetrics,
  currentMetrics = null,
  benchmarkMetrics = null,
  segments = 0,
  trades = 0,
}) {
  const sharpe = Number(candidateMetrics?.annualizedSharpe);
  const maxDrawdown = Number(candidateMetrics?.maxDrawdownPct);
  const totalReturn = Number(candidateMetrics?.totalReturnPct);
  const profitFactor = Number(candidateMetrics?.profitFactor);
  const winRate = Number(candidateMetrics?.winRatePct);

  if (!Number.isFinite(sharpe) || !Number.isFinite(maxDrawdown) || !Number.isFinite(totalReturn)) {
    return {
      eligible: false,
      reason: "INVALID_METRICS",
    };
  }

  if (segments < 4) {
    return {
      eligible: false,
      reason: "INSUFFICIENT_SEGMENTS",
    };
  }

  if (trades < 30) {
    return {
      eligible: false,
      reason: "INSUFFICIENT_TRADES",
    };
  }

  if (sharpe < 0.8) {
    return {
      eligible: false,
      reason: "LOW_SHARPE",
    };
  }

  if (maxDrawdown > 20) {
    return {
      eligible: false,
      reason: "DRAWDOWN_TOO_HIGH",
    };
  }

  if (Number.isFinite(profitFactor) && profitFactor < 1.15) {
    return {
      eligible: false,
      reason: "LOW_PROFIT_FACTOR",
    };
  }

  if (Number.isFinite(winRate) && winRate < 45) {
    return {
      eligible: false,
      reason: "LOW_WIN_RATE",
    };
  }

  if (benchmarkMetrics) {
    const benchmarkReturn = Number(benchmarkMetrics.totalReturnPct);
    const benchmarkSharpe = Number(benchmarkMetrics.annualizedSharpe);

    if (Number.isFinite(benchmarkReturn) && totalReturn < benchmarkReturn) {
      return {
        eligible: false,
        reason: "UNDERPERFORMS_BENCHMARK_RETURN",
      };
    }

    if (Number.isFinite(benchmarkSharpe) && sharpe < benchmarkSharpe) {
      return {
        eligible: false,
        reason: "UNDERPERFORMS_BENCHMARK_SHARPE",
      };
    }
  }

  if (currentMetrics) {
    const currentSharpe = Number(currentMetrics.annualizedSharpe);
    const currentDrawdown = Number(currentMetrics.maxDrawdownPct);
    const currentProfitFactor = Number(currentMetrics.profitFactor);
    const currentReturn = Number(currentMetrics.totalReturnPct);

    if (Number.isFinite(currentSharpe) && sharpe < currentSharpe + 0.15) {
      return {
        eligible: false,
        reason: "DOES_NOT_IMPROVE_CURRENT_SHARPE",
      };
    }

    if (Number.isFinite(currentDrawdown) && maxDrawdown > currentDrawdown + 3) {
      return {
        eligible: false,
        reason: "WORSE_DRAWDOWN_THAN_CURRENT",
      };
    }

    if (Number.isFinite(currentProfitFactor) && Number.isFinite(profitFactor) && profitFactor < currentProfitFactor) {
      return {
        eligible: false,
        reason: "WORSE_PROFIT_FACTOR_THAN_CURRENT",
      };
    }

    if (Number.isFinite(currentReturn) && totalReturn < currentReturn) {
      return {
        eligible: false,
        reason: "WORSE_RETURN_THAN_CURRENT",
      };
    }
  }

  return {
    eligible: true,
    reason: "PASSED",
  };
}

async function loadCurrentPromotedWalkForwardMetrics(market) {
  const promoted = await loadPromotedConfig(market);

  if (!promoted?.configId || promoted.configId === "default") {
    return null;
  }

  const { rows } = await query(
    `
    SELECT *
    FROM strategy_walkforward_metrics
    WHERE market = $1
      AND config_id = $2
    LIMIT 1
    `,
    [market, promoted.configId],
  );

  const row = rows[0];

  if (!row) return null;

  return {
    configId: promoted.configId,
    totalReturnPct: row.total_return_pct == null ? null : Number(row.total_return_pct),
    annualizedSharpe: row.annualized_sharpe == null ? null : Number(row.annualized_sharpe),
    averageDurationDays: row.average_duration_days == null ? null : Number(row.average_duration_days),
    profitFactor: row.profit_factor == null ? null : Number(row.profit_factor),
    winRatePct: row.win_rate_pct == null ? null : Number(row.win_rate_pct),
    maxDrawdownPct: row.max_drawdown_pct == null ? null : Number(row.max_drawdown_pct),
    equity: row.equity == null ? null : Number(row.equity),
  };
}


function computeCurveMetrics(curve) {
  return computeMetrics(
    curve.map((point, index) => ({
      ...point,
      index,
      equity: Number(point.equity),
      returnPct: Number(point.returnPct),
    })),
  );
}


function generateForwardSignalsForWindow({
  market,
  barsBySymbol,
  config,
  segmentIndex,
  selectedConfigId,
  testStart,
  testEnd,
}) {
  const dates = collectAllDates(barsBySymbol).filter((date) => {
    return date >= testStart && date <= testEnd;
  });

  const signals = [];

  for (const date of dates) {
    const indexBySymbol = new Map();

    for (const [symbol, bars] of barsBySymbol.entries()) {
      let index = -1;

      for (let i = 0; i < bars.length; i += 1) {
        const barDate = normalizeDate(bars[i].timestamp || bars[i].date);

        if (barDate <= date) index = i;
        if (barDate > date) break;
      }

      indexBySymbol.set(symbol, index);
    }

    const result = runStrategyForMarketAtIndex({
      market,
      barsBySymbol,
      indexBySymbol,
      config,
    });

    for (const signal of result.signals) {
      signals.push({
        ...signal,
        timestamp: date,
        segmentIndex,
        selectedConfigId,
        regime: signal.regime || result.regimeState?.regime || null,
      });
    }
  }

  return signals;
}

function closeForSymbolAtDate(barsBySymbol, symbol, date) {
  const bars = barsBySymbol.get(symbol) || [];
  const point = bars.find((bar) => normalizeDate(bar.timestamp || bar.date) === date);
  return point ? Number(point.close) : null;
}

function buildCurveFromForwardSignals({
  barsBySymbol,
  signals,
  startingEquity,
  previousBaseEquity = 1000,
  segmentIndex,
  selectedConfigId,
}) {
  const dates = Array.from(new Set(signals.map((signal) => normalizeDate(signal.timestamp)))).sort();

  if (dates.length < 2) return [];

  let equity = startingEquity;
  const curve = [
    {
      date: dates[0],
      equity,
      returnPct: ((equity - previousBaseEquity) / previousBaseEquity) * 100,
      deployedPct: 0,
      cashPct: 100,
      positionsCount: 0,
      segmentIndex,
      selectedConfigId,
      regime: signals.find((signal) => normalizeDate(signal.timestamp) === dates[0])?.regime || null,
    },
  ];

  for (let i = 0; i < dates.length - 1; i += 1) {
    const date = dates[i];
    const nextDate = dates[i + 1];

    const dailySignals = signals.filter((signal) => normalizeDate(signal.timestamp) === date);
    const buys = dailySignals.filter((signal) => {
      return signal.allocationAction === "Buy" && Number(signal.suggestedExposure) > 0;
    });

    const totalExposure = buys.reduce((sum, signal) => sum + Number(signal.suggestedExposure || 0), 0);
    const deployedFraction = Math.min(1, Math.max(0, totalExposure / 100));
    const cashFraction = 1 - deployedFraction;

    let weightedReturn = 0;

    if (buys.length && totalExposure > 0) {
      for (const buy of buys) {
        const todayClose = closeForSymbolAtDate(barsBySymbol, buy.symbol, date);
        const nextClose = closeForSymbolAtDate(barsBySymbol, buy.symbol, nextDate);

        if (!todayClose || !nextClose) continue;

        const weight = Number(buy.suggestedExposure || 0) / totalExposure;
        const symbolReturn = nextClose / todayClose - 1;

        weightedReturn += weight * symbolReturn;
      }
    }

    equity = equity * (cashFraction + deployedFraction * (1 + weightedReturn));

    curve.push({
      date: nextDate,
      equity,
      returnPct: ((equity - previousBaseEquity) / previousBaseEquity) * 100,
      deployedPct: deployedFraction * 100,
      cashPct: cashFraction * 100,
      positionsCount: buys.length,
      segmentIndex,
      selectedConfigId,
      regime: dailySignals[0]?.regime || null,
    });
  }

  return curve;
}



function barForSymbolAtDate(barsBySymbol, symbol, date) {
  const bars = barsBySymbol.get(symbol) || [];
  return bars.find((bar) => normalizeDate(bar.timestamp || bar.date) === date) || null;
}

function executionPriceForSymbolAtDate(barsBySymbol, symbol, date) {
  const bar = barForSymbolAtDate(barsBySymbol, symbol, date);
  if (!bar) return null;

  const open = Number(bar.open);
  const close = Number(bar.close);

  if (Number.isFinite(open) && open > 0) return open;
  if (Number.isFinite(close) && close > 0) return close;

  return null;
}

function markPriceForSymbolAtDate(barsBySymbol, symbol, date) {
  const bar = barForSymbolAtDate(barsBySymbol, symbol, date);
  if (!bar) return null;

  const close = Number(bar.close);
  const open = Number(bar.open);

  if (Number.isFinite(close) && close > 0) return close;
  if (Number.isFinite(open) && open > 0) return open;

  return null;
}

function historicalReturnsUntilDate(barsBySymbol, symbol, date, lookback = 60) {
  const bars = (barsBySymbol.get(symbol) || [])
    .filter((bar) => normalizeDate(bar.timestamp || bar.date) <= date)
    .slice(-lookback - 1);

  const returns = [];

  for (let i = 1; i < bars.length; i += 1) {
    const previous = Number(bars[i - 1].close);
    const current = Number(bars[i].close);

    if (previous > 0 && current > 0) {
      returns.push(current / previous - 1);
    }
  }

  return returns;
}

function covarianceMatrix(returnSeries) {
  const symbols = Object.keys(returnSeries);
  const length = Math.min(...symbols.map((symbol) => returnSeries[symbol].length));

  if (!symbols.length || !Number.isFinite(length) || length < 5) {
    return {
      symbols,
      cov: symbols.map(() => symbols.map(() => 0)),
      means: symbols.map(() => 0),
    };
  }

  const aligned = symbols.map((symbol) => returnSeries[symbol].slice(-length));
  const means = aligned.map((series) => series.reduce((sum, value) => sum + value, 0) / series.length);

  const cov = aligned.map((a, i) =>
    aligned.map((b, j) => {
      let sum = 0;

      for (let k = 0; k < length; k += 1) {
        sum += (a[k] - means[i]) * (b[k] - means[j]);
      }

      return sum / Math.max(1, length - 1);
    }),
  );

  return {
    symbols,
    cov,
    means,
  };
}

function shrinkCovariance(cov, shrinkage = 0.35) {
  return cov.map((row, i) =>
    row.map((value, j) => {
      if (i === j) return value;
      return value * (1 - shrinkage);
    }),
  );
}

function projectWeights(weights, caps, totalCap) {
  let next = weights.map((value, index) => Math.min(Math.max(0, value), caps[index]));

  let sum = next.reduce((acc, value) => acc + value, 0);

  if (sum > totalCap && sum > 0) {
    const scale = totalCap / sum;
    next = next.map((value) => value * scale);
  }

  return next;
}

function allocateMptWeights({
  barsBySymbol,
  signals,
  date,
  totalExposureCap = 65,
  maxPositionPct = 5.5,
  lookback = 60,
  riskAversion = 8,
  shrinkage = 0.35,
}) {
  const candidates = signals
    .filter((signal) => signal.allocationAction === "Buy" && Number(signal.suggestedExposure) > 0)
    .slice(0, 40);

  if (!candidates.length) return new Map();

  const returnSeries = {};
  const candidateBySymbol = new Map();

  for (const signal of candidates) {
    const symbol = signal.symbol;
    const returns = historicalReturnsUntilDate(barsBySymbol, symbol, date, lookback);

    if (returns.length >= 10) {
      returnSeries[symbol] = returns;
      candidateBySymbol.set(symbol, signal);
    }
  }

  const { symbols, cov, means } = covarianceMatrix(returnSeries);

  if (!symbols.length) return new Map();

  const shrunkCov = shrinkCovariance(cov, shrinkage);

  const mu = symbols.map((symbol, index) => {
    const signal = candidateBySymbol.get(symbol);
    const signalExpected = Number(signal?.expectedMove || 0) / 100;
    const historicalMean = means[index] || 0;

    return historicalMean * 0.35 + signalExpected * 0.65;
  });

  const caps = symbols.map((symbol) => {
    const signal = candidateBySymbol.get(symbol);
    return Math.min(maxPositionPct, Math.max(0, Number(signal?.suggestedExposure || 0)));
  });

  let weights = caps.map((cap) => Math.min(cap, totalExposureCap / symbols.length));

  const learningRate = 6;

  for (let step = 0; step < 120; step += 1) {
    const weightsDecimal = weights.map((weight) => weight / 100);

    const gradient = symbols.map((_, i) => {
      let varianceContribution = 0;

      for (let j = 0; j < symbols.length; j += 1) {
        varianceContribution += shrunkCov[i][j] * weightsDecimal[j];
      }

      return mu[i] - riskAversion * varianceContribution;
    });

    weights = weights.map((weight, i) => weight + learningRate * gradient[i]);
    weights = projectWeights(weights, caps, totalExposureCap);
  }

  const result = new Map();

  symbols.forEach((symbol, index) => {
    if (weights[index] > 0.05) {
      result.set(symbol, weights[index]);
    }
  });

  return result;
}

function portfolioEquityFromState({ cash, positions, barsBySymbol, date }) {
  let equity = cash;

  for (const [symbol, position] of positions.entries()) {
    const mark = markPriceForSymbolAtDate(barsBySymbol, symbol, date);

    if (!mark || !Number.isFinite(mark) || mark <= 0) continue;

    equity += position.quantity * mark;
  }

  return equity;
}

function portfolioExposurePctFromState({ equity, positions, barsBySymbol, date }) {
  if (!equity || equity <= 0) return 0;

  let exposure = 0;

  for (const [symbol, position] of positions.entries()) {
    const mark = markPriceForSymbolAtDate(barsBySymbol, symbol, date);

    if (!mark || !Number.isFinite(mark) || mark <= 0) continue;

    exposure += (position.quantity * mark) / equity;
  }

  return exposure * 100;
}


function buildStatefulLongOnlyCurveFromSignals({
  barsBySymbol,
  signals,
  startingEquity,
  previousBaseEquity = 1000,
  segmentIndex,
  selectedConfigId,
  spreadBps = 0,
}) {
  const halfSpreadRate = Math.max(0, Number(spreadBps || 0)) / 20_000;

  const dates = Array.from(new Set(signals.map((signal) => normalizeDate(signal.timestamp)))).sort();

  if (dates.length < 2) {
    return {
      curve: [],
      trades: [],
    };
  }

  let equity = startingEquity;
  const positions = new Map();
  const trades = [];

  const curve = [
    {
      date: dates[0],
      equity,
      returnPct: ((equity - previousBaseEquity) / previousBaseEquity) * 100,
      deployedPct: 0,
      cashPct: 100,
      positionsCount: 0,
      segmentIndex,
      selectedConfigId,
      regime: signals.find((signal) => normalizeDate(signal.timestamp) === dates[0])?.regime || null,
    },
  ];

  for (let i = 0; i < dates.length - 1; i += 1) {
    const date = dates[i];
    const nextDate = dates[i + 1];

    const dailySignals = signals.filter((signal) => normalizeDate(signal.timestamp) === date);

    for (const signal of dailySignals) {
      const action = String(signal.allocationAction || signal.signalAction || "Hold");
      const symbol = signal.symbol;
      const midPrice = closeForSymbolAtDate(barsBySymbol, symbol, date) || Number(signal.price);

      if (!symbol || !Number.isFinite(midPrice) || midPrice <= 0) continue;

      const buyPrice = midPrice * (1 + halfSpreadRate);
      const sellPrice = midPrice * (1 - halfSpreadRate);

      const existing = positions.get(symbol);

      if (action === "Buy") {
        const exposure = Math.max(0, Number(signal.suggestedExposure || 0));

        if (exposure <= 0) continue;

        if (existing) {
          positions.set(symbol, {
            ...existing,
            exposure,
            lastSignalDate: date,
            lastSignalPrice: midPrice,
            maxPrice: Math.max(existing.maxPrice || existing.entryPrice, midPrice),
          });
        } else {
          positions.set(symbol, {
            symbol,
            side: "long",
            entryDate: date,
            entryPrice: buyPrice,
            exposure,
            selectedConfigId,
            segmentIndex,
            maxPrice: midPrice,
            lastSignalDate: date,
            lastSignalPrice: midPrice,
          });
        }
      }

      if (action === "Sell") {
        if (!existing) continue;

        const pnlPct = existing.entryPrice > 0 ? ((sellPrice / existing.entryPrice) - 1) * 100 : 0;

        trades.push({
          symbol,
          side: "long",
          segmentIndex,
          selectedConfigId,
          entryDate: existing.entryDate,
          exitDate: date,
          entryPrice: existing.entryPrice,
          exitPrice: sellPrice,
          entryExposure: existing.exposure,
          exitReason: "Sell",
          pnlPct,
        });

        positions.delete(symbol);
      }
    }

    let weightedReturn = 0;
    let totalExposure = 0;

    for (const [symbol, position] of positions.entries()) {
      const todayClose = closeForSymbolAtDate(barsBySymbol, symbol, date);
      const nextClose = closeForSymbolAtDate(barsBySymbol, symbol, nextDate);

      if (!todayClose || !nextClose) continue;

      const exposure = Math.max(0, Number(position.exposure || 0));
      const symbolReturn = nextClose / todayClose - 1;

      weightedReturn += (exposure / 100) * symbolReturn;
      totalExposure += exposure;

      positions.set(symbol, {
        ...position,
        maxPrice: Math.max(position.maxPrice || todayClose, nextClose),
      });
    }

    const deployedFraction = Math.min(1, Math.max(0, totalExposure / 100));
    const cashFraction = 1 - deployedFraction;

    equity = equity * (1 + weightedReturn);

    curve.push({
      date: nextDate,
      equity,
      returnPct: ((equity - previousBaseEquity) / previousBaseEquity) * 100,
      deployedPct: deployedFraction * 100,
      cashPct: cashFraction * 100,
      positionsCount: positions.size,
      segmentIndex,
      selectedConfigId,
      regime: dailySignals[0]?.regime || null,
    });
  }

  const finalDate = dates[dates.length - 1];

  for (const [symbol, position] of positions.entries()) {
    const finalMidPrice = closeForSymbolAtDate(barsBySymbol, symbol, finalDate) || position.lastSignalPrice;
    const exitPrice = finalMidPrice ? finalMidPrice * (1 - halfSpreadRate) : null;

    if (!exitPrice || !Number.isFinite(exitPrice) || exitPrice <= 0) continue;

    const pnlPct = position.entryPrice > 0 ? ((exitPrice / position.entryPrice) - 1) * 100 : 0;

    trades.push({
      symbol,
      side: "long",
      segmentIndex,
      selectedConfigId,
      entryDate: position.entryDate,
      exitDate: finalDate,
      entryPrice: position.entryPrice,
      exitPrice,
      entryExposure: position.exposure,
      exitReason: "Segment End",
      pnlPct,
    });
  }

  return {
    curve,
    trades,
  };
}

async function saveWalkForwardTrades({ market, runId, trades }) {
  for (const trade of trades) {
    await query(
      `
      INSERT INTO strategy_walkforward_trades (
        market,
        run_id,
        segment_index,
        symbol,
        selected_config_id,
        side,
        entry_date,
        exit_date,
        entry_price,
        exit_price,
        entry_exposure,
        exit_reason,
        pnl_pct
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
      `,
      [
        market,
        runId,
        trade.segmentIndex,
        trade.symbol,
        trade.selectedConfigId,
        trade.side || "long",
        trade.entryDate,
        trade.exitDate,
        trade.entryPrice,
        trade.exitPrice,
        trade.entryExposure,
        trade.exitReason,
        trade.pnlPct,
      ],
    );
  }
}


async function saveWalkForwardSignals({ market, runId, signals }) {
  for (const signal of signals) {
    await query(
      `
      INSERT INTO strategy_walkforward_signals (
        market,
        run_id,
        segment_index,
        symbol,
        timestamp,
        selected_config_id,
        signal_action,
        allocation_action,
        suggested_exposure,
        setup_quality,
        risk_pressure,
        trend_quality,
        timing_quality,
        expected_move,
        price,
        regime,
        payload
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
      ON CONFLICT (market, run_id, segment_index, symbol, timestamp)
      DO UPDATE SET
        selected_config_id = EXCLUDED.selected_config_id,
        signal_action = EXCLUDED.signal_action,
        allocation_action = EXCLUDED.allocation_action,
        suggested_exposure = EXCLUDED.suggested_exposure,
        setup_quality = EXCLUDED.setup_quality,
        risk_pressure = EXCLUDED.risk_pressure,
        trend_quality = EXCLUDED.trend_quality,
        timing_quality = EXCLUDED.timing_quality,
        expected_move = EXCLUDED.expected_move,
        price = EXCLUDED.price,
        regime = EXCLUDED.regime,
        payload = EXCLUDED.payload
      `,
      [
        market,
        runId,
        signal.segmentIndex,
        signal.symbol,
        normalizeDate(signal.timestamp),
        signal.selectedConfigId,
        signal.signalAction,
        signal.allocationAction,
        signal.suggestedExposure,
        signal.setupQuality,
        signal.riskPressure,
        signal.trendQuality,
        signal.timingQuality,
        signal.expectedMove,
        signal.price,
        signal.regime,
        JSON.stringify(signal),
      ],
    );
  }
}


async function saveWalkForwardResult({
  market,
  configId,
  curve,
  segments,
  metrics,
  benchmarkComparison = {},
  promotionDecision = {},
}) {
  await query(
    `DELETE FROM strategy_walkforward_equity_curve WHERE market = $1 AND config_id = $2`,
    [market, configId],
  );

  await query(
    `DELETE FROM strategy_walkforward_segments WHERE market = $1 AND config_id = $2`,
    [market, configId],
  );

  await query(
    `DELETE FROM strategy_walkforward_signals WHERE market = $1 AND run_id = $2`,
    [market, configId],
  );

  await query(
    `DELETE FROM strategy_walkforward_trades WHERE market = $1 AND run_id = $2`,
    [market, configId],
  );

  for (const point of curve) {
    await query(
      `
      INSERT INTO strategy_walkforward_equity_curve (
        market,
        config_id,
        date,
        equity,
        return_pct,
        deployed_pct,
        cash_pct,
        positions_count,
        segment_index,
        selected_config_id,
        regime,
        updated_at
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,now())
      ON CONFLICT (market, config_id, date)
      DO UPDATE SET
        equity = EXCLUDED.equity,
        return_pct = EXCLUDED.return_pct,
        deployed_pct = EXCLUDED.deployed_pct,
        cash_pct = EXCLUDED.cash_pct,
        positions_count = EXCLUDED.positions_count,
        segment_index = EXCLUDED.segment_index,
        selected_config_id = EXCLUDED.selected_config_id,
        regime = EXCLUDED.regime,
        updated_at = now()
      `,
      [
        market,
        configId,
        point.date,
        point.equity,
        point.returnPct,
        point.deployedPct,
        point.cashPct,
        point.positionsCount,
        point.segmentIndex,
        point.selectedConfigId,
        point.regime || null,
      ],
    );
  }

  for (const segment of segments) {
    await query(
      `
      INSERT INTO strategy_walkforward_segments (
        market,
        config_id,
        segment_index,
        train_start,
        train_end,
        test_start,
        test_end,
        train_score,
        test_score,
        selected_config,
        metrics
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
      ON CONFLICT (market, config_id, segment_index)
      DO UPDATE SET
        train_start = EXCLUDED.train_start,
        train_end = EXCLUDED.train_end,
        test_start = EXCLUDED.test_start,
        test_end = EXCLUDED.test_end,
        train_score = EXCLUDED.train_score,
        test_score = EXCLUDED.test_score,
        selected_config = EXCLUDED.selected_config,
        metrics = EXCLUDED.metrics
      `,
      [
        market,
        configId,
        segment.segmentIndex,
        segment.trainStart,
        segment.trainEnd,
        segment.testStart,
        segment.testEnd,
        segment.trainScore,
        segment.testScore,
        JSON.stringify(segment.selectedConfig),
        JSON.stringify(segment.metrics),
      ],
    );
  }

  await query(
    `
    INSERT INTO strategy_walkforward_metrics (
      market,
      config_id,
      total_return_pct,
      annualized_sharpe,
      average_duration_days,
      profit_factor,
      win_rate_pct,
      max_drawdown_pct,
      equity,
      segments,
      benchmark_return_pct,
      benchmark_sharpe,
      excess_return_pct,
      excess_sharpe,
      promotion_eligible,
      promotion_reason,
      strategy_engine_version,
      config_schema_version,
      indicator_model_version,
      allocation_model_version,
      execution_model_version,
      updated_at
    )
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,now())
    ON CONFLICT (market, config_id)
    DO UPDATE SET
      total_return_pct = EXCLUDED.total_return_pct,
      annualized_sharpe = EXCLUDED.annualized_sharpe,
      average_duration_days = EXCLUDED.average_duration_days,
      profit_factor = EXCLUDED.profit_factor,
      win_rate_pct = EXCLUDED.win_rate_pct,
      max_drawdown_pct = EXCLUDED.max_drawdown_pct,
      equity = EXCLUDED.equity,
      segments = EXCLUDED.segments,
      benchmark_return_pct = EXCLUDED.benchmark_return_pct,
      benchmark_sharpe = EXCLUDED.benchmark_sharpe,
      excess_return_pct = EXCLUDED.excess_return_pct,
      excess_sharpe = EXCLUDED.excess_sharpe,
      promotion_eligible = EXCLUDED.promotion_eligible,
      promotion_reason = EXCLUDED.promotion_reason,
      strategy_engine_version = EXCLUDED.strategy_engine_version,
      config_schema_version = EXCLUDED.config_schema_version,
      indicator_model_version = EXCLUDED.indicator_model_version,
      allocation_model_version = EXCLUDED.allocation_model_version,
      execution_model_version = EXCLUDED.execution_model_version,
      updated_at = now()
    `,
    [
      market,
      configId,
      metrics.totalReturnPct,
      metrics.annualizedSharpe,
      metrics.averageDurationDays,
      metrics.profitFactor,
      metrics.winRatePct,
      metrics.maxDrawdownPct,
      metrics.equity,
      segments.length,
      benchmarkComparison.benchmarkReturnPct ?? null,
      benchmarkComparison.benchmarkSharpe ?? null,
      benchmarkComparison.excessReturnPct ?? null,
      benchmarkComparison.excessSharpe ?? null,
      promotionDecision.eligible ?? null,
      promotionDecision.reason ?? null,
      STRATEGY_ENGINE_VERSION,
      CONFIG_SCHEMA_VERSION,
      INDICATOR_MODEL_VERSION,
      ALLOCATION_MODEL_VERSION,
      EXECUTION_MODEL_VERSION,
    ],
  );
}


async function handleOptimizeMarket(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "METHOD_NOT_ALLOWED" });
    return;
  }

  const body = getBody(req);
  const market = marketKey(body.market);
  const symbolLimit = Math.min(120, Math.max(5, Number(body.symbolLimit || 30)));
  const configLimit = Math.min(120, Math.max(5, Number(body.configLimit || 40)));
  const autoPromote = body.autoPromote !== false;

  if (!market) {
    res.status(400).json({ error: "MARKET_REQUIRED" });
    return;
  }

  const lock = await acquireLock(`lock:strategy-optimize-market:${market}`, 240);

  if (!lock.acquired) {
    res.status(202).json({
      ok: true,
      market,
      status: "already_optimizing",
    });
    return;
  }

  const run = await query(
    `
    INSERT INTO strategy_optimization_runs (
      market,
      status,
      config_limit,
      symbol_limit
    )
    VALUES ($1,'running',$2,$3)
    RETURNING id
    `,
    [market, configLimit, symbolLimit],
  );

  const runId = run.rows[0].id;

  try {
    const barsBySymbol = await loadBarsBySymbol({
      market,
      limitSymbols: symbolLimit,
    });

    if (!barsBySymbol.size) {
      await query(
        `
        UPDATE strategy_optimization_runs
        SET status = 'failed',
            summary = $2,
            completed_at = now()
        WHERE id = $1
        `,
        [
          runId,
          JSON.stringify({
            reason: "NO_PRICE_HISTORY",
          }),
        ],
      );

      res.status(200).json({
        ok: false,
        market,
        runId,
        reason: "NO_PRICE_HISTORY",
      });
      return;
    }

    const configs = generateConservativeConfigs();
    const results = optimizeConfigsOnBars({
      market,
      barsBySymbol,
      configs,
      limit: configLimit,
    });

    const top = results.slice(0, 10);

    for (const evaluation of top) {
      await saveConfigResult(market, evaluation, "candidate");
    }

    const best = top[0] || null;

    if (best && autoPromote) {
      await promoteConfig(market, best.config.id, "paper_promoted");
    }

    if (best) {
      await saveBacktest(market, best.config.id, {
        curve: best.curve,
        signals: best.signals,
        metrics: best.fullMetrics,
      });

      await setCache(
        `strategy:backtest:summary:${market}:${best.config.id}`,
        {
          market,
          configId: best.config.id,
          ...best.fullMetrics,
          updatedAt: Date.now(),
          source: "shared-strategy-engine-optimizer",
        },
        60 * 10,
      );

      await setCache(
        `strategy:backtest:history:${market}:${best.config.id}`,
        {
          market,
          configId: best.config.id,
          data: best.curve,
          items: best.curve,
          total: best.curve.length,
          updatedAt: Date.now(),
          source: "shared-strategy-engine-optimizer",
        },
        60 * 10,
      );

      await setCache(
        `strategy:backtest:summary:${market}:default`,
        {
          market,
          configId: best.config.id,
          ...best.fullMetrics,
          updatedAt: Date.now(),
          source: "shared-strategy-engine-optimizer",
        },
        60 * 10,
      );

      await setCache(
        `strategy:backtest:history:${market}:default`,
        {
          market,
          configId: best.config.id,
          data: best.curve,
          items: best.curve,
          total: best.curve.length,
          updatedAt: Date.now(),
          source: "shared-strategy-engine-optimizer",
        },
        60 * 10,
      );
    }

    await query(
      `
      UPDATE strategy_optimization_runs
      SET status = 'completed',
          best_config_id = $2,
          best_score = $3,
          summary = $4,
          completed_at = now()
      WHERE id = $1
      `,
      [
        runId,
        best?.config?.id || null,
        best?.score ?? null,
        JSON.stringify({
          tested: results.length,
          top: top.map((item) => ({
            config: item.config,
            score: item.score,
            trainScore: item.trainScore,
            testScore: item.testScore,
            signalCount: item.signalCount,
            metrics: item.fullMetrics,
          })),
        }),
      ],
    );

    res.status(200).json({
      ok: true,
      market,
      runId,
      tested: results.length,
      promoted: autoPromote ? best?.config?.id ?? null : null,
      best: best
        ? {
            config: best.config,
            score: best.score,
            trainScore: best.trainScore,
            testScore: best.testScore,
            signalCount: best.signalCount,
            metrics: best.fullMetrics,
          }
        : null,
      top: top.map((item) => ({
        config: item.config,
        score: item.score,
        metrics: item.fullMetrics,
      })),
    });
  } catch (error) {
    await query(
      `
      UPDATE strategy_optimization_runs
      SET status = 'failed',
          summary = $2,
          completed_at = now()
      WHERE id = $1
      `,
      [
        runId,
        JSON.stringify({
          error: error.message,
        }),
      ],
    );

    throw error;
  }
}





function makeWalkForwardSegments(dates, { trainDays, testDays, stepDays }) {
  const segments = [];

  for (
    let trainStartIndex = 0;
    trainStartIndex + trainDays + testDays < dates.length;
    trainStartIndex += stepDays
  ) {
    const segmentIndex = segments.length;

    segments.push({
      segmentIndex,
      trainStartIndex,
      trainStart: dates[trainStartIndex],
      trainEnd: dates[Math.min(dates.length - 1, trainStartIndex + trainDays - 1)],
      testStart: dates[Math.min(dates.length - 1, trainStartIndex + trainDays)],
      testEnd: dates[Math.min(dates.length - 1, trainStartIndex + trainDays + testDays - 1)],
    });
  }

  return segments;
}

async function loadExistingWalkForwardState({ market, configId }) {
  const { rows } = await query(
    `
    SELECT date, equity, return_pct, deployed_pct, cash_pct, positions_count, segment_index, selected_config_id, regime
    FROM strategy_walkforward_equity_curve
    WHERE market = $1
      AND config_id = $2
    ORDER BY date ASC
    `,
    [market, configId],
  );

  const curve = rows.map((row) => ({
    date: normalizeDate(row.date),
    equity: Number(row.equity),
    returnPct: Number(row.return_pct),
    deployedPct: Number(row.deployed_pct),
    cashPct: Number(row.cash_pct),
    positionsCount: Number(row.positions_count),
    segmentIndex: Number(row.segment_index),
    selectedConfigId: row.selected_config_id,
    regime: row.regime,
  }));

  const last = curve[curve.length - 1];

  return {
    curve,
    currentEquity: last?.equity ?? 1000,
    nextSegmentIndex: last ? Number(last.segmentIndex) + 1 : 0,
  };
}

async function appendWalkForwardCurvePoints({ market, configId, points }) {
  for (const point of points) {
    await query(
      `
      INSERT INTO strategy_walkforward_equity_curve (
        market,
        config_id,
        date,
        equity,
        return_pct,
        deployed_pct,
        cash_pct,
        positions_count,
        segment_index,
        selected_config_id,
        regime,
        updated_at
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,now())
      ON CONFLICT (market, config_id, date)
      DO UPDATE SET
        equity = EXCLUDED.equity,
        return_pct = EXCLUDED.return_pct,
        deployed_pct = EXCLUDED.deployed_pct,
        cash_pct = EXCLUDED.cash_pct,
        positions_count = EXCLUDED.positions_count,
        segment_index = EXCLUDED.segment_index,
        selected_config_id = EXCLUDED.selected_config_id,
        regime = EXCLUDED.regime,
        updated_at = now()
      `,
      [
        market,
        configId,
        point.date,
        point.equity,
        point.returnPct,
        point.deployedPct,
        point.cashPct,
        point.positionsCount,
        point.segmentIndex,
        point.selectedConfigId,
        point.regime || null,
      ],
    );
  }
}

async function appendWalkForwardSegment({ market, configId, segment }) {
  await query(
    `
    INSERT INTO strategy_walkforward_segments (
      market,
      config_id,
      segment_index,
      train_start,
      train_end,
      test_start,
      test_end,
      train_score,
      test_score,
      selected_config,
      metrics
    )
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
    ON CONFLICT (market, config_id, segment_index)
    DO UPDATE SET
      train_start = EXCLUDED.train_start,
      train_end = EXCLUDED.train_end,
      test_start = EXCLUDED.test_start,
      test_end = EXCLUDED.test_end,
      train_score = EXCLUDED.train_score,
      test_score = EXCLUDED.test_score,
      selected_config = EXCLUDED.selected_config,
      metrics = EXCLUDED.metrics
    `,
    [
      market,
      configId,
      segment.segmentIndex,
      segment.trainStart,
      segment.trainEnd,
      segment.testStart,
      segment.testEnd,
      segment.trainScore,
      segment.testScore,
      JSON.stringify(segment.selectedConfig),
      JSON.stringify(segment.metrics),
    ],
  );
}

async function finalizeWalkForwardMetrics({
  market,
  configId,
  barsBySymbol,
  curve,
  segments,
  metrics,
  totalExposureCap,
  symbolLimit,
  promotionDecision,
  benchmarkComparison,
}) {
  await saveWalkForwardResult({
    market,
    configId,
    curve,
    segments,
    metrics,
    benchmarkComparison,
    promotionDecision,
  });
}



async function evaluateDataQuality(market, options = {}) {
  const minSymbols = Number(options.minSymbols ?? 5);
  const minBarsPerSymbol = Number(options.minBarsPerSymbol ?? 120);
  const maxLatestBarAgeDays = Number(options.maxLatestBarAgeDays ?? 7);
  const maxZeroPriceRows = Number(options.maxZeroPriceRows ?? 0);
  const maxDuplicateRows = Number(options.maxDuplicateRows ?? 0);
  const maxExtremeJumpPct = Number(options.maxExtremeJumpPct ?? 80);

  const summaryResult = await query(
    `
    SELECT
      COUNT(DISTINCT symbol)::int AS symbols,
      COUNT(*)::int AS rows,
      MAX(date) AS latest_bar_date,
      COUNT(*) FILTER (
        WHERE close IS NULL OR close <= 0 OR open IS NULL OR open <= 0
      )::int AS zero_price_rows
    FROM stock_price_history
    WHERE market = $1
      AND date >= CURRENT_DATE - INTERVAL '4 years'
    `,
    [market],
  );

  const summary = summaryResult.rows[0] || {};
  const latestBarDate = summary.latest_bar_date ? new Date(summary.latest_bar_date) : null;
  const latestBarAgeDays = latestBarDate
    ? Math.max(0, (Date.now() - latestBarDate.getTime()) / 86_400_000)
    : null;

  const barsResult = await query(
    `
    SELECT
      symbol,
      COUNT(*)::int AS bars
    FROM stock_price_history
    WHERE market = $1
      AND date >= CURRENT_DATE - INTERVAL '4 years'
    GROUP BY symbol
    `,
    [market],
  );

  const symbolRows = barsResult.rows || [];
  const tradableSymbols = symbolRows.filter((row) => Number(row.bars) >= minBarsPerSymbol).length;

  const duplicatesResult = await query(
    `
    SELECT COUNT(*)::int AS duplicate_rows
    FROM (
      SELECT symbol, date, COUNT(*)::int AS count
      FROM stock_price_history
      WHERE market = $1
        AND date >= CURRENT_DATE - INTERVAL '4 years'
      GROUP BY symbol, date
      HAVING COUNT(*) > 1
    ) duplicates
    `,
    [market],
  );

  const jumpResult = await query(
    `
    WITH ordered AS (
      SELECT
        symbol,
        date,
        close,
        LAG(close) OVER (PARTITION BY symbol ORDER BY date) AS previous_close
      FROM stock_price_history
      WHERE market = $1
        AND date >= CURRENT_DATE - INTERVAL '4 years'
    )
    SELECT COUNT(*)::int AS extreme_jumps
    FROM ordered
    WHERE previous_close > 0
      AND close > 0
      AND ABS((close / previous_close - 1) * 100) > $2
    `,
    [market, maxExtremeJumpPct],
  );

  const duplicateRows = Number(duplicatesResult.rows[0]?.duplicate_rows || 0);
  const extremeJumps = Number(jumpResult.rows[0]?.extreme_jumps || 0);
  const zeroPriceRows = Number(summary.zero_price_rows || 0);

  const failures = [];

  if (!Number(summary.symbols) || Number(summary.symbols) < minSymbols) {
    failures.push("INSUFFICIENT_SYMBOLS");
  }

  if (tradableSymbols < minSymbols) {
    failures.push("INSUFFICIENT_TRADABLE_SYMBOLS");
  }

  if (!latestBarDate) {
    failures.push("NO_LATEST_BAR");
  }

  if (latestBarAgeDays != null && latestBarAgeDays > maxLatestBarAgeDays) {
    failures.push("STALE_BARS");
  }

  if (zeroPriceRows > maxZeroPriceRows) {
    failures.push("ZERO_OR_NULL_PRICES");
  }

  if (duplicateRows > maxDuplicateRows) {
    failures.push("DUPLICATE_BARS");
  }

  if (extremeJumps > 0) {
    failures.push("EXTREME_PRICE_JUMPS");
  }

  return {
    market,
    pass: failures.length === 0,
    failures,
    thresholds: {
      minSymbols,
      minBarsPerSymbol,
      maxLatestBarAgeDays,
      maxZeroPriceRows,
      maxDuplicateRows,
      maxExtremeJumpPct,
    },
    stats: {
      symbols: Number(summary.symbols || 0),
      tradableSymbols,
      rows: Number(summary.rows || 0),
      latestBarDate: latestBarDate ? latestBarDate.toISOString().slice(0, 10) : null,
      latestBarAgeDays,
      zeroPriceRows,
      duplicateRows,
      extremeJumps,
    },
    versions: strategyVersionPayload(),
  };
}

async function requireDataQualityPass(market, res, options = {}) {
  const quality = await evaluateDataQuality(market, options);

  if (!quality.pass) {
    await auditStrategyEvent({
      market,
      eventType: "DATA_QUALITY_BLOCK",
      decision: "blocked",
      reason: quality.failures.join(","),
      payload: quality,
    });

    res.status(409).json({
      error: "DATA_QUALITY_FAILED",
      market,
      quality,
    });

    return null;
  }

  return quality;
}


async function handleWalkForwardMarket(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "METHOD_NOT_ALLOWED" });
    return;
  }

  const body = getBody(req);
  const market = marketKey(body.market);
  const configId = String(body.configId || "rolling");
  const symbolLimit = Math.min(200, Math.max(5, Number(body.symbolLimit || 40)));
  const configLimit = Math.min(120, Math.max(5, Number(body.configLimit || 40)));
  const trainDays = Math.min(900, Math.max(120, Number(body.trainDays || 365)));
  const testDays = Math.min(180, Math.max(20, Number(body.testDays || 63)));
  const stepDays = Math.min(180, Math.max(20, Number(body.stepDays || testDays)));
  const warmupDays = Math.min(260, Math.max(60, Number(body.warmupDays || 120)));
  const resume = body.resume !== false;
  const reset = body.reset === true;
  const maxSegmentsPerRun = Math.min(12, Math.max(1, Number(body.maxSegmentsPerRun || 3)));
  const requestedStartSegment = body.startSegment == null ? null : Math.max(0, Number(body.startSegment));

  const executionPreset = executionPresetForMarket(market);

  const spreadBps = pickExecutionNumber(body, "spreadBps", executionPreset, 0, 100);
  const slippageBps = pickExecutionNumber(body, "slippageBps", executionPreset, 0, 100);
  const rebalanceThresholdBps = pickExecutionNumber(body, "rebalanceThresholdBps", executionPreset, 0, 500);
  const totalExposureCap = pickExecutionNumber(body, "totalExposureCap", executionPreset, 0, 100);
  const maxPositionPct = pickExecutionNumber(body, "maxPositionPct", executionPreset, 0.5, 25);
  const mptLookback = pickExecutionNumber(body, "mptLookback", executionPreset, 20, 180);
  const riskAversion = pickExecutionNumber(body, "riskAversion", executionPreset, 0.1, 50);
  const shrinkage = pickExecutionNumber(body, "shrinkage", executionPreset, 0, 1);

  if (!market) {
    res.status(400).json({ error: "MARKET_REQUIRED" });
    return;
  }

  const controlsForWrite = await ensureMarketIsAllowedForWrite(market, res);
  if (!controlsForWrite) return;

  const quality = await requireDataQualityPass(market, res, {
    minSymbols: Number(body.minQualitySymbols || 5),
    minBarsPerSymbol: Number(body.minQualityBarsPerSymbol || 120),
    maxLatestBarAgeDays: Number(body.maxLatestBarAgeDays || 7),
  });
  if (!quality) return;

  const jobRecord = await createStrategyJob({
    market,
    jobType: "walk-forward-market",
    status: "running",
    params: body,
    createdBy: "api",
    idempotencyKey: explicitIdempotencyKey(req, {
      action: "walk-forward-market",
      market,
      configId,
      body,
    }),
  });
  const jobId = jobRecord.id;

  if (jobRecord.reused && ["running", "queued"].includes(jobRecord.status)) {
    res.status(202).json({
      ok: true,
      market,
      configId,
      jobId,
      idempotencyKey: jobRecord.idempotencyKey,
      status: jobRecord.status,
      reused: true,
    });
    return;
  }

  const leasedJob = await acquireJobLease(jobId, {
    leaseSeconds: Number(process.env.STRATEGY_JOB_LEASE_SECONDS || 300),
  });

  if (!leasedJob) {
    res.status(423).json({
      ok: false,
      error: "JOB_LEASE_NOT_ACQUIRED",
      market,
      configId,
      jobId,
    });
    return;
  }

  await updateStrategyJob(jobId, {
    startedAt: new Date().toISOString(),
    progress: 0,
  });

  const lock = await acquireLock(`lock:strategy-walk-forward:${market}:${configId}`, 300);

  if (!lock.acquired) {
    await updateStrategyJob(jobId, {
      status: "skipped",
      completedAt: new Date().toISOString(),
      summary: { reason: "already_running" },
    });

    res.status(202).json({
      ok: true,
      market,
      configId,
      jobId,
      status: "already_running",
    });
    return;
  }

  const controls = await getStrategyControls(market);

  const barsBySymbol = await loadBarsBySymbol({
    market,
    limitSymbols: symbolLimit,
    controls,
  });

  if (!barsBySymbol.size) {
    res.status(200).json({
      ok: false,
      market,
      configId,
      reason: "NO_PRICE_HISTORY",
    });
    return;
  }

  const dates = collectAllDates(barsBySymbol);

  if (dates.length < trainDays + testDays) {
    res.status(200).json({
      ok: false,
      market,
      configId,
      reason: "INSUFFICIENT_HISTORY",
      dates: dates.length,
      required: trainDays + testDays,
    });
    return;
  }

  const configs = generateConservativeConfigs();
  const plannedSegments = makeWalkForwardSegments(dates, { trainDays, testDays, stepDays });

  if (reset) {
    await query(`DELETE FROM strategy_walkforward_equity_curve WHERE market = $1 AND config_id = $2`, [market, configId]);
    await query(`DELETE FROM strategy_walkforward_segments WHERE market = $1 AND config_id = $2`, [market, configId]);
    await query(`DELETE FROM strategy_walkforward_signals WHERE market = $1 AND run_id = $2`, [market, configId]);
    await query(`DELETE FROM strategy_walkforward_trades WHERE market = $1 AND run_id = $2`, [market, configId]);
  }

  const existingState = resume && !reset
    ? await loadExistingWalkForwardState({ market, configId })
    : { curve: [], currentEquity: 1000, nextSegmentIndex: 0 };

  const curve = [...existingState.curve];
  const segments = [];
  let currentEquity = existingState.currentEquity;
  const startSegment = requestedStartSegment ?? existingState.nextSegmentIndex;
  const endSegment = Math.min(plannedSegments.length, startSegment + maxSegmentsPerRun);

  for (let plannedIndex = startSegment; plannedIndex < endSegment; plannedIndex += 1) {
    const planned = plannedSegments[plannedIndex];
    const segmentIndex = planned.segmentIndex;
    const trainStart = planned.trainStart;
    const trainEnd = planned.trainEnd;
    const testStart = planned.testStart;
    const testEnd = planned.testEnd;

    const trainBars = filterBarsByDateRange(barsBySymbol, trainStart, trainEnd);

    if (trainBars.size < 2) continue;

    const evaluations = optimizeConfigsOnBars({
      market,
      barsBySymbol: trainBars,
      configs,
      limit: configLimit,
    });

    const best = evaluations.find((item) => isPromotionEligible(item)) || evaluations[0];

    if (!best) continue;

    const warmupStart = addDays(testStart, -warmupDays);
    const testBars = filterBarsByDateRange(barsBySymbol, warmupStart, testEnd);

    if (testBars.size < 2) continue;

    const forwardSignals = generateForwardSignalsForWindow({
      market,
      barsBySymbol: testBars,
      config: best.config,
      segmentIndex,
      selectedConfigId: best.config.id,
      testStart,
      testEnd,
    });

    const simulated = buildStatefulLongOnlyCurveFromSignals({
      barsBySymbol: testBars,
      signals: forwardSignals,
      startingEquity: currentEquity,
      previousBaseEquity: 1000,
      segmentIndex,
      selectedConfigId: best.config.id,
      spreadBps,
      slippageBps,
      rebalanceThresholdBps,
      totalExposureCap,
      maxPositionPct,
      mptLookback,
      riskAversion,
      shrinkage,
    });

    const segmentCurve = simulated.curve;

    if (segmentCurve.length < 2) continue;

    await saveWalkForwardSignals({
      market,
      runId: configId,
      signals: forwardSignals,
    });

    await saveWalkForwardTrades({
      market,
      runId: configId,
      trades: simulated.trades,
    });

    const pointsToAdd = curve.length
      ? segmentCurve.filter((point) => point.date > curve[curve.length - 1].date)
      : segmentCurve;

    await appendWalkForwardCurvePoints({
      market,
      configId,
      points: pointsToAdd,
    });

    curve.push(...pointsToAdd);
    currentEquity = curve[curve.length - 1].equity;

    const segmentMetrics = {
      ...computeCurveMetrics(segmentCurve),
      trades: simulated.trades.length,
    };

    const segment = {
      segmentIndex,
      trainStart,
      trainEnd,
      testStart,
      testEnd,
      selectedConfig: best.config,
      trainScore: best.trainScore,
      testScore: best.testScore,
      metrics: segmentMetrics,
    };

    await appendWalkForwardSegment({ market, configId, segment });
    segments.push(segment);

    await updateStrategyJob(jobId, {
      progress: Math.round(((plannedIndex + 1) / Math.max(1, plannedSegments.length)) * 100),
      cursorValue: String(plannedIndex + 1),
      summary: {
        processedSegments: plannedIndex + 1,
        totalSegments: plannedSegments.length,
        latestSegment: segment,
      },
    });
  }

  if (curve.length < 2) {
    await updateStrategyJob(jobId, {
      status: "completed",
      progress: Math.round((endSegment / Math.max(1, plannedSegments.length)) * 100),
      completedAt: new Date().toISOString(),
      cursorValue: String(endSegment),
      summary: {
        reason: "NO_VALID_WALK_FORWARD_SEGMENTS_YET",
        startSegment,
        endSegment,
        totalSegments: plannedSegments.length,
      },
    });

    res.status(200).json({
      ok: false,
      market,
      configId,
      jobId,
      reason: "NO_VALID_WALK_FORWARD_SEGMENTS_YET",
      startSegment,
      nextSegment: endSegment,
      totalSegments: plannedSegments.length,
    });
    return;
  }

  const metrics = computeCurveMetrics(curve);
  const benchmarkCurve = buildEqualWeightBenchmarkCurve({
    barsBySymbol,
    dates: curve.map((point) => point.date),
    startingEquity: 1000,
    totalExposureCap,
    maxSymbols: symbolLimit,
  });
  const benchmarkMetrics = computeCurveMetrics(benchmarkCurve);
  const benchmarkComparison = summarizeBenchmarkComparison(metrics, benchmarkMetrics);
  const currentPromotedMetrics = await loadCurrentPromotedWalkForwardMetrics(market);
  const tradeCount = segments.reduce((sum, segment) => {
    return sum + Number(segment.metrics?.trades ?? 0);
  }, 0);

  const promotionDecision = isWalkForwardPromotionEligible({
    candidateMetrics: metrics,
    currentMetrics: currentPromotedMetrics,
    benchmarkMetrics,
    segments: segments.length,
    trades: tradeCount,
  });

  await saveWalkForwardResult({
    market,
    configId,
    curve,
    segments,
    metrics,
    benchmarkComparison,
    promotionDecision,
  });

  if (promotionDecision.eligible && segments.length) {
    const lastSegment = segments[segments.length - 1];
    const selectedConfigId = lastSegment?.selectedConfig?.id;

    if (selectedConfigId) {
      await promoteConfig(market, selectedConfigId, "paper_promoted", "paper_promoted");
    }
  }

  await setCache(
    `strategy:walkforward:summary:${market}:${configId}`,
    {
      market,
      configId,
      ...metrics,
      segments: segments.length,
      updatedAt: Date.now(),
      source: "walk-forward-shared-engine",
    },
    60 * 10,
  );

  await setCache(
    `strategy:walkforward:history:${market}:${configId}`,
    {
      market,
      configId,
      data: curve,
      items: curve,
      total: curve.length,
      segments: segments.length,
      updatedAt: Date.now(),
      source: "walk-forward-shared-engine",
    },
    60 * 10,
  );

  res.status(200).json({
    ok: true,
    market,
    configId,
    symbols: barsBySymbol.size,
    points: curve.length,
    segments: segments.length,
    historicalSignalsSaved: true,
    statefulTradesSaved: true,
    tradeModel: "long-only-stateful-next-bar-mpt",
    allocationModel: "constrained-shrinkage-mpt",
    executionProfile: executionPreset.profile,
    spreadBps,
    slippageBps,
    rebalanceThresholdBps,
    totalExposureCap,
    maxPositionPct,
    mptLookback,
    riskAversion,
    shrinkage,
    benchmark: {
      metrics: benchmarkMetrics,
      comparison: benchmarkComparison,
    },
    promotion: promotionDecision,
    quality,
    versions: strategyVersionPayload(),
    metrics,
    source: "walk-forward-stateful-long-only",
  });
}




async function handleCronForwardValidate(req, res) {
  const url = new URL(req.url, "https://stocks-optimizer.vercel.app");
  const secret = url.searchParams.get("secret");

  if (process.env.CRON_SECRET && secret !== process.env.CRON_SECRET) {
    res.status(401).json({ error: "UNAUTHORIZED" });
    return;
  }

  const requestedMarkets = String(url.searchParams.get("markets") || "ALL").trim();
  const marketLimit = Math.min(12, Math.max(1, Number(url.searchParams.get("marketLimit") || 4)));

  let markets = [];

  if (requestedMarkets.toUpperCase() === "ALL") {
    const { rows } = await query(
      `
      SELECT DISTINCT market
      FROM strategy_configs
      WHERE status = 'paper_promoted'
      ORDER BY market ASC
      LIMIT $1
      `,
      [marketLimit],
    );

    markets = rows.map((row) => marketKey(row.market));
  } else {
    markets = requestedMarkets.split(",").map(marketKey).filter(Boolean).slice(0, marketLimit);
  }

  const results = [];

  for (const market of markets) {
    try {
      const promoted = await loadPromotedConfig(market, ["paper_promoted"]);

      if (!promoted || promoted.configId === "default") {
        results.push({
          ok: false,
          market,
          reason: "NO_PAPER_PROMOTED_CONFIG",
        });
        continue;
      }

      const result = await evaluateForwardValidation({
        market,
        configId: promoted.configId,
        autoPromote: true,
      });

      results.push({
        ok: true,
        ...result,
      });
    } catch (error) {
      results.push({
        ok: false,
        market,
        error: error.message,
      });
    }
  }

  res.status(200).json({
    ok: true,
    markets,
    results,
  });
}


async function handleCronWalkForward(req, res) {
  const url = new URL(req.url, "https://stocks-optimizer.vercel.app");
  const secret = url.searchParams.get("secret");

  if (process.env.CRON_SECRET && secret !== process.env.CRON_SECRET) {
    res.status(401).json({ error: "UNAUTHORIZED" });
    return;
  }

  const requestedMarkets = String(url.searchParams.get("markets") || "ALL").trim();
  const marketLimit = Math.min(4, Math.max(1, Number(url.searchParams.get("marketLimit") || 2)));
  const symbolLimit = Math.min(80, Math.max(5, Number(url.searchParams.get("symbolLimit") || 30)));
  const configLimit = Math.min(80, Math.max(5, Number(url.searchParams.get("configLimit") || 40)));
  const trainDays = Math.min(900, Math.max(120, Number(url.searchParams.get("trainDays") || 365)));
  const testDays = Math.min(180, Math.max(20, Number(url.searchParams.get("testDays") || 63)));
  const stepDays = Math.min(180, Math.max(20, Number(url.searchParams.get("stepDays") || testDays)));
  const executionOverrides = {
    spreadBps: url.searchParams.get("spreadBps"),
    slippageBps: url.searchParams.get("slippageBps"),
    rebalanceThresholdBps: url.searchParams.get("rebalanceThresholdBps"),
    totalExposureCap: url.searchParams.get("totalExposureCap"),
    maxPositionPct: url.searchParams.get("maxPositionPct"),
    mptLookback: url.searchParams.get("mptLookback"),
    riskAversion: url.searchParams.get("riskAversion"),
    shrinkage: url.searchParams.get("shrinkage"),
  };

  let markets = [];

  if (requestedMarkets.toUpperCase() === "ALL") {
    const { rows } = await query(
      `
      SELECT market, COUNT(DISTINCT symbol)::int AS symbols
      FROM stock_price_history
      GROUP BY market
      HAVING COUNT(DISTINCT symbol) > 0
      ORDER BY symbols DESC, market ASC
      LIMIT $1
      `,
      [marketLimit],
    );

    markets = rows.map((row) => marketKey(row.market));
  } else {
    markets = requestedMarkets.split(",").map(marketKey).filter(Boolean).slice(0, marketLimit);
  }

  const results = [];

  for (const market of markets) {
    try {
      const fakeReq = {
        method: "POST",
        body: {
          market,
          configId: "rolling",
          symbolLimit,
          configLimit,
          trainDays,
          testDays,
          stepDays,
          ...(executionOverrides.spreadBps != null ? { spreadBps: executionOverrides.spreadBps } : {}),
          ...(executionOverrides.slippageBps != null ? { slippageBps: executionOverrides.slippageBps } : {}),
          ...(executionOverrides.rebalanceThresholdBps != null ? { rebalanceThresholdBps: executionOverrides.rebalanceThresholdBps } : {}),
          ...(executionOverrides.totalExposureCap != null ? { totalExposureCap: executionOverrides.totalExposureCap } : {}),
          ...(executionOverrides.maxPositionPct != null ? { maxPositionPct: executionOverrides.maxPositionPct } : {}),
          ...(executionOverrides.mptLookback != null ? { mptLookback: executionOverrides.mptLookback } : {}),
          ...(executionOverrides.riskAversion != null ? { riskAversion: executionOverrides.riskAversion } : {}),
          ...(executionOverrides.shrinkage != null ? { shrinkage: executionOverrides.shrinkage } : {}),
        },
      };

      let payload = null;

      const fakeRes = {
        status(code) {
          this.statusCode = code;
          return this;
        },
        json(data) {
          payload = data;
          return data;
        },
      };

      await handleWalkForwardMarket(fakeReq, fakeRes);

      results.push(payload);
    } catch (error) {
      results.push({
        ok: false,
        market,
        error: error.message,
      });
    }
  }

  res.status(200).json({
    ok: true,
    markets,
    results,
  });
}


async function handleCronOptimize(req, res) {
  const url = new URL(req.url, "https://stocks-optimizer.vercel.app");
  const secret = url.searchParams.get("secret");

  if (process.env.CRON_SECRET && secret !== process.env.CRON_SECRET) {
    res.status(401).json({ error: "UNAUTHORIZED" });
    return;
  }

  const requestedMarkets = String(url.searchParams.get("markets") || "ALL").trim();
  const marketLimit = Math.min(6, Math.max(1, Number(url.searchParams.get("marketLimit") || 2)));
  const symbolLimit = Math.min(60, Math.max(5, Number(url.searchParams.get("symbolLimit") || 12)));
  const configLimit = Math.min(80, Math.max(5, Number(url.searchParams.get("configLimit") || 30)));

  let markets = [];

  if (requestedMarkets.toUpperCase() === "ALL") {
    const { rows } = await query(
      `
      SELECT market, COUNT(DISTINCT symbol)::int AS symbols
      FROM stock_price_history
      GROUP BY market
      HAVING COUNT(DISTINCT symbol) > 0
      ORDER BY symbols DESC, market ASC
      LIMIT $1
      `,
      [marketLimit],
    );

    markets = rows.map((row) => marketKey(row.market));
  } else {
    markets = requestedMarkets.split(",").map(marketKey).filter(Boolean).slice(0, marketLimit);
  }

  const results = [];

  for (const market of markets) {
    try {
      const barsBySymbol = await loadBarsBySymbol({
        market,
        limitSymbols: symbolLimit,
      });

      const configs = generateConservativeConfigs();
      const evaluations = optimizeConfigsOnBars({
        market,
        barsBySymbol,
        configs,
        limit: configLimit,
      });

      const best = evaluations[0];

      if (!best) {
        results.push({
          ok: false,
          market,
          reason: "NO_VALID_EVALUATIONS",
        });
        continue;
      }

      await saveConfigResult(market, best, "candidate");
      await promoteConfig(market, best.config.id, "paper_promoted");

      await saveBacktest(market, best.config.id, {
        curve: best.curve,
        signals: best.signals,
        metrics: best.fullMetrics,
      });

      results.push({
        ok: true,
        market,
        promoted: best.config.id,
        score: best.score,
        metrics: best.fullMetrics,
      });
    } catch (error) {
      results.push({
        ok: false,
        market,
        error: error.message,
      });
    }
  }

  res.status(200).json({
    ok: true,
    markets,
    marketLimit,
    symbolLimit,
    configLimit,
    results,
  });
}


async function handleCronBacktest(req, res) {
  const url = new URL(req.url, "https://stocks-optimizer.vercel.app");
  const secret = url.searchParams.get("secret");

  if (process.env.CRON_SECRET && secret !== process.env.CRON_SECRET) {
    res.status(401).json({ error: "UNAUTHORIZED" });
    return;
  }

  const requestedMarkets = String(url.searchParams.get("markets") || "ALL").trim();
  const marketLimit = Math.min(12, Math.max(1, Number(url.searchParams.get("marketLimit") || 4)));
  const limitSymbols = Math.min(80, Math.max(2, Number(url.searchParams.get("limitSymbols") || 12)));

  let markets = [];

  if (requestedMarkets.toUpperCase() === "ALL") {
    const { rows } = await query(
      `
      SELECT market, COUNT(DISTINCT symbol)::int AS symbols
      FROM stock_price_history
      GROUP BY market
      HAVING COUNT(DISTINCT symbol) > 0
      ORDER BY symbols DESC, market ASC
      LIMIT $1
      `,
      [marketLimit],
    );

    markets = rows.map((row) => marketKey(row.market));
  } else {
    markets = requestedMarkets.split(",").map(marketKey).filter(Boolean).slice(0, marketLimit);
  }

  const results = [];

  for (const market of markets) {
    try {
      const barsBySymbol = await loadBarsBySymbol({ market, limitSymbols });
      const result = buildBacktestFromSharedEngine({ market, barsBySymbol, config: {} });

      if (result.curve.length >= 2) {
        await saveBacktest(market, "default", result);
      }

      results.push({
        ok: result.curve.length >= 2,
        market,
        symbols: barsBySymbol.size,
        points: result.curve.length,
        metrics: result.metrics,
      });
    } catch (error) {
      results.push({
        ok: false,
        market,
        error: error.message,
      });
    }
  }

  res.status(200).json({
    ok: true,
    markets,
    marketLimit,
    limitSymbols,
    results,
  });
}

module.exports = async function handler(req, res) {
  try {
    const route = routeName(req);

    const mappedJobType = HEAVY_ACTION_TO_JOB_TYPE[route];
    if (mappedJobType && req.method === "POST") {
      const body = getBody(req);
      const market = marketKey(body.market || new URL(req.url, "https://stocks-optimizer.vercel.app").searchParams.get("market"));

      if (market) {
        const rate = await enforceHeavyJobRateLimit({
          market,
          jobType: mappedJobType,
          cooldownSeconds: Number(process.env.STRATEGY_HEAVY_JOB_COOLDOWN_SECONDS || 60),
          allowResume: true,
        });

        if (!rate.allowed) {
          res.status(rate.resumable ? 202 : 429).json({
            ok: false,
            error: rate.reason,
            market,
            jobType: mappedJobType,
            activeJob: rate.activeJob || null,
            recentJob: rate.recentJob || null,
            retryAfterSeconds: rate.retryAfterSeconds || null,
            message: rate.resumable
              ? "A partial job exists. Resume it with action=run-job or call walk-forward-market with resume=true and a new idempotency key."
              : "A heavy job is already active or cooling down for this market/job type.",
          });
          return;
        }
      }
    }

    if (route === "migrate") {
      await handleMigrate(req, res);
      return;
    }

    if (route === "live-market") {
      await handleLiveMarket(req, res);
      return;
    }

    if (route === "signals") {
      await handleSignals(req, res);
      return;
    }

    if (route === "walk-forward-market") {
      await handleWalkForwardMarket(req, res);
      return;
    }

    if (route === "optimize-market") {
      await handleOptimizeMarket(req, res);
      return;
    }

    if (route === "backtest-market") {
      await handleBacktestMarket(req, res);
      return;
    }

    if (route === "forward-validate") {
      await handleForwardValidate(req, res);
      return;
    }

    if (route === "set-control") {
      await handleSetControl(req, res);
      return;
    }

    if (route === "control-state") {
      await handleControlState(req, res);
      return;
    }

    if (route === "force-cash") {
      await handleForceCash(req, res);
      return;
    }

    if (route === "create-job") {
      await handleCreateJob(req, res);
      return;
    }

    if (route === "claim-next-job") {
      await handleClaimNextJob(req, res);
      return;
    }

    if (route === "run-job") {
      await handleRunJob(req, res);
      return;
    }

    if (route === "cancel-job") {
      await handleCancelJob(req, res);
      return;
    }

    if (route === "job-status") {
      await handleJobStatus(req, res);
      return;
    }

    if (route === "audit-log") {
      await handleAuditLog(req, res);
      return;
    }

    if (route === "retire-config") {
      await handleRetireConfig(req, res);
      return;
    }

    if (route === "data-quality") {
      await handleDataQuality(req, res);
      return;
    }

    if (route === "best-configs") {
      await handleBestConfigs(req, res);
      return;
    }

    if (route === "walk-forward-trades") {
      await handleWalkForwardTrades(req, res);
      return;
    }

    if (route === "walk-forward-signals") {
      await handleWalkForwardSignals(req, res);
      return;
    }

    if (route === "walk-forward-summary") {
      await handleWalkForwardSummary(req, res);
      return;
    }

    if (route === "walk-forward-history") {
      await handleWalkForwardHistory(req, res);
      return;
    }

    if (route === "backtest-summary") {
      await handleBacktestSummary(req, res);
      return;
    }

    if (route === "backtest-history") {
      await handleBacktestHistory(req, res);
      return;
    }

    if (route === "cron-forward-validate") {
      await handleCronForwardValidate(req, res);
      return;
    }

    if (route === "cron-walk-forward") {
      await handleCronWalkForward(req, res);
      return;
    }

    if (route === "cron-optimize") {
      await handleCronOptimize(req, res);
      return;
    }

    if (route === "cron-backtest") {
      await handleCronBacktest(req, res);
      return;
    }

    res.status(404).json({
      error: "STRATEGY_ROUTE_NOT_FOUND",
      route,
    });
  } catch (error) {
    res.status(500).json({
      error: "STRATEGY_ROUTE_FAILED",
      message: error.message,
      stack: process.env.NODE_ENV === "development" ? error.stack : undefined,
    });
  }
};
