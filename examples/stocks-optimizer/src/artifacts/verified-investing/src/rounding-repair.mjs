import { units, decimal, tradeNotional, feeAmount, fingerprint, check } from './contracts.mjs';
import { auditExecutablePlan, withExecutionAudit } from './order-audit.mjs';

function violation(audit, input) {
  const excess = (v, cap) => Math.max(0, v - cap) ** 2;
  const horizon = input.profile.horizonDays < 90 ? 0.2 : input.profile.horizonDays < 365 ? 0.5 : 1;
  return audit.postTradeWeights.reduce((s, p, i) => s + excess(p.weight, Math.min(input.profile.maxAssetWeight, input.assets[i].liquidityCapWeight)), 0)
    + excess(audit.postTradeExposure, Math.min(input.profile.maxExposure, horizon))
    + excess(audit.postTradeAnnualVolatility, input.profile.annualVolatilityTarget)
    + excess(Number(input.planReserve || 0), Number(audit.postTradeCash)) / Math.max(1, audit.postTradeEquity ** 2);
}
function recost(orders, assets) {
  for (const order of orders) {
    const asset = assets.find(a => a.symbol === order.symbol);
    if (order.action === 'HOLD') { order.quantity = '0'; order.notional = '0'; order.estimatedFee = '0'; continue; }
    order.notional = tradeNotional(order.quantity, order.limitPrice);
    order.estimatedFee = feeAmount(order.notional, asset.feeBps);
  }
}

/** Bounded feasible lot repair, never a claim of a globally optimal integer portfolio. */
export function repairRoundedPlan(source, input, { maxSteps = 64 } = {}) {
  check(Number.isSafeInteger(maxSteps) && maxSteps >= 0 && maxSteps <= 128, 'invalid_lot_repair_budget');
  const originalHash = source.planHash, body = structuredClone(source); delete body.planHash;
  recost(body.orders, input.assets);
  let audit = auditExecutablePlan(body, input), steps = 0;
  const scoring = { ...input, planReserve: body.reservedCash };
  while (!audit.passed && steps < maxSteps) {
    let best = null, bestAudit = null, score = violation(audit, scoring);
    for (let i = 0; i < body.orders.length; i++) {
      const order = body.orders[i]; if (order.action !== 'BUY') continue;
      const asset = input.assets.find(a => a.symbol === order.symbol), step = units(asset.lotStep);
      const q = units(order.quantity); if (q < step) continue;
      const candidate = structuredClone(body), changed = candidate.orders[i]; changed.quantity = decimal(q - step);
      const notional = units(tradeNotional(changed.quantity, changed.limitPrice));
      if (units(changed.quantity) < units(asset.minQuantity) || notional < units(asset.minNotional) || q === step) {
        changed.action = 'HOLD'; changed.quantity = '0';
      }
      changed.reason = 'Lot size reduced to preserve post-fee portfolio risk limits; sale proceeds are not available for funding.';
      recost(candidate.orders, input.assets);
      const result = auditExecutablePlan(candidate, input), nextScore = violation(result, scoring);
      if (result.passed || nextScore < score - 1e-20) { best = candidate; bestAudit = result; score = nextScore; if (result.passed) break; }
    }
    if (!best) break;
    body.orders = best.orders; audit = bestAudit; steps++;
  }
  let remaining = units(input.account.availableCash) > units(body.reservedCash)
    ? units(input.account.availableCash) - units(body.reservedCash) : 0n;
  for (const order of body.orders) if (order.action === 'BUY') remaining -= units(order.notional) + units(order.estimatedFee);
  check(remaining >= 0n, 'cash_invariant');
  const result = { ...body, remainingSpendableCash: decimal(remaining), executionAudit: audit,
    status: audit.passed ? 'proposed' : 'blocked', portfolioPolicyPerformanceVerified: false,
    lotRepair: { steps, maxSteps, sourcePlanHash: originalHash, exactDiscreteOptimumClaimed: false,
      continuousCertificateScope: 'Original continuous optimization problem, not the repaired integer holdings.' } };
  return { ...result, planHash: fingerprint(result) };
}

export function withFeasibleLots(runtime) {
  const audited = withExecutionAudit(runtime);
  return { async query(name, input, ...args) {
    const result = await audited.query(name, input, ...args);
    if (name !== 'investing.plan.v1' || result.ok !== true) return result;
    const plan = repairRoundedPlan(result.result ?? result.data, input);
    return result.result !== undefined ? { ...result, result: plan } : { ...result, data: plan };
  } };
}
