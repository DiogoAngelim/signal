import { pool } from "@workspace/db";
import {
  attachSignalsToQuotes,
  fetchMarketQuotes,
  fetchQuotes,
  loadMarketList,
  loadStockList,
  type StockQuote,
} from "./stock-data";
import { appendLiveMarketContextOccurrences } from "./market-context-occurrences";
import { logger } from "./logger";

export type SignalScopeType = "market" | "exchange";

export interface SignalScope {
  scopeType: SignalScopeType;
  scopeCode: string;
}

export interface BackgroundSignalEngineStatus {
  enabled: boolean;
  started: boolean;
  running: boolean;
  refreshIntervalMs: number;
  snapshotFreshnessMs: number;
  watchTtlMs: number;
  lastStartedAt: string | null;
  lastCompletedAt: string | null;
  lastError: string | null;
  cycleCount: number;
  activeWatchCount: number;
  snapshotCount: number;
}

const WATCHLIST_TABLE = "stock_signal_watchlist";
const SNAPSHOT_TABLE = "stock_signal_snapshots";
const EVENT_TABLE = "stock_signal_events";
const REFRESH_INTERVAL_MS = Number(
  process.env.STOCK_SIGNAL_REFRESH_INTERVAL_MS ?? 5_000,
);
const SNAPSHOT_FRESHNESS_MS = Number(
  process.env.STOCK_SIGNAL_SNAPSHOT_FRESHNESS_MS ??
  Math.max(REFRESH_INTERVAL_MS * 2, 120_000),
);
const WATCH_TTL_MS = Number(
  process.env.STOCK_SIGNAL_WATCH_TTL_MS ?? 24 * 60 * 60 * 1000,
);
const MAX_SYMBOLS_PER_CYCLE = Number(
  process.env.STOCK_SIGNAL_MAX_SYMBOLS_PER_CYCLE ?? 240,
);
const SIGNAL_REFRESH_CHUNK_SIZE = Number(
  process.env.STOCK_SIGNAL_REFRESH_CHUNK_SIZE ?? 30,
);
const BOOTSTRAP_SYMBOLS_PER_SCOPE = Number(
  process.env.STOCK_SIGNAL_BOOTSTRAP_SYMBOLS_PER_SCOPE ?? 24,
);
const BOOTSTRAP_SCOPES = parseBootstrapScopes(
  process.env.STOCK_SIGNAL_BOOTSTRAP_SCOPES ?? "exchange:US",
);
const ENGINE_ENABLED = parseBooleanEnv(
  process.env.ENABLE_BACKGROUND_SIGNAL_ENGINE,
  !process.env.VERCEL,
);

type SnapshotRow = {
  scope_type: SignalScopeType;
  scope_code: string;
  symbol: string;
  price: number;
  change_percent: number;
  status: StockQuote["status"];
  high_52: number;
  low_52: number;
  history: unknown;
  summary: string;
  impact: string;
  cap: string | null;
  pe_ratio: number | null;
  signal_action: StockQuote["signalAction"];
  signal_confidence: number | null;
  signal_source: StockQuote["signalSource"];
  signal_emitted_at: string | Date | null;
  signal_entry_price: number | null;
  signal_return_percent: number | null;
  fetched_at: string | Date;
};

type WatchlistRow = {
  scope_type: SignalScopeType;
  scope_code: string;
  symbol: string;
};

type SignalEventRow = {
  id: string;
  scope_type: SignalScopeType;
  scope_code: string;
  symbol: string;
  event_token: string;
  payload: unknown;
  emitted_at: string | Date;
};

const runtimeState: Omit<
  BackgroundSignalEngineStatus,
  "activeWatchCount" | "snapshotCount"
> = {
  enabled: ENGINE_ENABLED,
  started: false,
  running: false,
  refreshIntervalMs: REFRESH_INTERVAL_MS,
  snapshotFreshnessMs: SNAPSHOT_FRESHNESS_MS,
  watchTtlMs: WATCH_TTL_MS,
  lastStartedAt: null,
  lastCompletedAt: null,
  lastError: null,
  cycleCount: 0,
};

let schemaReady: Promise<void> | null = null;
let engineStarted = false;

