import { check, units, decimal, tradeNotional, feeAmount, fingerprint, validateQuote, dot } from './contracts.mjs';
import { shrinkageCovariance } from './portfolio.mjs';

/** Independent post-rounding check. Continuous optimality is NOT discrete execution feasibility. */
export function auditExecutablePlan(plan, { profile, account, assets, returnMatrix, now = Date.now(), expectedRelease }) {
  check(plan && Array.isArray(plan.orders), 'invalid_execution_plan');
  check(new Set(plan.orders.map(o => o.symbol)).size === plan.orders.length, 'duplicate_order_asset');
  const indexed = new Map(assets.map(a => [a.symbol, a]));
  const holdings = new Map(account.holdings.map(h => [h.symbol, units(h.availableQuantity)]));
  let cash = units(account.availableCash), buyBudget = cash > units(plan.reservedCash) ? cash - units(plan.reservedCash) : 0n;
  const blockers = [], costs = [];
  for (const order of plan.orders) {
    const asset = indexed.get(order.symbol); check(asset, 'unvalued_order_asset');
    validateQuote(asset.quote, { now, symbol: order.symbol, expectedRelease });
    check(['BUY', 'SELL', 'HOLD'].includes(order.action), 'invalid_order_action');
    const quantity = units(order.quantity), held = holdings.get(order.symbol) || 0n;
    if (order.action === 'HOLD') { check(quantity === 0n, 'hold_has_nonzero_quantity'); continue; }
    const price = units(order.limitPrice), step = units(asset.lotStep), tick = units(asset.priceTick);
    check(quantity > 0n && step > 0n && tick > 0n && quantity % step === 0n && price > 0n && price % tick === 0n, 'rounded_order_step_mismatch');
    const notional = units(tradeNotional(order.quantity, order.limitPrice)), fee = units(feeAmount(decimal(notional), asset.feeBps));
    if (units(order.estimatedFee) < fee) blockers.push(`${order.symbol}:fee_under_reserved`);
    if (quantity < units(asset.minQuantity) || notional < units(asset.minNotional)) blockers.push(`${order.symbol}:exchange_minimum`);
    if (asset.maxQuantity !== undefined && quantity > units(asset.maxQuantity)) blockers.push(`${order.symbol}:exchange_maximum`);
    if (order.action === 'SELL') {
      check(quantity <= held, 'rounded_order_oversells'); holdings.set(order.symbol, held - quantity); cash += notional - fee;
    } else {
      check(asset.allowIncrease !== false, 'entry_window_or_direction_not_validated');
      check(notional + fee <= buyBudget, 'buy_depends_on_unsettled_sales');
      buyBudget -= notional + fee; cash -= notional + fee; holdings.set(order.symbol, held + quantity);
    }
    costs.push({ symbol: order.symbol, notional: decimal(notional), fee: decimal(fee) });
  }
  check(cash >= 0n, 'post_trade_cash_negative');
  const values = assets.map(a => Number(decimal(holdings.get(a.symbol) || 0n)) * a.quote.price);
  const equity = Number(decimal(cash)) + values.reduce((a, b) => a + b, 0);
  check(Number.isFinite(equity) && equity > 0, 'invalid_post_trade_equity');
  const weights = values.map(v => v / equity), exposure = weights.reduce((a, b) => a + b, 0);
  const covariance = shrinkageCovariance(returnMatrix);
  const volatility = Math.sqrt(Math.max(0, dot(weights, covariance.map(row => dot(row, weights)))) * assets[0].periodsPerYear);
  const tolerance = 1e-10;
  for (let i = 0; i < assets.length; i++) if (weights[i] > Math.min(profile.maxAssetWeight, assets[i].liquidityCapWeight) + tolerance)
    blockers.push(`${assets[i].symbol}:post_trade_concentration`);
  const horizonCap = profile.horizonDays < 90 ? 0.2 : profile.horizonDays < 365 ? 0.5 : 1;
  if (exposure > Math.min(profile.maxExposure, horizonCap) + tolerance) blockers.push('post_trade_exposure');
  if (volatility > profile.annualVolatilityTarget + tolerance) blockers.push('post_trade_volatility');
  if (cash < units(plan.reservedCash)) blockers.push('withdrawal_reserve_shortfall');
  if (plan.observedDrawdown >= profile.maxDrawdown && exposure > tolerance) blockers.push('drawdown_liquidation_residual');
  return { schemaVersion: 'execution-feasibility.v1', passed: blockers.length === 0, blockers,
    postTradeCash: decimal(cash), postTradeEquity: equity, postTradeExposure: exposure,
    postTradeAnnualVolatility: volatility, postTradeWeights: assets.map((a, i) => ({ symbol: a.symbol, weight: weights[i] })), costs,
    feesReserved: true, futureFillsGuaranteed: false, discreteGlobalOptimalityProven: false,
    scope: 'Feasibility at quoted prices after lot rounding and fees, not performance validation of the deployed portfolio policy.' };
}

export function withExecutionAudit(runtime) {
  return {
    async query(name, input, ...args) {
      const result = await runtime.query(name, input, ...args);
      if (name !== 'investing.plan.v1' || result.ok !== true) return result;
      const plan = result.result ?? result.data;
      const executionAudit = auditExecutablePlan(plan, input);
      const { planHash, ...body } = plan;
      const audited = { ...body, executionAudit, status: executionAudit.passed ? 'proposed' : 'blocked',
        portfolioPolicyPerformanceVerified: false };
      const value = { ...audited, planHash: fingerprint(audited) };
      return result.result !== undefined ? { ...result, result: value } : { ...result, data: value };
    },
  };
}
