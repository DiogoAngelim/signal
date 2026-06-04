import { clamp, roundCurrency } from "./format.js";
import type { BalanceSnapshot, CashflowProfile, NormalizedTransaction, PurchaseDecisionSnapshot } from "./models.js";

const DAYS_PER_MONTH = 30.44;
const WEEKS_PER_MONTH = 4.345;
const MAX_RUNWAY_WEEKS = 260;

export function calculateCashflowProfile({
  userId,
  transactions,
  balances,
  now = new Date()
}: {
  userId: string;
  transactions: NormalizedTransaction[];
  balances: BalanceSnapshot[];
  now?: Date;
}): CashflowProfile {
  const sorted = [...transactions].sort((a, b) => a.date.getTime() - b.date.getTime());
  const latestBalance = [...balances].sort((a, b) => b.capturedAt.getTime() - a.capturedAt.getTime())[0];
  const derivedBalance = transactions.reduce((sum, transaction) => {
    return sum + (transaction.direction === "inflow" ? transaction.amount : -transaction.amount);
  }, 0);
  const currentBalance = roundCurrency(latestBalance?.availableAmount ?? Math.max(0, derivedBalance));
  const firstDate = sorted[0]?.date ?? now;
  const lastDate = sorted[sorted.length - 1]?.date ?? now;
  const dataCoverageDays = Math.max(0, Math.ceil((lastDate.getTime() - firstDate.getTime()) / (24 * 60 * 60 * 1000)) + 1);
  const monthCount = Math.max(1, dataCoverageDays / DAYS_PER_MONTH);
  const incomePredicate = (transaction: NormalizedTransaction) => transaction.type === "income" || transaction.type === "refund";
  const expensePredicate = (transaction: NormalizedTransaction) => transaction.type !== "transfer";
  const incomeTotal = sumTransactions(sorted, "inflow", incomePredicate);
  const expenseTotal = sumTransactions(sorted, "outflow", expensePredicate);
  const averageMonthlyIncome = roundCurrency(incomeTotal / monthCount);
  const averageMonthlyExpenses = roundCurrency(expenseTotal / monthCount);
  const fixedMonthlyExpenses = roundCurrency(detectFixedMonthlyExpenses(sorted, dataCoverageDays));
  const discretionaryMonthlyExpenses = roundCurrency(Math.max(0, averageMonthlyExpenses - fixedMonthlyExpenses));
  const monthlyIncome = monthlyTotals(sorted, "inflow", incomePredicate);
  const monthlyExpenses = monthlyTotals(sorted, "outflow", expensePredicate);
  const incomeVolatility = coefficientOfVariation(monthlyIncome);
  const expenseVolatility = coefficientOfVariation(monthlyExpenses);
  const snapshot = calculateScenarioSnapshot({
    currentBalance,
    averageMonthlyIncome,
    averageMonthlyExpenses,
    incomeVolatility,
    expenseVolatility
  });

  return {
    id: `cashflow-${userId}`,
    userId,
    currentBalance,
    averageMonthlyIncome,
    averageMonthlyExpenses,
    fixedMonthlyExpenses,
    discretionaryMonthlyExpenses,
    incomeVolatility,
    expenseVolatility,
    runwayWeeks: snapshot.runwayWeeks,
    shortfallRisk30d: snapshot.shortfallRisk30d,
    shortfallRisk60d: snapshot.shortfallRisk60d,
    shortfallRisk90d: snapshot.shortfallRisk90d,
    dataCoverageDays,
    transactionCount: sorted.length,
    updatedAt: now
  };
}

export function profileSnapshot(profile: CashflowProfile): PurchaseDecisionSnapshot {
  return {
    runwayWeeks: profile.runwayWeeks,
    shortfallRisk30d: profile.shortfallRisk30d,
    shortfallRisk60d: profile.shortfallRisk60d,
    shortfallRisk90d: profile.shortfallRisk90d,
    currentBalance: profile.currentBalance
  };
}

