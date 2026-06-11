import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { roundCurrency } from "../format.js";
import type {
  BalanceSnapshot,
  BankConnection,
  RawTransaction,
} from "../models.js";

export type LocalNubankStatementApiResult =
  | {
      ok: true;
      connection: BankConnection;
      balances: BalanceSnapshot[];
      rawTransactions: RawTransaction[];
      coverage: LocalNubankStatementCoverage;
      message: string;
    }
  | {
      ok: false;
      message: string;
    };

export type LocalNubankStatementCoverage = {
  firstMonth?: string;
  lastMonth?: string;
  monthCount?: number;
  missingMonths: string[];
  sourceFileCount?: number;
  uniqueFileCount?: number;
  removedDuplicateFileCount?: number;
  transactionRows: number;
};

type LocalNubankStatementManifest = {
  interval?: {
    firstMonth?: string;
    lastMonth?: string;
    monthCount?: number;
  };
  currentBalance?: number;
  balanceSource?: string;
  missingMonths?: string[];
  sourceFileCount?: number;
  uniqueFileCount?: number;
  removedDuplicateFileCount?: number;
  transactionRows?: number;
};

type LoadLocalNubankStatementOptions = {
  userId?: string;
  now?: Date;
  statementPath?: string;
  manifestPath?: string;
};

const DEFAULT_USER_ID = "demo-user";

export function loadLocalNubankStatementData({
  userId = DEFAULT_USER_ID,
  now = new Date(),
  statementPath = resolveDefaultLocalDataPath("nubank-statements.csv"),
  manifestPath = resolveDefaultLocalDataPath("nubank-statements-manifest.json"),
}: LoadLocalNubankStatementOptions = {}): LocalNubankStatementApiResult {
  if (!existsSync(statementPath)) {
    return {
      ok: false,
      message:
        "No local Nubank statement data found. Add cleaned CSV data to .local-data/nubank-statements.csv.",
    };
  }

  const rawTransactions = parseNubankStatementCsv(
    readFileSync(statementPath, "utf8"),
  );
  if (rawTransactions.length === 0) {
    return {
      ok: false,
      message:
        "Local Nubank statement data was found, but it did not contain readable transactions.",
    };
  }

  const connection: BankConnection = {
    id: "local-nubank-statement",
    userId,
    provider: "nubank",
    mode: "manual_import",
    status: "connected",
    lastSyncedAt: now,
    createdAt: now,
  };
  const manifest = readManifest(manifestPath);
  const coverage = readCoverage(manifest, rawTransactions.length);
  const manifestBalance = manifest?.currentBalance;
  const currentBalance =
    typeof manifestBalance === "number" && Number.isFinite(manifestBalance)
      ? manifestBalance
      : deriveBalance(rawTransactions);
  const balances: BalanceSnapshot[] = [
    {
      id: "local-nubank-statement-balance",
      userId,
      connectionId: connection.id,
      availableAmount: currentBalance,
      currency: "BRL",
      capturedAt: now,
    },
  ];
  const interval =
    coverage.firstMonth && coverage.lastMonth
      ? ` (${coverage.firstMonth} through ${coverage.lastMonth})`
      : "";

  return {
    ok: true,
    connection,
    balances,
    rawTransactions,
    coverage,
    message: `Loaded ${rawTransactions.length} Nubank statement transactions from local cleaned statements${interval}.`,
  };
}

function resolveDefaultLocalDataPath(fileName: string): string {
  const packageRootPath = join(process.cwd(), ".local-data", fileName);
  if (existsSync(packageRootPath)) return packageRootPath;
  return join(
    process.cwd(),
    "examples",
    "liquidity-manager",
    ".local-data",
    fileName,
  );
}

function parseNubankStatementCsv(csv: string): RawTransaction[] {
  const rows = parseCsvRows(csv).filter((row) =>
    row.some((cell) => cell.trim()),
  );
  if (rows.length < 2) return [];

  const headers = rows[0]?.map(normalizeHeader);
  const dateIndex = findHeader(headers, ["data", "date"]);
  const amountIndex = findHeader(headers, ["valor", "amount"]);
  const identifierIndex = findHeader(headers, [
    "identificador",
    "identifier",
    "id",
  ]);
  const descriptionIndex = findHeader(headers, [
    "descricao",
    "description",
    "descrição",
  ]);
  if (dateIndex < 0 || amountIndex < 0 || descriptionIndex < 0) return [];

  return rows.slice(1).flatMap((row, index) => {
    const date = parseStatementDate(row[dateIndex]);
    const amount = parseMoney(row[amountIndex]);
    const description = row[descriptionIndex]?.trim();
    if (!date || !Number.isFinite(amount) || !description) return [];

    const identifier =
      identifierIndex >= 0 ? row[identifierIndex]?.trim() : undefined;
    const dateKey = date.toISOString().slice(0, 10);
    const rowNumber = index + 2;
    return [
      {
        id: `local-nubank-${identifier || dateKey}-${rowNumber}`,
        source: "nubank" as const,
        amount,
        description,
        date,
        metadata: {
          identifier: identifier || undefined,
          importedFrom: "local-nubank-statement",
          importedRow: rowNumber,
        },
      },
    ];
  });
}

function readManifest(
  manifestPath: string,
): LocalNubankStatementManifest | undefined {
  if (!existsSync(manifestPath)) {
    return undefined;
  }

  try {
    return JSON.parse(
      readFileSync(manifestPath, "utf8"),
    ) as LocalNubankStatementManifest;
  } catch {
    return undefined;
  }
}

function readCoverage(
  manifest: LocalNubankStatementManifest | undefined,
  transactionRows: number,
): LocalNubankStatementCoverage {
  return {
    firstMonth: manifest?.interval?.firstMonth,
    lastMonth: manifest?.interval?.lastMonth,
    monthCount: manifest?.interval?.monthCount,
    missingMonths: manifest?.missingMonths ?? [],
    sourceFileCount: manifest?.sourceFileCount,
    uniqueFileCount: manifest?.uniqueFileCount,
    removedDuplicateFileCount: manifest?.removedDuplicateFileCount,
    transactionRows: manifest?.transactionRows ?? transactionRows,
  };
}

function deriveBalance(transactions: RawTransaction[]): number {
  return roundCurrency(
    Math.max(
      0,
      transactions.reduce((sum, transaction) => {
        if (isInternalInvestmentMovement(transaction.description)) return sum;
        return sum + transaction.amount;
      }, 0),
    ),
  );
}

function isInternalInvestmentMovement(description: string): boolean {
  const normalized = description
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  return ["aplicacao", "resgate rdb", "nuinvest", "criptomoeda"].some((word) =>
    normalized.includes(word),
  );
}

function parseCsvRows(csv: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < csv.length; index += 1) {
    const char = csv[index]!;
    const next = csv[index + 1];

    if (char === '"' && quoted && next === '"') {
      cell += '"';
      index += 1;
      continue;
    }

    if (char === '"') {
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

function parseStatementDate(value: string | undefined): Date | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  const brMatch = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(trimmed);
  const normalized = brMatch
    ? `${brMatch[3]}-${brMatch[2]?.padStart(2, "0")}-${brMatch[1]?.padStart(2, "0")}`
    : trimmed;
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
