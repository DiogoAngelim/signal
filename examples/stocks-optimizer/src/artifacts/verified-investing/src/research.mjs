import { check, number, integer, mean, variance, costModel, afterCosts, fingerprint,
  validateDataset, INTERVAL_MS, SCHEMA, SOURCE_SIGNAL_COMMIT } from './contracts.mjs';
import { indicators, samplesFor, chronologicalSplit, fitModel, predictModel, candidateConfigs } from './model.mjs';

/** Moving-block resampling, seeded and deterministic. Dependence is not mistaken for extra independent trials. */
export function blockMeanInterval(values, { blockLength = 5, confidence = 0.95, draws = 1000 } = {}) {
  check(Array.isArray(values) && values.length >= 2 && values.every(Number.isFinite), 'invalid_returns');
  integer(draws, 'bootstrap_draws', 200, 10000); number(confidence, 'confidence', 0.9, 0.999);
  integer(blockLength, 'block_length', 1, values.length);
  let seed = 19470711;
  const random = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return (seed >>> 0) / 4294967296; };
  const means = [];
  for (let b = 0; b < draws; b++) {
    let sum = 0, count = 0;
    while (count < values.length) {
      const start = Math.floor(random() * values.length);
      for (let j = 0; j < blockLength && count < values.length; j++, count++) sum += values[(start + j) % values.length];
    }
    means.push(sum / count);
  }
  means.sort((a, b) => a - b);
  const alpha = (1 - confidence) / 2;
  return { mean: mean(values), lower: means[Math.floor(alpha * draws)],
    upper: means[Math.min(draws - 1, Math.ceil((1 - alpha) * draws) - 1)], blockLength,
    independentBlockEstimate: Math.floor(values.length / blockLength), draws, confidence };
}

/** Long-only next-open entry and close-at-horizon exit. Costs affect cash/equity, not just trade labels. */
export function backtest(samples, model, { costs = {}, exposure = 0.25, applyCalibrator } = {}) {
  const c = costModel(costs); number(exposure, 'exposure', 0, 1);
  const trades = [], curve = [], excess = [], predicted = []; let equity = 1, peak = 1, maxDrawdown = 0, occupiedUntil = -1;
  let benchmark = 1, lastTime = -1;
  for (const s of samples) {
    check(s.time > lastTime && s.entryTime > s.time && s.exitTime >= s.entryTime, 'noncausal_backtest'); lastTime = s.time;
    if (s.entryTime <= occupiedUntil) continue;
    const forecast = predictModel(model, s.x, applyCalibrator);
    const net = afterCosts(s.entry, s.exit, c);
    const active = forecast.probability >= (model.config.probabilityThreshold ?? 0.55) && forecast.expectedGrossReturn > model.roundTripCost;
    const r = active ? exposure * net : 0;
    equity *= 1 + r; benchmark *= 1 + exposure * net;
    peak = Math.max(peak, equity); maxDrawdown = Math.max(maxDrawdown, 1 - equity / peak);
    excess.push(r - exposure * net);
    predicted.push({ time: s.time, probability: forecast.probability, outcome: Number(net > 0), return: r });
    if (active) trades.push({ signalAt: s.time, entryAt: s.entryTime, exitAt: s.exitTime,
      entryPrice: s.entry, exitPrice: s.exit, exposure, grossReturn: s.grossReturn, netReturn: net, equityReturn: r });
    curve.push({ at: s.exitTime, equity, benchmark, return: r }); occupiedUntil = s.exitTime;
  }
  const rs = curve.map(p => p.return), sd = Math.sqrt(variance(rs));
  const durationDays = curve.length ? (curve.at(-1).at - samples[0].time) / 86400000 : 0;
  const periods = durationDays > 0 ? curve.length * 365 / durationDays : 0;
  const wins = trades.filter(t => t.netReturn > 0), losses = trades.filter(t => t.netReturn < 0);
  const loss = -losses.reduce((sum, t) => sum + t.netReturn, 0);
  const brier = predicted.length ? mean(predicted.map(p => (p.probability - p.outcome) ** 2)) : null;
  const constantBrier = predicted.length ? mean(predicted.map(p => (model.positiveClassRate - p.outcome) ** 2)) : null;
  return { trades, curve, excess, metrics: { observations: rs.length, tradeCount: trades.length,
    durationDays, totalReturn: equity - 1, benchmarkReturn: benchmark - 1,
    excessReturn: equity - benchmark, maxDrawdown,
    annualizedSharpe: sd > 0 ? mean(rs) / sd * Math.sqrt(periods) : null,
    profitFactor: loss > 0 ? wins.reduce((s, t) => s + t.netReturn, 0) / loss : null,
    winRate: trades.length ? wins.length / trades.length : null, brier, constantBrier } };
}

