import {
  AlertTriangle,
  CheckCircle2,
  CircleDollarSign,
  Database,
  FileUp,
  History,
  PlugZap,
  RefreshCw,
  ShieldCheck,
  SlidersHorizontal,
  Trash2,
  Upload,
  WalletCards
} from "lucide-react";
import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from "react";
import { calculateCashflowProfile } from "../cashflow.js";
import {
  ManualUploadConnector,
  SampleDataConnector
} from "../connectors.js";
import { formatBrl, formatPercent } from "../format.js";
import type {
  BalanceSnapshot,
  BankConnection,
  PaymentMethod,
  PurchaseDecision,
  PurchaseDecisionOutput,
  PurchaseNecessity,
  PurchaseVerdict,
  RawTransaction
} from "../models.js";
import { normalizeRawTransactions } from "../normalize.js";
import { createPurchaseDecision } from "../purchase-decision.js";
import { createSampleFinancialDataset } from "../sample-data.js";

const APP_NOW = new Date("2026-06-03T12:00:00.000Z");
const USER_ID = "demo-user";

type Tab = "validate" | "connect" | "profile" | "history" | "upload" | "settings";

type FinancialState = {
  connection?: BankConnection;
  balances: BalanceSnapshot[];
  rawTransactions: RawTransaction[];
  message?: string;
};

type PurchaseForm = {
  amount: string;
  category: string;
  paymentMethod: PaymentMethod;
  installments: string;
  necessity: PurchaseNecessity;
};

type LocalNubankStatementApiResult =
  | {
      ok: true;
      connection: BankConnection;
      balances: BalanceSnapshot[];
      rawTransactions: RawTransaction[];
      message: string;
    }
  | {
      ok: false;
      message: string;
    };

const SAMPLE_UPLOAD = `date,description,amount,category,balance
2026-05-25,Salary deposit,7800,Income,18640
2026-05-27,Grocery market,-386,Groceries,18254
2026-05-29,Restaurant meal,-92,Dining,18162
2026-06-03,Apartment rent,-2450,Housing,15712`;

