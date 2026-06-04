import { calculateScenarioSnapshot, profileSnapshot } from "./cashflow.js";
import { clamp, formatBrl } from "./format.js";
import type {
  CashflowProfile,
  NormalizedTransaction,
  PurchaseDecisionInput,
  PurchaseDecisionOutput,
  PurchaseDecisionSnapshot,
  PurchaseVerdict
} from "./models.js";

const SAFE_RUNWAY_WEEKS = 8;
const STRONG_RUNWAY_WEEKS = 16;

export function createPurchaseDecision({
  input,
  profile,
  transactions = [],
  now = new Date()
}: {
  input: PurchaseDecisionInput;
  profile: CashflowProfile;
  transactions?: NormalizedTransaction[];
  now?: Date;
}): PurchaseDecisionOutput {
  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    throw new Error("Purchase amount must be greater than zero.");
  }

  const installments = Math.max(1, Math.round(input.installments || 1));
  const installmentPayment = input.paymentMethod === "installments" ? input.amount / installments : 0;
  const oneMonthCreditImpact = input.paymentMethod === "credit" ? input.amount : 0;
  const immediateBalanceDelta = input.paymentMethod === "cash" ? -input.amount : 0;
  const before = profileSnapshot(profile);
  const after = calculateScenarioSnapshot({
    currentBalance: Math.max(0, profile.currentBalance + immediateBalanceDelta),
    averageMonthlyIncome: profile.averageMonthlyIncome,
    averageMonthlyExpenses: profile.averageMonthlyExpenses + installmentPayment + oneMonthCreditImpact,
    incomeVolatility: profile.incomeVolatility,
    expenseVolatility: profile.expenseVolatility
  });

  const riskIncrease = Math.max(
    after.shortfallRisk30d - before.shortfallRisk30d,
    after.shortfallRisk60d - before.shortfallRisk60d,
    after.shortfallRisk90d - before.shortfallRisk90d,
    0
  );
  const scoreParts = {
    runway: clamp(after.runwayWeeks / STRONG_RUNWAY_WEEKS, 0, 1) * 100,
    risk: clamp(1 - riskIncrease / 0.18, 0, 1) * 100,
    volatility: clamp(1 - profile.incomeVolatility - input.amount / Math.max(1, profile.averageMonthlyIncome * 3), 0, 1) * 100,
    necessity: necessityScore(input.necessity),
    recentSpending: recentSpendingScore({ transactions, amount: input.amount, now, monthlyExpenses: profile.averageMonthlyExpenses }),
    recovery: recoveryScore({ amount: input.amount, profile })
  };

  let score =
    scoreParts.runway * 0.3 +
    scoreParts.risk * 0.25 +
    scoreParts.volatility * 0.15 +
    scoreParts.necessity * 0.15 +
    scoreParts.recentSpending * 0.1 +
    scoreParts.recovery * 0.05;

  score += necessityBoost(input.necessity);
  score = applyHardCaps({ score, input, profile, after, riskIncrease, installmentPayment });
  score = Math.round(clamp(score, 0, 100));
  const confidence = calculateDecisionConfidence(profile);
  const verdict = verdictForScore(score, input, after);

  return {
    verdict,
    score,
    confidence,
    explanation: explainDecision({ verdict, score, confidence, before, after, input }),
    before,
    after,
    saferAlternative: saferAlternative({ verdict, input, profile, after, installmentPayment })
  };
}

export function calculateDecisionConfidence(profile: CashflowProfile): number {
  if (profile.dataCoverageDays < 30 || profile.transactionCount < 30) return 25;
  if (profile.dataCoverageDays >= 180 && profile.transactionCount >= 100) return 95;
  if (profile.dataCoverageDays >= 90 && profile.transactionCount >= 60) return 80;
  if (profile.dataCoverageDays >= 60 && profile.transactionCount >= 30) return 60;
  return 40;
}

function necessityScore(necessity: PurchaseDecisionInput["necessity"]): number {
  if (necessity === "income_generating") return 88;
  if (necessity === "necessary") return 78;
  return 56;
}

function necessityBoost(necessity: PurchaseDecisionInput["necessity"]): number {
  if (necessity === "income_generating") return 10;
  if (necessity === "necessary") return 5;
  return 0;
}

function recentSpendingScore({
  transactions,
  amount,
  now,
  monthlyExpenses
}: {
  transactions: NormalizedTransaction[];
  amount: number;
  now: Date;
  monthlyExpenses: number;
}): number {
  const cutoff = now.getTime() - 30 * 24 * 60 * 60 * 1000;
  const recentOutflow = transactions
    .filter((transaction) => transaction.direction === "outflow" && transaction.date.getTime() >= cutoff)
    .reduce((sum, transaction) => sum + transaction.amount, 0);
  const pressureRatio = (recentOutflow + amount) / Math.max(1, monthlyExpenses);
  return clamp(120 - pressureRatio * 55, 20, 100);
}

