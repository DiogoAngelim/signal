import { describe, expect, it } from "vitest";
import {
  calculateCashflowProfile,
  createPurchaseDecision,
  createSampleFinancialDataset,
  normalizeRawTransactions,
} from "../src/index.js";
import type { RawTransaction } from "../src/models.js";

const NOW = new Date("2026-06-03T12:00:00.000Z");

describe("cashflow profile", () => {
  it("calculates runway, coverage, transaction count, income, expenses, and recurring expense load", () => {
    const { profile } = sampleProfile();

    expect(profile.currentBalance).toBe(23000);
    expect(profile.averageMonthlyIncome).toBeGreaterThan(
      profile.averageMonthlyExpenses,
    );
    expect(profile.fixedMonthlyExpenses).toBeGreaterThan(3000);
    expect(profile.runwayWeeks).toBeGreaterThan(16);
    expect(profile.dataCoverageDays).toBeGreaterThanOrEqual(180);
    expect(profile.transactionCount).toBeGreaterThan(100);
  });

  it("classifies inflows, outflows, income, and recurring expenses from normalized history", () => {
    const { normalized, profile } = sampleProfile();
    const salary = normalized.find(
      (transaction) => transaction.description === "Salary deposit",
    );
    const rent = normalized.find(
      (transaction) => transaction.description === "Apartment rent",
    );

    expect(salary?.direction).toBe("inflow");
    expect(salary?.type).toBe("income");
    expect(rent?.direction).toBe("outflow");
    expect(rent?.type).toBe("expense");
    expect(profile.fixedMonthlyExpenses).toBeGreaterThan(
      profile.discretionaryMonthlyExpenses,
    );
  });

  it("feeds manual-upload shaped data into the same purchase engine", () => {
    const rawTransactions: RawTransaction[] = [
      raw(
        "salary-1",
        "manual_upload",
        6000,
        "Salary deposit",
        "2026-04-25",
        "Income",
      ),
      raw(
        "salary-2",
        "manual_upload",
        6000,
        "Salary deposit",
        "2026-05-25",
        "Income",
      ),
      raw(
        "rent-1",
        "manual_upload",
        -2100,
        "Apartment rent",
        "2026-04-03",
        "Housing",
      ),
      raw(
        "rent-2",
        "manual_upload",
        -2100,
        "Apartment rent",
        "2026-05-03",
        "Housing",
      ),
      raw(
        "groceries-1",
        "manual_upload",
        -450,
        "Grocery market",
        "2026-05-10",
        "Groceries",
      ),
      raw(
        "groceries-2",
        "manual_upload",
        -430,
        "Grocery market",
        "2026-05-17",
        "Groceries",
      ),
    ];
    const normalized = normalizeRawTransactions({
      rawTransactions,
      userId: "u1",
      connectionId: "manual-1",
    });
    const profile = calculateCashflowProfile({
      userId: "u1",
      transactions: normalized,
      balances: [
        {
          id: "b1",
          userId: "u1",
          connectionId: "manual-1",
          availableAmount: 14000,
          currency: "BRL",
          capturedAt: NOW,
        },
      ],
      now: NOW,
    });
    const decision = createPurchaseDecision({
      input: {
        userId: "u1",
        amount: 500,
        paymentMethod: "cash",
        necessity: "optional",
      },
      profile,
      transactions: normalized,
      now: NOW,
    });

    expect(decision.score).toBeGreaterThan(60);
    expect(decision.before.currentBalance).toBe(14000);
  });

  it("feeds Nubank-shaped data into the same purchase engine", () => {
    const rawTransactions: RawTransaction[] = [
      raw("nu-1", "nubank", 7000, "Salary deposit", "2026-03-25", "Income"),
      raw("nu-2", "nubank", 7000, "Salary deposit", "2026-04-25", "Income"),
      raw("nu-3", "nubank", 7000, "Salary deposit", "2026-05-25", "Income"),
      raw("nu-4", "nubank", -2200, "Apartment rent", "2026-03-03", "Housing"),
      raw("nu-5", "nubank", -2200, "Apartment rent", "2026-04-03", "Housing"),
      raw("nu-6", "nubank", -2200, "Apartment rent", "2026-05-03", "Housing"),
      raw("nu-7", "nubank", -380, "Grocery market", "2026-05-09", "Groceries"),
    ];
    const normalized = normalizeRawTransactions({
      rawTransactions,
      userId: "u1",
      connectionId: "nu-1",
    });
    const profile = calculateCashflowProfile({
      userId: "u1",
      transactions: normalized,
      balances: [
        {
          id: "b1",
          userId: "u1",
          connectionId: "nu-1",
          availableAmount: 12500,
          currency: "BRL",
          capturedAt: NOW,
        },
      ],
      now: NOW,
    });
    const decision = createPurchaseDecision({
      input: {
        userId: "u1",
        amount: 800,
        paymentMethod: "cash",
        necessity: "necessary",
      },
      profile,
      transactions: normalized,
      now: NOW,
    });

    expect(decision.verdict).not.toBe("not_justifiable");
    expect(decision.after.currentBalance).toBe(11700);
  });

  it("excludes internal Nubank investment movements from monthly expenses", () => {
    const rawTransactions: RawTransaction[] = [
      raw(
        "income",
        "nubank",
        5000,
        "Transferência recebida pelo Pix",
        "2026-05-25",
        "Income",
      ),
      raw("rdb", "nubank", -4800, "Aplicação RDB", "2026-05-25", "Transfer"),
      raw(
        "grocery",
        "nubank",
        -200,
        "Compra no débito",
        "2026-05-26",
        "Groceries",
      ),
    ];
    const normalized = normalizeRawTransactions({
      rawTransactions,
      userId: "u1",
      connectionId: "nu-1",
    });
    const profile = calculateCashflowProfile({
      userId: "u1",
      transactions: normalized,
      balances: [
        {
          id: "b1",
          userId: "u1",
          connectionId: "nu-1",
          availableAmount: 5000,
          currency: "BRL",
          capturedAt: NOW,
        },
      ],
      now: NOW,
    });

    expect(
      normalized.find((transaction) => transaction.id === "rdb")?.type,
    ).toBe("transfer");
    expect(profile.averageMonthlyExpenses).toBeLessThan(300);
  });
});

function sampleProfile() {
  const dataset = createSampleFinancialDataset({
    userId: "u1",
    connectionId: "sample-1",
    now: NOW,
  });
  const normalized = normalizeRawTransactions({
    rawTransactions: dataset.transactions,
    userId: "u1",
    connectionId: "sample-1",
  });
  const profile = calculateCashflowProfile({
    userId: "u1",
    transactions: normalized,
    balances: dataset.balances,
    now: NOW,
  });
  return { dataset, normalized, profile };
}

function raw(
  id: string,
  source: RawTransaction["source"],
  amount: number,
  description: string,
  date: string,
  category: string,
): RawTransaction {
  return {
    id,
    source,
    amount,
    description,
    date: new Date(`${date}T12:00:00.000Z`),
    metadata: { category },
  };
}