/** Gate rules are fixed before looking at final outcomes. A failed winner stays failed. */
export function validationGates(result, stressed, { maxDrawdown = 0.15, minTrades = 30,
  minDays = 90, minBlocks = 20, blockLength = 5, maxBrier = 0.25 } = {}) {
  number(maxDrawdown, 'drawdown_limit', 0.001, 0.5); integer(minTrades, 'minimum_trades', 20, 10000);
  integer(minDays, 'minimum_days', 30, 3650); integer(minBlocks, 'minimum_blocks', 10, 1000);
  const interval = result.excess.length >= blockLength ? blockMeanInterval(result.excess, { blockLength }) : null;
  const m = result.metrics;
  const gates = {
    adequate_sample: m.tradeCount >= minTrades && m.durationDays >= minDays,
    effective_sample: Boolean(interval && interval.independentBlockEstimate >= minBlocks),
    positive_net_return: m.totalReturn > 0,
    beats_exposure_matched_benchmark: m.excessReturn > 0 && Boolean(interval && interval.lower > 0),
    drawdown_within_limit: m.maxDrawdown <= maxDrawdown,
    calibrated_forecast: m.brier !== null && m.brier <= maxBrier && m.brier <= m.constantBrier,
    doubled_cost_stress: stressed.metrics.totalReturn > 0 && stressed.metrics.maxDrawdown <= maxDrawdown,
  };
  return { passed: Object.values(gates).every(Boolean), gates, interval,
    blockers: Object.entries(gates).filter(([, v]) => !v).map(([k]) => k) };
}

/** Expanding-window retraining confined to the selection partition. Final test remains untouched. */
export function walkForwardSelection(train, selection, config, options) {
  check(selection.length >= 99, 'walk_forward_sample');
  const folds = [];
  for (let i = 0; i < 3; i++) {
    const start = Math.floor(selection.length * i / 3), end = Math.floor(selection.length * (i + 1) / 3);
    const test = selection.slice(start, end), cutoff = test[0].time - options.embargoMs;
    const fit = [...train, ...selection.slice(0, start)].filter(row => row.exitTime < cutoff);
    const model = fitModel(fit, { lambda: config.lambda, roundTripCost: options.roundTripCost, config });
    const run = backtest(test, model, options);
    folds.push({ trainingEnd: model.trainEnd, testStart: test[0].time, testEnd: test.at(-1).exitTime, metrics: run.metrics });
  }
  return folds;
}

