export type FinancialDataProvider = "sample" | "nubank" | "manual_upload" | "open_finance";

export type ConnectionMode =
  | "sample_data"
  | "experimental_unofficial_api"
  | "manual_import"
  | "open_finance_placeholder";

export type ConnectionStatus = "connected" | "failed" | "expired" | "revoked" | "pending";

export type PaymentMethod = "cash" | "credit" | "installments";

export type PurchaseNecessity = "necessary" | "optional" | "income_generating";

export type PurchaseVerdict =
  | "approved"
  | "acceptable"
  | "delay"
  | "reduce_amount"
  | "risky"
  | "not_justifiable";

export type User = {
  id: string;
  email?: string;
  authProvider?: "email" | "google" | "passkey" | "development";
  createdAt: Date;
};

export type BankConnection = {
  id: string;
  userId: string;
  provider: FinancialDataProvider;
  mode: ConnectionMode;
  status: ConnectionStatus;
  maskedCpf?: string;
  encryptedSessionData?: string;
  lastSyncedAt?: Date;
  createdAt: Date;
};

export type BalanceSnapshot = {
  id: string;
  userId: string;
  connectionId: string;
  availableAmount: number;
  currency: "BRL";
  capturedAt: Date;
};

export type RawTransaction = {
  id: string;
  source: FinancialDataProvider;
  amount: number;
  description: string;
  date: Date;
  metadata?: Record<string, unknown>;
};

export type NormalizedTransaction = {
  id: string;
  userId: string;
  connectionId: string;
  source: FinancialDataProvider;
  amount: number;
  direction: "inflow" | "outflow";
  type: "income" | "expense" | "transfer" | "refund" | "unknown";
  category?: string;
  description: string;
  date: Date;
};

export type CashflowProfile = {
  id: string;
  userId: string;
  currentBalance: number;
  averageMonthlyIncome: number;
  averageMonthlyExpenses: number;
  fixedMonthlyExpenses: number;
  discretionaryMonthlyExpenses: number;
  incomeVolatility: number;
  expenseVolatility: number;
  runwayWeeks: number;
  shortfallRisk30d: number;
  shortfallRisk60d: number;
  shortfallRisk90d: number;
  dataCoverageDays: number;
  transactionCount: number;
  updatedAt: Date;
};

export type PurchaseDecisionSnapshot = {
  runwayWeeks: number;
  shortfallRisk30d: number;
  shortfallRisk60d: number;
  shortfallRisk90d: number;
  currentBalance: number;
};

export type PurchaseDecisionInput = {
  userId: string;
  amount: number;
  category?: string;
  paymentMethod: PaymentMethod;
  installments?: number;
  necessity: PurchaseNecessity;
};

export type PurchaseDecisionOutput = {
  verdict: PurchaseVerdict;
  score: number;
  confidence: number;
  explanation: string;
  before: PurchaseDecisionSnapshot;
  after: PurchaseDecisionSnapshot;
  saferAlternative?: string;
};

export type PurchaseDecision = PurchaseDecisionInput &
  PurchaseDecisionOutput & {
    id: string;
    createdAt: Date;
  };

export type ConnectionResult = {
  ok: boolean;
  connection: BankConnection;
  message?: string;
};

export interface FinancialDataConnector {
  provider: FinancialDataProvider;

  connect(input: unknown): Promise<ConnectionResult>;

  fetchBalances(connectionId: string): Promise<BalanceSnapshot[]>;

  fetchTransactions(
    connectionId: string,
    params?: {
      from?: Date;
      to?: Date;
    }
  ): Promise<RawTransaction[]>;

  disconnect(connectionId: string): Promise<void>;
}
