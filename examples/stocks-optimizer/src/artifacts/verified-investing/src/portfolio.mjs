import { check, number, integer, mean, variance, dot, clamp, units, decimal, SCALE,
  floorToStep, tradeNotional, feeAmount, fingerprint, validateQuote } from './contracts.mjs';

export function shrinkageCovariance(returns, shrinkage = 0.35) {
  check(Array.isArray(returns) && returns.length >= 60 && returns.length <= 5000, 'covariance_sample');
  const n = returns[0].length; integer(n, 'asset_count', 1, 20);
  check(returns.every(r => r.length === n && r.every(Number.isFinite)), 'invalid_return_matrix');
  number(shrinkage, 'shrinkage', 0.01, 1);
  const means = Array.from({ length: n }, (_, j) => mean(returns.map(r => r[j])));
  return means.map((_, i) => means.map((__, j) => {
    const cov = returns.reduce((s, r) => s + (r[i] - means[i]) * (r[j] - means[j]), 0) / (returns.length - 1);
    return i === j ? cov + 1e-10 : cov * (1 - shrinkage);
  }));
}
const sum = xs => xs.reduce((a, b) => a + b, 0);
const multiply = (A, w) => A.map(row => dot(row, w));
function positiveDefinite(A) {
  const n = A.length, L = Array.from({ length: n }, () => Array(n).fill(0));
  for (let i = 0; i < n; i++) for (let j = 0; j <= i; j++) {
    check(Math.abs(A[i][j] - A[j][i]) < 1e-10, 'asymmetric_covariance');
    let v = A[i][j]; for (let k = 0; k < j; k++) v -= L[i][k] * L[j][k];
    if (i === j) { check(v > 0, 'non_positive_covariance'); L[i][j] = Math.sqrt(v); }
    else L[i][j] = v / L[j][j];
  }
}
function prox(z, old, penalty, caps, total) {
  const at = shift => z.map((v, i) => {
    const d = v - shift - old[i];
    return clamp(old[i] + Math.sign(d) * Math.max(0, Math.abs(d) - penalty[i]), 0, caps[i]);
  });
  let result = at(0); if (sum(result) <= total) return result;
  let lo = 0, hi = Math.max(...z.map((v, i) => Math.abs(v) + Math.abs(old[i]) + penalty[i])) + 1;
  for (let i = 0; i < 70; i++) { const mid = (lo + hi) / 2; if (sum(at(mid)) > total) lo = mid; else hi = mid; }
  return at(hi);
}
/** Exact linear-plus-L1 minimization over a capped simplex supplies a convex optimality bound. */
function linearOracle(g, old, costs, caps, total) {
  const segments = [];
  for (let i = 0; i < g.length; i++) {
    const knee = clamp(old[i], 0, caps[i]);
    segments.push({ i, length: knee, slope: g[i] - costs[i] });
    segments.push({ i, length: caps[i] - knee, slope: g[i] + costs[i] });
  }
  segments.sort((a, b) => a.slope - b.slope || a.i - b.i);
  const w = g.map(() => 0); let left = total;
  for (const segment of segments) {
    if (left <= 0 || segment.slope >= 0) break;
    const amount = Math.min(left, segment.length); w[segment.i] += amount; left -= amount;
  }
  return dot(g, w) + sum(w.map((v, i) => costs[i] * Math.abs(v - old[i])));
}
export function optimizeMpt({ expectedReturns, covariance, currentWeights, costs, caps,
  totalExposure = 0.8, riskAversion = 10, tolerance = 1e-8, maxIterations = 10000 }) {
  const n = expectedReturns.length; integer(n, 'asset_count', 1, 20);
  for (const [name, vector] of Object.entries({ expectedReturns, currentWeights, costs, caps }))
    check(Array.isArray(vector) && vector.length === n && vector.every(Number.isFinite), `invalid_${name}`);
  check(covariance.length === n && covariance.every(row => row.length === n && row.every(Number.isFinite)), 'invalid_covariance');
  positiveDefinite(covariance);
  check(caps.every(v => v >= 0 && v <= 1) && costs.every(v => v >= 0) && currentWeights.every(v => v >= 0 && v <= 1), 'invalid_constraints');
  number(totalExposure, 'total_exposure', 0, 1); number(riskAversion, 'risk_aversion', 0.01, 1000000);
  number(tolerance, 'tolerance', 1e-12, 1e-5); integer(maxIterations, 'iterations', 1, 50000);
  const L = Math.max(1e-12, riskAversion * Math.max(...covariance.map(row => sum(row.map(Math.abs)))));
  const step = 1 / L;
  let weights = prox(currentWeights, currentWeights, costs.map(() => 0), caps, totalExposure), gap = Infinity, i = 0;
  for (; i < maxIterations; i++) {
    const g = multiply(covariance, weights).map((v, j) => riskAversion * v - expectedReturns[j]);
    gap = Math.max(0, dot(g, weights) + sum(weights.map((v, j) => costs[j] * Math.abs(v - currentWeights[j])))
      - linearOracle(g, currentWeights, costs, caps, totalExposure));
    if (gap <= tolerance) break;
    weights = prox(weights.map((v, j) => v - step * g[j]), currentWeights, costs.map(c => c * step), caps, totalExposure);
  }
  const portfolioVariance = dot(weights, multiply(covariance, weights));
  return { weights, cashWeight: 1 - sum(weights), variance: portfolioVariance,
    expectedReturn: dot(weights, expectedReturns), turnover: sum(weights.map((v, j) => Math.abs(v - currentWeights[j]))),
    objective: dot(weights, expectedReturns) - riskAversion * portfolioVariance / 2
      - sum(weights.map((v, j) => costs[j] * Math.abs(v - currentWeights[j]))),
    certificate: { model: 'long-only-shrinkage-mean-variance-L1', converged: gap <= tolerance,
      objectiveGapUpperBound: gap, tolerance, iterations: i, globalForStatedConvexModelOnly: true } };
}