/** Actual Signal calibrator is injected by the runtime adapter; no imitation or synthetic fallback. */
export function discoverStrategy(datasets, { now = Date.now(), expectedRelease,
  costs = {}, exposure = 0.25, configs = candidateConfigs(), gatePolicy = {}, signal } = {}) {
  check(signal?.fitBinaryIsotonicCalibrator && signal?.applyBinaryIsotonicCalibrator, 'signal_calibration_required');
  check(Array.isArray(datasets) && datasets.length >= 1 && datasets.length <= 8, 'dataset_limit');
  check(Array.isArray(configs) && configs.length >= 1 && configs.length <= 24, 'candidate_limit');
  const data = datasets.map(d => validateDataset(d, { now, minBars: 1200, expectedRelease }));
  check(new Set(data.map(d => `${d.symbol}:${d.interval}`)).size === data.length, 'duplicate_dataset');
  const c = costModel(costs), roundTripCost = -afterCosts(1, 1, c);
  // Compare timeframes on the same calendar bounds, not incomparable backtest lengths.
  const start = Math.max(...data.map(d => d.bars[200].closeTime));
  const end = Math.min(...data.map(d => d.bars.at(-1).closeTime));
  check(end > start, 'no_common_history');
  const bounds = [0, 0.45, 0.65, 0.85, 1].map(x => Math.floor(start + (end - start) * x)); bounds[4]++;
  const candidates = [], rejected = [];
  for (const d of data) for (const config of configs) {
    try {
      const featureRows = indicators(d.bars, config);
      const rows = samplesFor(d.bars, featureRows, config);
      const splits = chronologicalSplit(rows, { embargoMs: INTERVAL_MS[d.interval] * config.horizon, boundaries: bounds });
      check(splits.selection.length >= 100 && splits.calibration.length >= 200 && splits.test.length >= 100, 'insufficient_independent_splits');
      const model = fitModel(splits.train, { lambda: config.lambda, roundTripCost, config });
      const selection = backtest(splits.selection, model, { costs: c, exposure });
      const walkForward = walkForwardSelection(splits.train, splits.selection, config, { costs: c, exposure, roundTripCost, embargoMs: INTERVAL_MS[d.interval] * config.horizon });
      const score = mean(walkForward.map(fold => fold.metrics.totalReturn - 2 * fold.metrics.maxDrawdown));
      candidates.push({ symbol: d.symbol, interval: d.interval, dataHash: d.dataHash, model, splits, selection, walkForward, score });
    } catch (error) { rejected.push({ symbol: d.symbol, interval: d.interval, configId: config.id, reason: error.code || error.message }); }
  }
  check(candidates.length, 'no_trainable_candidates', rejected);
  candidates.sort((a, b) => b.score - a.score || a.model.config.id.localeCompare(b.model.config.id));
  const winner = candidates[0];
  winner.model = fitModel([...winner.splits.train, ...winner.splits.selection], { lambda: winner.model.lambda, roundTripCost, config: winner.model.config });
  const calibration = winner.splits.calibration.map(s => ({ id: `${winner.symbol}:${winner.interval}:${s.id}`,
    rawProbability: predictModel(winner.model, s.x).rawProbability,
    observedOutcome: Number(afterCosts(s.entry, s.exit, c) > 0) }));
  // Freeze before final-test evaluation; never try runner-up models after test failure.
  winner.model.calibrator = signal.fitBinaryIsotonicCalibrator(calibration, {
    modelVersion: winner.model.modelHash, calibrationDatasetVersion: winner.dataHash, split: 'calibration_only' });
  const frozenHash = fingerprint(winner.model);
  const final = backtest(winner.splits.test, winner.model, { costs: c, exposure, applyCalibrator: signal.applyBinaryIsotonicCalibrator });
  const stress = backtest(winner.splits.test, winner.model, { costs: Object.fromEntries(Object.entries(c).map(([k, v]) => [k, v * 2])), exposure,
    applyCalibrator: signal.applyBinaryIsotonicCalibrator });
  const validation = validationGates(final, stress, gatePolicy);
  validation.gates.walk_forward_stability = winner.walkForward.filter(f => f.metrics.totalReturn > 0).length >= 2 && winner.walkForward.every(f => f.metrics.maxDrawdown <= (gatePolicy.maxDrawdown ?? 0.15));
  validation.blockers = Object.entries(validation.gates).filter(([, passed]) => !passed).map(([key]) => key);
  validation.passed = validation.blockers.length === 0;
  const result = { schemaVersion: SCHEMA, researchVersion: 'purged-ml-v1', signalSourceCommit: SOURCE_SIGNAL_COMMIT,
    createdAt: now, strategyHash: frozenHash, symbol: winner.symbol, interval: winner.interval, model: winner.model,
    dataHash: winner.dataHash, dataRelease: expectedRelease || null, costs: c, exposure, boundaries: bounds,
    selection: { selectedOn: 'selection_only', candidatesTested: candidates.length,
      comparisons: candidates.map(x => ({ symbol: x.symbol, interval: x.interval, configId: x.model.config.id, score: x.score })), rejected },
    partitions: Object.fromEntries(Object.entries(winner.splits).filter(([key]) => key !== 'boundaries').map(([key, rows]) =>
      [key, { count: rows.length, start: rows[0]?.time ?? null, end: rows.at(-1)?.exitTime ?? null }])),
    walkForward: winner.walkForward, validation, finalTest: final, costStress: stress.metrics,
    prospective: { passed: false, independentObservations: 0, reason: 'Prospective outcomes must be collected after strategy freezing.' },
    deploymentEligible: false, bestMeans: 'Best of the preregistered candidates on selection data; no global optimum or future return guarantee.' };
  return { ...result, reportHash: fingerprint(result) };
}