function recoveryScore({ amount, profile }: { amount: number; profile: CashflowProfile }): number {
  const monthlySurplus = profile.averageMonthlyIncome - profile.averageMonthlyExpenses;
  if (monthlySurplus <= 0) return 25;
  const months = amount / monthlySurplus;
  return clamp(100 - months * 18, 25, 100);
}

function applyHardCaps({
  score,
  input,
  profile,
  after,
  riskIncrease,
  installmentPayment
}: {
  score: number;
  input: PurchaseDecisionInput;
  profile: CashflowProfile;
  after: PurchaseDecisionSnapshot;
  riskIncrease: number;
  installmentPayment: number;
}): number {
  let capped = score;
  if (after.runwayWeeks < SAFE_RUNWAY_WEEKS) capped = Math.min(capped, 69);
  if (after.runwayWeeks < 4) capped = Math.min(capped, 49);
  if (riskIncrease >= 0.05) capped = Math.min(capped, 74);
  if (riskIncrease >= 0.1) capped = Math.min(capped, 59);
  if (input.paymentMethod === "cash" && input.amount > profile.currentBalance) capped = Math.min(capped, 49);
  if (input.paymentMethod === "installments" && profile.averageMonthlyExpenses + installmentPayment > profile.averageMonthlyIncome) {
    capped = Math.min(capped, 59);
  }
  return capped;
}

function verdictForScore(score: number, input: PurchaseDecisionInput, after: PurchaseDecisionSnapshot): PurchaseVerdict {
  if (score >= 85) return "approved";
  if (score >= 70) return "acceptable";
  if (score >= 50) {
    if (input.paymentMethod === "cash" && after.runwayWeeks < SAFE_RUNWAY_WEEKS) return "reduce_amount";
    return "delay";
  }
  if (score >= 30) return "risky";
  return "not_justifiable";
}

function explainDecision({
  verdict,
  confidence,
  before,
  after,
  input
}: {
  verdict: PurchaseVerdict;
  score: number;
  confidence: number;
  before: PurchaseDecisionSnapshot;
  after: PurchaseDecisionSnapshot;
  input: PurchaseDecisionInput;
}): string {
  const confidencePrefix = confidence < 50 ? "With low confidence, " : "";
  const runwayDelta = Math.round((before.runwayWeeks - after.runwayWeeks) * 10) / 10;

  if (verdict === "approved") return `${confidencePrefix}Approved: your runway remains above target.`;
  if (verdict === "acceptable") return `${confidencePrefix}Acceptable: this weakens your buffer by ${runwayDelta} weeks, but remains manageable.`;
  if (verdict === "delay") return `${confidencePrefix}Delay: this purchase would be safer after your next income cycle.`;
  if (verdict === "reduce_amount") return `${confidencePrefix}Reduce amount: ${formatBrl(input.amount)} would push runway below the target buffer.`;
  if (verdict === "risky") return `${confidencePrefix}Risky: this materially increases shortfall risk.`;
  return `${confidencePrefix}Not justifiable: your cashflow cannot absorb this purchase safely.`;
}

function saferAlternative({
  verdict,
  input,
  profile,
  after,
  installmentPayment
}: {
  verdict: PurchaseVerdict;
  input: PurchaseDecisionInput;
  profile: CashflowProfile;
  after: PurchaseDecisionSnapshot;
  installmentPayment: number;
}): string | undefined {
  if (verdict === "approved" || verdict === "acceptable") return undefined;

  if (input.paymentMethod === "installments" && profile.averageMonthlyExpenses + installmentPayment > profile.averageMonthlyIncome) {
    const safePayment = Math.max(0, profile.averageMonthlyIncome - profile.averageMonthlyExpenses);
    return `Use installments only if monthly payment remains below ${formatBrl(safePayment)}.`;
  }

  const weeklyExpenseBurn = Math.max(1, profile.averageMonthlyExpenses / 4.345);
  const safeBalanceFloor = weeklyExpenseBurn * SAFE_RUNWAY_WEEKS;
  const safeAmount = Math.max(0, Math.floor((profile.currentBalance - safeBalanceFloor) / 10) * 10);

  if (input.paymentMethod === "cash" && safeAmount > 0 && safeAmount < input.amount) {
    return `Reduce the purchase to ${formatBrl(safeAmount)}.`;
  }

  if (after.runwayWeeks < SAFE_RUNWAY_WEEKS) return "Delay until runway is back above 8 weeks.";
  return "Wait until the next income cycle.";
}
