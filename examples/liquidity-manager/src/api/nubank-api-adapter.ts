import { readFileSync } from "node:fs";
import { NubankApi, type AccountTransaction } from "nubank-api";
import type { NubankSessionAdapter } from "../connectors.js";
import type { RawTransaction } from "../models.js";
import { NubankConnectionError } from "./nubank-adapter.js";

type Route = { href: string };
type Routes = Record<string, Route>;

type NubankApiClientOptions = {
  clientName?: string;
  cert?: Buffer;
  accessToken?: string;
  refreshToken?: string;
  refreshBefore?: string;
  privateUrls?: Routes;
  publicUrls?: Record<string, string>;
  env?: "node" | "rn" | "web";
};

type NubankApiLike = {
  authState?: unknown;
  auth?: {
    authenticateWithQrCode?: (cpf: string, password: string, qrCodeId: string) => Promise<void>;
  };
  account?: {
    getBalance?: () => Promise<unknown>;
    getFeed?: () => Promise<unknown>;
    getTransactions?: () => Promise<unknown>;
    getFeedPaginated?: (cursor?: string) => Promise<unknown>;
    getTransactionsPaginated?: (cursor?: string) => Promise<unknown>;
  };
  card?: {
    getFeed?: () => Promise<unknown>;
    getTransactions?: () => Promise<unknown>;
    getPayments?: () => Promise<unknown>;
  };
};

type NubankApiAdapterOptions = {
  authState?: unknown;
  cert?: Buffer;
  clientName?: string;
  createClient?: (params?: NubankApiClientOptions) => NubankApiLike;
  env?: NodeJS.ProcessEnv;
  maxAccountPages?: number;
};

const DEFAULT_CLIENT_NAME = "github:DiogoAngelim/signal/examples/liquidity-manager";
const DEFAULT_MAX_ACCOUNT_PAGES = 4;

const ACCOUNT_OUTFLOW_TYPES = new Set([
  "BarcodePaymentEvent",
  "BillPaymentEvent",
  "DebitPurchaseEvent",
  "DebitWithdrawalEvent",
  "DebitWithdrawalFeeEvent",
  "PixTransferOutEvent",
  "PixTransferScheduledEvent",
  "TransferOutEvent"
]);

const ACCOUNT_INFLOW_TYPES = new Set([
  "DebitPurchaseReversalEvent",
  "PixTransferInEvent",
  "PixTransferOutReversalEvent",
  "TransferInEvent",
  "TransferOutReversalEvent"
]);

export function createNubankApiSessionAdapter({
  authState,
  cert,
  clientName = DEFAULT_CLIENT_NAME,
  createClient = (params) => new NubankApi(params) as NubankApiLike,
  env = process.env,
  maxAccountPages = DEFAULT_MAX_ACCOUNT_PAGES
}: NubankApiAdapterOptions = {}): NubankSessionAdapter {
  return {
    async createSession({ cpf, password, authCode }) {
      const storedAuthState = parseStoredAuthState(authState ?? env["NUBANK_API_AUTH_STATE"]);
      const storedCert = cert ?? readConfiguredCertificate(env);
      const api = createClient({
        ...storedAuthState,
        clientName,
        cert: storedCert,
        env: "node"
      });

      if (!storedAuthState) {
        await authenticateWithQrCode(api, cpf, password, authCode);
      }

      const [balance, accountFeed, cardTransactions, cardPayments] = await Promise.all([
        readAccountBalance(api),
        readAccountFeed(api, maxAccountPages),
        readCardTransactions(api),
        readCardPayments(api)
      ]);

      const transactions = [
        ...normalizeNubankApiAccountTransactions(accountFeed),
        ...normalizeNubankApiCardTransactions(cardTransactions, "card-transaction"),
        ...normalizeNubankApiCardTransactions(cardPayments, "card-payment")
      ];

      if (transactions.length === 0 && balance == null) {
        throw new NubankConnectionError(
          "Nubank authenticated, but this unofficial adapter did not return readable balance or transactions."
        );
      }

      return {
        sessionData: api.authState ?? storedAuthState ?? {},
        balances: balance == null ? [] : [{ availableAmount: balance }],
        transactions
      };
    }
  };
}

export function normalizeNubankApiAccountTransactions(feed: unknown): RawTransaction[] {
  const items = Array.isArray(feed) ? feed : [];
  return items.flatMap((item, index) => {
    const transaction = normalizeNubankApiAccountTransaction(item, index);
    return transaction ? [transaction] : [];
  });
}

export function normalizeNubankApiCardTransactions(feed: unknown, importedFrom = "card-transaction"): RawTransaction[] {
  const items = Array.isArray(feed) ? feed : [];
  return items.flatMap((item, index) => {
    const transaction = normalizeNubankApiCardTransaction(item, index, importedFrom);
    return transaction ? [transaction] : [];
  });
}