function parseBooleanEnv(
  value: string | undefined,
  fallback: boolean,
): boolean {
  if (!value) return fallback;
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
}

function parseBootstrapScopes(value: string): SignalScope[] {
  const scopes = value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [rawType, ...rest] = entry.split(":");
      const scopeCode = rest.join(":").trim();
      const scopeType =
        rawType?.trim().toLowerCase() === "market" ? "market" : "exchange";

      if (!scopeCode) {
        return null;
      }

      return {
        scopeType,
        scopeCode: normalizeScopeCode(scopeCode),
      } satisfies SignalScope;
    })
    .filter((entry): entry is SignalScope => Boolean(entry));

  return scopes.length ? scopes : [{ scopeType: "exchange", scopeCode: "US" }];
}

function normalizeScopeCode(value: string): string {
  const normalized = value.trim().toUpperCase();
  return normalized || "GLOBAL";
}

function normalizeSymbol(value: string): string {
  return value.trim().toUpperCase();
}

function toIsoString(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

function parseHistory(value: unknown): number[] {
  if (Array.isArray(value)) {
    return value.map(Number).filter((item) => Number.isFinite(item));
  }

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed)
        ? parsed.map(Number).filter((item) => Number.isFinite(item))
        : [];
    } catch {
      return [];
    }
  }

  return [];
}

function mapSnapshotRow(row: SnapshotRow): StockQuote {
  return {
    symbol: row.symbol,
    price: Number(row.price ?? 0),
    changePercent: Number(row.change_percent ?? 0),
    status: row.status,
    high52: Number(row.high_52 ?? 0),
    low52: Number(row.low_52 ?? 0),
    history: parseHistory(row.history),
    summary: row.summary,
    impact: row.impact,
    cap: row.cap ?? undefined,
    peRatio: row.pe_ratio ?? undefined,
    signalAction: row.signal_action ?? undefined,
    signalConfidence: row.signal_confidence ?? undefined,
    signalSource: row.signal_source ?? undefined,
    signalEmittedAt: toIsoString(row.signal_emitted_at) ?? undefined,
    signalEntryPrice: row.signal_entry_price ?? undefined,
    signalReturnPercent: row.signal_return_percent ?? undefined,
  };
}

function mapSignalEventRow(row: SignalEventRow) {
  return {
    id: String(row.id),
    scopeType: row.scope_type,
    scopeCode: row.scope_code,
    symbol: row.symbol,
    token: row.event_token,
    emittedAt: toIsoString(row.emitted_at) ?? new Date().toISOString(),
    signal: row.payload,
  };
}

function signalEventToken(quote: StockQuote): string {
  const entryPrice = Number(quote.signalEntryPrice);
  const entryPriceKey =
    Number.isFinite(entryPrice) && entryPrice > 0
      ? String(entryPrice)
      : "market";
  const emittedAtKey =
    toIsoString(quote.signalEmittedAt) ??
    `${quote.signalAction ?? "Hold"}:${entryPriceKey}`;

  return [
    normalizeSymbol(quote.symbol),
    quote.signalAction ?? "Hold",
    quote.signalSource ?? "unknown",
    emittedAtKey,
    entryPriceKey,
  ].join("|");
}

