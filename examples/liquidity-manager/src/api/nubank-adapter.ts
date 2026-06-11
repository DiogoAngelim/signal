import nubankModule from "nubank";
import type { NubankSessionAdapter } from "../connectors.js";
import type { RawTransaction } from "../models.js";

type NubankApi = {
  getLoginToken?: (input: {
    login: string;
    password: string;
  }) => Promise<unknown>;
  getWholeFeed?: () => Promise<unknown>;
  getCustomerAccount?: () => Promise<unknown>;
  getAccountBalance?: () => Promise<unknown>;
  getBalance?: () => Promise<unknown>;
  getSavingsAccountBalance?: () => Promise<unknown>;
};

export class NubankConnectionError extends Error {
  readonly publicMessage: string;

  constructor(publicMessage: string) {
    super(publicMessage);
    this.name = "NubankConnectionError";
    this.publicMessage = publicMessage;
  }
}

export function createUnofficialNubankSessionAdapter({
  createClient = resolveNubankFactory(nubankModule),
}: {
  createClient?: () => unknown;
} = {}): NubankSessionAdapter {
  return {
    async createSession({ cpf, password }) {
      const api = createClient() as NubankApi;
      if (!password) {
        throw new NubankConnectionError(
          "The legacy Nubank client requires CPF and password.",
        );
      }
      if (typeof api.getLoginToken !== "function") {
        throw new NubankConnectionError(
          "The unofficial Nubank client does not expose a login method.",
        );
      }
      if (typeof api.getWholeFeed !== "function") {
        throw new NubankConnectionError(
          "The unofficial Nubank client does not expose a transaction feed method.",
        );
      }

      const sessionData = await requestLoginToken(api, cpf, password);
      assertSignedInSession(sessionData);
      const feed = await requestTransactionFeed(api);
      const availableAmount = await readAvailableBalance(api);
      const transactions = normalizeNubankFeed(feed);

      return {
        sessionData,
        balances: availableAmount == null ? [] : [{ availableAmount }],
        transactions,
      };
    },
  };
}

export function resolveNubankFactory(moduleValue: unknown): () => unknown {
  if (typeof moduleValue === "function") return moduleValue as () => unknown;
  if (isRecord(moduleValue) && typeof moduleValue.default === "function") {
    return moduleValue.default as () => unknown;
  }
  throw new NubankConnectionError(
    "The unofficial Nubank client could not be loaded.",
  );
}

async function requestLoginToken(
  api: NubankApi,
  cpf: string,
  password: string,
): Promise<unknown> {
  try {
    return await api.getLoginToken?.({
      login: cpf.replace(/\D/g, ""),
      password,
    });
  } catch {
    throw new NubankConnectionError(
      "Nubank login failed. Check the CPF, password, and any confirmation required by Nubank.",
    );
  }
}

async function requestTransactionFeed(api: NubankApi): Promise<unknown> {
  try {
    return await api.getWholeFeed?.();
  } catch {
    throw new NubankConnectionError(
      "Nubank login completed, but the unofficial client could not fetch the transaction feed link.",
    );
  }
}

function assertSignedInSession(sessionData: unknown): void {
  if (!isRecord(sessionData)) {
    throw new NubankConnectionError(
      "Nubank login failed. The unofficial client did not receive a valid session.",
    );
  }
  if (typeof sessionData.access_token !== "string") {
    throw new NubankConnectionError(
      "Nubank login failed. Check the CPF, password, and any confirmation required by Nubank.",
    );
  }

  const eventsHref = readPath(sessionData, "_links.events.href");
  if (typeof eventsHref !== "string" || !eventsHref) {
    throw new NubankConnectionError(
      "Nubank login completed, but Nubank did not return a transaction feed link for this unofficial client.",
    );
  }
}

export function normalizeNubankFeed(feed: unknown): RawTransaction[] {
  const items = Array.isArray(feed) ? feed : [];
  return items.flatMap((item, index) => {
    const transaction = normalizeNubankFeedItem(item, index);
    return transaction ? [transaction] : [];
  });
}

function normalizeNubankFeedItem(
  item: unknown,
  index: number,
): RawTransaction | undefined {
  if (!isRecord(item)) return undefined;
  const amount = readAmount(item);
  if (amount == null || amount === 0) return undefined;
  const date = readDate(item);
  if (!date) return undefined;
  const description = readDescription(item);
  const id =
    readString(item, ["id", "uuid", "href"]) ??
    `nubank-${index + 1}-${date.toISOString().slice(0, 10)}`;

  return {
    id,
    source: "nubank",
    amount,
    description,
    date,
    metadata: {
      category: readString(item, ["category", "kind", "type"]),
      importedFrom: "unofficial-nubank-feed",
    },
  };
}

async function readAvailableBalance(
  api: NubankApi,
): Promise<number | undefined> {
  for (const method of [
    "getCustomerAccount",
    "getAccountBalance",
    "getBalance",
    "getSavingsAccountBalance",
  ] as const) {
    const fn = api[method];
    if (typeof fn !== "function") continue;
    try {
      const result = await fn.call(api);
      const amount = extractFirstNumber(result, [
        "available",
        "availableAmount",
        "balance",
        "amount",
        "value",
      ]);
      if (amount != null) return normalizeCurrencyAmount(amount);
    } catch {
      return undefined;
    }
  }
  return undefined;
}

function readAmount(item: Record<string, unknown>): number | undefined {
  const explicitAmount = extractFirstNumber(item, [
    "amount",
    "value",
    "total",
    "details.amount",
    "details.value",
  ]);
  if (explicitAmount == null) return undefined;
  const normalized = normalizeCurrencyAmount(explicitAmount);
  return inferSignedAmount(normalized, item);
}

function readDate(item: Record<string, unknown>): Date | undefined {
  const value = readString(item, [
    "date",
    "time",
    "postDate",
    "createdAt",
    "details.date",
  ]);
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function readDescription(item: Record<string, unknown>): string {
  return (
    readString(item, [
      "description",
      "title",
      "label",
      "merchant",
      "details.description",
      "details.title",
      "details.subtitle",
    ]) ?? "Nubank transaction"
  );
}

function inferSignedAmount(
  amount: number,
  item: Record<string, unknown>,
): number {
  if (amount < 0) return amount;
  const category =
    `${readString(item, ["category", "kind", "type", "title", "description"]) ?? ""}`.toLowerCase();
  const inflowWords = [
    "payment",
    "pagamento recebido",
    "deposit",
    "deposito",
    "depósito",
    "cashback",
    "refund",
    "estorno",
  ];
  const outflowWords = [
    "transaction",
    "purchase",
    "compra",
    "pix",
    "transfer",
    "debit",
    "débito",
  ];
  if (inflowWords.some((word) => category.includes(word)))
    return Math.abs(amount);
  if (outflowWords.some((word) => category.includes(word)))
    return -Math.abs(amount);
  return amount;
}

function normalizeCurrencyAmount(amount: number): number {
  const absolute = Math.abs(amount);
  const value =
    Number.isInteger(amount) && absolute >= 1_000 ? amount / 100 : amount;
  return Math.round(value * 100) / 100;
}

function extractFirstNumber(
  value: unknown,
  paths: string[],
): number | undefined {
  for (const path of paths) {
    const found = readPath(value, path);
    if (typeof found === "number" && Number.isFinite(found)) return found;
    if (typeof found === "string") {
      const parsed = Number(found.replace(/[^\d.,-]/g, "").replace(",", "."));
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return undefined;
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
