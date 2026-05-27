type CacheRecord = {
  value: unknown;
  savedAt: string;
};

const PREFIX = "signal-markets:backtest-cache:";

function safeKey(input: string) {
  return input.replace(/[^a-zA-Z0-9._:-]/g, "_");
}

function storageKey(key: string) {
  return `${PREFIX}${safeKey(key)}`;
}

export function isValidHistoricalValidationPayload(payload: any): boolean {
  if (!payload) return false;

  const root = payload?.data && !Array.isArray(payload.data) ? payload.data : payload;
  const summary = root?.summary ?? root?.snapshot ?? root;

  const tradeCount = Number(
    summary?.tradeCount ??
      root?.tradeCount ??
      root?.snapshot?.tradeCount ??
      0,
  );

  const survivalScore = Number(
    summary?.survivalScore ??
      root?.survivalScore ??
      root?.snapshot?.survivalScore ??
      0,
  );

  const history =
    root?.history ??
    root?.data ??
    summary?.history ??
    [];

  const trades =
    root?.trades ??
    summary?.trades ??
    [];

  const hasHistory = Array.isArray(history) && history.length > 0;
  const hasTrades = Array.isArray(trades) && trades.length > 0;

  return tradeCount > 0 || survivalScore > 0 || hasHistory || hasTrades;
}

export function rememberBacktestPayload(key: string, payload: unknown) {
  if (!isValidHistoricalValidationPayload(payload)) return payload;

  try {
    const record: CacheRecord = {
      value: payload,
      savedAt: new Date().toISOString(),
    };

    window.localStorage.setItem(storageKey(key), JSON.stringify(record));
  } catch {
    // Ignore storage failures.
  }

  return payload;
}

export function recoverBacktestPayload<T>(key: string, payload: T): T {
  if (isValidHistoricalValidationPayload(payload)) {
    rememberBacktestPayload(key, payload);
    return payload;
  }

  try {
    const raw = window.localStorage.getItem(storageKey(key));
    if (!raw) return payload;

    const record = JSON.parse(raw) as CacheRecord;

    if (isValidHistoricalValidationPayload(record.value)) {
      return record.value as T;
    }
  } catch {
    // Ignore storage failures.
  }

  return payload;
}

export function shouldProtectBacktestUrl(url: string): boolean {
  return (
    url.includes("/api/portfolio") ||
    url.includes("/portfolio") ||
    url.includes("/api/strategy") ||
    url.includes("/strategy")
  ) && (
    url.includes("summary") ||
    url.includes("history") ||
    url.includes("trades") ||
    url.includes("snapshot") ||
    url.includes("walk-forward") ||
    url.includes("live-market") ||
    url.includes("refresh-market")
  );
}

export function backtestCacheKey(url: string, method = "GET") {
  try {
    const parsed = new URL(url, window.location.origin);
    const market = parsed.searchParams.get("market") ?? "GLOBAL";
    const action = parsed.searchParams.get("action") ?? parsed.pathname;

    return `${method.toUpperCase()}:${parsed.pathname}:${market}:${action}`;
  } catch {
    return `${method.toUpperCase()}:${url}`;
  }
}