export function calculateScenarioSnapshot({
  currentBalance,
  averageMonthlyIncome,
  averageMonthlyExpenses,
  incomeVolatility,
  expenseVolatility
}: {
  currentBalance: number;
  averageMonthlyIncome: number;
  averageMonthlyExpenses: number;
  incomeVolatility: number;
  expenseVolatility: number;
}): PurchaseDecisionSnapshot {
  const weeklyExpenseBurden = averageMonthlyExpenses / WEEKS_PER_MONTH;
  const weeklyNetBurn = Math.max(0, averageMonthlyExpenses - averageMonthlyIncome) / WEEKS_PER_MONTH;
  const weeklyBurn = Math.max(1, weeklyExpenseBurden, weeklyNetBurn);
  const runwayWeeks = roundOne(clamp(currentBalance / weeklyBurn, 0, MAX_RUNWAY_WEEKS));
  const volatility = incomeVolatility * 0.55 + expenseVolatility * 0.45;

  return {
    runwayWeeks,
    shortfallRisk30d: roundRisk(shortfallRisk({ currentBalance, averageMonthlyIncome, averageMonthlyExpenses, volatility, horizonDays: 30 })),
    shortfallRisk60d: roundRisk(shortfallRisk({ currentBalance, averageMonthlyIncome, averageMonthlyExpenses, volatility, horizonDays: 60 })),
    shortfallRisk90d: roundRisk(shortfallRisk({ currentBalance, averageMonthlyIncome, averageMonthlyExpenses, volatility, horizonDays: 90 })),
    currentBalance: roundCurrency(Math.max(0, currentBalance))
  };
}

function sumTransactions(
  transactions: NormalizedTransaction[],
  direction: NormalizedTransaction["direction"],
  predicate: (transaction: NormalizedTransaction) => boolean = () => true
): number {
  return transactions
    .filter((transaction) => transaction.direction === direction && predicate(transaction))
    .reduce((sum, transaction) => sum + transaction.amount, 0);
}

function monthlyTotals(
  transactions: NormalizedTransaction[],
  direction: NormalizedTransaction["direction"],
  predicate: (transaction: NormalizedTransaction) => boolean = () => true
): number[] {
  const byMonth = new Map<string, number>();
  for (const transaction of transactions) {
    if (transaction.direction !== direction) continue;
    if (!predicate(transaction)) continue;
    const key = `${transaction.date.getUTCFullYear()}-${String(transaction.date.getUTCMonth() + 1).padStart(2, "0")}`;
    byMonth.set(key, (byMonth.get(key) ?? 0) + transaction.amount);
  }
  return [...byMonth.values()];
}

function detectFixedMonthlyExpenses(transactions: NormalizedTransaction[], dataCoverageDays: number): number {
  const groups = new Map<string, NormalizedTransaction[]>();
  for (const transaction of transactions) {
    if (transaction.direction !== "outflow" || transaction.type !== "expense") continue;
    const key = recurringKey(transaction);
    const next = groups.get(key) ?? [];
    next.push(transaction);
    groups.set(key, next);
  }

  let fixedTotal = 0;
  for (const items of groups.values()) {
    if (items.length < 2) continue;
    const amount = items.reduce((sum, item) => sum + item.amount, 0);
    fixedTotal += (amount / Math.max(1, dataCoverageDays)) * DAYS_PER_MONTH;
  }
  return fixedTotal;
}

function recurringKey(transaction: NormalizedTransaction): string {
  return (transaction.category || transaction.description)
    .toLowerCase()
    .replace(/\d+/g, "")
    .replace(/[^a-z]+/g, " ")
    .trim();
}

function coefficientOfVariation(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  if (mean <= 0) return 0;
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  return roundRisk(Math.sqrt(variance) / mean);
}

function shortfallRisk({
  currentBalance,
  averageMonthlyIncome,
  averageMonthlyExpenses,
  volatility,
  horizonDays
}: {
  currentBalance: number;
  averageMonthlyIncome: number;
  averageMonthlyExpenses: number;
  volatility: number;
  horizonDays: number;
}): number {
  if (averageMonthlyExpenses <= 0) return 0;
  const months = horizonDays / DAYS_PER_MONTH;
  const projectedBalance = currentBalance + (averageMonthlyIncome - averageMonthlyExpenses) * months;
  const requiredReserve = averageMonthlyExpenses * months * 1.15;
  const reserveGap = 1 - projectedBalance / Math.max(1, requiredReserve);
  return clamp(reserveGap + clamp(volatility * 0.18, 0, 0.2), 0, 0.95);
}

function roundRisk(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function roundOne(value: number): number {
  return Math.round(value * 10) / 10;
}
