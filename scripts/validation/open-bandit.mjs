/**
 * Evidence-bearing real-data validation of opt-in @signal/decision APIs.
 * Public ZOZO/OBP 10k-row examples; no credentials, customer data or production side effects.
 *
 * Run after: pnpm --filter @signal/decision build
 *   node scripts/validation/open-bandit.mjs
 *
 * Published paper: Saito et al., arXiv:2008.07146.
 * A sample and descriptive replay cannot establish production effectiveness.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, writeFile, appendFile } from "node:fs/promises";
import signalDecision from "../../packages/decision/dist/index.js";
const { evaluateBinaryForecasts, evaluateQuantitativeDecision, stressTestProbabilityCases } = signalDecision;

const UPSTREAM = "8cbd5fa4558b7ad2ba4781546d6604e4cc3e07c4";
const DATASET_VERSION = "zr-obp-10k-men/" + UPSTREAM;
const SOURCES = [
  { policy: "random", blob: "e99ba925c30ccd537a554ce8ea2104a005c6f49e" },
  { policy: "bts", blob: "fbd217ad69b08f6dc338c7e2180cd8da16fcf658" },
];
const CUTOFF = Date.parse("2019-11-29T00:00:00Z");
const ACTION_COUNT = 34;
const BOOTSTRAP_SEED = 20261113;
const BOOTSTRAP_ITERATIONS = 1200;

function randomGenerator(seed) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function percentile(sorted, q) {
  const x = (sorted.length - 1) * q;
  const lo = Math.floor(x);
  const hi = Math.ceil(x);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (x - lo);
}

function interval(values) {
  const sorted = values.slice().sort((a, b) => a - b);
  return [percentile(sorted, 0.025), percentile(sorted, 0.975)];
}

function countClick(rows) {
  return rows.reduce((sum, row) => sum + row.click, 0);
}

function clickRate(rows) {
  assert(rows.length > 0, "empty cohort");
  return countClick(rows) / rows.length;
}

async function downloadSample(source) {
  const url = "https://raw.githubusercontent.com/st-tech/zr-obp/" + UPSTREAM +
    "/obd/" + source.policy + "/men/men.csv";
  const response = await fetch(url, {
    headers: { Accept: "text/csv" },
    signal: AbortSignal.timeout(60000),
  });
  assert(response.ok, "source download failed: HTTP " + response.status);
  const bytes = Buffer.from(await response.arrayBuffer());
  assert(bytes.length < 8000000, "unexpected source size");
  const actualBlob = createHash("sha1")
    .update("blob " + bytes.length + "\0")
    .update(bytes)
    .digest("hex");
  assert.equal(actualBlob, source.blob, "pinned upstream blob integrity mismatch");
  const text = bytes.toString("utf8").trimEnd();
  const lines = text.split(/\r?\n/);
  const headers = lines[0].split(",");
  const required = ["timestamp", "item_id", "position", "click", "propensity_score"];
  for (const name of required) assert(headers.includes(name), "missing column " + name);
  const col = Object.fromEntries(headers.map((name, index) => [name, index]));
  assert.equal(lines.length - 1, 10000, "unexpected sample size");
  const ids = new Set();
  const rows = lines.slice(1).map((line) => {
    const v = line.split(",");
    assert.equal(v.length, headers.length, "unexpected csv column count");
    const rowId = Number(v[0]);
    const action = Number(v[col.item_id]);
    const position = Number(v[col.position]);
    const click = Number(v[col.click]);
    const pscore = Number(v[col.propensity_score]);
    const timestamp = Date.parse(v[col.timestamp].replace(" ", "T"));
    assert(Number.isSafeInteger(rowId) && !ids.has(rowId), "duplicate/invalid row ID");
    ids.add(rowId);
    assert(Number.isInteger(action) && action >= 0 && action < ACTION_COUNT, "action");
    assert([1, 2, 3].includes(position), "position");
    assert([0, 1].includes(click), "click");
    assert(Number.isFinite(pscore) && pscore > 0 && pscore <= 1, "pscore");
    assert(Number.isFinite(timestamp), "timestamp");
    assert(timestamp >= Date.parse("2019-11-24T00:00:00Z"), "source start");
    assert(timestamp < Date.parse("2019-12-01T00:00:00Z"), "source end");
    return { id: source.policy + ":" + rowId, policy: source.policy, action,
      position, click, pscore, timestamp, day: new Date(timestamp).toISOString().slice(0, 10) };
  });
  rows.sort((a, b) => a.timestamp - b.timestamp || a.id.localeCompare(b.id));
  if (source.policy === "random") {
    for (const row of rows) {
      assert(Math.abs(row.pscore - 1 / ACTION_COUNT) < 1e-9, "random policy propensity mismatch");
    }
  }
  return { url, expectedGitBlob: source.blob, n: rows.length, rows };
}

function evaluateForecastHoldout(all) {
  const train = all.filter((x) => x.timestamp < CUTOFF);
  const test = all.filter((x) => x.timestamp >= CUTOFF);
  assert(train.length > 1000 && test.length > 1000, "bad temporal split");
  const baseline = clickRate(train);
  const priorStrength = 100;
  const key = (r) => r.policy + "|" + r.position + "|" + r.action;
  const groups = new Map();
  for (const row of train) {
    const name = key(row);
    const g = groups.get(name) || { n: 0, positives: 0 };
    g.n += 1;
    g.positives += row.click;
    groups.set(name, g);
  }
  const records = test.map((row) => {
    const group = groups.get(key(row)) || { n: 0, positives: 0 };
    const probability = (group.positives + priorStrength * baseline) /
      (group.n + priorStrength);
    return { id: row.id, probability, outcome: row.click };
  });
  const metrics = evaluateBinaryForecasts({
    datasetVersion: DATASET_VERSION,
    modelVersion: "item-position-policy-shrinkage-k100-v1",
    eventDefinition: "A logged item impression produces a click (1) or not (0).",
    samplingFrame: "Official 10k-row published men's examples of random and BTS; not population representative.",
    split: "temporal_holdout",
    independentLabels: false,
    precommittedBaselineProbability: baseline,
    bucketCount: 10,
    records,
  });
  return {
    cutoff: new Date(CUTOFF).toISOString(),
    trainCount: train.length,
    testCount: test.length,
    trainingBaselineClickProbability: baseline,
    modelFit: "Empirical per-(policy,position,item) clicks with 100 training-prior pseudoexposures; no test-time labels used.",
    ...metrics,
  };
}

function evaluateDecisionHoldout(all) {
  const train = all.filter((x) => x.timestamp < CUTOFF);
  const test = all.filter((x) => x.timestamp >= CUTOFF);
  const days = [...new Set(train.map((x) => x.day))].sort();
  assert.equal(days.length, 5, "expected five training days");
  const cohort = (source, day) => train.filter((r) => r.policy === source && r.day === day);
  const model = {
    modelVersion: "bandit-randomized-cohort-day-state-v1",
    unit: "clicks per 10000 impressions",
    probabilityEvidence: "estimated",
    states: days.map((id) => ({ id, probability: 1 / days.length })),
    actions: ["random", "bts"].map((policy) => ({
      id: policy,
      payoffs: days.map((stateId) => {
        const subset = cohort(policy, stateId);
        assert(subset.length > 0, "missing randomized-policy day");
        return { stateId, amount: clickRate(subset) * 10000 };
      }),
    })),
    riskPolicy: { tailMass: 0.2, downsidePenalty: 0 },
  };
  const comparison = evaluateQuantitativeDecision(model);
  const stress = stressTestProbabilityCases(model, days.map((favorite) => ({
    id: "overweight-" + favorite,
    probabilities: days.map((stateId) => ({
      stateId, probability: stateId === favorite ? 0.6 : 0.4 / (days.length - 1),
    })),
  })));
  const holdoutCtrByPolicy = Object.fromEntries(["random", "bts"].map((policy) => {
    const subset = test.filter((r) => r.policy === policy);
    assert(subset.length > 0, "missing holdout");
    return [policy, { n: subset.length, clicks: countClick(subset), ctr: clickRate(subset) }];
  }));
  return { model, comparison, stress, holdoutCtrByPolicy, limitation:
    "Daily policy cohort click rates are aggregated observations, not observed per-impression counterfactuals. " +
    "The decision model is an illustrative historical-data application; five training days and two holdout days " +
    "do not establish reliable economic lift or causal superiority of Signal." };
}

function evaluateOffPolicy(randomRows, btsRows) {
  assert.equal(randomRows.length, btsRows.length, "expected matched sample sizes");
  const weights = btsRows.map((r) => (1 / ACTION_COUNT) / r.pscore);
  const n = btsRows.length;
  const sumWeights = weights.reduce((sum, x) => sum + x, 0);
  const sumWeightedClicks = btsRows.reduce((sum, row, i) => sum + weights[i] * row.click, 0);
  const ips = sumWeightedClicks / n;
  const snips = sumWeightedClicks / sumWeights;
  const effectiveSampleSize = sumWeights ** 2 /
    weights.reduce((sum, w) => sum + w * w, 0);
  const cap = 20;
  const clipped = weights.map((w) => Math.min(w, cap));
  const clippedWeightedClicks = btsRows.reduce((sum, row, i) =>
    sum + clipped[i] * row.click, 0);
  const clippedSNIPS = clippedWeightedClicks / clipped.reduce((sum, w) => sum + w, 0);
  const rand = randomGenerator(BOOTSTRAP_SEED);
  const ipsDraws = [], snipsDraws = [], directDifferenceDraws = [];
  for (let iteration = 0; iteration < BOOTSTRAP_ITERATIONS; iteration += 1) {
    let randomClicks = 0, btsClicks = 0, weightedClicks = 0, totalWeight = 0;
    for (let j = 0; j < n; j += 1) {
      const ai = Math.floor(rand() * n);
      const bi = Math.floor(rand() * n);
      randomClicks += randomRows[ai].click;
      btsClicks += btsRows[bi].click;
      weightedClicks += btsRows[bi].click * weights[bi];
      totalWeight += weights[bi];
    }
    ipsDraws.push(weightedClicks / n);
    snipsDraws.push(weightedClicks / totalWeight);
    directDifferenceDraws.push((btsClicks - randomClicks) / n);
  }
  return {
    observedRandom: { count: n, clicks: countClick(randomRows), rate: clickRate(randomRows) },
    observedBts: { count: n, clicks: countClick(btsRows), rate: clickRate(btsRows) },
    observedBtsMinusRandom: clickRate(btsRows) - clickRate(randomRows),
    observedDifferenceCI95_IID: interval(directDifferenceDraws),
    randomPolicyFromBts: {
      targetActionProbability: 1 / ACTION_COUNT,
      ips, snips,
      ipsCI95_IID: interval(ipsDraws),
      snipsCI95_IID: interval(snipsDraws),
      meanImportanceWeight: sumWeights / n,
      effectiveSampleSize,
      maximumImportanceWeight: Math.max(...weights),
      importanceWeightsAbove20: weights.filter((w) => w > 20).length,
      clippedSNIPS_cap20: clippedSNIPS,
    },
    bootstrap: { iterations: BOOTSTRAP_ITERATIONS, seed: BOOTSTRAP_SEED,
      assumption: "Illustrative IID impression bootstrap; repeat users and temporal dependence are not modeled." },
    limitations: [
      "Open Bandit published 10k examples are not a random sample of all ZOZOTOWN traffic.",
      "The treatment-assignment mechanism and policy overlap must be verified before causal inference.",
      "Importance-weight diagnostics show low effective sample size; missing support cannot be repaired with weight clipping.",
      "Inferred target probability is uniform among 34 actions at each logged position; slate dependence is not fully modeled.",
      "No full-feedback counterfactual labels exist for unchosen actions; paired full-feedback APIs must not be used.",
    ],
  };
}

async function main() {
  const [random, bts] = await Promise.all(SOURCES.map(downloadSample));
  const combined = random.rows.concat(bts.rows);
  const report = {
    datasetVersion: DATASET_VERSION,
    source: {
      paper: "Saito et al., Open Bandit Dataset and Pipeline, arXiv:2008.07146",
      citation: "https://arxiv.org/abs/2008.07146",
      sourceRepo: "https://github.com/st-tech/zr-obp/tree/" + UPSTREAM + "/obd",
      sourceBlobsVerified: [random.expectedGitBlob, bts.expectedGitBlob],
      sampleSizePerPolicy: 10000,
      horizon: "2019-11-24 through 2019-11-30 UTC",
    },
    observedEvaluation: evaluateOffPolicy(random.rows, bts.rows),
    forecastHoldout: evaluateForecastHoldout(combined),
    quantitativeDecisionHoldout: evaluateDecisionHoldout(combined),
    overallStatus: "exploratory_real_data_only",
    claimsNotSupported: [
      "Signal has improved business results",
      "The heuristic Signal policy beats Random/BTS on logged recommendations",
      "Statistical confidence in causal policy lift",
      "Certified calibration or representative production quality",
      "End-to-end security, durable execution, and external exactly-once behavior",
    ],
  };
  const path = "artifacts/validation/open-bandit-report.json";
  await mkdir("artifacts/validation", { recursive: true });
  await writeFile(path, JSON.stringify(report, null, 2) + "\n");
  const o = report.observedEvaluation;
  const f = report.forecastHoldout;
  const d = report.quantitativeDecisionHoldout;
  const summary = [
    "Open Bandit: real 2019 ZOZOTOWN men's sample (" + combined.length + " impressions).",
    "Random direct CTR: " + (o.observedRandom.rate * 100).toFixed(4) + "%",
    "BTS direct CTR: " + (o.observedBts.rate * 100).toFixed(4) + "%",
    "Uniform target IPS from BTS: " + (o.randomPolicyFromBts.ips * 100).toFixed(4) + "%",
    "Uniform target SNIPS from BTS: " + (o.randomPolicyFromBts.snips * 100).toFixed(4) + "%",
    "Importance weight ESS: " + o.randomPolicyFromBts.effectiveSampleSize.toFixed(1) + " / " + bts.rows.length,
    "Forecast temporal test n: " + f.sampleSize + "; Brier: " + f.brierScore +
      "; baseline Brier: " + f.baselineBrier + "; status: " + f.status,
    "Quantitative recommendation from training-day aggregates: " + d.comparison.recommendedActionId +
      "; scenario-stress stable: " + d.stress.stableAcrossSuppliedCases,
    "STATUS: exploratory_real_data_only; no verified Signal business lift.",
    "Full evidence: " + path,
  ];
  for (const line of summary) console.log(line);
  if (process.env.GITHUB_STEP_SUMMARY) {
    await appendFile(process.env.GITHUB_STEP_SUMMARY, "### Open Bandit real-data validation\n\n" +
      summary.map((line) => "- " + line).join("\n") + "\n\n");
  }
}

await main();
