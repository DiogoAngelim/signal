import { z } from "zod";
import type { MarketOption, StockData, StockQuote } from "./api";

const UnknownRecordSchema = z.record(z.string(), z.unknown());

export type DashboardStockListResponse = {
  data: StockData[];
  items: StockData[];
  total: number;
  offset: number;
  limit: number;
  market: string;
  raw: unknown;
};

export type DashboardQuoteBatchResponse = {
  market?: string;
  exchange?: string;
  requestedSymbols: string[];
  unavailableSymbols: string[];
  deferredSymbols?: string[];
  partial: boolean;
  quotes: StockQuote[];
  raw: unknown;
};

export type DashboardStrategyLiveMarket = {
  signals: Array<Record<string, unknown>>;
  regime: Record<string, unknown> | null;
  opportunityDiscovery: Record<string, unknown> | null;
  agencyDiagnostics: Record<string, unknown> | null;
  summary: Record<string, unknown> | null;
  decisionIntelligence: Record<string, unknown> | null;
  raw: unknown;
};

export type DashboardTimeSeriesResponse = {
  data: Array<Record<string, unknown>>;
  raw: unknown;
};

function asRecord(value: unknown): Record<string, unknown> {
  const parsed = UnknownRecordSchema.safeParse(value);
  return parsed.success ? parsed.data : {};
}

function firstString(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value))
      return String(value);
  }

  return "";
}

function numberOr(value: unknown, fallback = 0) {
  if (value == null || value === "") return fallback;
  const next = Number(value);
  return Number.isFinite(next) ? next : fallback;
}

function optionalNumber(value: unknown) {
  if (value == null || value === "") return undefined;
  const next = Number(value);
  return Number.isFinite(next) ? next : undefined;
}

function stringArray(value: unknown) {
  return Array.isArray(value)
    ? value.map((item) => String(item).trim()).filter(Boolean)
    : [];
}

function recordArray(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value)
    ? value
        .map((item) => UnknownRecordSchema.safeParse(item))
        .filter((item) => item.success)
        .map((item) => item.data)
    : [];
}

function arrayFromPayload(
  payload: unknown,
  keys: string[],
): Array<Record<string, unknown>> {
  if (Array.isArray(payload)) return recordArray(payload);

  const record = asRecord(payload);
  for (const key of keys) {
    const rows = recordArray(record[key]);
    if (rows.length) return rows;
  }

  return [];
}

function normalizeMarketOption(value: unknown): MarketOption | null {
  const record = asRecord(value);
  const code = firstString(record, [
    "code",
    "value",
    "market",
    "scopeCode",
    "marketCode",
    "venue",
    "id",
  ]).toUpperCase();

  if (!code) return null;

  return {
    code,
    label:
      firstString(record, [
        "label",
        "displayName",
        "name",
        "marketName",
        "exchangeName",
        "scopeName",
        "venueName",
      ]) || code,
    count: Math.max(
      0,
      Math.round(
        numberOr(
          record.count ??
            record.symbolCount ??
            record.total ??
            record.totalSymbols,
          0,
        ),
      ),
    ),
  };
}

export function parseDashboardMarketOptions(payload: unknown): MarketOption[] {
  const rows = arrayFromPayload(payload, [
    "data",
    "items",
    "markets",
    "results",
  ]);
  const seen = new Set<string>();
  const options: MarketOption[] = [];

  for (const row of rows) {
    const option = normalizeMarketOption(row);
    if (!option || seen.has(option.code)) continue;
    seen.add(option.code);
    options.push(option);
  }

  return options;
}

function normalizeStockListItem(
  value: unknown,
  context: { market: string },
): StockData | null {
  const record = asRecord(value);
  const symbol = firstString(record, [
    "symbol",
    "ticker",
    "code",
    "id",
  ]).toUpperCase();

  if (!symbol) return null;

  const market =
    firstString(record, [
      "market",
      "exchange",
      "scopeCode",
      "marketCode",
      "venue",
    ]) || context.market;

  const history = Array.isArray(record.history)
    ? record.history
        .map((point) => Number(point))
        .filter((point) => Number.isFinite(point) && point > 0)
    : undefined;

  return {
    ...record,
    symbol,
    ticker: firstString(record, [
      "ticker",
      "symbol",
      "code",
      "id",
    ]).toUpperCase(),
    name:
      firstString(record, ["name", "description", "label", "displayName"]) ||
      symbol,
    market,
    exchange: firstString(record, ["exchange", "market", "venue"]) || market,
    country: firstString(record, ["country", "region", "market"]) || market,
    price: optionalNumber(
      record.price ??
        record.last ??
        record.close ??
        record.regularMarketPrice ??
        record.lastPrice,
    ),
    changePercent: optionalNumber(
      record.changePercent ?? record.regularMarketChangePercent,
    ),
    high52: optionalNumber(record.high52),
    low52: optionalNumber(record.low52),
    peRatio: optionalNumber(record.peRatio),
    history,
  } as StockData;
}

