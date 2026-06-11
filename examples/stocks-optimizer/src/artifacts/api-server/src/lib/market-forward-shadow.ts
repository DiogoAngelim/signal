import { createHash } from "node:crypto";
import { pool } from "@workspace/db";
import type { MarketBacktestConfig } from "./market-backtest-config";

type ForwardShadowSignal = {
  symbol?: string;
  ticker?: string;
  market?: string;
  signalAction?: string;
  allocationAction?: string;
  signalStatus?: string;
  signalDate?: string;
  observedAt?: string;
  entryPrice?: number;
  price?: number;
  close?: number;
  suggestedExposure?: number;
};

type ShadowObservation = {
  id: string;
  market: string;
  configId: string;
  symbol: string;
  signalAction: string;
  signalDate: string;
  observedAt: string;
  horizonDays: number;
  entryPrice: number;
  exitPrice: number | null;
  evaluatedAt: string | null;
  forwardReturnPct: number | null;
  source: string;
  signalPayload: any;
};

type ForwardShadowEvidence = {
  requiredSignals: number;
  confirmedSignalCount: number;
  observedSignalCount: number;
  openSignalCount: number;
  evaluatedSignalCount: number;
  maturedUnevaluatedCount: number;
  hitRatePct: number | null;
  averageReturnPct: number | null;
  latestObservationAt: string | null;
  oldestOpenObservationAt: string | null;
  collectionStatus:
    | "not_started"
    | "collecting"
    | "insufficient_evidence"
    | "passed";
  storage: "postgres" | "memory";
  warnings: string[];
  passed: boolean;
};

const MEMORY_OBSERVATIONS = new Map<string, ShadowObservation>();

let schemaReady: Promise<void> | null = null;
let postgresUnavailableReason: string | null = null;

