import type { NormalizedTransaction, RawTransaction } from "./models.js";

const INCOME_WORDS = [
  "salary",
  "deposit",
  "income",
  "payroll",
  "freelance",
  "reimbursement",
];
const REFUND_WORDS = ["refund", "reembolso", "estorno", "cashback"];
const INTERNAL_TRANSFER_WORDS = [
  "aplicacao",
  "resgate rdb",
  "nuinvest",
  "criptomoeda",
];

export function normalizeRawTransactions({
  rawTransactions,
  userId,
  connectionId,
}: {
  rawTransactions: RawTransaction[];
  userId: string;
  connectionId: string;
}): NormalizedTransaction[] {
  return rawTransactions.map((raw) =>
    normalizeRawTransaction({ raw, userId, connectionId }),
  );
}

export function normalizeRawTransaction({
  raw,
  userId,
  connectionId,
}: {
  raw: RawTransaction;
  userId: string;
  connectionId: string;
}): NormalizedTransaction {
  const signedAmount = Number(raw.amount) || 0;
  const direction = signedAmount >= 0 ? "inflow" : "outflow";
  const description = raw.description.trim();
  const lower = description
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  const category =
    typeof raw.metadata?.category === "string"
      ? raw.metadata.category
      : undefined;

  return {
    id: raw.id,
    userId,
    connectionId,
    source: raw.source,
    amount: Math.abs(signedAmount),
    direction,
    type: classifyTransaction(lower, direction),
    category,
    description,
    date: new Date(raw.date),
  };
}

function classifyTransaction(
  description: string,
  direction: NormalizedTransaction["direction"],
): NormalizedTransaction["type"] {
  if (INTERNAL_TRANSFER_WORDS.some((word) => description.includes(word)))
    return "transfer";

  if (direction === "inflow") {
    if (REFUND_WORDS.some((word) => description.includes(word)))
      return "refund";
    if (INCOME_WORDS.some((word) => description.includes(word)))
      return "income";
    return "income";
  }

  return "expense";
}
