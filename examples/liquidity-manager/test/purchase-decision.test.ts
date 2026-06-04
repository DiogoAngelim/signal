import { describe, expect, it } from "vitest";
import {
  calculateCashflowProfile,
  calculateScenarioSnapshot,
  createPurchaseDecision,
  createSampleFinancialDataset,
  normalizeRawTransactions
} from "../src/index.js";
import type { CashflowProfile, NormalizedTransaction } from "../src/models.js";

const NOW = new Date("2026-06-03T12:00:00.000Z");

describe("purchase decision engine", () => {
  it("approves a purchase that preserves runway", () => {
    const { profile, normalized } = sampleProfile();
    const decision = createPurchaseDecision({
      input: { userId: "u1", amount: 160, paymentMethod: "cash", necessity: "necessary" },
      profile,
      transactions: normalized,
      now: NOW
    });

    expect(decision.verdict).toBe("approved");
    expect(decision.score).toBeGreaterThanOrEqual(85);
    expect(decision.confidence).toBeGreaterThanOrEqual(90);
  });

  it("marks a purchase that slightly weakens the buffer as acceptable or delay", () => {
    const { profile, normalized } = sampleProfile();
    const decision = createPurchaseDecision({
      input: { userId: "u1", amount: 2600, paymentMethod: "cash", necessity: "optional" },
      profile,
      transactions: normalized,
      now: NOW
    });

    expect(["acceptable", "delay"]).toContain(decision.verdict);
    expect(decision.score).toBeGreaterThanOrEqual(50);
    expect(decision.score).toBeLessThan(85);
  });

  it("caps purchases that drop runway below 8 weeks", () => {
    const { profile, normalized } = sampleProfile();
    const decision = createPurchaseDecision({
      input: { userId: "u1", amount: 13000, paymentMethod: "cash", necessity: "optional" },
      profile,
      transactions: normalized,
      now: NOW
    });

    expect(decision.after.runwayWeeks).toBeLessThan(8);
    expect(decision.score).toBeLessThanOrEqual(69);
    expect(decision.verdict).not.toBe("approved");
  });

  it("caps purchases that drop runway below 4 weeks harder", () => {
    const { profile, normalized } = sampleProfile();
    const decision = createPurchaseDecision({
      input: { userId: "u1", amount: 19000, paymentMethod: "cash", necessity: "optional" },
      profile,
      transactions: normalized,
      now: NOW
    });

    expect(decision.after.runwayWeeks).toBeLessThan(4);
    expect(decision.score).toBeLessThanOrEqual(49);
    expect(["risky", "not_justifiable"]).toContain(decision.verdict);
  });

  it("caps purchases that increase shortfall risk by 5+ and 10+ points", () => {
    const profile = syntheticProfile({ currentBalance: 5400, income: 5200, expenses: 4800, coverage: 120, count: 80 });
    const moderate = createPurchaseDecision({
      input: { userId: "u1", amount: 700, paymentMethod: "cash", necessity: "necessary" },
      profile,
      transactions: [],
      now: NOW
    });
    const severe = createPurchaseDecision({
      input: { userId: "u1", amount: 1600, paymentMethod: "cash", necessity: "necessary" },
      profile,
      transactions: [],
      now: NOW
    });

    expect(riskIncrease(moderate)).toBeGreaterThanOrEqual(0.05);
    expect(moderate.score).toBeLessThanOrEqual(74);
    expect(riskIncrease(severe)).toBeGreaterThanOrEqual(0.1);
    expect(severe.score).toBeLessThanOrEqual(59);
  });

  it("gives income-generating purchases more tolerance than optional purchases", () => {
    const { profile, normalized } = sampleProfile();
    const optional = createPurchaseDecision({
      input: { userId: "u1", amount: 1800, paymentMethod: "cash", necessity: "optional" },
      profile,
      transactions: normalized,
      now: NOW
    });
    const incomeGenerating = createPurchaseDecision({
      input: { userId: "u1", amount: 1800, paymentMethod: "cash", necessity: "income_generating" },
      profile,
      transactions: normalized,
      now: NOW
    });

    expect(incomeGenerating.score).toBeGreaterThan(optional.score);
  });

  it("accounts for installment payments in future cashflow", () => {
    const { profile, normalized } = sampleProfile();
    const decision = createPurchaseDecision({
      input: { userId: "u1", amount: 9800, paymentMethod: "installments", installments: 2, necessity: "optional" },
      profile,
      transactions: normalized,
      now: NOW
    });

    expect(decision.after.runwayWeeks).toBeLessThan(decision.before.runwayWeeks);
    expect(decision.score).toBeLessThanOrEqual(59);
  });

  it("caps cash payments above available balance", () => {
    const { profile, normalized } = sampleProfile();
    const decision = createPurchaseDecision({
      input: { userId: "u1", amount: profile.currentBalance + 1, paymentMethod: "cash", necessity: "necessary" },
      profile,
      transactions: normalized,
      now: NOW
    });

    expect(decision.score).toBeLessThanOrEqual(49);
    expect(["risky", "not_justifiable"]).toContain(decision.verdict);
  });

  it("keeps score and confidence separate when history is thin", () => {
    const profile = syntheticProfile({ currentBalance: 60000, income: 11000, expenses: 2400, coverage: 24, count: 12 });
    const decision = createPurchaseDecision({
      input: { userId: "u1", amount: 500, paymentMethod: "cash", necessity: "necessary" },
      profile,
      transactions: [],
      now: NOW
    });

    expect(decision.score).toBeGreaterThanOrEqual(85);
    expect(decision.confidence).toBe(25);
    expect(decision.explanation).toContain("low confidence");
  });

  it("returns safer alternatives for weak verdicts", () => {
    const { profile, normalized } = sampleProfile();
    const decision = createPurchaseDecision({
      input: { userId: "u1", amount: 14000, paymentMethod: "cash", necessity: "optional" },
      profile,
      transactions: normalized,
      now: NOW
    });

    expect(decision.saferAlternative).toBeTruthy();
    expect(decision.saferAlternative).toMatch(/Reduce|Delay|Wait|installments/);
  });
});

