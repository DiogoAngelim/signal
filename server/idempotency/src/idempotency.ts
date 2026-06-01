import type {
  IdempotencyRecord,
  IdempotencySource,
  IdempotencyStore,
} from "./contracts";

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

export function createIdempotencyKey(source: IdempotencySource): string | null {
  const metaKey = source.meta?.idempotencyKey;
  if (isNonEmptyString(metaKey)) {
    return `meta:${metaKey}`;
  }

  if (source.kind === "query") {
    return null;
  }

  if (isNonEmptyString(source.messageId)) {
    return `message:${source.messageId}`;
  }

  return null;
}

export function createIdempotencyRecord(input: {
  key: string;
  messageId: string;
  traceId: string;
  createdAt: string;
  resultHash?: string;
}): IdempotencyRecord {
  return {
    key: input.key,
    messageId: input.messageId,
    traceId: input.traceId,
    createdAt: input.createdAt,
    resultHash: input.resultHash,
  };
}

export async function isDuplicate(
  store: IdempotencyStore,
  key: string | null,
): Promise<boolean> {
  if (!key) {
    return false;
  }
  return store.has(key);
}

export async function rememberIdempotency(
  store: IdempotencyStore,
  record: IdempotencyRecord | null,
): Promise<void> {
  if (!record) {
    return;
  }

  await store.put(record);
}
