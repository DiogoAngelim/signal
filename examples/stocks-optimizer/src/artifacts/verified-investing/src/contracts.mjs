import { createHash } from 'node:crypto';

export const SCHEMA = 'verified-investing.v1';
export const INTERVAL_MS = Object.freeze({ '1m': 60000, '5m': 300000, '15m': 900000,
  '30m': 1800000, '1h': 3600000, '4h': 14400000, '1d': 86400000, '1w': 604800000 });
export const SOURCE_SIGNAL_COMMIT = '7352ff381f4809b3bb21e103f127b399782a1526';
export class InputError extends Error {
  constructor(code, details) { super(code); this.name = 'InputError'; this.code = code; this.details = details; }
}
export function check(condition, code, details) { if (!condition) throw new InputError(code, details); }
export function number(value, name, min = -1e12, max = 1e12) {
  check(typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max, `invalid_${name}`);
  return value;
}
export function integer(value, name, min, max) {
  number(value, name, min, max); check(Number.isSafeInteger(value), `invalid_${name}`); return value;
}
export function id(value, name = 'id') {
  check(typeof value === 'string' && /^[A-Za-z0-9_.:-]{1,160}$/.test(value), `invalid_${name}`); return value;
}
export function finiteVector(value, name, minLength = 1, maxLength = 10000) {
  check(Array.isArray(value) && value.length >= minLength && value.length <= maxLength, `invalid_${name}`);
  value.forEach(v => number(v, name)); return value;
}
export const sha256 = value => createHash('sha256').update(value).digest('hex');
export function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`;
  check(value !== undefined && !(typeof value === 'number' && !Number.isFinite(value)), 'uncanonical_value');
  return JSON.stringify(value);
}
export const fingerprint = value => sha256(canonical(value));
export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
export const mean = xs => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
export const variance = xs => { const m = mean(xs); return xs.length > 1 ? xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1) : 0; };
export const dot = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0);

/** Independently check provider claims; a fresh HTTP response never makes old candles live. */
export function validateDataset(data, { now = Date.now(), minBars = 2, expectedRelease } = {}) {
  check(data?.schemaVersion === 'market-data.v1', 'data_contract_mismatch');
  check(data.provider === 'binance-public', 'unverified_provider');
  check(/^[A-Z0-9]{5,24}$/.test(data.symbol), 'invalid_symbol');
  check(Object.hasOwn(INTERVAL_MS, data.interval), 'unsupported_interval');
  if (expectedRelease) check(data.releaseSha === expectedRelease, 'data_release_mismatch');
  check(data.consumption?.displayOnly === false, 'non_display_entitlement_missing');
  check(data.quality?.real === true && data.quality.synthetic === false && data.quality.closedOnly === true, 'unverified_candle_provenance');
  check(data.quality.complete === true, 'incomplete_dataset');
  check(Array.isArray(data.bars) && data.bars.length >= minBars && data.bars.length <= 5000, 'insufficient_history');
  check(sha256(JSON.stringify(data.bars)) === data.dataHash, 'data_hash_mismatch');
  const ms = INTERVAL_MS[data.interval];
  data.bars.forEach((b, i) => {
    integer(b.timestamp, 'bar_time', 0, now - 1);
    integer(b.closeTime, 'bar_close_time', b.timestamp, now - 1);
    for (const key of ['open', 'high', 'low', 'close']) number(b[key], key, Number.MIN_VALUE, 1e12);
    number(b.volume, 'volume', 0, 1e20);
    check(b.low <= Math.min(b.open, b.close) && b.high >= Math.max(b.open, b.close) && b.low <= b.high, 'invalid_ohlc');
    check(b.closeTime - b.timestamp + 1 === ms, 'bar_interval_mismatch');
    if (i) check(b.timestamp - data.bars[i - 1].timestamp === ms, 'history_gap_or_duplicate');
  });
  check(now - data.bars.at(-1).closeTime <= ms * 2, 'stale_history');
  return structuredClone(data);
}

export function validateQuote(quote, { now = Date.now(), symbol, maxAgeMs = 15000, expectedRelease } = {}) {
  check(quote?.schemaVersion === 'market-data.v1' && quote.provider === 'binance-public', 'quote_contract_mismatch');
  if (expectedRelease) check(quote.releaseSha === expectedRelease, 'data_release_mismatch');
  if (symbol) check(quote.symbol === symbol, 'quote_symbol_mismatch');
  check(quote.realtime === true && quote.delayed === false && quote.synthetic === false, 'quote_not_realtime');
  integer(quote.observedAt, 'quote_time', 0, now + 1000);
  integer(quote.fetchedAt, 'quote_receive_time', quote.observedAt - 1000, now + 1000);
  integer(quote.expiresAt, 'quote_expiry', 0, Number.MAX_SAFE_INTEGER);
  check(now - quote.observedAt <= maxAgeMs && quote.expiresAt > now, 'stale_quote');
  for (const key of ['price', 'bid', 'ask']) number(quote[key], key, Number.MIN_VALUE, 1e12);
  check(quote.ask >= quote.bid, 'crossed_book');
  return structuredClone(quote);
}

/** Decimal arithmetic for executable quantities. No binary-float round-up at lot boundaries. */
export const SCALE = 100000000n;
export function units(value) {
  if (typeof value === 'number') { number(value, 'decimal', 0, 1e12); check(Number(value.toFixed(8)) === value, 'decimal_precision_exceeds_eight_places'); }
  const s = typeof value === 'number' ? value.toFixed(8) : String(value);
  check(/^\d+(?:\.\d{1,8})?$/.test(s), 'invalid_decimal');
  const [whole, fraction = ''] = s.split('.');
  const v = BigInt(whole) * SCALE + BigInt(fraction.padEnd(8, '0'));
  check(v <= 100000000000000000000n, 'decimal_out_of_range'); return v;
}
export function decimal(value) {
  check(typeof value === 'bigint' && value >= 0n, 'invalid_units');
  const whole = value / SCALE, fraction = (value % SCALE).toString().padStart(8, '0').replace(/0+$/, '');
  return `${whole}${fraction ? `.${fraction}` : ''}`;
}
export const ceilDiv = (a, b) => (a + b - 1n) / b;
export function floorToStep(quantity, step) {
  const q = units(quantity), s = units(step); check(s > 0n, 'invalid_lot_step'); return decimal(q / s * s);
}
export function tradeNotional(quantity, price) { return decimal(ceilDiv(units(quantity) * units(price), SCALE)); }
export function feeAmount(notional, feeBps) {
  integer(feeBps, 'fee_bps', 0, 1000); return decimal(ceilDiv(units(notional) * BigInt(feeBps), 10000n));
}
export function costModel(value = {}) {
  const result = { feeBps: value.feeBps ?? 10, spreadBps: value.spreadBps ?? 4,
    slippageBps: value.slippageBps ?? 5 };
  Object.entries(result).forEach(([k, v]) => number(v, k, 0, 1000));
  return result;
}
export const oneWayCost = c => (c.feeBps + c.spreadBps / 2 + c.slippageBps) / 10000;
export function afterCosts(entry, exit, c) {
  const side = oneWayCost(c); return (exit * (1 - side)) / (entry * (1 + side)) - 1;
}