export function App() {
  const [tab, setTab] = useState<Tab>("validate");
  const [financialState, setFinancialState] = useState<FinancialState>(() => createInitialFinancialState());
  const [form, setForm] = useState<PurchaseForm>({
    amount: "520",
    category: "Work equipment",
    paymentMethod: "cash",
    installments: "6",
    necessity: "optional"
  });
  const [decision, setDecision] = useState<PurchaseDecisionOutput | undefined>();
  const [history, setHistory] = useState<PurchaseDecision[]>([]);
  const [manualCsv, setManualCsv] = useState(SAMPLE_UPLOAD);

  useEffect(() => {
    let cancelled = false;

    void fetch(`/api/local-nubank-statement?userId=${encodeURIComponent(USER_ID)}`)
      .then(async (response) => {
        if (!response.ok) return undefined;
        return response.json() as Promise<LocalNubankStatementApiResult>;
      })
      .then((result) => {
        if (cancelled || !result?.ok) return;
        setFinancialState(hydrateFinancialState(result));
        setDecision(undefined);
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, []);

  const normalizedTransactions = useMemo(() => {
    if (!financialState.connection) return [];
    return normalizeRawTransactions({
      rawTransactions: financialState.rawTransactions,
      userId: USER_ID,
      connectionId: financialState.connection.id
    });
  }, [financialState.connection, financialState.rawTransactions]);

  const profile = useMemo(() => {
    return calculateCashflowProfile({
      userId: USER_ID,
      transactions: normalizedTransactions,
      balances: financialState.balances,
      now: APP_NOW
    });
  }, [financialState.balances, normalizedTransactions]);

  function validatePurchase(event?: FormEvent) {
    event?.preventDefault();
    const amount = Number(form.amount);
    const nextDecision = createPurchaseDecision({
      input: {
        userId: USER_ID,
        amount,
        category: form.category || undefined,
        paymentMethod: form.paymentMethod,
        installments: Number(form.installments) || undefined,
        necessity: form.necessity
      },
      profile,
      transactions: normalizedTransactions,
      now: APP_NOW
    });
    setDecision(nextDecision);
    setHistory((current) => [
      {
        ...nextDecision,
        id: `decision-${Date.now()}`,
        userId: USER_ID,
        amount,
        category: form.category || undefined,
        paymentMethod: form.paymentMethod,
        installments: Number(form.installments) || undefined,
        necessity: form.necessity,
        createdAt: new Date()
      },
      ...current
    ]);
  }

  async function loadSampleData() {
    const connector = new SampleDataConnector({ now: () => APP_NOW });
    const result = await connector.connect({ userId: USER_ID });
    if (result.ok) {
      setFinancialState({
        connection: result.connection,
        balances: await connector.fetchBalances(result.connection.id),
        rawTransactions: await connector.fetchTransactions(result.connection.id),
        message: result.message
      });
      setTab("validate");
      setDecision(undefined);
    }
  }

  async function importManualCsv() {
    const connector = new ManualUploadConnector({ now: () => APP_NOW });
    const result = await connector.connect({
      userId: USER_ID,
      csv: manualCsv,
      currentBalance: profile.currentBalance
    });
    if (!result.ok) {
      setFinancialState((current) => ({ ...current, message: result.message }));
      return;
    }
    setFinancialState({
      connection: result.connection,
      balances: await connector.fetchBalances(result.connection.id),
      rawTransactions: await connector.fetchTransactions(result.connection.id),
      message: result.message
    });
    setTab("validate");
    setDecision(undefined);
  }

  async function readCsvFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setManualCsv(await file.text());
  }

  function disconnectData() {
    if (!window.confirm("Disconnect the active financial data source? Imported records will be cleared from this session.")) return;
    setFinancialState({ balances: [], rawTransactions: [], message: "Financial data disconnected." });
    setDecision(undefined);
  }

  function deleteImportedData() {
    if (!window.confirm("Delete imported financial records from this session? This cannot be undone in the current session.")) return;
    setFinancialState((current) => ({ ...current, balances: [], rawTransactions: [], message: "Imported financial records deleted." }));
    setDecision(undefined);
  }

  return (
    <main className="liquidity-app">
      <header className="app-topbar">
        <div className="brand-lockup">
          <div className="brand-icon" aria-hidden="true"><WalletCards size={22} /></div>
          <div>
            <p>Liquidity Manager</p>
            <span>{connectionLabel(financialState.connection)}</span>
          </div>
        </div>
        <nav className="tab-nav" aria-label="Liquidity Manager sections">
          <TabButton tab="validate" current={tab} onSelect={setTab} icon={<CircleDollarSign size={17} />} label="Validate" />
          <TabButton tab="connect" current={tab} onSelect={setTab} icon={<PlugZap size={17} />} label="Connect" />
          <TabButton tab="profile" current={tab} onSelect={setTab} icon={<SlidersHorizontal size={17} />} label="Profile" />
          <TabButton tab="history" current={tab} onSelect={setTab} icon={<History size={17} />} label="History" />
          <TabButton tab="upload" current={tab} onSelect={setTab} icon={<FileUp size={17} />} label="Upload" />
          <TabButton tab="settings" current={tab} onSelect={setTab} icon={<ShieldCheck size={17} />} label="Settings" />
        </nav>
      </header>

      {financialState.message ? (
        <p className="system-message"><ShieldCheck size={17} aria-hidden="true" />{financialState.message}</p>
      ) : null}

      {tab === "validate" ? (
        <PurchaseValidator
          form={form}
          profile={profile}
          transactionCount={normalizedTransactions.length}
          decision={decision}
          disabled={!financialState.connection || normalizedTransactions.length === 0}
          onChange={setForm}
          onSubmit={validatePurchase}
          onLoadSample={() => void loadSampleData()}
        />
      ) : null}

      {tab === "connect" ? (
        <ConnectScreen
          onUpload={() => setTab("upload")}
        />
      ) : null}

      {tab === "profile" ? <CashflowProfileView profile={profile} /> : null}
      {tab === "history" ? <DecisionHistory decisions={history} /> : null}
      {tab === "upload" ? (
        <ManualUploadView
          csv={manualCsv}
          onCsvChange={setManualCsv}
          onFileChange={(event) => void readCsvFile(event)}
          onImport={() => void importManualCsv()}
        />
      ) : null}
      {tab === "settings" ? (
        <SettingsView
          connection={financialState.connection}
          rawRecordCount={financialState.rawTransactions.length}
          onDisconnect={disconnectData}
          onDeleteData={deleteImportedData}
        />
      ) : null}
    </main>
  );
}

export function PurchaseValidator({
  form,
  profile,
  transactionCount,
  decision,
  disabled,
  onChange,
  onSubmit,
  onLoadSample
}: {
  form: PurchaseForm;
  profile: ReturnType<typeof calculateCashflowProfile>;
  transactionCount: number;
  decision?: PurchaseDecisionOutput;
  disabled: boolean;
  onChange(next: PurchaseForm): void;
  onSubmit(event?: FormEvent): void;
  onLoadSample(): void;
}) {
  return (
    <section className="validate-layout" aria-labelledby="purchase-question">
      <form className="purchase-form" onSubmit={onSubmit}>
        <div>
          <p className="eyebrow">Purchase validation</p>
          <h1 id="purchase-question">Is this purchase justifiable?</h1>
          <p className="subtitle">Validate a purchase against your real cashflow before committing.</p>
        </div>

        <label className="field">
          <span>Amount</span>
          <input
            value={form.amount}
            onChange={(event) => onChange({ ...form, amount: event.target.value })}
            inputMode="decimal"
            type="number"
            min="1"
            step="1"
            aria-label="Purchase amount"
          />
        </label>

        <label className="field">
          <span>Category</span>
          <input
            value={form.category}
            onChange={(event) => onChange({ ...form, category: event.target.value })}
            placeholder="Optional"
            aria-label="Purchase category"
          />
        </label>

        <div className="field">
          <span>Payment method</span>
          <div className="segmented-control" role="group" aria-label="Payment method">
            {(["cash", "credit", "installments"] as const).map((method) => (
              <button
                key={method}
                type="button"
                className={form.paymentMethod === method ? "selected" : undefined}
                onClick={() => onChange({ ...form, paymentMethod: method })}
              >
                {methodLabel(method)}
              </button>
            ))}
          </div>
        </div>

        {form.paymentMethod === "installments" ? (
          <label className="field">
            <span>Installments</span>
            <input
              value={form.installments}
              onChange={(event) => onChange({ ...form, installments: event.target.value })}
              type="number"
              min="2"
              max="24"
              step="1"
              aria-label="Installment count"
            />
          </label>
        ) : null}

        <label className="field">
          <span>Necessity</span>
          <select
            value={form.necessity}
            onChange={(event) => onChange({ ...form, necessity: event.target.value as PurchaseNecessity })}
            aria-label="Purchase necessity"
          >
            <option value="optional">Optional</option>
            <option value="necessary">Necessary</option>
            <option value="income_generating">Income generating</option>
          </select>
        </label>

        <div className="form-actions">
          <button className="primary-button" type="submit" disabled={disabled || Number(form.amount) <= 0}>
            <CheckCircle2 size={18} aria-hidden="true" />
            Validate purchase
          </button>
          {disabled ? (
            <button className="secondary-button" type="button" onClick={onLoadSample}>
              <RefreshCw size={17} aria-hidden="true" />
              Try sample data
            </button>
          ) : null}
        </div>
      </form>

      <section className="decision-surface" aria-live="polite">
        <CashflowVisual profile={profile} transactionCount={transactionCount} />
        {decision ? <DecisionResult decision={decision} /> : <EmptyDecision />}
      </section>
    </section>
  );
}

function DecisionResult({ decision }: { decision: PurchaseDecisionOutput }) {
  return (
    <div className={`decision-result verdict-${decision.verdict}`}>
      <div className="decision-heading">
        <VerdictIcon verdict={decision.verdict} />
        <div>
          <p>{verdictLabel(decision.verdict)}</p>
          <h2>{decision.explanation}</h2>
        </div>
      </div>

      <div className="score-grid">
        <ScoreMeter label="Score" value={decision.score} />
        <ScoreMeter label="Confidence" value={decision.confidence} />
      </div>

      <div className="metrics-comparison" aria-label="Before and after metrics">
        <MetricPair label="Current balance" before={formatBrl(decision.before.currentBalance)} after={formatBrl(decision.after.currentBalance)} />
        <MetricPair label="Runway" before={`${decision.before.runwayWeeks} weeks`} after={`${decision.after.runwayWeeks} weeks`} />
        <MetricPair label="30-day risk" before={formatPercent(decision.before.shortfallRisk30d)} after={formatPercent(decision.after.shortfallRisk30d)} />
        <MetricPair label="60-day risk" before={formatPercent(decision.before.shortfallRisk60d)} after={formatPercent(decision.after.shortfallRisk60d)} />
        <MetricPair label="90-day risk" before={formatPercent(decision.before.shortfallRisk90d)} after={formatPercent(decision.after.shortfallRisk90d)} />
      </div>

      {decision.saferAlternative ? (
        <p className="safer-alternative"><ShieldCheck size={17} aria-hidden="true" />{decision.saferAlternative}</p>
      ) : null}
    </div>
  );
}

function EmptyDecision() {
  return (
    <div className="empty-decision">
      <CircleDollarSign size={28} aria-hidden="true" />
      <p>No decision yet.</p>
      <span>Enter a purchase and validate it against the active cashflow profile.</span>
    </div>
  );
}

function CashflowVisual({ profile, transactionCount }: { profile: ReturnType<typeof calculateCashflowProfile>; transactionCount: number }) {
  const runwayWidth = `${Math.min(100, (profile.runwayWeeks / 20) * 100)}%`;
  const riskWidth = `${Math.min(100, profile.shortfallRisk90d * 100)}%`;

  return (
    <div className="cashflow-visual" aria-label="Cashflow summary">
      <div className="visual-row">
        <span>Balance</span>
        <strong>{formatBrl(profile.currentBalance)}</strong>
      </div>
      <div className="visual-track"><span style={{ width: runwayWidth }} /></div>
      <div className="visual-row">
        <span>Runway</span>
        <strong>{profile.runwayWeeks} weeks</strong>
      </div>
      <div className="visual-track risk"><span style={{ width: riskWidth }} /></div>
      <div className="visual-row">
        <span>90-day risk</span>
        <strong>{formatPercent(profile.shortfallRisk90d)}</strong>
      </div>
      <div className="visual-foot">
        <Database size={16} aria-hidden="true" />
        <span>{transactionCount} transactions</span>
      </div>
    </div>
  );
}

export function ConnectScreen({
  onUpload
}: {
  onUpload(): void;
}) {
  return (
    <section className="screen-grid" aria-labelledby="connect-title">
      <div className="screen-heading">
        <p className="eyebrow">Connect financial data</p>
        <h1 id="connect-title">Connect financial data</h1>
      </div>

      <div className="connector-list">
        <button className="connector-option" type="button" onClick={onUpload}>
          <Upload size={21} aria-hidden="true" />
          <span>
            <strong>Upload statement</strong>
            <small>CSV import with date, description, and amount.</small>
          </span>
        </button>
      </div>
    </section>
  );
}

function CashflowProfileView({ profile }: { profile: ReturnType<typeof calculateCashflowProfile> }) {
  return (
    <section className="screen-grid" aria-labelledby="profile-title">
      <div className="screen-heading">
        <p className="eyebrow">Cashflow profile</p>
        <h1 id="profile-title">Cashflow profile</h1>
      </div>
      <div className="profile-grid">
        <MetricTile label="Current balance" value={formatBrl(profile.currentBalance)} />
        <MetricTile label="Average monthly income" value={formatBrl(profile.averageMonthlyIncome)} />
        <MetricTile label="Average monthly expenses" value={formatBrl(profile.averageMonthlyExpenses)} />
        <MetricTile label="Fixed monthly expenses" value={formatBrl(profile.fixedMonthlyExpenses)} />
        <MetricTile label="Discretionary monthly expenses" value={formatBrl(profile.discretionaryMonthlyExpenses)} />
        <MetricTile label="Income volatility" value={formatPercent(profile.incomeVolatility)} />
        <MetricTile label="Expense volatility" value={formatPercent(profile.expenseVolatility)} />
        <MetricTile label="Data coverage" value={`${profile.dataCoverageDays} days`} />
        <MetricTile label="Transaction count" value={`${profile.transactionCount}`} />
      </div>
    </section>
  );
}

function DecisionHistory({ decisions }: { decisions: PurchaseDecision[] }) {
  return (
    <section className="screen-grid" aria-labelledby="history-title">
      <div className="screen-heading">
        <p className="eyebrow">Decision history</p>
        <h1 id="history-title">Decision history</h1>
      </div>
      {decisions.length ? (
        <div className="history-list">
          {decisions.map((decision) => (
            <article className={`history-item verdict-${decision.verdict}`} key={decision.id}>
              <div>
                <strong>{formatBrl(decision.amount)}</strong>
                <span>{decision.category || "Uncategorized"} · {methodLabel(decision.paymentMethod)}</span>
              </div>
              <p>{verdictLabel(decision.verdict)} · score {decision.score} · confidence {decision.confidence}</p>
            </article>
          ))}
        </div>
      ) : (
        <p className="empty-line">No purchase decisions yet.</p>
      )}
    </section>
  );
}

function ManualUploadView({
  csv,
  onCsvChange,
  onFileChange,
  onImport
}: {
  csv: string;
  onCsvChange(value: string): void;
  onFileChange(event: ChangeEvent<HTMLInputElement>): void;
  onImport(): void;
}) {
  return (
    <section className="screen-grid" aria-labelledby="upload-title">
      <div className="screen-heading">
        <p className="eyebrow">Manual upload fallback</p>
        <h1 id="upload-title">Upload statement</h1>
      </div>
      <div className="upload-actions">
        <label className="file-button">
          <FileUp size={18} aria-hidden="true" />
          <span>Choose CSV</span>
          <input type="file" accept=".csv,text/csv" onChange={onFileChange} />
        </label>
        <button className="primary-button" type="button" onClick={onImport}>
          <Upload size={18} aria-hidden="true" />
          Import CSV
        </button>
      </div>
      <label className="field text-area-field">
        <span>CSV content</span>
        <textarea value={csv} onChange={(event) => onCsvChange(event.target.value)} rows={10} spellCheck={false} />
      </label>
    </section>
  );
}

function SettingsView({
  connection,
  rawRecordCount,
  onDisconnect,
  onDeleteData
}: {
  connection?: BankConnection;
  rawRecordCount: number;
  onDisconnect(): void;
  onDeleteData(): void;
}) {
  return (
    <section className="screen-grid" aria-labelledby="settings-title">
      <div className="screen-heading">
        <p className="eyebrow">Settings</p>
        <h1 id="settings-title">Disconnect / delete data</h1>
      </div>
      <div className="settings-grid">
        <MetricTile label="Active provider" value={connection ? providerLabel(connection.provider) : "None"} />
        <MetricTile label="Imported records" value={`${rawRecordCount}`} />
      </div>
      <div className="danger-actions">
        <button className="secondary-button" type="button" onClick={onDisconnect}>
          <PlugZap size={17} aria-hidden="true" />
          Disconnect
        </button>
        <button className="danger-button" type="button" onClick={onDeleteData}>
          <Trash2 size={17} aria-hidden="true" />
          Delete imported data
        </button>
      </div>
    </section>
  );
}

function ScoreMeter({ label, value }: { label: string; value: number }) {
  return (
    <div className="score-meter">
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
      </div>
      <div className="meter-track"><span style={{ width: `${value}%` }} /></div>
    </div>
  );
}

function MetricPair({ label, before, after }: { label: string; before: string; after: string }) {
  return (
    <div className="metric-pair">
      <span>{label}</span>
      <strong>{before}</strong>
      <strong>{after}</strong>
    </div>
  );
}

function MetricTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric-tile">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function TabButton({
  tab,
  current,
  icon,
  label,
  onSelect
}: {
  tab: Tab;
  current: Tab;
  icon: React.ReactNode;
  label: string;
  onSelect(tab: Tab): void;
}) {
  return (
    <button type="button" className={current === tab ? "selected" : undefined} onClick={() => onSelect(tab)} aria-current={current === tab ? "page" : undefined}>
      {icon}
      <span>{label}</span>
    </button>
  );
}

