import { roundCurrency } from "./format.js";
import { parseManualCsv, type ManualUploadInput } from "./manual-upload.js";
import type {
  BalanceSnapshot,
  BankConnection,
  ConnectionResult,
  FinancialDataConnector,
  RawTransaction
} from "./models.js";
import { createSampleFinancialDataset, type SampleFinancialDataset } from "./sample-data.js";
import { encryptSessionData, maskCpf } from "./security.js";

type Clock = () => Date;

const DEFAULT_USER_ID = "demo-user";

export class SampleDataConnector implements FinancialDataConnector {
  provider = "sample" as const;
  private dataset?: SampleFinancialDataset;
  private readonly now: Clock;

  constructor({ now = () => new Date() }: { now?: Clock } = {}) {
    this.now = now;
  }

  async connect(input: unknown): Promise<ConnectionResult> {
    const userId = readUserId(input);
    const connection = createConnection({
      userId,
      provider: "sample",
      mode: "sample_data",
      status: "connected",
      now: this.now()
    });
    this.dataset = createSampleFinancialDataset({ userId, connectionId: connection.id, now: this.now() });
    return { ok: true, connection, message: "Sample cashflow data is ready." };
  }

  async fetchBalances(connectionId: string): Promise<BalanceSnapshot[]> {
    return this.dataset?.connectionId === connectionId ? this.dataset.balances : [];
  }

  async fetchTransactions(connectionId: string): Promise<RawTransaction[]> {
    return this.dataset?.connectionId === connectionId ? this.dataset.transactions : [];
  }

  async disconnect(): Promise<void> {
    this.dataset = undefined;
  }
}

export class ManualUploadConnector implements FinancialDataConnector {
  provider = "manual_upload" as const;
  private records = new Map<string, { balances: BalanceSnapshot[]; transactions: RawTransaction[] }>();
  private readonly now: Clock;

  constructor({ now = () => new Date() }: { now?: Clock } = {}) {
    this.now = now;
  }

  async connect(input: unknown): Promise<ConnectionResult> {
    const typed = input as ManualUploadInput | undefined;
    const userId = readUserId(input);
    const connection = createConnection({
      userId,
      provider: "manual_upload",
      mode: "manual_import",
      status: "connected",
      now: this.now()
    });

    if (!typed?.csv) {
      return {
        ok: false,
        connection: { ...connection, status: "failed" },
        message: "Upload a CSV with date, description, and amount columns."
      };
    }

    const parsed = parseManualCsv(typed.csv);
    if (!parsed.ok) {
      return {
        ok: false,
        connection: { ...connection, status: "failed" },
        message: parsed.errors.join(" ")
      };
    }

    const currentBalance = typed.currentBalance ?? parsed.currentBalance ?? deriveBalance(parsed.transactions);
    this.records.set(connection.id, {
      transactions: parsed.transactions,
      balances: [
        {
          id: `${connection.id}-balance`,
          userId,
          connectionId: connection.id,
          availableAmount: roundCurrency(currentBalance),
          currency: "BRL",
          capturedAt: this.now()
        }
      ]
    });

    return { ok: true, connection, message: `${parsed.transactions.length} transactions imported.` };
  }

  async fetchBalances(connectionId: string): Promise<BalanceSnapshot[]> {
    return this.records.get(connectionId)?.balances ?? [];
  }

  async fetchTransactions(connectionId: string): Promise<RawTransaction[]> {
    return this.records.get(connectionId)?.transactions ?? [];
  }

  async disconnect(connectionId: string): Promise<void> {
    this.records.delete(connectionId);
  }
}

export type NubankSessionAdapter = {
  createSession(input: { cpf: string; password?: string; authCode?: string }): Promise<{
    sessionData: unknown;
    balances?: Array<{ availableAmount: number }>;
    transactions?: RawTransaction[];
  }>;
};

export class NubankConnector implements FinancialDataConnector {
  provider = "nubank" as const;
  private records = new Map<string, { balances: BalanceSnapshot[]; transactions: RawTransaction[] }>();
  private readonly adapter?: NubankSessionAdapter;
  private readonly encryptionSecret?: string;
  private readonly now: Clock;

  constructor({
    adapter,
    encryptionSecret,
    now = () => new Date()
  }: {
    adapter?: NubankSessionAdapter;
    encryptionSecret?: string;
    now?: Clock;
  } = {}) {
    this.adapter = adapter;
    this.encryptionSecret = encryptionSecret;
    this.now = now;
  }

