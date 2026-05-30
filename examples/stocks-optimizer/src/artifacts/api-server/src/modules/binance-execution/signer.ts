import crypto from "node:crypto";

export function canonicalQuery(params: Record<string, string | number | boolean | undefined | null>) {
  return Object.entries(params)
    .filter(([, value]) => value != null)
    .map(([key, value]) => [key, String(value)] as const)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join("&");
}

export function signQuery(query: string, secret: string) {
  return crypto.createHmac("sha256", secret).update(query).digest("hex");
}

export function signedQuery(
  params: Record<string, string | number | boolean | undefined | null>,
  secret: string,
) {
  const query = canonicalQuery(params);
  const signature = signQuery(query, secret);
  return `${query}&signature=${signature}`;
}

export function createClientOrderId(input: {
  decisionId: string;
  strategyId?: string;
  symbol: string;
  action: string;
}) {
  const seed = [
    input.decisionId,
    input.strategyId ?? "strategy",
    input.symbol,
    input.action,
  ].join(":");
  const hash = crypto.createHash("sha256").update(seed).digest("hex").slice(0, 22);
  const readable = `${input.symbol}_${input.action}`.replace(/[^A-Z0-9_]/gi, "").slice(0, 12);
  return `so_${readable}_${hash}`.slice(0, 36);
}