export function parseDashboardStockListResponse(
  payload: unknown,
  context: { market: string; offset: number; limit: number },
): DashboardStockListResponse {
  const record = asRecord(payload);
  const items = arrayFromPayload(payload, [
    "data",
    "items",
    "stocks",
    "symbols",
    "results",
  ])
    .map((item) => normalizeStockListItem(item, context))
    .filter((item): item is StockData => item != null);

  return {
    data: items,
    items,
    total: Math.max(0, Math.round(numberOr(record.total, items.length))),
    offset: Math.max(0, Math.round(numberOr(record.offset, context.offset))),
    limit: Math.max(1, Math.round(numberOr(record.limit, context.limit))),
    market:
      firstString(record, ["market", "exchange", "scopeCode", "venue"]) ||
      context.market,
    raw: payload,
  };
}

function normalizeQuote(
  value: unknown,
  context: { market: string },
): StockQuote | null {
  const record = asRecord(value);
  const symbol = firstString(record, [
    "symbol",
    "ticker",
    "code",
    "id",
  ]).toUpperCase();

  if (!symbol) return null;

  const price = optionalNumber(
    record.price ??
      record.last ??
      record.close ??
      record.lastPrice ??
      record.regularMarketPrice,
  );
  const history = Array.isArray(record.history)
    ? record.history
        .map((point) => Number(point))
        .filter((point) => Number.isFinite(point) && point > 0)
    : [];

  return {
    ...record,
    symbol,
    ticker: firstString(record, [
      "ticker",
      "symbol",
      "code",
      "id",
    ]).toUpperCase(),
    market:
      firstString(record, ["market", "exchange", "venue"]) || context.market,
    price,
    last: optionalNumber(record.last) ?? price,
    close: optionalNumber(record.close) ?? price,
    changePercent: numberOr(
      record.changePercent ?? record.regularMarketChangePercent,
      0,
    ),
    status: record.status ?? "Stable",
    high52: numberOr(record.high52, price ?? 0),
    low52: numberOr(record.low52, price ?? 0),
    history,
    summary: String(record.summary ?? ""),
    impact: String(record.impact ?? ""),
  } as StockQuote;
}

export function parseDashboardQuoteBatchResponse(
  payload: unknown,
  context: { market: string; requestedSymbols: string[] },
): DashboardQuoteBatchResponse {
  const record = asRecord(payload);
  const quotes = arrayFromPayload(payload, [
    "quotes",
    "data",
    "items",
    "results",
  ])
    .map((item) => normalizeQuote(item, context))
    .filter((item): item is StockQuote => item != null);
  const unavailableSymbols = stringArray(record.unavailableSymbols);

  return {
    market:
      firstString(record, ["market", "exchange", "scopeCode", "venue"]) ||
      context.market,
    exchange: firstString(record, ["exchange", "market", "venue"]) || undefined,
    requestedSymbols: stringArray(record.requestedSymbols).length
      ? stringArray(record.requestedSymbols)
      : context.requestedSymbols,
    unavailableSymbols,
    deferredSymbols: stringArray(record.deferredSymbols),
    partial:
      typeof record.partial === "boolean"
        ? record.partial
        : unavailableSymbols.length > 0,
    quotes,
    raw: payload,
  };
}

function optionalRecord(value: unknown): Record<string, unknown> | null {
  const record = asRecord(value);
  return Object.keys(record).length ? record : null;
}

export function parseDashboardStrategyLiveMarket(
  payload: unknown,
): DashboardStrategyLiveMarket {
  const record = asRecord(payload);

  return {
    signals: recordArray(record.signals),
    regime: optionalRecord(record.regime),
    opportunityDiscovery: optionalRecord(record.opportunityDiscovery),
    agencyDiagnostics: optionalRecord(record.agencyDiagnostics),
    summary: optionalRecord(record.summary),
    decisionIntelligence: optionalRecord(record.decisionIntelligence),
    raw: payload,
  };
}

export function parseDashboardTimeSeriesResponse(
  payload: unknown,
): DashboardTimeSeriesResponse {
  return {
    data: arrayFromPayload(payload, [
      "data",
      "history",
      "trades",
      "items",
      "results",
      "points",
    ]),
    raw: payload,
  };
}