export function validateProfile(p, now = Date.now()) {
  check(p && typeof p === 'object', 'profile_required');
  check(['conservative', 'balanced', 'growth'].includes(p.riskTolerance), 'risk_tolerance_required');
  check(typeof p.quoteCurrency === 'string' && /^[A-Z]{3,6}$/.test(p.quoteCurrency), 'base_currency_required');
  number(p.maxAssetWeight, 'max_asset_weight', 0.01, 0.5); number(p.maxExposure, 'max_exposure', 0, 1);
  number(p.annualVolatilityTarget, 'annual_volatility_target', 0.01, 0.5);
  number(p.maxDrawdown, 'max_drawdown', 0.01, 0.5);
  integer(p.horizonDays, 'horizon_days', 1, 36500); units(p.cashReserve);
  check(Array.isArray(p.cashFlows) && p.cashFlows.length <= 100, 'cash_flows_required');
  for (const flow of p.cashFlows) {
    check(['contribution', 'withdrawal'].includes(flow.type), 'invalid_cash_flow'); units(flow.amount);
    integer(flow.dueAt, 'cash_flow_date', now - 36500 * 86400000, now + 36500 * 86400000);
    check(typeof flow.settled === 'boolean', 'cash_flow_settlement_required');
  }
  if (p.goal) { units(p.goal.target); integer(p.goal.dueAt, 'goal_due_date', now + 86400000, now + 36500 * 86400000); }
  return structuredClone(p);
}