async function ensureSignalBackendSchema(): Promise<void> {
  if (!schemaReady) {
    schemaReady = (async () => {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS ${WATCHLIST_TABLE} (
          scope_type TEXT NOT NULL,
          scope_code TEXT NOT NULL,
          symbol TEXT NOT NULL,
          enabled BOOLEAN NOT NULL DEFAULT TRUE,
          added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          last_requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          last_refreshed_at TIMESTAMPTZ,
          last_error TEXT,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          PRIMARY KEY (scope_type, scope_code, symbol)
        )
      `);

      await pool.query(`
        UPDATE ${WATCHLIST_TABLE}
        SET
          scope_type = CASE
            WHEN LOWER(TRIM(scope_type)) = 'market' THEN 'market'
            ELSE 'exchange'
          END,
          scope_code = UPPER(TRIM(scope_code)),
          symbol = UPPER(TRIM(symbol))
        WHERE
          scope_type <> CASE
            WHEN LOWER(TRIM(scope_type)) = 'market' THEN 'market'
            ELSE 'exchange'
          END
          OR scope_code <> UPPER(TRIM(scope_code))
          OR symbol <> UPPER(TRIM(symbol))
      `);

      await pool.query(`
        WITH ranked AS (
          SELECT
            ctid,
            ROW_NUMBER() OVER (
              PARTITION BY scope_type, scope_code, symbol
              ORDER BY updated_at DESC, added_at DESC, ctid DESC
            ) AS rn
          FROM ${WATCHLIST_TABLE}
        )
        DELETE FROM ${WATCHLIST_TABLE} target
        USING ranked
        WHERE target.ctid = ranked.ctid
          AND ranked.rn > 1
      `);

      await pool.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS ${WATCHLIST_TABLE}_scope_symbol_uidx
        ON ${WATCHLIST_TABLE} (scope_type, scope_code, symbol)
      `);

      await pool.query(`
        CREATE TABLE IF NOT EXISTS ${SNAPSHOT_TABLE} (
          scope_type TEXT NOT NULL,
          scope_code TEXT NOT NULL,
          symbol TEXT NOT NULL,
          price DOUBLE PRECISION NOT NULL DEFAULT 0,
          change_percent DOUBLE PRECISION NOT NULL DEFAULT 0,
          status TEXT NOT NULL DEFAULT 'Stable',
          high_52 DOUBLE PRECISION NOT NULL DEFAULT 0,
          low_52 DOUBLE PRECISION NOT NULL DEFAULT 0,
          history JSONB NOT NULL DEFAULT '[]'::jsonb,
          summary TEXT NOT NULL DEFAULT '',
          impact TEXT NOT NULL DEFAULT '',
          cap TEXT,
          pe_ratio DOUBLE PRECISION,
          signal_action TEXT,
          signal_confidence DOUBLE PRECISION,
          signal_source TEXT,
          signal_emitted_at TIMESTAMPTZ,
          signal_entry_price DOUBLE PRECISION,
          signal_return_percent DOUBLE PRECISION,
          fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          PRIMARY KEY (scope_type, scope_code, symbol)
        )
      `);

      await pool.query(`
        CREATE TABLE IF NOT EXISTS ${EVENT_TABLE} (
          id BIGSERIAL PRIMARY KEY,
          scope_type TEXT NOT NULL,
          scope_code TEXT NOT NULL,
          symbol TEXT NOT NULL,
          event_token TEXT,
          payload JSONB NOT NULL,
          emitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);

      await pool.query(`
        ALTER TABLE ${EVENT_TABLE}
        ADD COLUMN IF NOT EXISTS event_token TEXT
      `);

      await pool.query(`
        UPDATE ${EVENT_TABLE}
        SET
          scope_type = CASE
            WHEN LOWER(TRIM(scope_type)) = 'market' THEN 'market'
            ELSE 'exchange'
          END,
          scope_code = UPPER(TRIM(scope_code)),
          symbol = UPPER(TRIM(symbol)),
          event_token = COALESCE(
            NULLIF(event_token, ''),
            CONCAT(
              UPPER(TRIM(symbol)),
              '|',
              COALESCE(payload->>'signalAction', 'Hold'),
              '|',
              COALESCE(payload->>'signalSource', 'unknown'),
              '|',
              COALESCE(payload->>'signalEmittedAt', emitted_at::text),
              '|',
              COALESCE(payload->>'signalEntryPrice', 'market')
            )
          )
        WHERE
          scope_type <> CASE
            WHEN LOWER(TRIM(scope_type)) = 'market' THEN 'market'
            ELSE 'exchange'
          END
          OR scope_code <> UPPER(TRIM(scope_code))
          OR symbol <> UPPER(TRIM(symbol))
          OR event_token IS NULL
          OR event_token = ''
      `);

      await pool.query(`
        WITH ranked AS (
          SELECT
            id,
            ROW_NUMBER() OVER (
              PARTITION BY scope_type, scope_code, event_token
              ORDER BY emitted_at ASC, id ASC
            ) AS rn
          FROM ${EVENT_TABLE}
        )
        DELETE FROM ${EVENT_TABLE} target
        USING ranked
        WHERE target.id = ranked.id
          AND ranked.rn > 1
      `);

      await pool.query(`
        ALTER TABLE ${EVENT_TABLE}
        ALTER COLUMN event_token SET NOT NULL
      `);

      await pool.query(`
        CREATE INDEX IF NOT EXISTS ${EVENT_TABLE}_scope_emitted_idx
        ON ${EVENT_TABLE} (scope_type, scope_code, emitted_at DESC)
      `);

      await pool.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS ${EVENT_TABLE}_scope_token_uidx
        ON ${EVENT_TABLE} (scope_type, scope_code, event_token)
      `);

      await pool.query(`
        UPDATE ${SNAPSHOT_TABLE}
        SET
          scope_type = CASE
            WHEN LOWER(TRIM(scope_type)) = 'market' THEN 'market'
            ELSE 'exchange'
          END,
          scope_code = UPPER(TRIM(scope_code)),
          symbol = UPPER(TRIM(symbol))
        WHERE
          scope_type <> CASE
            WHEN LOWER(TRIM(scope_type)) = 'market' THEN 'market'
            ELSE 'exchange'
          END
          OR scope_code <> UPPER(TRIM(scope_code))
          OR symbol <> UPPER(TRIM(symbol))
      `);

      await pool.query(`
        WITH ranked AS (
          SELECT
            ctid,
            ROW_NUMBER() OVER (
              PARTITION BY scope_type, scope_code, symbol
              ORDER BY fetched_at DESC, updated_at DESC, ctid DESC
            ) AS rn
          FROM ${SNAPSHOT_TABLE}
        )
        DELETE FROM ${SNAPSHOT_TABLE} target
        USING ranked
        WHERE target.ctid = ranked.ctid
          AND ranked.rn > 1
      `);

      await pool.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS ${SNAPSHOT_TABLE}_scope_symbol_uidx
        ON ${SNAPSHOT_TABLE} (scope_type, scope_code, symbol)
      `);
    })().catch((error) => {
      schemaReady = null;
      throw error;
    });
  }

  await schemaReady;
}

async function countActiveWatchEntries(): Promise<number> {
  await ensureSignalBackendSchema();
  const result = await pool.query<{ count: string }>(
    `
      SELECT COUNT(*)::text AS count
      FROM ${WATCHLIST_TABLE}
      WHERE enabled = TRUE
        AND last_requested_at >= NOW() - (INTERVAL '1 millisecond' * $1)
    `,
    [WATCH_TTL_MS],
  );
  return Number(result.rows[0]?.count ?? 0);
}

async function countSnapshots(): Promise<number> {
  await ensureSignalBackendSchema();
  const result = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM ${SNAPSHOT_TABLE}`,
  );
  return Number(result.rows[0]?.count ?? 0);
}

async function loadDueWatchEntries(): Promise<WatchlistRow[]> {
  await ensureSignalBackendSchema();
  const result = await pool.query<WatchlistRow>(
    `
      SELECT scope_type, scope_code, symbol
      FROM ${WATCHLIST_TABLE}
      WHERE enabled = TRUE
        AND last_requested_at >= NOW() - (INTERVAL '1 millisecond' * $1)
        AND (
          last_refreshed_at IS NULL
          OR last_refreshed_at <= NOW() - (INTERVAL '1 millisecond' * $2)
        )
      ORDER BY COALESCE(last_refreshed_at, added_at) ASC
      LIMIT $3
    `,
    [WATCH_TTL_MS, REFRESH_INTERVAL_MS, MAX_SYMBOLS_PER_CYCLE],
  );

  return result.rows;
}

async function markWatchEntriesRefreshed(
  scope: SignalScope,
  symbols: string[],
  error?: string | null,
): Promise<void> {
  const normalizedSymbols = Array.from(
    new Set(symbols.map(normalizeSymbol)),
  ).filter(Boolean);
  if (!normalizedSymbols.length) return;

  await ensureSignalBackendSchema();
  await pool.query(
    `
      UPDATE ${WATCHLIST_TABLE}
      SET
        last_refreshed_at = NOW(),
        last_error = $4,
        updated_at = NOW()
      WHERE scope_type = $1
        AND scope_code = $2
        AND symbol = ANY($3::text[])
    `,
    [
      scope.scopeType,
      normalizeScopeCode(scope.scopeCode),
      normalizedSymbols,
      error ?? null,
    ],
  );
}

async function seedWatchlist(): Promise<void> {
  for (const scope of BOOTSTRAP_SCOPES) {
    const items =
      scope.scopeType === "market"
        ? loadMarketList(scope.scopeCode)
        : loadStockList(scope.scopeCode);
    const symbols = items
      .slice(0, Math.max(0, BOOTSTRAP_SYMBOLS_PER_SCOPE))
      .map((item) => item.symbol);

    if (symbols.length) {
      await registerSymbolsForBackgroundRefresh(scope, symbols);
    }
  }
}

async function refreshScope(
  scope: SignalScope,
  symbols: string[],
): Promise<StockQuote[]> {
  const normalizedSymbols = Array.from(
    new Set(symbols.map(normalizeSymbol)),
  ).filter(Boolean);
  if (!normalizedSymbols.length) {
    return [];
  }

  const scopedSymbols = filterSymbolsForScope(scope, normalizedSymbols);
  const skippedSymbols = normalizedSymbols.filter(
    (symbol) => !scopedSymbols.includes(symbol),
  );
  if (skippedSymbols.length) {
    await markWatchEntriesRefreshed(
      scope,
      skippedSymbols,
      "Symbol is not part of the selected market list.",
    );
  }
  if (!scopedSymbols.length) {
    return [];
  }

  const allQuotesWithSignals: StockQuote[] = [];

  for (let index = 0; index < scopedSymbols.length; index += SIGNAL_REFRESH_CHUNK_SIZE) {
    const chunk = scopedSymbols.slice(index, index + SIGNAL_REFRESH_CHUNK_SIZE);
    const quotes =
      scope.scopeType === "market"
        ? await fetchMarketQuotes(scope.scopeCode, chunk, {
          bypassCache: true,
        })
        : await fetchQuotes(scope.scopeCode, chunk, {
          bypassCache: true,
        });
    const quotesWithSignals = await attachSignalsToQuotes(
      quotes,
      scope.scopeCode,
      {
        bypassSignalCache: true,
      },
    );
    allQuotesWithSignals.push(...quotesWithSignals);
  }

  await storeSignalSnapshots(scope, allQuotesWithSignals);
  await markWatchEntriesRefreshed(scope, scopedSymbols, null);
  return allQuotesWithSignals;
}

function filterSymbolsForScope(scope: SignalScope, symbols: string[]): string[] {
  const sourceItems =
    scope.scopeType === "market"
      ? loadMarketList(scope.scopeCode)
      : loadStockList(scope.scopeCode);
  if (!sourceItems.length) {
    return symbols;
  }

  const allowedSymbols = new Set(sourceItems.map((item) => normalizeSymbol(item.symbol)));
  return symbols.filter((symbol) => allowedSymbols.has(symbol));
}

async function runRefreshCycle(): Promise<number> {
  const dueEntries = await loadDueWatchEntries();
  if (!dueEntries.length) {
    return 0;
  }

  const grouped = new Map<string, { scope: SignalScope; symbols: string[] }>();
  for (const entry of dueEntries) {
    const key = `${entry.scope_type}:${entry.scope_code}`;
    const current = grouped.get(key);
    if (current) {
      current.symbols.push(entry.symbol);
    } else {
      grouped.set(key, {
        scope: {
          scopeType: entry.scope_type,
          scopeCode: entry.scope_code,
        },
        symbols: [entry.symbol],
      });
    }
  }

  for (const group of grouped.values()) {
    try {
      const updatedSignals = await refreshScope(group.scope, group.symbols);
      // Broadcast updated signals after refresh
      if (signalBroadcast && updatedSignals.length) {
        await storeSignalEvents(group.scope, updatedSignals);
        signalBroadcast({
          type: "signal-update",
          scope: group.scope,
          signals: updatedSignals,
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Refresh failed";
      runtimeState.lastError = message;
      logger.error(
        {
          err: error,
          scopeType: group.scope.scopeType,
          scopeCode: group.scope.scopeCode,
          symbolCount: group.symbols.length,
        },
        "Background signal refresh failed",
      );
      await markWatchEntriesRefreshed(group.scope, group.symbols, message);
    }
  }

  return dueEntries.length;
}

async function runEngineLoop(): Promise<void> {
  runtimeState.running = true;
  runtimeState.lastStartedAt = new Date().toISOString();

  while (true) {
    let refreshedCount = 0;
    try {
      refreshedCount = await runRefreshCycle();
      runtimeState.cycleCount += 1;
      runtimeState.lastCompletedAt = new Date().toISOString();
    } catch (error) {
      runtimeState.lastError =
        error instanceof Error ? error.message : "Refresh cycle failed";
      logger.error({ err: error }, "Background signal engine cycle failed");
    }

    await new Promise((resolve) =>
      setTimeout(
        resolve,
        refreshedCount >= MAX_SYMBOLS_PER_CYCLE ? 100 : REFRESH_INTERVAL_MS,
      ),
    );
  }
}

export async function registerSymbolsForBackgroundRefresh(
  scope: SignalScope,
  symbols: string[],
): Promise<void> {
  const normalizedScopeCode = normalizeScopeCode(scope.scopeCode);
  const normalizedSymbols = Array.from(
    new Set(symbols.map(normalizeSymbol)),
  ).filter(Boolean);

  if (!normalizedSymbols.length) {
    return;
  }

  await ensureSignalBackendSchema();

  const values: string[] = [];
  const params: Array<string | boolean> = [];
  for (const symbol of normalizedSymbols) {
    const baseIndex = params.length;
    values.push(
      `($${baseIndex + 1}, $${baseIndex + 2}, $${baseIndex + 3}, $${baseIndex + 4}, NOW(), NOW(), NOW())`,
    );
    params.push(scope.scopeType, normalizedScopeCode, symbol, true);
  }

  await pool.query(
    `
      INSERT INTO ${WATCHLIST_TABLE} (
        scope_type,
        scope_code,
        symbol,
        enabled,
        added_at,
        last_requested_at,
        updated_at
      )
      VALUES ${values.join(", ")}
      ON CONFLICT (scope_type, scope_code, symbol)
      DO UPDATE SET
        enabled = EXCLUDED.enabled,
        last_requested_at = NOW(),
        updated_at = NOW()
    `,
    params,
  );
}

export async function getStoredSignalSnapshots(
  scope: SignalScope,
  symbols: string[],
  options?: { freshnessMs?: number },
): Promise<StockQuote[]> {
  const normalizedScopeCode = normalizeScopeCode(scope.scopeCode);
  const normalizedSymbols = Array.from(
    new Set(symbols.map(normalizeSymbol)),
  ).filter(Boolean);
  if (!normalizedSymbols.length) {
    return [];
  }

  await ensureSignalBackendSchema();
  const result = await pool.query<SnapshotRow>(
    `
      SELECT *
      FROM ${SNAPSHOT_TABLE}
      WHERE scope_type = $1
        AND scope_code = $2
        AND symbol = ANY($3::text[])
    `,
    [scope.scopeType, normalizedScopeCode, normalizedSymbols],
  );

  const freshnessMs = options?.freshnessMs ?? SNAPSHOT_FRESHNESS_MS;
  const cutoff = Date.now() - freshnessMs;
  const snapshotMap = new Map<string, StockQuote>();

  for (const row of result.rows) {
    const fetchedAt = Date.parse(toIsoString(row.fetched_at) ?? "");
    if (Number.isFinite(fetchedAt) && fetchedAt < cutoff) {
      continue;
    }
    snapshotMap.set(row.symbol, mapSnapshotRow(row));
  }

  return normalizedSymbols
    .map((symbol) => snapshotMap.get(symbol))
    .filter((quote): quote is StockQuote => Boolean(quote));
}

export async function storeSignalSnapshots(
  scope: SignalScope,
  quotes: StockQuote[],
): Promise<void> {
  const normalizedScopeCode = normalizeScopeCode(scope.scopeCode);
  const normalizedQuotes = quotes
    .map((quote) => ({
      ...quote,
      symbol: normalizeSymbol(quote.symbol),
    }))
    .filter((quote) => quote.symbol);

  if (!normalizedQuotes.length) {
    return;
  }

  await ensureSignalBackendSchema();

  const values: string[] = [];
  const params: Array<string | number | null> = [];

  for (const quote of normalizedQuotes) {
    const baseIndex = params.length;
    values.push(
      `(
        $${baseIndex + 1}, $${baseIndex + 2}, $${baseIndex + 3}, $${baseIndex + 4}, $${baseIndex + 5},
        $${baseIndex + 6}, $${baseIndex + 7}, $${baseIndex + 8}, $${baseIndex + 9}::jsonb, $${baseIndex + 10},
        $${baseIndex + 11}, $${baseIndex + 12}, $${baseIndex + 13}, $${baseIndex + 14}, $${baseIndex + 15},
        $${baseIndex + 16}, $${baseIndex + 17}, $${baseIndex + 18}, $${baseIndex + 19}, NOW(), NOW()
      )`,
    );
    params.push(
      scope.scopeType,
      normalizedScopeCode,
      quote.symbol,
      quote.price,
      quote.changePercent,
      quote.status,
      quote.high52,
      quote.low52,
      JSON.stringify(quote.history ?? []),
      quote.summary,
      quote.impact,
      quote.cap ?? null,
      quote.peRatio ?? null,
      quote.signalAction ?? null,
      quote.signalConfidence ?? null,
      quote.signalSource ?? null,
      quote.signalEmittedAt ?? null,
      quote.signalEntryPrice ?? null,
      quote.signalReturnPercent ?? null,
    );
  }

  await pool.query(
    `
      INSERT INTO ${SNAPSHOT_TABLE} (
        scope_type,
        scope_code,
        symbol,
        price,
        change_percent,
        status,
        high_52,
        low_52,
        history,
        summary,
        impact,
        cap,
        pe_ratio,
        signal_action,
        signal_confidence,
        signal_source,
        signal_emitted_at,
        signal_entry_price,
        signal_return_percent,
        fetched_at,
        updated_at
      )
      VALUES ${values.join(", ")}
      ON CONFLICT (scope_type, scope_code, symbol)
      DO UPDATE SET
        price = EXCLUDED.price,
        change_percent = EXCLUDED.change_percent,
        status = EXCLUDED.status,
        high_52 = EXCLUDED.high_52,
        low_52 = EXCLUDED.low_52,
        history = EXCLUDED.history,
        summary = EXCLUDED.summary,
        impact = EXCLUDED.impact,
        cap = EXCLUDED.cap,
        pe_ratio = EXCLUDED.pe_ratio,
        signal_action = EXCLUDED.signal_action,
        signal_confidence = EXCLUDED.signal_confidence,
        signal_source = EXCLUDED.signal_source,
        signal_emitted_at = EXCLUDED.signal_emitted_at,
        signal_entry_price = EXCLUDED.signal_entry_price,
        signal_return_percent = EXCLUDED.signal_return_percent,
        fetched_at = EXCLUDED.fetched_at,
        updated_at = EXCLUDED.updated_at
    `,
    params,
  );

  await appendLiveMarketContextOccurrences(
    {
      scopeType: scope.scopeType,
      scopeCode: normalizedScopeCode,
    },
    normalizedQuotes,
    "stock_signal_snapshots",
  );
}

export async function storeSignalEvents(
  scope: SignalScope,
  quotes: StockQuote[],
): Promise<void> {
  const normalizedScopeCode = normalizeScopeCode(scope.scopeCode);
  const normalizedQuotes = quotes
    .map((quote) => ({ ...quote, symbol: normalizeSymbol(quote.symbol) }))
    .filter((quote) => quote.symbol);

  if (!normalizedQuotes.length) return;

  await ensureSignalBackendSchema();

  const values: string[] = [];
  const params: Array<string | null> = [];

  for (const quote of normalizedQuotes) {
    const baseIndex = params.length;
    values.push(
      `($${baseIndex + 1}, $${baseIndex + 2}, $${baseIndex + 3}, $${baseIndex + 4}, $${baseIndex + 5}::jsonb, COALESCE($${baseIndex + 6}::timestamptz, NOW()))`,
    );
    params.push(
      scope.scopeType,
      normalizedScopeCode,
      quote.symbol,
      signalEventToken(quote),
      JSON.stringify(quote),
      quote.signalEmittedAt ?? null,
    );
  }

  await pool.query(
    `
      INSERT INTO ${EVENT_TABLE} (
        scope_type,
        scope_code,
        symbol,
        event_token,
        payload,
        emitted_at
      )
      VALUES ${values.join(", ")}
      ON CONFLICT (scope_type, scope_code, event_token)
      DO NOTHING
    `,
    params,
  );
}

export async function getSignalEvents(
  scope?: Partial<SignalScope>,
  limit = 100,
) {
  await ensureSignalBackendSchema();

  const normalizedLimit = Math.min(Math.max(Math.floor(limit), 1), 300);
  const hasScope = Boolean(scope?.scopeType && scope?.scopeCode);

  const result = await pool.query<SignalEventRow>(
    `
      SELECT *
      FROM ${EVENT_TABLE}
      ${hasScope ? "WHERE scope_type = $1 AND scope_code = $2" : ""}
      ORDER BY emitted_at DESC, id DESC
      LIMIT $${hasScope ? 3 : 1}
    `,
    hasScope
      ? [
          scope!.scopeType!,
          normalizeScopeCode(scope!.scopeCode!),
          normalizedLimit,
        ]
      : [normalizedLimit],
  );

  return result.rows.map(mapSignalEventRow);
}

export async function getBackgroundSignalEngineStatus(): Promise<BackgroundSignalEngineStatus> {
  const [activeWatchCount, snapshotCount] = await Promise.all([
    countActiveWatchEntries(),
    countSnapshots(),
  ]);

  return {
    ...runtimeState,
    activeWatchCount,
    snapshotCount,
  };
}

export async function startBackgroundSignalEngine(): Promise<void> {
  if (!ENGINE_ENABLED || engineStarted) {
    return;
  }

  engineStarted = true;
  await ensureSignalBackendSchema();
  await seedWatchlist();

  void runEngineLoop();
  runtimeState.started = true;
  logger.info(
    {
      refreshIntervalMs: REFRESH_INTERVAL_MS,
      bootstrapScopes: BOOTSTRAP_SCOPES,
      bootstrapSymbolsPerScope: BOOTSTRAP_SYMBOLS_PER_SCOPE,
    },
    "Background signal engine started",
  );
}

let signalBroadcast: ((data: any) => void) | null = null;

export function setSignalBroadcast(fn: (data: any) => void) {
  signalBroadcast = fn;
}

export function emitFakeFrontendSignal(data?: Partial<StockQuote> & {
  symbol?: string;
  name?: string;
  ticker?: string;
}) {
  const symbol = normalizeSymbol(data?.symbol ?? data?.ticker ?? "BINANCE:POLBRL");
  const price = Number(data?.price ?? 0.47);
  const entryPrice = Number(data?.signalEntryPrice ?? 0.46);
  const now = new Date().toISOString();

  const signal = {
    ticker: symbol,
    symbol,
    name: data?.name ?? "Temporary fake signal",
    price,
    bid: Number(data?.bid ?? price),
    ask: Number(data?.ask ?? price),
    changePercent: Number(data?.changePercent ?? 1.5),
    status: data?.status ?? "Rising",
    high52: Number(data?.high52 ?? price),
    low52: Number(data?.low52 ?? entryPrice),
    history: data?.history ?? [entryPrice, price],
    summary: data?.summary ?? "Temporary fake Buy + Rising signal.",
    impact: data?.impact ?? "Dev-only signal emitted from the API console trigger.",
    signalAction: data?.signalAction ?? "Buy",
    signalConfidence: Number(data?.signalConfidence ?? 88),
    signalSource: data?.signalSource ?? "heuristic",
    signalEmittedAt: data?.signalEmittedAt ?? now,
    signalEntryPrice: entryPrice,
    signalReturnPercent: Number(
      (((price - entryPrice) / entryPrice) * 100).toFixed(2),
    ),
  } satisfies StockQuote & { ticker: string; name: string };

  signalBroadcast?.({
    type: "signal",
    dev: true,
    data: signal,
  });

  return signal;
}
