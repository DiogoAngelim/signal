/**
 * Preregistered confirmatory *shadow* policy evaluation on the full women's
 * RANDOM Open Bandit policy. Never uses customer/production databases or keys.
 *
 * Preregistration: docs/case-studies/confirmatory-full-open-bandit-prereg-2026-11-14.md
 * Source: ZOZO / https://huggingface.co/datasets/zozonext/open-bandit
 * CC BY 4.0. Read the preregistration before interpreting any estimates.
 *
 * node scripts/validation/full-open-bandit-confirmatory.mjs --self-test
 * node scripts/validation/full-open-bandit-confirmatory.mjs
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { appendFile, mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { Transform, Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import signalDecision from "../../packages/decision/dist/index.js";

const { evaluateDecision, evaluateBinaryForecasts } = signalDecision;
assert.equal(typeof evaluateDecision, "function");
assert.equal(typeof evaluateBinaryForecasts, "function");
const SOURCE = "ZOZO Open Bandit full women random-policy campaign";
const REVISION = "57a688e";
const DATA_PATH = "random/women/women.csv";
const METADATA_URL = "https://huggingface.co/api/datasets/zozonext/open-bandit/tree/" +
  REVISION + "/random/women?expand=true";
const DATA_URL = "https://huggingface.co/datasets/zozonext/open-bandit/resolve/" +
  REVISION + "/" + DATA_PATH;
const TRAIN_END = Date.parse("2019-11-28T00:00:00Z");
const CAL_END = Date.parse("2019-11-29T00:00:00Z");
const END = Date.parse("2019-12-01T00:00:00Z");
const START = Date.parse("2019-11-24T00:00:00Z");
const EPSILON = 0.2;
const PSEUDO_N = 150;
const AFFINITY_CLICK = 0.0005;
const BOOT_REPS = 2000;
const BOOT_SEED = 20261114;
const DATASET_VERSION = "zozonext/open-bandit@" + REVISION + "/" + DATA_PATH;
const OUT = "artifacts/validation/full-open-bandit-confirmatory-report.json";
const clamp = (x, low, high) => Math.max(low, Math.min(high, x));

function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(1664525, s) + 1013904223) >>> 0) / 4294967296);
}
function pct(sorted, q) {
  const pos = (sorted.length - 1) * q;
  const left = Math.floor(pos), right = Math.ceil(pos);
  return sorted[left] + (sorted[right] - sorted[left]) * (pos - left);
}
function ci(values) {
  const sorted = values.slice().sort((a, b) => a - b);
  return [pct(sorted, .025), pct(sorted, .975)];
}
function parseTimestamp(value) {
  const iso = value.includes("T") ? value : value.replace(" ", "T");
  const timestamp = Date.parse(iso.endsWith("Z") ? iso : iso + "Z");
  assert(Number.isFinite(timestamp) && timestamp >= START && timestamp < END,
    "out-of-range or invalid timestamp (source timestamp only): " + JSON.stringify(value) +
      " parsedUTC=" + (Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : "invalid"));
  return timestamp;
}
function phase(timestamp) {
  return timestamp < TRAIN_END ? "train" : timestamp < CAL_END ? "calibration" : "test";
}
function parseHeader(line) {
  const header = line.replace(/^\uFEFF/, "").split(",");
  const indices = new Map(header.map((name, i) => [name, i]));
  for (const key of ["timestamp", "item_id", "position", "click", "propensity_score"]) {
    assert(indices.has(key), "missing source field: " + key);
  }
  const aff = header.filter(k => /^user-item_affinity_[0-9]+$/.test(k))
    .sort((a, b) => Number(a.slice(19)) - Number(b.slice(19)));
  assert(aff.length >= 40 && aff.length <= 50, "unexpected women's campaign arm count");
  for (let i = 0; i < aff.length; i++) {
    assert.equal(aff[i], "user-item_affinity_" + i, "missing affinity action index");
  }
  return { header, indices, affIndices: aff.map(k => indices.get(k)), K: aff.length };
}
function fields(line, schema) {
  const csv = line.split(",");
  assert.equal(csv.length, schema.header.length, "bad source CSV record width");
  const v = name => csv[schema.indices.get(name)];
  const timestamp = parseTimestamp(v("timestamp"));
  const position = Number(v("position"));
  const action = Number(v("item_id"));
  const propensity = Number(v("propensity_score"));
  assert(Number.isInteger(position) && position >= 1 && position <= 3);
  assert(Number.isInteger(action) && action >= 0 && action < schema.K);
  assert(Number.isFinite(propensity) &&
    Math.abs(propensity - 1 / schema.K) < 1e-8,
    "non-random logging propensity or arm mismatch");
  return { csv, timestamp, position, action, propensity };
}
function reward(row, schema) {
  const y = Number(row.csv[schema.indices.get("click")]);
  assert(y === 0 || y === 1, "invalid observed click");
  return y;
}
function rawProbability(row, model, action) {
  const affinity = Number(row.csv[model.schema.affIndices[action]]);
  assert(Number.isFinite(affinity) && affinity >= 0, "bad affinity");
  return clamp(model.rate[row.position - 1][action] +
    AFFINITY_CLICK * Math.min(4, affinity), 0.000001, 0.5);
}
function chooseCandidate(row, model) {
  let bestAction = -1, score = -Infinity;
  for (let a = 0; a < model.schema.K; a++) {
    const candidate = rawProbability(row, model, a);
    if (candidate > score) {
      bestAction = a;
      score = candidate;
    }
  }
  return { action: bestAction, forecast: clamp(score * model.calibrationFactor, 0.000001, 0.5) };
}
async function* sourceRows(file) {
  const lines = createInterface({ input: createReadStream(file), crlfDelay: Infinity });
  let schema, rowCount = 0;
  for await (const line of lines) {
    if (!schema) {
      schema = parseHeader(line);
      yield { headerOnly: true, schema };
    } else {
      assert(line.length, "unexpected blank source row");
      rowCount++;
      yield { schema, row: fields(line, schema), rowCount };
    }
  }
  assert(schema && rowCount > 100000, "source is too small for full-sample evaluation");
}
async function getPinnedMetadata() {
  const res = await fetch(METADATA_URL, { signal: AbortSignal.timeout(90000) });
  assert(res.ok, "metadata request failed HTTP " + res.status);
  const entries = await res.json();
  assert(Array.isArray(entries), "unexpected pinned metadata shape");
  const entry = entries.find(x => x.path === DATA_PATH);
  assert(entry && entry.type === "file", "pinned women's data file unavailable");
  const sha256 = entry.lfs?.oid || entry.lfs?.sha256;
  assert(/^[0-9a-f]{64}$/i.test(sha256 || ""),
    "no verifiable Git LFS SHA-256 in the frozen dataset revision");
  assert(Number.isSafeInteger(entry.size) && entry.size > 20000000 &&
    entry.size < 1500000000, "unexpected published source size");
  return { sha256: sha256.toLowerCase(), sizeBytes: entry.size };
}
async function downloadPinnedSource(filepath, metadata) {
  const res = await fetch(DATA_URL, { signal: AbortSignal.timeout(1200000) });
  assert(res.ok && res.body, "full source download failed HTTP " + res.status);
  const hash = createHash("sha256");
  let bytes = 0;
  await pipeline(
    Readable.fromWeb(res.body),
    new Transform({ transform(chunk, encoding, cb) {
      bytes += chunk.length;
      hash.update(chunk);
      cb(null, chunk);
    }}),
    createWriteStream(filepath, { flags: "wx" })
  );
  const actual = hash.digest("hex");
  assert.equal(bytes, metadata.sizeBytes, "pinned full-source length mismatch");
  assert.equal(actual, metadata.sha256, "pinned Git LFS checksum mismatch");
  return { sha256: actual, bytes };
}
async function fitTraining(filepath) {
  let schema, n = 0, positives = 0;
  let counts, unique = new Set(), phaseCounts = { train: 0, calibration: 0, test: 0 };
  let firstTs = Infinity, lastTs = -Infinity;
  for await (const record of sourceRows(filepath)) {
    if (record.headerOnly) {
      schema = record.schema;
      counts = Array.from({length: 3}, () =>
        Array.from({length: schema.K}, () => ({n: 0, clicks: 0})));
      continue;
    }
    const r = record.row;
    const rawId = r.csv[0];
    assert(/^[0-9]+$/.test(rawId), "missing source row ID");
    const id = Number(rawId);
    assert(Number.isSafeInteger(id) && !unique.has(id), "duplicate/bad source row ID");
    unique.add(id);
    n++;
    phaseCounts[phase(r.timestamp)]++;
    firstTs = Math.min(firstTs, r.timestamp);
    lastTs = Math.max(lastTs, r.timestamp);
    // Do not read or compute calibration/test outcome before parameters are frozen.
    if (r.timestamp >= TRAIN_END) continue;
    const y = reward(r, schema);
    positives += y;
    const bucket = counts[r.position - 1][r.action];
    bucket.n++;
    bucket.clicks += y;
  }
  assert(phaseCounts.train > 100000 && phaseCounts.calibration > 20000 &&
    phaseCounts.test >= 100000, "insufficient phase coverage");
  assert(positives > 0, "training has no clicks");
  const trainingCtr = positives / phaseCounts.train;
  const rate = counts.map(pos => pos.map(group =>
    (group.clicks + PSEUDO_N * trainingCtr) / (group.n + PSEUDO_N)));
  return { schema, n, uniqueIds: unique.size, phaseCounts, firstTs, lastTs,
    trainingClicks: positives, globalCtr: trainingCtr, rate, calibrationFactor: 1 };
}
async function calibrateOnly(filepath, model) {
  let count = 0, clicks = 0, forecastSum = 0;
  for await (const record of sourceRows(filepath)) {
    if (record.headerOnly) continue;
    const r = record.row;
    if (phase(r.timestamp) !== "calibration") continue;
    count++;
    clicks += reward(r, model.schema);
    forecastSum += rawProbability(r, model, r.action);
  }
  assert(count === model.phaseCounts.calibration && clicks > 0 &&
    forecastSum > 0, "bad calibration sample");
  model.calibrationFactor = clamp(clicks / forecastSum, 0.25, 4);
  return { count, clicks, rawExpectedClicks: forecastSum, factor: model.calibrationFactor,
    method: "single-scale in-the-large on one pre-test day; NOT group calibration" };
}

// Copied unchanged from the actual preceding native-gate adapter.
// Its context is fed a validation-day calibrated *probability*, while the
// legacy 0-100 score remains explicitly ordinal and is NOT a probability.
function signalDecisionForCandidate(row, candidate, model, withEvidence) {
  // This conversion is a precommitted, explicitly *ordinal* domain adapter.
  // The 0–100 score is NOT a calibrated click probability.
  const score = clamp(
    65 + 20 * Math.log(Math.max(candidate.forecast, 1e-9) / model.globalCtr),
    25, 95
  );
  const modules = Object.fromEntries([
    "discovery", "judgment", "purpose", "need", "trust", "reflection", "recovery",
    "memory", "learning", "calibration", "identity", "awareness", "agency",
  ].map(name => [name, Math.round(score)]));

  const context = {
    decisionId: "obd-signal-policy:" + row.id + ":" + Number(withEvidence),
    source: SOURCE,
    createdAt: new Date(row.timestamp).toISOString(),
    observation: {
      proposedItem: candidate.action, position: row.position,
      trainingOnlyScore: candidate.forecast,
      // Deliberately no outcome, outcome-derived field or logged action.
    },
    modules,
    prediction: {
      currentScore: score,
      expectedReward: score, expectedRisk: 100 - score,
      uncertainty: 100 - score, purposeAlignment: score,
      needAlignment: score, confidence: score,
    },
    wisdom: {
      expectedReward: score, downsideRisk: 100 - score,
      irreversibleRisk: 30, survivalPriority: 80,
      longTermAlignment: score, shortTermTemptation: score,
      uncertainty: 100 - score, confidence: score,
    },
    action: { proposedItem: candidate.action, operation: "show-recommendation" },
  };
  if (withEvidence) {
    context.assessment = {
      decisionId: context.decisionId,
      createdAt: context.createdAt,
      desiredConfidence: 65,
      known: ["Candidate propensity is based exclusively on the training period."],
      unknowns: [
        "The example sample may not represent actual application traffic.",
        "Forecasts and historical source signals are not independently calibrated.",
      ],
      evidence: [{
        evidenceId: "training-click-evidence",
        label: "Published randomized training click labels",
        direction: "supporting",
        sourceRef: { sourceId: "ZOZO-OBD-public-sample", sourceType: "database" },
        eventAt: "2019-11-28T23:59:59Z",
        observedAt: "2019-11-28T23:59:59Z",
        recordedAt: "2019-11-28T23:59:59Z",
        reliability: 65,
        quality: 65,
        independence: 40,
        replication: 20,
        calibration: 20,
        traceability: 75,
      }],
    };
  }
  return evaluateDecision(context);
}

function normalizeGate(result) {
  const scale = result.actionAllowed ? clamp(result.actionScale, 0, 1) : 0;
  assert(Number.isFinite(scale), "invalid Signal actionScale");
  return { scale, allowed: result.actionAllowed,
    wisdom: result.wisdomDecision, simulation: result.simulationRecommendation,
    coherence: result.coherenceStatus };
}


function makeNativeRow(r, model, i) {
  // No outcome, logged action or source user feature enters the decision gate.
  const affinities = []; // unused by native adapter: ranker already computed.
  return { id: i, timestamp: r.timestamp, position: r.position, affinities };
}
function emptyHour(hour) {
  return {hour, n: 0, clicks: 0, signalWeighted: 0, featureWeighted: 0,
    signalMinusFeature: 0, signalMinusRandom: 0, brierGain: 0, signalEpsilon: 0,
    meanWSignal: 0, meanWFeature: 0};
}
function addPolicy(stats, w, click) {
  stats.weightSum += w;
  stats.weightSquareSum += w * w;
  stats.weightedClicks += w * click;
  stats.maxWeight = Math.max(stats.maxWeight, w);
}
function createPolicyStats() {
  return {weightSum: 0, weightSquareSum: 0, weightedClicks: 0, maxWeight: 0};
}
function policySummary(stats, n) {
  return { ips: stats.weightedClicks / n,
    snips: stats.weightedClicks / stats.weightSum,
    effectiveSampleSize: stats.weightSum ** 2 / stats.weightSquareSum,
    maxWeight: stats.maxWeight,
    meanWeight: stats.weightSum / n };
}
function bootstrap(hours) {
  const groups = [...hours.values()].sort((a, b) => a.hour.localeCompare(b.hour));
  assert(groups.length >= 24, "too few independent calendar-hour groups");
  const random = rng(BOOT_SEED), differences = [], brierGains = [], versusRandom = [];
  for (let iteration = 0; iteration < BOOT_REPS; iteration++) {
    let n = 0, diff = 0, forecastGain = 0, relativeRandom = 0;
    for (let j = 0; j < groups.length; j++) {
      const g = groups[Math.floor(random() * groups.length)];
      n += g.n;
      diff += g.signalMinusFeature;
      forecastGain += g.brierGain;
      relativeRandom += g.signalMinusRandom;
    }
    differences.push(diff / n);
    brierGains.push(forecastGain / n);
    versusRandom.push(relativeRandom / n);
  }
  return { method: "paired cluster bootstrap of UTC-hour blocks; NOT user-clustered",
    count: groups.length, seed: BOOT_SEED, replicates: BOOT_REPS,
    signalMinusFeatureCI95: ci(differences),
    signalMinusRandomCI95: ci(versusRandom),
    brierImprovementCI95: ci(brierGains) };
}
async function evaluateTest(filepath, model) {
  const hours = new Map(), days = new Map(), positions = new Map();
  const methods = {random: createPolicyStats(),
    featureOnly: createPolicyStats(), signalGoverned: createPolicyStats()};
  const forecastRecords = [];
  let n = 0, clicks = 0, allowed = 0, scaleSum = 0, nonzeroProposals = 0;
  let brierModel = 0, brierBaseline = 0, logModel = 0, logBaseline = 0, sumCalibProb = 0;
  const eceBounds = [0,.5,.75,1,1.25,1.5,2,3,5,10,Infinity];
  const reliability = Array.from({length: 10}, () => ({n: 0, probabilitySum: 0, clicks: 0}));
  for await (const record of sourceRows(filepath)) {
    if (record.headerOnly) continue;
    const r = record.row;
    if (r.timestamp < CAL_END) continue;
    const click = reward(r, model.schema);
    const candidate = chooseCandidate(r, model);
    const nativeRow = makeNativeRow(r, model, record.rowCount);
    const normalized = normalizeGate(
      signalDecisionForCandidate(nativeRow, candidate, model, true));
    assert(!normalized.allowed || normalized.scale > 0,
      "Signal must fail closed on zero-scale permission");
    assert(normalized.scale >= 0 && normalized.scale <= 1);
    if (normalized.allowed) allowed++;
    if (normalized.scale > 0) nonzeroProposals++;
    const fraction = normalized.scale * EPSILON;
    scaleSum += normalized.scale;
    const matched = r.action === candidate.action ? 1 : 0;
    const wFeature = (1 - EPSILON) + EPSILON * model.schema.K * matched;
    const wSignal = (1 - fraction) + fraction * model.schema.K * matched;
    addPolicy(methods.random, 1, click);
    addPolicy(methods.featureOnly, wFeature, click);
    addPolicy(methods.signalGoverned, wSignal, click);
    const probLogged = clamp(
      rawProbability(r, model, r.action) * model.calibrationFactor, 0.000001, 0.5);
    const baseline = model.globalCtr;
    forecastRecords.push({ id: String(record.rowCount),
      probability: probLogged, outcome: click });
    const gain = (click - baseline) ** 2 - (click - probLogged) ** 2;
    brierBaseline += (click - baseline) ** 2;
    brierModel += (click - probLogged) ** 2;
    logModel += -(click * Math.log(probLogged) +
      (1 - click) * Math.log1p(-probLogged));
    logBaseline += -(click * Math.log(baseline) +
      (1 - click) * Math.log1p(-baseline));
    sumCalibProb += probLogged;
    const ratio = probLogged / baseline;
    const idx = eceBounds.findIndex((v, i) =>
      i < eceBounds.length - 1 && ratio >= v && ratio < eceBounds[i+1]);
    assert(idx >= 0, "calibration bin not found");
    const bin = reliability[idx];
    bin.n++; bin.probabilitySum += probLogged; bin.clicks += click;
    const hour = new Date(r.timestamp).toISOString().slice(0, 13);
    const g = hours.get(hour) || emptyHour(hour);
    g.n++; g.clicks += click;
    g.signalWeighted += click * wSignal;
    g.featureWeighted += click * wFeature;
    g.signalMinusFeature += click * (wSignal - wFeature);
    g.signalMinusRandom += click * (wSignal - 1);
    g.brierGain += gain;
    g.signalEpsilon += fraction;
    g.meanWSignal += wSignal; g.meanWFeature += wFeature;
    hours.set(hour, g);
    const day = hour.slice(0, 10);
    const d = days.get(day) || {n: 0, clicks: 0};
    d.n++; d.clicks += click; days.set(day, d);
    const pos = positions.get(r.position) || {n: 0, clicks: 0};
    pos.n++; pos.clicks += click; positions.set(r.position, pos);
    n++; clicks += click;
  }
  assert.equal(n, model.phaseCounts.test, "test window count mismatch");
  assert(n >= 100000, "insufficient confirmatory test count");
  const summaries = Object.fromEntries(Object.entries(methods)
    .map(([key, stats]) => [key, policySummary(stats, n)]));
  const clustered = bootstrap(hours);
  const signalMinusFeature = summaries.signalGoverned.ips - summaries.featureOnly.ips;
  const signalMinusRandom = summaries.signalGoverned.ips - summaries.random.ips;
  const brierImprovement = (brierBaseline - brierModel) / n;
  const officialForecast = evaluateBinaryForecasts({
    datasetVersion: DATASET_VERSION, modelVersion: "train-4d-calibrate-1d-k150-v1",
    eventDefinition: "An impression's logged item was clicked within the recorded observation",
    samplingFrame: "Entire public full-size women RANDOM sample; historical and not customer-representative",
    split: "temporal_holdout", independentLabels: false,
    precommittedBaselineProbability: model.globalCtr, bucketCount: 10,
    records: forecastRecords
  });
  const ece = reliability.reduce((total, bin) => total +
    (bin.n ? bin.n / n * Math.abs(bin.probabilitySum/bin.n - bin.clicks/bin.n) : 0), 0);
  const scenarios = [];
  const meanEps = EPSILON * scaleSum / n;
  for (const clickValue of [1, 5, 20]) {
    for (const exploitCost of [0, 0.001, 0.01]) {
      const governed = clickValue * summaries.signalGoverned.ips - exploitCost * meanEps;
      const feature = clickValue * summaries.featureOnly.ips - exploitCost * EPSILON;
      scenarios.push({ clickValueIllustrativeUnits: clickValue,
        perExploitImpressionCostIllustrativeUnits: exploitCost,
        signalUtilityPerImpression: governed, featureUtilityPerImpression: feature,
        governedMinusFeature: governed - feature });
    }
  }
  const pointDifference = signalMinusFeature;
  const essOkay = summaries.signalGoverned.effectiveSampleSize >= 0.1 * n;
  const primary = !essOkay ? "OVERLAP_TOO_WEAK" :
    clustered.signalMinusFeatureCI95[0] > 0 && allowed > 0 ?
      "POSITIVE_SHADOW_SAMPLE_ONLY" :
    clustered.signalMinusFeatureCI95[1] < 0 ? "NEGATIVE_SHADOW_SAMPLE_ONLY" : "INCONCLUSIVE";
  return {
    test: {n, clicks, observedCtr: clicks/n, days: Object.fromEntries(days),
      positions: Object.fromEntries(positions), hourlyGroups: hours.size},
    policy: {
      policies: {
        random: "uniform per item",
        featureOnly: "80% uniform + 20% ranker",
        signalGoverned: "80%-base random; 20%*gated scale ranker, genuine evaluateDecision"
      },
      summaries, primary: {
        comparison: "native governed minus feature-only",
        differenceIPS: pointDifference, differenceCI95HourBootstrap: clustered.signalMinusFeatureCI95,
        outcome: primary, overlapGateESS10Percent: essOkay
      },
      versusRandom: {differenceIPS: signalMinusRandom,
        differenceCI95HourBootstrap: clustered.signalMinusRandomCI95},
      governed: {allowedCount: allowed, nonzeroProposals,
        meanActionScale: scaleSum/n, meanEpsilon: meanEps, abstentionCount: n - allowed},
      hourBootstrap: clustered
    },
    forecast: {
      officialSignalMetrics: officialForecast,
      brier: brierModel/n, baselineBrier: brierBaseline/n,
      brierImprovement, brierImprovementCI95HourBootstrap: clustered.brierImprovementCI95,
      logLoss: logModel/n, baselineLogLoss: logBaseline/n,
      observedClickRate: clicks/n, predictedClickRate: sumCalibProb/n,
      descriptiveECECustomTenBins: ece, reliabilityBins: reliability.map((b, i) =>
        ({intervalOfTrainBaselineMultiple: [eceBounds[i], eceBounds[i+1] === Infinity ?
          "infinity" : eceBounds[i+1]],
        n: b.n, predicted: b.n ? b.probabilitySum/b.n : null,
        observed: b.n ? b.clicks/b.n : null})),
      brierSuperiorityGate: brierImprovement > 0 && clustered.brierImprovementCI95[0] > 0
    },
    utilitySensitivity: {
      formula: "value_per_click*IPS - exploitation_cost_per_selected_exploitation_allocation*mean_epsilon",
      currency: "UNVALIDATED SCENARIO UTILITY UNITS, NOT USD OR REAL PROFIT",
      scenarios
    }
  };
}
async function selfTest() {
  const schema = parseHeader(["", "timestamp", "item_id", "position", "click",
    "propensity_score", ...Array.from({length: 47}, (_,i) =>
      "user-item_affinity_" + i)].join(","));
  const line = ["1", "2019-11-29 12:00:00", "5", "1", "0", String(1/47),
    ...Array.from({length: 47}, () => "0")].join(",");
  const row = fields(line, schema);
  const model = { schema, rate: Array.from({length: 3}, () =>
    Array.from({length: 47}, (_,i) => .004 + i * .00005)),
    globalCtr: .005, calibrationFactor: 1.1 };
  const chosen = chooseCandidate(row, model);
  assert.equal(chosen.action, 46, "ranker tie/score");
  const gate1 = normalizeGate(signalDecisionForCandidate(
    makeNativeRow(row,model,1),chosen,model,true));
  const gate2 = normalizeGate(signalDecisionForCandidate(
    makeNativeRow({...row, csv:line.replace(",0,0.021276",",1,0.021276").split(",")},model,1),
      chosen,model,true));
  assert.deepEqual(gate1, gate2, "held-out click must not affect decision");
  assert(!gate1.allowed || gate1.scale > 0, "zero-scale permission");
  const hour = new Map();
  for(let j = 0; j < 48; j++) {
    const g = emptyHour("test-" + j); g.n = 10; g.signalMinusFeature = 0.01;
    g.brierGain = 0.005; hour.set(g.hour,g);
  }
  const b = bootstrap(hour);
  assert(Math.abs(b.signalMinusFeatureCI95[0] - 0.001) < 1e-12);
  assert(parseTimestamp("2019-11-29 00:00:00") === CAL_END);
  console.log("SELF TEST PASS: fixed-input decision, independent label, zero-scale invariant, hourly CI");
}
async function main() {
  const temp = await mkdtemp(join(tmpdir(),"signal-women-"));
  try {
    const expected = await getPinnedMetadata();
    const file = join(temp, "women.csv");
    const observed = await downloadPinnedSource(file, expected);
    const actualStat = await stat(file);
    assert.equal(actualStat.size, observed.bytes);
    const model = await fitTraining(file);
    const calibration = await calibrateOnly(file, model);
    const experiment = await evaluateTest(file, model);
    const report = {
      study: "FROZEN_FULL_WOMEN_RANDOMIZED_SHADOW_CONFIRMATION",
      classification: "NO_CAUSAL_OR_BUSINESS_LIFT_CERTIFICATION",
      preregistration: "docs/case-studies/confirmatory-full-open-bandit-prereg-2026-11-14.md",
      data: {publisher: SOURCE, license: "CC BY 4.0",
        source: DATA_URL, metadata: METADATA_URL, gitRevision: REVISION,
        expectedSha256: expected.sha256, observedSha256: observed.sha256,
        bytes: observed.bytes, rows: model.n,
        sourcePeriod: [new Date(model.firstTs).toISOString(),
          new Date(model.lastTs).toISOString()], phases: model.phaseCounts,
        uniqueRowIDs: model.uniqueIds, arms: model.schema.K},
      training: {n: model.phaseCounts.train, clicks: model.trainingClicks,
        clickRate: model.globalCtr, trainingEndsExclusive:
          new Date(TRAIN_END).toISOString(),
        ranker: "training per-position/per-item CTR, 150 prior impressions; 0.0005 per historical affinity click, capped at 4"},
      calibration: {day: "2019-11-28", ...calibration},
      ...experiment,
      assumptions: [
        "Observed click feedback originates with ZOZO; external independent label audit unavailable.",
        "Per-position off-policy IPS assumes consistency, correctly logged propensities, positivity and no relevant unmeasured confounding of randomized choice.",
        "Joint-slate interference and repeated-user dependence are untested.",
        "UTC-hour resampling does not resolve within-hour user clustering or serial cross-hour dependence.",
        "The input dataset is historic fashion recommendation traffic and is not representative of Workbench or other Signal target domains.",
        "Signal is a decision gate on an external ranker, not the producer of item-level forecasts.",
        "Click reward is not conversion, profit, trust, well-being, safety or long-run economic benefit.",
        "Economic costs and values are invented scenario parameters; utility is conditional, not observed.",
        "No online Signal intervention, production deployment, customer outcome, or external side effect was conducted."
      ]
    };
    await mkdir("artifacts/validation", { recursive: true });
    await writeFile(OUT, JSON.stringify(report,null,2) + "\n");
    console.log("SOURCE VERIFIED:", observed.bytes, observed.sha256, "ARMS:", model.schema.K);
    console.log("SPLITS:", JSON.stringify(model.phaseCounts));
    console.log("GOVERNED ALLOWED:", experiment.policy.governed.allowedCount,
      "OF", experiment.test.n);
    for (const [key,v] of Object.entries(experiment.policy.summaries)) {
      console.log(key,"IPS",v.ips,"SNIPS",v.snips,"ESS",v.effectiveSampleSize);
    }
    console.log("PRIMARY DIFF",experiment.policy.primary.differenceIPS,
      "95% HOURLY",JSON.stringify(experiment.policy.primary.differenceCI95HourBootstrap),
      "VERDICT",experiment.policy.primary.outcome);
    console.log("FORECAST BRIER",experiment.forecast.brier,
      "BASELINE",experiment.forecast.baselineBrier,
      "BRIER SUPERIORITY",experiment.forecast.brierSuperiorityGate);
    console.log("NO CAUSAL OR BUSINESS LIFT CERTIFICATION");
    if (process.env.GITHUB_STEP_SUMMARY) {
      await appendFile(process.env.GITHUB_STEP_SUMMARY,
        "## Preregistered full-size women randomized shadow study\n\n" +
        "- Rows: " + model.n + "; final holdout: " + experiment.test.n + "\n" +
        "- Native allowed proposals: " + experiment.policy.governed.allowedCount + "\n" +
        "- Primary IPS contrast: " + experiment.policy.primary.differenceIPS + "\n" +
        "- Hour-bootstrap 95% descriptive interval: " +
          JSON.stringify(experiment.policy.primary.differenceCI95HourBootstrap) + "\n" +
        "- Verdict: " + experiment.policy.primary.outcome + "\n\n" +
        "**Not a production, causal, calibrated cross-domain, or monetary certification.**\n");
    }
  } finally {
    await rm(temp,{recursive:true,force:true});
  }
}
if (process.argv.includes("--self-test")) await selfTest();
else await main();