/** Recommendations are not execution permissions. Upcoming money is never spent. */
export function planPortfolio({ profile, account, assets, returnMatrix, now = Date.now(), expectedRelease }) {
  const p = validateProfile(profile, now);
  check(Array.isArray(assets) && assets.length >= 1 && assets.length <= 20, 'asset_count');
  check(new Set(assets.map(a => a.symbol)).size === assets.length, 'duplicate_asset');
  check(account.quoteCurrency === p.quoteCurrency, 'currency_conversion_required');
  integer(account.syncedAt, 'account_timestamp', now - 30000, now + 1000);
  check(account.reconciled === true && account.openOrders === 0, 'account_reconciliation_required');
  check(Array.isArray(account.holdings), 'holdings_required');
  check(account.holdings.every(h => assets.some(a => a.symbol === h.symbol)), 'unvalued_holdings');
  check(new Set(account.holdings.map(h => h.symbol)).size === account.holdings.length, 'duplicate_holdings');
  let cash = units(account.availableCash); const held = new Map(account.holdings.map(h => [h.symbol, units(h.availableQuantity)]));
  const values = assets.map(a => {
    validateQuote(a.quote, { now, symbol: a.symbol, expectedRelease });
    check(a.quoteCurrency === p.quoteCurrency, 'mixed_quote_currencies');
    integer(a.feeBps, 'fee_bps', 0, 1000); number(a.expectedReturn, 'expected_return', -0.5, 0.5);
    number(a.uncertainty, 'forecast_uncertainty', 0, 1); number(a.liquidityCapWeight, 'liquidity_cap', 0, 1);
    check(a.eligible === true, 'asset_validation_required');
    check(units(a.lotStep) > 0n && units(a.priceTick) > 0n && units(a.minQuantity) >= 0n, 'exchange_filters_required');
    return Number(decimal((held.get(a.symbol) || 0n) * units(a.quote.price) / SCALE));
  });
  const equity = Number(decimal(cash)) + sum(values); check(equity > 0, 'no_equity');
  const upcoming = p.cashFlows.filter(f => !f.settled && f.type === 'contribution');
  let reserve = units(p.cashReserve);
  for (const flow of p.cashFlows) if (!flow.settled && flow.type === 'withdrawal' && flow.dueAt <= now + Math.min(90, p.horizonDays) * 86400000)
    reserve += units(flow.amount);
  const reservedWeight = Math.min(1, Number(decimal(reserve)) / equity);
  const horizonCap = p.horizonDays < 90 ? 0.2 : p.horizonDays < 365 ? 0.5 : 1;
  number(account.flowAdjustedPeakEquity, 'flow_adjusted_peak_equity', equity, 1e12);
  const observedDrawdown = 1 - equity / account.flowAdjustedPeakEquity;
  const totalExposure = observedDrawdown >= p.maxDrawdown ? 0 : Math.max(0, Math.min(p.maxExposure, 1 - reservedWeight, horizonCap));
  const covariance = shrinkageCovariance(returnMatrix);
  check(covariance.length === assets.length, 'asset_covariance_mismatch');
  const expectedReturns = assets.map(a => Math.max(-0.5, a.expectedReturn - 1.96 * a.uncertainty));
  const currentWeights = values.map(v => v / equity);
  const costs = assets.map(a => a.feeBps / 10000 + (a.quote.ask - a.quote.bid) / (2 * a.quote.price) + 0.0005);
  const caps = assets.map((a,i) => Math.min(p.maxAssetWeight, a.liquidityCapWeight, a.allowIncrease===false?currentWeights[i]:1));
  const periodsPerYear = assets[0].periodsPerYear;
  number(periodsPerYear, 'periods_per_year', 1, 525600);
  check(assets.every(a => a.periodsPerYear === periodsPerYear), 'unaligned_forecast_horizons');
  let riskAversion = { conservative: 30, balanced: 15, growth: 5 }[p.riskTolerance];
  let solved;
  for (let attempt = 0; attempt < 16; attempt++) {
    solved = optimizeMpt({ expectedReturns, covariance, currentWeights, costs, caps, totalExposure, riskAversion });
    check(solved.certificate.converged, 'optimizer_not_converged');
    if (Math.sqrt(solved.variance * periodsPerYear) <= p.annualVolatilityTarget + 1e-9) break;
    riskAversion *= 2;
  }
  check(Math.sqrt(solved.variance * periodsPerYear) <= p.annualVolatilityTarget + 1e-9, 'volatility_target_infeasible');
  let spendable = cash > reserve ? cash - reserve : 0n;
  const orders = assets.map((a, i) => {
    const current = held.get(a.symbol) || 0n;
    const targetRaw = Math.max(0, solved.weights[i] * equity / a.quote.price);
    const target = units(floorToStep((Math.floor(targetRaw * 1e8) / 1e8).toFixed(8), a.lotStep));
    const action = target > current ? 'BUY' : target < current ? 'SELL' : 'HOLD';
    const raw = target >= current ? target - current : current - target;
    const quantity = units(floorToStep(decimal(raw), a.lotStep));
    const tick = units(a.priceTick);
    const marketPrice = units(action === 'BUY' ? a.quote.ask : a.quote.bid);
    const price = action === 'BUY' ? ((marketPrice + tick - 1n) / tick) * tick : marketPrice / tick * tick;
    return { symbol: a.symbol, action, quantity, price, targetQuantity: decimal(target), currentQuantity: decimal(current),
      targetWeight: solved.weights[i], a, reason: 'cost-aware constrained portfolio rebalance' };
  });
  orders.sort((a, b) => Number(b.action === 'SELL') - Number(a.action === 'SELL') || a.symbol.localeCompare(b.symbol));
  for (const order of orders) {
    const { a } = order;
    if (order.action === 'BUY') {
      const max = spendable * SCALE * 10000n / (order.price * (10000n + BigInt(a.feeBps)));
      order.quantity = order.quantity < max ? order.quantity : max;
      order.quantity = order.quantity / units(a.lotStep) * units(a.lotStep);
    }
    let notional = order.quantity * order.price / SCALE;
    if (order.quantity < units(a.minQuantity) || notional < units(a.minNotional) || order.quantity === 0n) {
      order.action = 'HOLD'; order.quantity = 0n; notional = 0n;
      order.reason = 'No executable delta within settled cash and exchange minimums; minimums are never inflated.';
    }
    if (order.action === 'BUY') {
      const debit = units(tradeNotional(decimal(order.quantity), decimal(order.price)));
      spendable -= debit + units(feeAmount(decimal(debit), a.feeBps)); check(spendable >= 0n, 'cash_invariant');
    }
    order.notional = decimal(notional); order.estimatedFee = feeAmount(order.notional, a.feeBps);
    order.quantity = decimal(order.quantity); order.limitPrice = decimal(order.price); delete order.price; delete order.a;
  }
  const goal = p.goal ? { target: p.goal.target, dueAt: p.goal.dueAt,
    requiredAnnualReturnWithoutUnsettledContributions: (Number(p.goal.target) / equity) ** (365 * 86400000 / (p.goal.dueAt - now)) - 1,
    feasibility: 'not_guaranteed', riskLimitsIncreasedToMeetGoal: false } : null;
  const result = { accountHash: fingerprint({...account,syncedAt:0}), strategyHashes: assets.map(a => a.strategyHash || null), observedDrawdown, generatedAt: now, expiresAt: Math.min(...assets.map(a => a.quote.expiresAt)),
    quoteCurrency: p.quoteCurrency, equity, reservedCash: decimal(reserve), remainingSpendableCash: decimal(spendable),
    unsettledContributionsExcluded: upcoming, goal, orders, optimizer: solved,
    forecastAnnualVolatility: Math.sqrt(solved.variance * periodsPerYear),
    executionAuthorized: false, riskProfileHash: fingerprint(p),
    limitations: ['Optimization is conditional on estimated returns, covariance and costs.',
      'Discrete lot rounding and unfilled sales can deviate from continuous target weights.',
      'Future drawdown is not bounded by a historical drawdown limit.'] };
  return { ...result, planHash: fingerprint(result) };
}