  async connect(input: unknown): Promise<ConnectionResult> {
    const typed = input as { userId?: string; cpf?: string; password?: string; authCode?: string } | undefined;
    const userId = readUserId(input);
    const connection = createConnection({
      userId,
      provider: "nubank",
      mode: "experimental_unofficial_api",
      status: "connected",
      now: this.now()
    });

    if (!typed?.cpf) {
      return {
        ok: false,
        connection: { ...connection, status: "failed", maskedCpf: typed?.cpf ? maskCpf(typed.cpf) : undefined },
        message: "Enter CPF to request a QR-authorized Nubank session."
      };
    }

    if (!this.adapter) {
      return {
        ok: false,
        connection: { ...connection, status: "failed", maskedCpf: maskCpf(typed.cpf) },
        message: "Nubank connector adapter is not configured. Upload a Nubank statement instead."
      };
    }

    try {
      const session = await this.adapter.createSession({ cpf: typed.cpf, password: typed.password, authCode: typed.authCode });
      const connected: BankConnection = {
        ...connection,
        maskedCpf: maskCpf(typed.cpf),
        encryptedSessionData: await encryptSessionData(session.sessionData, this.encryptionSecret),
        lastSyncedAt: this.now()
      };
      this.records.set(connected.id, {
        balances: (session.balances ?? []).map((balance, index) => ({
          id: `${connected.id}-balance-${index + 1}`,
          userId,
          connectionId: connected.id,
          availableAmount: balance.availableAmount,
          currency: "BRL",
          capturedAt: this.now()
        })),
        transactions: session.transactions ?? []
      });
      return { ok: true, connection: connected, message: "Nubank transactions imported through the QR-authorized connector." };
    } catch (error) {
      return {
        ok: false,
        connection: { ...connection, status: "failed", maskedCpf: maskCpf(typed.cpf) },
        message: safeNubankFailureMessage(error)
      };
    }
  }

  async fetchBalances(connectionId: string): Promise<BalanceSnapshot[]> {
    return this.records.get(connectionId)?.balances ?? [];
  }

  async fetchTransactions(connectionId: string): Promise<RawTransaction[]> {
    return this.records.get(connectionId)?.transactions ?? [];
  }

  async disconnect(connectionId: string): Promise<void> {
    this.records.delete(connectionId);
  }
}

function safeNubankFailureMessage(error: unknown): string {
  if (
    typeof error === "object" &&
    error !== null &&
    "publicMessage" in error &&
    typeof error.publicMessage === "string"
  ) {
    return `${error.publicMessage} Upload a Nubank statement instead.`;
  }
  return "Could not connect to Nubank automatically. Upload a Nubank statement instead.";
}

export class OpenFinanceConnector implements FinancialDataConnector {
  provider = "open_finance" as const;
  private readonly now: Clock;

  constructor({ now = () => new Date() }: { now?: Clock } = {}) {
    this.now = now;
  }

  async connect(input: unknown): Promise<ConnectionResult> {
    const userId = readUserId(input);
    return {
      ok: false,
      connection: createConnection({
        userId,
        provider: "open_finance",
        mode: "open_finance_placeholder",
        status: "pending",
        now: this.now()
      }),
      message:
        "Open Finance is a future placeholder. Production access may require regulated access, certificates, consent, compliance, and conformance testing."
    };
  }

  async fetchBalances(): Promise<BalanceSnapshot[]> {
    return [];
  }

  async fetchTransactions(): Promise<RawTransaction[]> {
    return [];
  }

  async disconnect(): Promise<void> {
    return;
  }
}

function createConnection({
  userId,
  provider,
  mode,
  status,
  now
}: {
  userId: string;
  provider: BankConnection["provider"];
  mode: BankConnection["mode"];
  status: BankConnection["status"];
  now: Date;
}): BankConnection {
  return {
    id: `${provider}-${now.getTime()}-${Math.random().toString(36).slice(2, 8)}`,
    userId,
    provider,
    mode,
    status,
    createdAt: now
  };
}

function readUserId(input: unknown): string {
  return typeof input === "object" && input !== null && "userId" in input && typeof input.userId === "string"
    ? input.userId
    : DEFAULT_USER_ID;
}

function deriveBalance(transactions: RawTransaction[]): number {
  return Math.max(0, transactions.reduce((sum, transaction) => sum + transaction.amount, 0));
}