function sampleProfile(): { profile: CashflowProfile; normalized: NormalizedTransaction[] } {
  const dataset = createSampleFinancialDataset({ userId: "u1", connectionId: "sample-1", now: NOW });
  const normalized = normalizeRawTransactions({
    rawTransactions: dataset.transactions,
    userId: "u1",
    connectionId: "sample-1"
  });
  const profile = calculateCashflowProfile({
    userId: "u1",
    transactions: normalized,
    balances: dataset.balances,
    now: NOW
  });
  return { profile, normalized };
}

function syntheticProfile({
  currentBalance,
  income,
  expenses,
  coverage,
  count
}: {
  currentBalance: number;
  income: number;
  expenses: number;
  coverage: number;
  count: number;
}): CashflowProfile {
  const snapshot = calculateScenarioSnapshot({
    currentBalance,
    averageMonthlyIncome: income,
    averageMonthlyExpenses: expenses,
    incomeVolatility: 0.08,
    expenseVolatility: 0.08
  });
  return {
    id: "synthetic-profile",
    userId: "u1",
    currentBalance,
    averageMonthlyIncome: income,
    averageMonthlyExpenses: expenses,
    fixedMonthlyExpenses: expenses * 0.72,
    discretionaryMonthlyExpenses: expenses * 0.28,
    incomeVolatility: 0.08,
    expenseVolatility: 0.08,
    runwayWeeks: snapshot.runwayWeeks,
    shortfallRisk30d: snapshot.shortfallRisk30d,
    shortfallRisk60d: snapshot.shortfallRisk60d,
    shortfallRisk90d: snapshot.shortfallRisk90d,
    dataCoverageDays: coverage,
    transactionCount: count,
    updatedAt: NOW
  };
}

function riskIncrease(decision: PurchaseDecisionOutputLike): number {
  return Math.max(
    decision.after.shortfallRisk30d - decision.before.shortfallRisk30d,
    decision.after.shortfallRisk60d - decision.before.shortfallRisk60d,
    decision.after.shortfallRisk90d - decision.before.shortfallRisk90d,
    0
  );
}

type PurchaseDecisionOutputLike = ReturnType<typeof createPurchaseDecision>;