function finiteNumber(value: unknown) {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function isoDate(value: unknown) {
  const text = String(value ?? "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;

  const timestamp = Date.parse(text);
  if (Number.isFinite(timestamp)) {
    return new Date(timestamp).toISOString().slice(0, 10);
  }

  return new Date().toISOString().slice(0, 10);
}

function isoDateTime(value: unknown) {
  const timestamp = Date.parse(String(value ?? ""));
  if (Number.isFinite(timestamp)) return new Date(timestamp).toISOString();
  return new Date().toISOString();
}

function observationId(input: {
  market: string;
  configId: string;
  symbol: string;
  signalAction: string;
  signalDate: string;
}) {
  return createHash("sha256")
    .update(
      [
        input.market,
        input.configId,
        input.symbol,
        input.signalAction,
        input.signalDate,
      ].join("|"),
    )
    .digest("hex")
    .slice(0, 32);
}

function normalizeConfirmedSignal(
  market: string,
  config: MarketBacktestConfig,
  signal: ForwardShadowSignal,
): ShadowObservation | null {
  const symbol = String(signal.symbol ?? signal.ticker ?? "")
    .trim()
    .toUpperCase();
  const signalAction = String(
    signal.signalAction ?? signal.allocationAction ?? "",
  ).trim();
  const entryPrice =
    finiteNumber(signal.entryPrice) ??
    finiteNumber(signal.price) ??
    finiteNumber(signal.close);
  const suggestedExposure = finiteNumber(signal.suggestedExposure) ?? 0;

  if (
    !symbol ||
    signal.signalStatus !== "confirmed" ||
    signalAction !== "Buy" ||
    suggestedExposure <= 0 ||
    entryPrice == null ||
    entryPrice <= 0
  ) {
    return null;
  }

  const signalDate = isoDate(signal.signalDate ?? signal.observedAt);

  return {
    id: observationId({
      market,
      configId: config.id,
      symbol,
      signalAction,
      signalDate,
    }),
    market,
    configId: config.id,
    symbol,
    signalAction,
    signalDate,
    observedAt: isoDateTime(signal.observedAt ?? signal.signalDate),
    horizonDays: config.holdingDays,
    entryPrice,
    exitPrice: null,
    evaluatedAt: null,
    forwardReturnPct: null,
    source: "stocks-optimizer-forward-shadow",
    signalPayload: signal,
  };
}

function currentPriceBySymbol(signals: ForwardShadowSignal[]) {
  const prices = new Map<string, number>();

  for (const signal of signals) {
    const symbol = String(signal.symbol ?? signal.ticker ?? "")
      .trim()
      .toUpperCase();
    const price =
      finiteNumber(signal.price) ??
      finiteNumber(signal.entryPrice) ??
      finiteNumber(signal.close);

    if (symbol && price != null && price > 0) {
      prices.set(symbol, price);
    }
  }

  return prices;
}

function isMature(observation: ShadowObservation, now = Date.now()) {
  const observedAt = Date.parse(observation.observedAt);
  if (!Number.isFinite(observedAt)) return false;
  return now - observedAt >= observation.horizonDays * 86_400_000;
}

function evaluateOpenObservations(
  observations: ShadowObservation[],
  prices: Map<string, number>,
) {
  const updates: ShadowObservation[] = [];
  const nowIso = new Date().toISOString();

  for (const observation of observations) {
    if (observation.evaluatedAt || !isMature(observation)) continue;

    const exitPrice = prices.get(observation.symbol);
    if (exitPrice == null || exitPrice <= 0) continue;

    observation.exitPrice = exitPrice;
    observation.evaluatedAt = nowIso;
    observation.forwardReturnPct =
      (exitPrice / observation.entryPrice - 1) * 100;
    updates.push(observation);
  }

  return updates;
}

function summarizeEvidence(input: {
  requiredSignals: number;
  confirmedSignalCount: number;
  observations: ShadowObservation[];
  storage: "postgres" | "memory";
  warnings: string[];
}): ForwardShadowEvidence {
  const evaluated = input.observations.filter(
    (observation) =>
      observation.evaluatedAt != null &&
      observation.forwardReturnPct != null &&
      Number.isFinite(Number(observation.forwardReturnPct)),
  );
  const returns = evaluated.map((observation) =>
    Number(observation.forwardReturnPct),
  );
  const open = input.observations.filter(
    (observation) => !observation.evaluatedAt,
  );
  const hitRatePct = returns.length
    ? (returns.filter((value) => value > 0).length / returns.length) * 100
    : null;
  const averageReturnPct = returns.length
    ? returns.reduce((sum, value) => sum + value, 0) / returns.length
    : null;
  const latestObservationAt =
    input.observations
      .map((observation) => observation.observedAt)
      .filter(Boolean)
      .sort((a, b) => b.localeCompare(a))[0] ?? null;
  const oldestOpenObservationAt =
    open
      .map((observation) => observation.observedAt)
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b))[0] ?? null;
  const passed =
    evaluated.length >= input.requiredSignals &&
    (hitRatePct ?? 0) >= 45 &&
    (averageReturnPct ?? 0) > 0;
  const collectionStatus = passed
    ? "passed"
    : evaluated.length > 0
      ? "insufficient_evidence"
      : input.observations.length > 0
        ? "collecting"
        : "not_started";

  return {
    requiredSignals: input.requiredSignals,
    confirmedSignalCount: input.confirmedSignalCount,
    observedSignalCount: input.observations.length,
    openSignalCount: open.length,
    evaluatedSignalCount: evaluated.length,
    maturedUnevaluatedCount: open.filter((observation) => isMature(observation))
      .length,
    hitRatePct,
    averageReturnPct,
    latestObservationAt,
    oldestOpenObservationAt,
    collectionStatus,
    storage: input.storage,
    warnings: input.warnings,
    passed,
  };
}

async function ensureSchema() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not configured");
  }

  schemaReady ??= (async () => {
    const client = await pool.connect();

    try {
      await client.query("BEGIN");
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtext('stock_forward_shadow_observations_schema'))",
      );
      await client.query(`
        CREATE TABLE IF NOT EXISTS stock_forward_shadow_observations (
          id TEXT PRIMARY KEY,
          market TEXT NOT NULL,
          config_id TEXT NOT NULL,
          symbol TEXT NOT NULL,
          signal_action TEXT NOT NULL,
          signal_date DATE NOT NULL,
          observed_at TIMESTAMPTZ NOT NULL,
          horizon_days INTEGER NOT NULL,
          entry_price DOUBLE PRECISION NOT NULL,
          exit_price DOUBLE PRECISION,
          evaluated_at TIMESTAMPTZ,
          forward_return_pct DOUBLE PRECISION,
          source TEXT NOT NULL DEFAULT 'stocks-optimizer-forward-shadow',
          signal_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_stock_forward_shadow_market_config
          ON stock_forward_shadow_observations (market, config_id, observed_at DESC)
      `);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  })();

  try {
    await schemaReady;
  } catch (error) {
    schemaReady = null;

    if (
      error instanceof Error &&
      /duplicate key value|already exists|pg_type_typname_nsp_index/i.test(
        error.message,
      )
    ) {
      await new Promise((resolve) => setTimeout(resolve, 250));
      return;
    }

    throw error;
  }
}

