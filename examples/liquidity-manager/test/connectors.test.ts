import { describe, expect, it } from "vitest";
import {
  FinancialDataSession,
  ManualUploadConnector,
  NubankConnector,
  OpenFinanceConnector,
  SampleDataConnector,
  maskCpf,
  normalizeRawTransactions,
  parseManualCsv
} from "../src/index.js";

const NOW = new Date("2026-06-03T12:00:00.000Z");

describe("financial data connectors", () => {
  it("loads sample data and creates normalized transactions", async () => {
    const connector = new SampleDataConnector({ now: () => NOW });
    const result = await connector.connect({ userId: "u1" });
    const rawTransactions = await connector.fetchTransactions(result.connection.id);
    const normalized = normalizeRawTransactions({
      rawTransactions,
      userId: "u1",
      connectionId: result.connection.id
    });

    expect(result.ok).toBe(true);
    expect(rawTransactions.length).toBeGreaterThan(100);
    expect(normalized.some((transaction) => transaction.direction === "inflow")).toBe(true);
    expect(normalized.some((transaction) => transaction.direction === "outflow")).toBe(true);
  });

  it("normalizes valid manual CSV uploads", async () => {
    const connector = new ManualUploadConnector({ now: () => NOW });
    const result = await connector.connect({
      userId: "u1",
      csv: `date,description,amount,category,balance
2026-05-01,Salary,5000,Income,9000
2026-05-02,Rent,-2200,Housing,6800`
    });
    const transactions = await connector.fetchTransactions(result.connection.id);
    const balances = await connector.fetchBalances(result.connection.id);

    expect(result.ok).toBe(true);
    expect(transactions).toHaveLength(2);
    expect(transactions[0]?.source).toBe("manual_upload");
    expect(balances[0]?.availableAmount).toBe(6800);
  });

  it("classifies Nubank investment movements as transfers", () => {
    const normalized = normalizeRawTransactions({
      userId: "u1",
      connectionId: "nu-1",
      rawTransactions: [
        {
          id: "rdb-application",
          source: "nubank",
          amount: -219.16,
          description: "Aplicação RDB",
          date: NOW
        },
        {
          id: "rdb-rescue",
          source: "nubank",
          amount: 219.16,
          description: "Resgate RDB",
          date: NOW
        }
      ]
    });

    expect(normalized.map((transaction) => transaction.type)).toEqual(["transfer", "transfer"]);
  });

  it("returns useful manual upload errors", () => {
    const parsed = parseManualCsv(`date,description
2026-05-01,Salary`);

    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.errors.join(" ")).toContain("amount");
  });

  it("keeps Nubank isolated, masks CPF, encrypts sessions, and never persists passwords", async () => {
    const connector = new NubankConnector({
      now: () => NOW,
      encryptionSecret: "unit-test-secret",
      adapter: {
        async createSession() {
          return {
            sessionData: { token: "secret-token-value" },
            balances: [{ availableAmount: 7200 }],
            transactions: [
              {
                id: "nu-1",
                source: "nubank",
                amount: 5000,
                description: "Salary deposit",
                date: new Date("2026-05-25T12:00:00.000Z")
              }
            ]
          };
        }
      }
    });

    const result = await connector.connect({
      userId: "u1",
      cpf: "123.456.789-09",
      password: "never-store-this"
    });
    const persisted = JSON.stringify(result.connection);

    expect(result.ok).toBe(true);
    expect(result.connection.maskedCpf).toBe("***.***.***-09");
    expect(result.connection.encryptedSessionData).toBeTruthy();
    expect(persisted).not.toContain("12345678909");
    expect(persisted).not.toContain("secret-token-value");
    expect(persisted).not.toContain("never-store-this");
  });

  it("falls back to manual upload when Nubank is unavailable", async () => {
    const connector = new NubankConnector({ now: () => NOW });
    const result = await connector.connect({
      userId: "u1",
      cpf: "12345678909",
      password: "temporary"
    });

    expect(result.ok).toBe(false);
    expect(result.connection.status).toBe("failed");
    expect(result.message).toContain("Upload a Nubank statement instead");
  });

  it("returns safe Nubank adapter failure messages without leaking thrown details", async () => {
    const connector = new NubankConnector({
      now: () => NOW,
      adapter: {
        async createSession() {
          throw new Error("raw upstream detail with secret-token-value");
        }
      }
    });

    const result = await connector.connect({
      userId: "u1",
      cpf: "12345678909",
      password: "temporary"
    });

    expect(result.ok).toBe(false);
    expect(result.message).toBe("Could not connect to Nubank automatically. Upload a Nubank statement instead.");
    expect(result.message).not.toContain("secret-token-value");
  });

  it("keeps Open Finance as a placeholder", async () => {
    const connector = new OpenFinanceConnector({ now: () => NOW });
    const result = await connector.connect({ userId: "u1" });

    expect(result.ok).toBe(false);
    expect(result.connection.mode).toBe("open_finance_placeholder");
    expect(result.message).toContain("future placeholder");
  });

  it("disconnects and deletes imported financial records", async () => {
    const session = new FinancialDataSession();
    const connector = new SampleDataConnector({ now: () => NOW });
    await session.connect(connector, { userId: "u1" });

    expect(session.activeConnection).toBeTruthy();
    expect(session.rawTransactions.length).toBeGreaterThan(0);

    session.deleteImportedData();
    expect(session.rawTransactions).toHaveLength(0);
    expect(session.balances).toHaveLength(0);

    await session.connect(connector, { userId: "u1" });
    await session.disconnect(connector);
    expect(session.activeConnection).toBeUndefined();
    expect(session.rawTransactions).toHaveLength(0);
  });
});

describe("security helpers", () => {
  it("masks CPF before storage", () => {
    expect(maskCpf("123.456.789-09")).toBe("***.***.***-09");
  });
});