async function authenticateWithQrCode(
  api: NubankApiLike,
  cpf: string,
  password: string | undefined,
  authCode: string | undefined
): Promise<void> {
  if (!password || !authCode?.trim()) {
    throw new NubankConnectionError(
      "Nubank QR authorization requires CPF, password, and a generated QR id, or a saved NUBANK_API_AUTH_STATE."
    );
  }
  if (typeof api.auth?.authenticateWithQrCode !== "function") {
    throw new NubankConnectionError("The nubank-api client does not expose QR authentication.");
  }

  try {
    await api.auth.authenticateWithQrCode(cpf.replace(/\D/g, ""), password, authCode.trim());
  } catch {
    throw new NubankConnectionError(
      "Nubank QR authorization failed. Scan the generated QR id in the Nubank app, then try again."
    );
  }
}

async function readAccountBalance(api: NubankApiLike): Promise<number | undefined> {
  if (typeof api.account?.getBalance !== "function") return undefined;
  try {
    const balance = await api.account.getBalance();
    const amount = typeof balance === "number" ? balance : extractFirstNumber(balance, ["amount", "balance", "availableAmount"]);
    return amount == null ? undefined : normalizeCurrencyAmount(amount);
  } catch {
    return undefined;
  }
}

async function readAccountFeed(api: NubankApiLike, maxPages: number): Promise<unknown[]> {
  try {
    if (typeof api.account?.getFeedPaginated === "function") {
      const items: unknown[] = [];
      let cursor: string | undefined;
      for (let page = 0; page < maxPages; page += 1) {
        const result = await api.account.getFeedPaginated(cursor);
        const pageItems = readArray(result, "items");
        items.push(...pageItems);
        cursor = readString(result, ["nextCursor"]);
        if (!cursor) break;
      }
      return items;
    }

    if (typeof api.account?.getFeed === "function") {
      const feed = await api.account.getFeed();
      return Array.isArray(feed) ? feed : [];
    }

    if (typeof api.account?.getTransactionsPaginated === "function") {
      const feed = await api.account.getTransactionsPaginated();
      return Array.isArray(feed) ? feed : [];
    }

    if (typeof api.account?.getTransactions === "function") {
      const feed = await api.account.getTransactions();
      return Array.isArray(feed) ? feed : [];
    }
  } catch {
    return [];
  }

  return [];
}

async function readCardTransactions(api: NubankApiLike): Promise<unknown[]> {
  try {
    if (typeof api.card?.getTransactions === "function") {
      const feed = await api.card.getTransactions();
      return Array.isArray(feed) ? feed : [];
    }
    if (typeof api.card?.getFeed === "function") {
      const feed = await api.card.getFeed();
      return Array.isArray(feed) ? feed.filter((item) => readString(item, ["category"]) === "transaction") : [];
    }
  } catch {
    return [];
  }
  return [];
}

async function readCardPayments(api: NubankApiLike): Promise<unknown[]> {
  try {
    if (typeof api.card?.getPayments === "function") {
      const feed = await api.card.getPayments();
      return Array.isArray(feed) ? feed : [];
    }
    if (typeof api.card?.getFeed === "function") {
      const feed = await api.card.getFeed();
      return Array.isArray(feed) ? feed.filter((item) => readString(item, ["category"]) === "payment") : [];
    }
  } catch {
    return [];
  }
  return [];
}

function normalizeNubankApiAccountTransaction(item: unknown, index: number): RawTransaction | undefined {
  if (!isRecord(item)) return undefined;
  const date = readDate(item, ["postDate", "date", "time"]);
  if (!date) return undefined;
  const amount = readAccountAmount(item);
  if (amount == null || amount === 0) return undefined;
  const id = readString(item, ["id"]) ?? `nubank-account-${index + 1}-${date.toISOString().slice(0, 10)}`;
  const typename = readString(item, ["__typename"]);
  const description = joinDescription(
    readString(item, ["title"]),
    readString(item, ["detail"]),
    readString(item, ["destinationAccount.name"]),
    readString(item, ["originAccount.name"])
  );

  return {
    id,
    source: "nubank",
    amount,
    description: description || "Nubank account transaction",
    date,
    metadata: {
      category: typename,
      importedFrom: "nubank-api-account-feed"
    }
  };
}

function normalizeNubankApiCardTransaction(item: unknown, index: number, importedFrom: string): RawTransaction | undefined {
  if (!isRecord(item)) return undefined;
  const date = readDate(item, ["time", "date", "postDate"]);
  if (!date) return undefined;
  const rawAmount = extractFirstNumber(item, ["amount", "value", "details.amount"]);
  if (rawAmount == null || rawAmount === 0) return undefined;

  const category = readString(item, ["category"]) ?? importedFrom;
  const amount = inferCardAmountSign(normalizeCurrencyAmount(rawAmount), category);
  const id = readString(item, ["id", "href"]) ?? `nubank-card-${index + 1}-${date.toISOString().slice(0, 10)}`;
  const description = joinDescription(readString(item, ["title"]), readString(item, ["description"]));

  return {
    id,
    source: "nubank",
    amount,
    description: description || "Nubank card transaction",
    date,
    metadata: {
      category,
      importedFrom: `nubank-api-${importedFrom}`
    }
  };
}

