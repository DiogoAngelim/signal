import type { RawTransaction } from "./models.js";

export type ManualUploadInput = {
  userId?: string;
  csv: string;
  currentBalance?: number;
};

export type ManualUploadParseResult =
  | {
      ok: true;
      transactions: RawTransaction[];
      currentBalance?: number;
    }
  | {
      ok: false;
      errors: string[];
    };

const HEADER_ALIASES = {
  date: ["date", "data", "transaction_date", "posted_date", "dt"],
  description: ["description", "descricao", "descrição", "memo", "merchant", "name", "title"],
  amount: ["amount", "valor", "value", "transaction_amount", "quantia"],
  category: ["category", "categoria", "type_category"],
  type: ["type", "tipo", "direction", "debit_credit"],
  balance: ["balance", "saldo", "running_balance"]
} as const;

export function parseManualCsv(csv: string): ManualUploadParseResult {
  const rows = parseCsvRows(csv).filter((row) => row.some((cell) => cell.trim()));
  if (rows.length < 2) {
    return { ok: false, errors: ["CSV must include a header row and at least one transaction."] };
  }

  const headers = rows[0]!.map(normalizeHeader);
  const dateIndex = findHeader(headers, HEADER_ALIASES.date);
  const descriptionIndex = findHeader(headers, HEADER_ALIASES.description);
  const amountIndex = findHeader(headers, HEADER_ALIASES.amount);
  const categoryIndex = findHeader(headers, HEADER_ALIASES.category);
  const typeIndex = findHeader(headers, HEADER_ALIASES.type);
  const balanceIndex = findHeader(headers, HEADER_ALIASES.balance);
  const errors: string[] = [];

  if (dateIndex < 0) errors.push("CSV is missing a date column.");
  if (descriptionIndex < 0) errors.push("CSV is missing a description column.");
  if (amountIndex < 0) errors.push("CSV is missing an amount column.");
  if (errors.length) return { ok: false, errors };

  const transactions: RawTransaction[] = [];
  let currentBalance: number | undefined;

  rows.slice(1).forEach((row, index) => {
    const date = parseDate(row[dateIndex]);
    const description = row[descriptionIndex]?.trim();
    const parsedAmount = parseMoney(row[amountIndex]);

    if (!date) {
      errors.push(`Row ${index + 2} has an invalid date.`);
      return;
    }
    if (!description) {
      errors.push(`Row ${index + 2} is missing a description.`);
      return;
    }
    if (!Number.isFinite(parsedAmount)) {
      errors.push(`Row ${index + 2} has an invalid amount.`);
      return;
    }

    const type = typeIndex >= 0 ? row[typeIndex]?.toLowerCase() : "";
    const amount = normalizeSignedAmount(parsedAmount, type);
    const balance = balanceIndex >= 0 ? parseMoney(row[balanceIndex]) : Number.NaN;
    if (Number.isFinite(balance)) currentBalance = balance;

    transactions.push({
      id: `manual-${index + 1}-${date.toISOString().slice(0, 10)}`,
      source: "manual_upload",
      amount,
      description,
      date,
      metadata: {
        category: categoryIndex >= 0 ? row[categoryIndex]?.trim() || undefined : undefined,
        importedRow: index + 2
      }
    });
  });

  if (errors.length) return { ok: false, errors };
  return { ok: true, transactions, currentBalance };
}

function parseCsvRows(csv: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < csv.length; index += 1) {
    const char = csv[index]!;
    const next = csv[index + 1];

    if (char === "\"" && quoted && next === "\"") {
      cell += "\"";
      index += 1;
      continue;
    }

    if (char === "\"") {
      quoted = !quoted;
      continue;
    }

    if (char === "," && !quoted) {
      row.push(cell);
      cell = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      continue;
    }

    cell += char;
  }

  row.push(cell);
  rows.push(row);
  return rows;
}

function normalizeHeader(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function findHeader(headers: string[], aliases: readonly string[]): number {
  const normalizedAliases = aliases.map(normalizeHeader);
  return headers.findIndex((header) => normalizedAliases.includes(header));
}

function parseDate(value: string | undefined): Date | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  const brMatch = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(trimmed);
  const normalized = brMatch ? `${brMatch[3]}-${brMatch[2]!.padStart(2, "0")}-${brMatch[1]!.padStart(2, "0")}` : trimmed;
  const date = new Date(`${normalized}T12:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function parseMoney(value: string | undefined): number {
  if (!value) return Number.NaN;
  const trimmed = value.trim().replace(/\s/g, "").replace(/R\$/gi, "");
  if (!trimmed) return Number.NaN;
  const lastComma = trimmed.lastIndexOf(",");
  const lastDot = trimmed.lastIndexOf(".");
  const normalized =
    lastComma > lastDot
      ? trimmed.replace(/\./g, "").replace(",", ".")
      : trimmed.replace(/,/g, "");
  return Number(normalized);
}

function normalizeSignedAmount(amount: number, type: string | undefined): number {
  const typeValue = type?.toLowerCase() ?? "";
  if (["debit", "debito", "débito", "outflow", "expense", "withdrawal"].includes(typeValue)) return -Math.abs(amount);
  if (["credit", "credito", "crédito", "inflow", "income", "deposit"].includes(typeValue)) return Math.abs(amount);
  return amount;
}
