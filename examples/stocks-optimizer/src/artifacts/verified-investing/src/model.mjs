import { check, integer, number, mean, variance, clamp, dot, fingerprint } from './contracts.mjs';

export const FEATURE_NAMES = Object.freeze(['return1', 'fastDistance', 'trendSpread', 'momentum20',
  'rsi14', 'macdHistogram', 'bollingerPosition', 'atr14', 'volatility20', 'relativeVolume', 'breakout20']);
export const FEATURE_SETS = Object.freeze({ trend: [0, 1, 2, 3, 7, 8],
  oscillator: [0, 4, 5, 6, 7, 8, 9], mixed: FEATURE_NAMES.map((_, i) => i) });

/** Causal indicators, computed once per dataset/config. No centered windows or future bars. */
export function indicators(bars, { fast = 12, slow = 50 } = {}) {
  integer(fast, 'fast', 2, 60); integer(slow, 'slow', fast + 1, 200);
  const rows = []; let ema12, ema26, ema9 = 0, gain = 0, loss = 0, atr = 0;
  const closes = [], volumes = [], returns = [];
  for (let i = 0; i < bars.length; i++) {
    const b = bars[i], prev = bars[i - 1];
    number(b.close, 'close', Number.MIN_VALUE); number(b.volume, 'volume', 0, 1e20);
    const delta = prev ? b.close - prev.close : 0;
    gain = i ? gain * 13 / 14 + Math.max(delta, 0) / 14 : 0;
    loss = i ? loss * 13 / 14 + Math.max(-delta, 0) / 14 : 0;
    const tr = prev ? Math.max(b.high - b.low, Math.abs(b.high - prev.close), Math.abs(b.low - prev.close)) : b.high - b.low;
    atr = i ? atr * 13 / 14 + tr / 14 : tr;
    ema12 = i ? b.close * 2 / 13 + ema12 * 11 / 13 : b.close;
    ema26 = i ? b.close * 2 / 27 + ema26 * 25 / 27 : b.close;
    const macd = ema12 - ema26;
    ema9 = i ? macd * 0.2 + ema9 * 0.8 : macd;
    closes.push(b.close); volumes.push(b.volume); returns.push(prev ? b.close / prev.close - 1 : 0);
    if (i < Math.max(slow, 65)) { rows.push(null); continue; }
    const tail = (xs, n) => xs.slice(-n);
    const fastMean = mean(tail(closes, fast)), slowMean = mean(tail(closes, slow));
    const avg20 = mean(tail(closes, 20)), sd20 = Math.sqrt(variance(tail(closes, 20)));
    const rsi = loss === 0 ? gain === 0 ? 50 : 100 : 100 - 100 / (1 + gain / loss);
    const priorHigh = Math.max(...bars.slice(i - 20, i).map(x => x.high));
    const volumeMean = mean(tail(volumes, 20));
    rows.push([returns.at(-1), b.close / fastMean - 1, fastMean / slowMean - 1,
      b.close / closes[i - 20] - 1, (rsi - 50) / 50, (macd - ema9) / b.close,
      sd20 > 0 ? clamp((b.close - avg20) / (2 * sd20), -5, 5) : 0, atr / b.close,
      Math.sqrt(variance(tail(returns, 20))), volumeMean > 0 ? Math.log1p(b.volume / volumeMean) - Math.log(2) : 0,
      b.close / priorHigh - 1]);
  }
  return rows;
}

export function samplesFor(bars, features, { horizon = 1, featureSet = 'mixed' } = {}) {
  integer(horizon, 'horizon', 1, 20); check(FEATURE_SETS[featureSet], 'unknown_feature_set');
  return features.flatMap((row, i) => {
    if (!row || i + horizon >= bars.length) return [];
    const entry = bars[i + 1], exit = bars[i + horizon];
    return [{ id: String(bars[i].closeTime), index: i, time: bars[i].closeTime,
      entryTime: entry.timestamp, exitTime: exit.closeTime, entry: entry.open, exit: exit.close,
      grossReturn: exit.close / entry.open - 1, x: FEATURE_SETS[featureSet].map(j => row[j]) }];
  });
}

/** Four chronological partitions; label end must precede the next partition, with embargo. */
export function chronologicalSplit(samples, { embargoMs = 0, boundaries } = {}) {
  check(samples.length >= 30, 'insufficient_samples');
  integer(embargoMs, 'embargo', 0, 365 * 86400000);
  const all = samples.map(s => s.time);
  check(all.every((t, i) => Number.isFinite(t) && (!i || t > all[i - 1])), 'non_chronological_samples');
  const bounds = boundaries ?? [all[0], all[Math.floor(all.length * 0.45)],
    all[Math.floor(all.length * 0.65)], all[Math.floor(all.length * 0.85)], samples.at(-1).exitTime + 1];
  check(bounds.length === 5 && bounds.every((t, i) => Number.isFinite(t) && (!i || t > bounds[i - 1])), 'invalid_split_boundaries');
  const result = { boundaries: [...bounds] };
  ['train', 'selection', 'calibration', 'test'].forEach((name, i) => {
    result[name] = samples.filter(s => s.time >= bounds[i] + (i ? embargoMs : 0) && s.exitTime < bounds[i + 1]);
  });
  return result;
}

