
export function hasValidBacktestPayload(payload: any): boolean {
  if (!payload) return false;

  const summary = payload.summary ?? payload.snapshot ?? payload;

  const tradeCount = Number(
    summary?.tradeCount ??
      payload?.tradeCount ??
      payload?.snapshot?.tradeCount ??
      0,
  );

  const survivalScore = Number(
    summary?.survivalScore ??
      payload?.survivalScore ??
      payload?.snapshot?.survivalScore ??
      0,
  );

  const hasHistory =
    Array.isArray(payload?.history) && payload.history.length > 0
      ? true
      : Array.isArray(payload?.data) && payload.data.length > 0
        ? true
        : Array.isArray(summary?.history) && summary.history.length > 0;

  return tradeCount > 0 || survivalScore > 0 || hasHistory;
}

export function mergeBacktestState(previous: any, next: any): any {
  if (hasValidBacktestPayload(next)) return next;
  if (hasValidBacktestPayload(previous)) return previous;
  return next;
}

export function normalizeBacktestPayload(payload: any): any {
  if (!payload) return payload;

  const summary = payload.summary ?? payload.snapshot ?? payload;
  const history = payload.history ?? payload.data ?? summary?.history ?? [];
  const trades = payload.trades ?? summary?.trades ?? [];

  return {
    ...payload,
    summary,
    history,
    trades,
    snapshot: {
      ...(payload.snapshot ?? {}),
      ...summary,
      history,
      trades,
    },
  };
}
