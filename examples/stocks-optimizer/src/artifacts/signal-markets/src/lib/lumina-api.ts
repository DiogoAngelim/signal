export type LuminaUser = { id: string; email: string; name: string };
export type Capabilities = {
  app: string; auth: boolean; registrationReady: boolean; persistentData: boolean;
  ai: boolean; aiModel: string | null; connectedBroker: boolean; realExecution: boolean;
  backgroundMonitoring: boolean; practiceMode: boolean;
};
export type Goal = {
  id: string; title: string; targetAmount: number | null; targetDate: string | null;
  description: string; createdAt: string; updatedAt: string;
};
export type PracticeRecord = {
  id: string; at: string; amount: number; exposedPercent: number;
  accessiblePercent: number; goal: string; goalId: string | null;
  horizon: "soon" | "middle" | "later" | "unsure" | null;
  rationale: string; provenance: "illustrative"; executed: false;
};
export type Conversation = { id: string; title: string; createdAt: string; updatedAt: string };
export type Message = {
  id: string; conversationId: string; role: "user" | "assistant";
  content: string; provenance: "user-provided" | "illustrative" | "ai-generated";
  createdAt: string;
};
export type MarketSymbol = "BTCUSDT" | "ETHUSDT" | "SOLUSDT" | "BNBUSDT" | "PETR4" | "VALE3" | "AAPL" | "MSFT";
export type Quote = {
  symbol: MarketSymbol; label: string; tradingViewSymbol: string;
  currency: "BRL" | "USD"; price: number | null; change24hPercent: number | null;
  market: "crypto" | "stock"; exchange: string;
  status: "fresh" | "delayed" | "stale" | "unavailable";
  provider: "tradingview-data"; underlyingProvider: string | null; source: string | null;
  receivedAt: string; syncedAt: string | null; quoteAt: string | null;
  realtimeVerified: boolean; eligibleForLiveCalculations: boolean;
  reliabilityScore: number | null; note: string;
};
export type MarketHistoryBar = {
  timestamp: string; open: number; high: number; low: number;
  close: number; volume: number | null;
};
export type MarketHistory = {
  symbol: MarketSymbol; provider: "tradingview-data";
  underlyingProvider: string | null; source: string | null;
  status: "available" | "unavailable"; bars: MarketHistoryBar[];
  lastBarAt: string | null; syncedAt: string | null; note: string;
};
export type Watch = {
  id: string; symbol: MarketSymbol; direction: "above" | "below";
  threshold: number; active: boolean; triggeredAt: string | null; createdAt: string;
};
export type InboxEvent = {
  id: string; kind: string; title: string; body: string; source: string;
  evidenceAt: string | null; seenAt: string | null; resolvedAt: string | null;
  createdAt: string;
};

export class LuminaApiError extends Error {
  constructor(public readonly status: number, message: string) { super(message); }
}

export async function luminaRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    ...options,
    credentials: "include",
    headers: {
      accept: "application/json",
      ...(options.body !== undefined ? { "content-type": "application/json" } : {}),
      ...(options.headers ?? {}),
    },
  });
  if (response.status === 204) return undefined as T;
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new LuminaApiError(
    response.status,
    typeof data?.error?.message === "string" ? data.error.message
      : typeof data?.message === "string" ? data.message
      : response.status === 401 ? "Sign in to continue." : "Lúmina couldn't complete that request.",
  );
  return data as T;
}
export const luminaApi = {
  capabilities: () => luminaRequest<Capabilities>("/api/lumina/capabilities"),
  me: () => luminaRequest<{ user: LuminaUser }>("/api/lumina/me"),
  signIn: (email: string, password: string) => luminaRequest<{ user?: LuminaUser }>(
    "/api/auth/sign-in/email", { method: "POST", body: JSON.stringify({ email, password }) }),
  signUp: (name: string, email: string, password: string) => luminaRequest<{ user?: LuminaUser }>(
    "/api/auth/sign-up/email", { method: "POST", body: JSON.stringify({ name, email, password }) }),
  signOut: () => luminaRequest<unknown>("/api/auth/sign-out", { method: "POST", body: "{}" }),
  goals: () => luminaRequest<{ goals: Goal[] }>("/api/lumina/goals"),
  addGoal: (input: { title: string; description?: string; targetAmount?: number | null; targetDate?: string | null }) =>
    luminaRequest<{ goal: Goal }>("/api/lumina/goals", { method: "POST", body: JSON.stringify(input) }),
  deleteGoal: (id: string) => luminaRequest<void>("/api/lumina/goals/" + encodeURIComponent(id), { method: "DELETE" }),
  practice: () => luminaRequest<{ choices: PracticeRecord[] }>("/api/lumina/practice"),
  savePractice: (input: {
    amount: number; exposedPercent: number; goal: string; goalId?: string | null;
    horizon?: PracticeRecord["horizon"]; rationale?: string;
  }) => luminaRequest<{ choice: PracticeRecord }>("/api/lumina/practice", { method: "POST", body: JSON.stringify(input) }),
  forgetPractice: (id: string) => luminaRequest<void>("/api/lumina/practice/" + encodeURIComponent(id), { method: "DELETE" }),
  clearPractice: () => luminaRequest<{ removed: number }>("/api/lumina/practice", { method: "DELETE" }),
  conversations: () => luminaRequest<{ conversations: Conversation[] }>("/api/lumina/conversations"),
  addConversation: (title: string) =>
    luminaRequest<{ conversation: Conversation }>("/api/lumina/conversations", { method: "POST", body: JSON.stringify({ title }) }),
  messages: (id: string) => luminaRequest<{ messages: Message[] }>(
    "/api/lumina/conversations/" + encodeURIComponent(id) + "/messages"),
  reply: (id: string, message: string, useAi = false) =>
    luminaRequest<{ messages: Message[]; ai: boolean; priceEvidence: unknown }>(
      "/api/lumina/conversations/" + encodeURIComponent(id) + "/reply",
      { method: "POST", body: JSON.stringify({ message, useAi }) }),
  deleteConversation: (id: string) => luminaRequest<void>(
    "/api/lumina/conversations/" + encodeURIComponent(id), { method: "DELETE" }),
  quote: (symbol: MarketSymbol) => luminaRequest<Quote>("/api/lumina/market?symbol=" + symbol),
  history: (symbol: MarketSymbol, bars = 90) => luminaRequest<MarketHistory>(
    "/api/lumina/market/history?symbol=" + symbol + "&bars=" + bars),
  watches: () => luminaRequest<{ watches: Watch[] }>("/api/lumina/watches"),
  addWatch: (symbol: MarketSymbol, direction: "above" | "below", threshold: number) =>
    luminaRequest<{ watch: Watch }>("/api/lumina/watches",
      { method: "POST", body: JSON.stringify({ symbol, direction, threshold }) }),
  deleteWatch: (id: string) => luminaRequest<void>(
    "/api/lumina/watches/" + encodeURIComponent(id), { method: "DELETE" }),
  inbox: (check = false) => luminaRequest<{ events: InboxEvent[]; monitoring: string; pushNotifications: false }>(
    "/api/lumina/inbox" + (check ? "?check=true" : "")),
  updateInbox: (id: string, action: "seen" | "resolved") =>
    luminaRequest<{ ok: true }>("/api/lumina/inbox/" + encodeURIComponent(id),
      { method: "PATCH", body: JSON.stringify({ action }) }),
  erasePersonalData: () => luminaRequest<{ ok: true; scope: string }>(
    "/api/lumina/my-data", { method: "DELETE" }),
};