function solve(matrix, rhs) {
  const n = rhs.length, a = matrix.map((row, i) => [...row, rhs[i]]);
  for (let i = 0; i < n; i++) {
    let pivot = i;
    for (let j = i + 1; j < n; j++) if (Math.abs(a[j][i]) > Math.abs(a[pivot][i])) pivot = j;
    check(Math.abs(a[pivot][i]) > 1e-14, 'singular_model');
    [a[i], a[pivot]] = [a[pivot], a[i]];
    const divisor = a[i][i]; for (let k = i; k <= n; k++) a[i][k] /= divisor;
    for (let j = 0; j < n; j++) if (j !== i) {
      const factor = a[j][i]; for (let k = i; k <= n; k++) a[j][k] -= factor * a[i][k];
    }
  }
  return a.map(row => row[n]);
}
const sigmoid = value => 1 / (1 + Math.exp(-clamp(value, -35, 35)));
export function fitModel(training, { lambda = 1, roundTripCost = 0, config = {} } = {}) {
  number(lambda, 'lambda', 0.0001, 1000); number(roundTripCost, 'round_trip_cost', 0, 0.5);
  check(training.length >= 100 && training.length <= 10000, 'training_sample_too_small');
  const d = training[0].x.length;
  check(d >= 1 && d <= 30 && training.every(row => row.x.length === d && row.x.every(Number.isFinite) && Number.isFinite(row.grossReturn)), 'invalid_training_features');
  const centers = Array.from({ length: d }, (_, j) => mean(training.map(s => s.x[j])));
  const scales = centers.map((_, j) => Math.max(1e-8, Math.sqrt(variance(training.map(s => s.x[j])))));
  const X = training.map(s => [1, ...s.x.map((v, j) => clamp((v - centers[j]) / scales[j], -10, 10))]);
  const y = training.map(s => s.grossReturn), labels = y.map(v => v > roundTripCost ? 1 : 0);
  const positive = labels.reduce((a, b) => a + b, 0);
  check(positive >= 20 && training.length - positive >= 20, 'training_class_imbalance');
  const A = Array.from({ length: d + 1 }, () => Array(d + 1).fill(0)), b = Array(d + 1).fill(0);
  for (let i = 0; i < X.length; i++) for (let j = 0; j <= d; j++) {
    b[j] += X[i][j] * y[i]; for (let k = 0; k <= d; k++) A[j][k] += X[i][j] * X[i][k];
  }
  for (let j = 1; j <= d; j++) A[j][j] += lambda;
  const ridge = solve(A, b);
  // Regularized logistic regression with a deterministic, bounded Newton iteration.
  let logistic = Array(d + 1).fill(0); logistic[0] = Math.log(positive / (training.length - positive));
  let converged = false, iterations = 0;
  for (; iterations < 80; iterations++) {
    const H = Array.from({ length: d + 1 }, () => Array(d + 1).fill(0)), g = Array(d + 1).fill(0);
    X.forEach((x, i) => {
      const p = sigmoid(dot(x, logistic)), weight = Math.max(1e-8, p * (1 - p));
      for (let j = 0; j <= d; j++) { g[j] += x[j] * (p - labels[i]);
        for (let k = 0; k <= d; k++) H[j][k] += weight * x[j] * x[k]; }
    });
    for (let j = 0; j <= d; j++) { H[j][j] += j ? lambda : 1e-6; if (j) g[j] += lambda * logistic[j]; }
    const delta = solve(H, g); const scale = Math.min(1, 5 / Math.max(...delta.map(Math.abs), 1e-9));
    logistic = logistic.map((v, i) => v - scale * delta[i]);
    if (Math.max(...delta.map(Math.abs)) < 1e-7) { converged = true; break; }
  }
  check(converged, 'logistic_did_not_converge');
  const residuals = X.map((x, i) => y[i] - dot(x, ridge));
  const result = { method: 'ridge_return_logistic_direction.v1', config, lambda, roundTripCost,
    centers, scales, ridge, logistic, residualStd: Math.sqrt(variance(residuals)),
    nTrain: training.length, trainStart: training[0].time, trainEnd: Math.max(...training.map(s => s.exitTime)),
    positiveClassRate: positive / training.length, iterations, converged, calibrator: null };
  return { ...result, modelHash: fingerprint(result) };
}
export function predictModel(model, features, applyCalibrator) {
  check(Array.isArray(features) && features.length === model.centers.length && features.every(Number.isFinite), 'invalid_prediction_features');
  const x = [1, ...features.map((v, j) => clamp((v - model.centers[j]) / model.scales[j], -10, 10))];
  const grossReturn = clamp(dot(x, model.ridge), -0.25, 0.25);
  const rawProbability = sigmoid(dot(x, model.logistic));
  const probability = model.calibrator ? applyCalibrator(model.calibrator, rawProbability) : rawProbability;
  number(probability, 'probability', 0, 1);
  return { expectedGrossReturn: grossReturn, rawProbability, probability,
    predictionStd: model.residualStd, probabilityEvidence: model.calibrator ? 'calibrated_estimate' : 'uncalibrated_estimate' };
}

export function candidateConfigs() {
  // Bounded, preregistered grid. "Best" always means best among these tested candidates.
  return [8, 16].flatMap(fast => ['trend', 'oscillator', 'mixed'].flatMap(featureSet =>
    [1, 10].map(lambda => ({ id: `ml-${featureSet}-f${fast}-l${lambda}`, fast, slow: 50,
      featureSet, lambda, horizon: 1, probabilityThreshold: 0.55 }))));
}