function readAccountAmount(item: AccountTransaction | Record<string, unknown>): number | undefined {
  const explicitAmount = extractFirstNumber(item, ["amount", "value", "detail", "footer"]);
  if (explicitAmount == null) return undefined;
  const amount = normalizeCurrencyAmount(explicitAmount);
  const typename = readString(item, ["__typename"]) ?? "";
  if (ACCOUNT_INFLOW_TYPES.has(typename)) return Math.abs(amount);
  if (ACCOUNT_OUTFLOW_TYPES.has(typename)) return -Math.abs(amount);
  return amount < 0 ? amount : -Math.abs(amount);
}

function inferCardAmountSign(amount: number, category: string): number {
  if (amount < 0) return amount;
  return category.toLowerCase() === "payment" ? Math.abs(amount) : -Math.abs(amount);
}

function parseStoredAuthState(value: unknown): NubankApiClientOptions | undefined {
  if (value == null || value === "") return undefined;
  const parsed = typeof value === "string" ? parseJson(value) : value;
  if (!isRecord(parsed)) {
    throw new NubankConnectionError("NUBANK_API_AUTH_STATE is not valid JSON auth state.");
  }

  return {
    accessToken: readString(parsed, ["accessToken"]),
    refreshToken: readString(parsed, ["refreshToken"]),
    refreshBefore: readString(parsed, ["refreshBefore"]),
    privateUrls: readRoutes(parsed["privateUrls"]),
    publicUrls: readPublicUrls(parsed["publicUrls"])
  };
}

function readConfiguredCertificate(env: NodeJS.ProcessEnv): Buffer | undefined {
  const certBase64 = env["NUBANK_API_CERT_BASE64"]?.trim();
  if (certBase64) {
    return Buffer.from(certBase64, "base64");
  }

  const certPath = env["NUBANK_API_CERT_PATH"]?.trim();
  if (!certPath) return undefined;

  try {
    return readFileSync(certPath);
  } catch {
    throw new NubankConnectionError("NUBANK_API_CERT_PATH could not be read.");
  }
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    throw new NubankConnectionError("NUBANK_API_AUTH_STATE is not valid JSON auth state.");
  }
}

function readRoutes(value: unknown): Routes | undefined {
  if (!isRecord(value)) return undefined;
  const routes: Routes = {};
  for (const [key, route] of Object.entries(value)) {
    const href = readString(route, ["href"]);
    if (href) routes[key] = { href };
  }
  return Object.keys(routes).length > 0 ? routes : undefined;
}

function readPublicUrls(value: unknown): Record<string, string> | undefined {
  if (!isRecord(value)) return undefined;
  const urls: Record<string, string> = {};
  for (const [key, url] of Object.entries(value)) {
    if (typeof url === "string" && url.trim()) urls[key] = url.trim();
  }
  return Object.keys(urls).length > 0 ? urls : undefined;
}

function readArray(value: unknown, path: string): unknown[] {
  const found = readPath(value, path);
  return Array.isArray(found) ? found : [];
}

function readDate(value: unknown, paths: string[]): Date | undefined {
  const raw = readString(value, paths);
  if (!raw) return undefined;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function joinDescription(...parts: Array<string | undefined>): string {
  return parts.filter(Boolean).join(" - ");
}

function normalizeCurrencyAmount(amount: number): number {
  const absolute = Math.abs(amount);
  const value = Number.isInteger(amount) && absolute >= 1_000 ? amount / 100 : amount;
  return Math.round(value * 100) / 100;
}

function extractFirstNumber(value: unknown, paths: string[]): number | undefined {
  for (const path of paths) {
    const found = readPath(value, path);
    if (typeof found === "number" && Number.isFinite(found)) return found;
    if (typeof found === "string") {
      const parsed = parseCurrencyString(found);
      if (parsed != null) return parsed;
    }
  }
  return undefined;
}

function parseCurrencyString(value: string): number | undefined {
  const match = value.match(/-?\d[\d.,]*/);
  if (!match) return undefined;
  const normalized = match[0].replace(/\.(?=\d{3}(?:\D|$))/g, "").replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function readString(value: unknown, paths: string[]): string | undefined {
  for (const path of paths) {
    const found = readPath(value, path);
    if (typeof found === "string" && found.trim()) return found.trim();
  }
  return undefined;
}

function readPath(value: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((current, segment) => {
    if (!isRecord(current)) return undefined;
    return current[segment];
  }, value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