async function collectWithPostgres(
  market: string,
  config: MarketBacktestConfig,
  observations: ShadowObservation[],
  prices: Map<string, number>,
) {
  await ensureSchema();

  for (const observation of observations) {
    await pool.query(
      `
        INSERT INTO stock_forward_shadow_observations (
          id,
          market,
          config_id,
          symbol,
          signal_action,
          signal_date,
          observed_at,
          horizon_days,
          entry_price,
          source,
          signal_payload
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb)
        ON CONFLICT (id) DO UPDATE SET
          signal_payload = EXCLUDED.signal_payload,
          updated_at = NOW()
      `,
      [
        observation.id,
        observation.market,
        observation.configId,
        observation.symbol,
        observation.signalAction,
        observation.signalDate,
        observation.observedAt,
        observation.horizonDays,
        observation.entryPrice,
        observation.source,
        JSON.stringify(observation.signalPayload ?? {}),
      ],
    );
  }

  const result = await pool.query(
    `
      SELECT
        id,
        market,
        config_id,
        symbol,
        signal_action,
        signal_date::text,
        observed_at::text,
        horizon_days,
        entry_price,
        exit_price,
        evaluated_at::text,
        forward_return_pct,
        source,
        signal_payload
      FROM stock_forward_shadow_observations
      WHERE market = $1 AND config_id = $2
      ORDER BY observed_at DESC
      LIMIT 2000
    `,
    [market, config.id],
  );

  const stored: ShadowObservation[] = result.rows.map((row: any) => ({
    id: row.id,
    market: row.market,
    configId: row.config_id,
    symbol: row.symbol,
    signalAction: row.signal_action,
    signalDate: isoDate(row.signal_date),
    observedAt: isoDateTime(row.observed_at),
    horizonDays: Number(row.horizon_days),
    entryPrice: Number(row.entry_price),
    exitPrice: finiteNumber(row.exit_price),
    evaluatedAt: row.evaluated_at ? isoDateTime(row.evaluated_at) : null,
    forwardReturnPct: finiteNumber(row.forward_return_pct),
    source: row.source,
    signalPayload: row.signal_payload ?? {},
  }));
  const updates = evaluateOpenObservations(stored, prices);

  for (const update of updates) {
    await pool.query(
      `
        UPDATE stock_forward_shadow_observations
        SET
          exit_price = $2,
          evaluated_at = $3,
          forward_return_pct = $4,
          updated_at = NOW()
        WHERE id = $1
      `,
      [
        update.id,
        update.exitPrice,
        update.evaluatedAt,
        update.forwardReturnPct,
      ],
    );
  }

  return stored;
}

function collectWithMemory(
  market: string,
  config: MarketBacktestConfig,
  observations: ShadowObservation[],
  prices: Map<string, number>,
) {
  for (const observation of observations) {
    if (!MEMORY_OBSERVATIONS.has(observation.id)) {
      MEMORY_OBSERVATIONS.set(observation.id, observation);
    }
  }

  const stored = Array.from(MEMORY_OBSERVATIONS.values())
    .filter(
      (observation) =>
        observation.market === market && observation.configId === config.id,
    )
    .sort((a, b) => b.observedAt.localeCompare(a.observedAt));
  evaluateOpenObservations(stored, prices);

  return stored;
}

export async function collectForwardShadowEvidence(
  marketInput: string,
  signals: ForwardShadowSignal[],
  config: MarketBacktestConfig,
): Promise<ForwardShadowEvidence> {
  const market = String(marketInput || "ADX")
    .trim()
    .toUpperCase();
  const signalList = Array.isArray(signals) ? signals : [];
  const observations = signalList
    .map((signal) => normalizeConfirmedSignal(market, config, signal))
    .filter(
      (observation): observation is ShadowObservation => observation != null,
    );
  const prices = currentPriceBySymbol(signalList);
  const warnings: string[] = [];
  let stored: ShadowObservation[];
  let storage: "postgres" | "memory" = "memory";

  if (process.env.DATABASE_URL && postgresUnavailableReason == null) {
    try {
      stored = await collectWithPostgres(market, config, observations, prices);
      storage = "postgres";
    } catch (error) {
      postgresUnavailableReason =
        error instanceof Error ? error.message : String(error);
      warnings.push(
        `Forward-shadow persistence fell back to memory: ${postgresUnavailableReason}`,
      );
      stored = collectWithMemory(market, config, observations, prices);
    }
  } else {
    if (postgresUnavailableReason) {
      warnings.push(
        `Forward-shadow persistence fell back to memory: ${postgresUnavailableReason}`,
      );
    }
    stored = collectWithMemory(market, config, observations, prices);
  }

  return summarizeEvidence({
    requiredSignals: config.minimumForwardSignals,
    confirmedSignalCount: observations.length,
    observations: stored,
    storage,
    warnings,
  });
}