function VerdictIcon({ verdict }: { verdict: PurchaseVerdict }) {
  if (verdict === "approved" || verdict === "acceptable") return <CheckCircle2 size={28} aria-hidden="true" />;
  return <AlertTriangle size={28} aria-hidden="true" />;
}

function createInitialFinancialState(): FinancialState {
  const connection: BankConnection = {
    id: "sample-connection",
    userId: USER_ID,
    provider: "sample",
    mode: "sample_data",
    status: "connected",
    lastSyncedAt: APP_NOW,
    createdAt: APP_NOW
  };
  const dataset = createSampleFinancialDataset({ userId: USER_ID, connectionId: connection.id, now: APP_NOW });
  return {
    connection,
    balances: dataset.balances,
    rawTransactions: dataset.transactions,
    message: "Sample cashflow data is ready."
  };
}

function hydrateFinancialState(input: {
  connection: BankConnection;
  balances: BalanceSnapshot[];
  rawTransactions: RawTransaction[];
  message?: string;
}): FinancialState {
  return {
    connection: {
      ...input.connection,
      createdAt: new Date(input.connection.createdAt),
      lastSyncedAt: input.connection.lastSyncedAt ? new Date(input.connection.lastSyncedAt) : undefined
    },
    balances: input.balances.map((balance) => ({
      ...balance,
      capturedAt: new Date(balance.capturedAt)
    })),
    rawTransactions: input.rawTransactions.map((transaction) => ({
      ...transaction,
      date: new Date(transaction.date)
    })),
    message: input.message
  };
}

function connectionLabel(connection?: BankConnection): string {
  if (!connection) return "No active data source";
  return `${providerLabel(connection.provider)} · ${connection.status}`;
}

function providerLabel(provider: BankConnection["provider"]): string {
  if (provider === "manual_upload") return "Manual upload";
  if (provider === "open_finance") return "Open Finance";
  if (provider === "nubank") return "Nubank";
  return "Sample data";
}

function methodLabel(method: PaymentMethod): string {
  if (method === "installments") return "Installments";
  if (method === "credit") return "Credit";
  return "Cash";
}

function verdictLabel(verdict: PurchaseVerdict): string {
  const labels: Record<PurchaseVerdict, string> = {
    approved: "Approved",
    acceptable: "Acceptable",
    delay: "Delay",
    reduce_amount: "Reduce amount",
    risky: "Risky",
    not_justifiable: "Not justifiable"
  };
  return labels[verdict];
}
