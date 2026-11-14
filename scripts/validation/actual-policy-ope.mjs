/**
 * Retrospective, non-deployed off-policy evaluation of the ACTUAL Signal evaluateDecision
 * gating path with a declared 34-item domain adapter, using logged randomized ZOZOTOWN data.
 *
 * IMPORTANT: Signal decides WHETHER/HOW STRONGLY to exploit a candidate; the
 * item ranker is a separate training-only heuristic, NOT a built-in Signal recommender.
 * No off-policy result is proof of commercial lift or deployment readiness.
 *
 * Run: pnpm --filter @signal/decision build && node scripts/validation/actual-policy-ope.mjs
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { appendFile, mkdir, writeFile } from "node:fs/promises";
import signalDecision from "../../packages/decision/dist/index.js";

const { evaluateDecision } = signalDecision;
assert.equal(typeof evaluateDecision, "function", "real Signal policy entrypoint missing");

const SOURCE_SHA = "8cbd5fa4558b7ad2ba4781546d6604e4cc3e07c4";
const RANDOM_BLOB = "e99ba925c30ccd537a554ce8ea2104a005c6f49e";
const TEST_CUTOFF_MS = Date.parse("2019-11-29T00:00:00Z");
const N_ARMS = 34;
const EPSILON = 0.2; // Precommitted action support; 80% uniform + 20% exploit.
const SMOOTHING_IMPRESSIONS = 150;
const AFFINITY_PER_PAST_CLICK = 0.0005;
const CI_REPLICATES = 1400;
const SEED = 20261114;
const DATASET_VERSION = "zr-obp-men-random-10k/" + SOURCE_SHA;
const SOURCE = "ZOZO Open Bandit public random-policy sample";

const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

function random(seed) {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(1664525, s) + 1013904223) >>> 0) / 4294967296);
}

function quantile(sorted, q) {
  const x = (sorted.length - 1) * q;
  const a = Math.floor(x);
  const b = Math.ceil(x);
  return sorted[a] + (sorted[b] - sorted[a]) * (x - a);
}

function ci95(values) {
  const sorted = values.slice().sort((a, b) => a - b);
  return [quantile(sorted, 0.025), quantile(sorted, 0.975)];
}

async function getRandomPolicySample() {
  const url = "https://raw.githubusercontent.com/st-tech/zr-obp/" + SOURCE_SHA +
    "/obd/random/men/men.csv";
  const res = await fetch(url, {
    headers: { Accept: "text/csv" },
    signal: AbortSignal.timeout(60000),
  });
  assert(res.ok, "Open Bandit download failed, HTTP " + res.status);
  const bytes = Buffer.from(await res.arrayBuffer());
  assert(bytes.length > 3000000 && bytes.length < 4000000, "source size changed");
  const sha = createHash("sha1")
    .update("blob " + bytes.length + "\0")
    .update(bytes)
    .digest("hex");
  assert.equal(sha, RANDOM_BLOB, "published dataset blob mismatch");
  const lines = bytes.toString("utf8").trimEnd().split(/\r?\n/);
  const header = lines.shift().split(",");
  assert.equal(lines.length, 10000, "sample must contain exactly 10,000 rows");
  const fields = new Map(header.map((name, index) => [name, index]));
  for (const name of ["timestamp", "item_id", "position", "click", "propensity_score",
    ...Array.from({ length: N_ARMS }, (_, i) => "user-item_affinity_" + i)]) {
    assert(fields.has(name), "missing Open Bandit field: " + name);
  }
  const get = (csv, key) => csv[fields.get(key)];
  const ids = new Set();
  const rows = lines.map((line) => {
    const csv = line.split(",");
    assert.equal(csv.length, header.length, "malformed Open Bandit CSV");
    const id = Number(csv[0]);
    assert(Number.isSafeInteger(id) && !ids.has(id), "repeated row id");
    ids.add(id);
    const action = Number(get(csv, "item_id"));
    const position = Number(get(csv, "position"));
    const reward = Number(get(csv, "click"));
    const pscore = Number(get(csv, "propensity_score"));
    assert(Number.isInteger(action) && action >= 0 && action < N_ARMS, "bad item id");
    assert([1, 2, 3].includes(position), "bad position");
    assert([0, 1].includes(reward), "bad click");
    assert(Math.abs(pscore - 1 / N_ARMS) < 1e-12, "source is not uniform random");
    const timestamp = Date.parse(get(csv, "timestamp").replace(" ", "T"));
    assert(Number.isFinite(timestamp), "invalid event time");
    const affinities = Array.from({ length: N_ARMS }, (_, i) =>
      Number(get(csv, "user-item_affinity_" + i)));
    assert(affinities.every(v => Number.isFinite(v) && v >= 0), "invalid pre-outcome affinities");
    // No feature hashes, user identity, or free text is emitted or persisted.
    return { id, timestamp, position, action, reward, pscore, affinities };
  });
  rows.sort((a, b) => a.timestamp - b.timestamp || a.id - b.id);
  return { rows, url, blob: sha };
}

function trainCandidateModel(rows) {
  const training = rows.filter(r => r.timestamp < TEST_CUTOFF_MS);
  const testing = rows.filter(r => r.timestamp >= TEST_CUTOFF_MS);
  assert(training.length > 5000 && testing.length > 2000, "temporal split empty");
  const totalClicks = training.reduce((a, r) => a + r.reward, 0);
  const globalCtr = totalClicks / training.length;
  assert(globalCtr > 0 && globalCtr < 1, "invalid training click rate");
  const counts = Array.from({ length: 3 }, () =>
    Array.from({ length: N_ARMS }, () => ({ n: 0, clicks: 0 })));
  for (const row of training) {
    const v = counts[row.position - 1][row.action];
    v.n += 1;
    v.clicks += row.reward;
  }
  const rate = counts.map(pos => pos.map(({ n, clicks }) =>
    (clicks + SMOOTHING_IMPRESSIONS * globalCtr) /
    (n + SMOOTHING_IMPRESSIONS)));
  return { training, testing, totalClicks, globalCtr, rate };
}

function chooseCandidate(row, model) {
  let winner = -1, winningScore = -Infinity;
  for (let a = 0; a < N_ARMS; a += 1) {
    // Candidate scoring is a declared, non-Signal domain heuristic.
    const score = model.rate[row.position - 1][a] +
      AFFINITY_PER_PAST_CLICK * Math.min(4, row.affinities[a]);
    if (score > winningScore) {
      winner = a;
      winningScore = score;
    }
  }
  assert(winner >= 0, "no supported action");
  return { action: winner, forecast: winningScore };
}

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

function calculatePropensityForLoggedAction(row, bestAction, fraction) {
  const p = (1 - fraction) / N_ARMS +
    (row.action === bestAction ? fraction : 0);
  assert(p >= 0 && p <= 1, "invalid evaluation action probability");
  return p;
}

function evaluateLoggedRows(model) {
  const policies = {
    random: { name: "Uniform-random logging policy" },
    featureOnly: { name: "80%-random/20%-feature-only ranker" },
    signalUngoverned: { name: "80%-random/Signal legacy gating ranker" },
    signalGoverned: { name: "80%-random/Signal + evidence governance ranker" },
  };
  const output = [];
  let legacyAllowed = 0, governedAllowed = 0, legacyScale = 0, governedScale = 0;
  let legacyWisdom = {}, governedWisdom = {}, legacySimulation = {}, governedSimulation = {};
  let exactRepeats = 0;
  for (const row of model.testing) {
    const candidate = chooseCandidate(row, model);
    const legacy = normalizeGate(signalDecisionForCandidate(row, candidate, model, false));
    const governed = normalizeGate(signalDecisionForCandidate(row, candidate, model, true));
    if (legacy.allowed) legacyAllowed += 1;
    if (governed.allowed) governedAllowed += 1;
    legacyScale += legacy.scale;
    governedScale += governed.scale;
    legacyWisdom[legacy.wisdom] = (legacyWisdom[legacy.wisdom] || 0) + 1;
    governedWisdom[governed.wisdom] = (governedWisdom[governed.wisdom] || 0) + 1;
    legacySimulation[legacy.simulation] = (legacySimulation[legacy.simulation] || 0) + 1;
    governedSimulation[governed.simulation] = (governedSimulation[governed.simulation] || 0) + 1;
    if (exactRepeats < 12) {
      const again = normalizeGate(signalDecisionForCandidate(row, candidate, model, true));
      assert.deepEqual(again, governed, "non-deterministic replay on fixed input");
      // Flipping a held-out reward cannot change a decision: inputs exclude click.
      const flipped = { ...row, reward: 1 - row.reward };
      assert.deepEqual(chooseCandidate(flipped, model), candidate);
      assert.deepEqual(normalizeGate(signalDecisionForCandidate(flipped, candidate, model, true)), governed,
        "label leakage detected");
      exactRepeats += 1;
    }
    const fractions = {
      random: 0, featureOnly: EPSILON,
      signalUngoverned: EPSILON * legacy.scale,
      signalGoverned: EPSILON * governed.scale,
    };
    const weights = {};
    for (const [name, fraction] of Object.entries(fractions)) {
      assert(fraction >= 0 && fraction <= EPSILON);
      // Exact distribution-level overlap, not just probability of logged action.
      let sum = 0;
      for (let a = 0; a < N_ARMS; a += 1) {
        sum += (1 - fraction) / N_ARMS + (a === candidate.action ? fraction : 0);
      }
      assert(Math.abs(sum - 1) < 1e-10, "target probabilities do not sum to 1");
      const pEval = calculatePropensityForLoggedAction(row, candidate.action, fraction);
      weights[name] = pEval / row.pscore;
      assert(Number.isFinite(weights[name]) && weights[name] >= 0);
    }
    output.push({ date: new Date(row.timestamp).toISOString().slice(0, 10),
      position: row.position, reward: row.reward, weights,
      candidateWasLoggedAction: candidate.action === row.action });
  }
  return {
    policyDefinitions: policies,
    rows: output,
    signalDiagnostics: {
      n: output.length,
      exactReplayAndLabelLeakageTests: exactRepeats,
      legacy: { allowedCount: legacyAllowed, allowedFraction: legacyAllowed / output.length,
        meanScale: legacyScale / output.length, wisdom: legacyWisdom, simulation: legacySimulation },
      withEvidence: { allowedCount: governedAllowed, allowedFraction: governedAllowed / output.length,
        meanScale: governedScale / output.length, wisdom: governedWisdom, simulation: governedSimulation },
    },
  };
}

function scorePolicies(rows) {
  const policyKeys = ["random", "featureOnly", "signalUngoverned", "signalGoverned"];
  const n = rows.length;
  const rand = random(SEED);
  const summaries = {};
  for (const key of policyKeys) {
    const ws = rows.map(r => r.weights[key]);
    const w = ws.reduce((s, x) => s + x, 0);
    const wr = rows.reduce((s, r) => s + r.reward * r.weights[key], 0);
    summaries[key] = {
      ipsCTR: wr / n, snipsCTR: wr / w,
      meanWeight: w / n,
      effectiveSampleSize: w * w / ws.reduce((s, x) => s + x * x, 0),
      maximumWeight: Math.max(...ws),
      matchedNonzeroWeightCount: ws.filter(x => x > 0).length,
    };
  }
  const ciSamples = Object.fromEntries(policyKeys.map(k => [k, []]));
  const differences = Object.fromEntries(policyKeys.slice(1).map(k => [k, []]));
  for (let iteration = 0; iteration < CI_REPLICATES; iteration += 1) {
    const sums = Object.fromEntries(policyKeys.map(k => [k, 0]));
    for (let j = 0; j < n; j += 1) {
      const row = rows[Math.floor(rand() * n)];
      for (const key of policyKeys) sums[key] += row.reward * row.weights[key];
    }
    for (const key of policyKeys) ciSamples[key].push(sums[key] / n);
    for (const key of policyKeys.slice(1)) differences[key].push((sums[key] - sums.random) / n);
  }
  for (const key of policyKeys) {
    summaries[key].ipsCI95IID = ci95(ciSamples[key]);
  }
  for (const key of policyKeys.slice(1)) {
    summaries[key].ipsDifferenceFromRandom = summaries[key].ipsCTR - summaries.random.ipsCTR;
    summaries[key].differenceCI95IID = ci95(differences[key]);
  }
  const perDay = [...new Set(rows.map(r => r.date))].map(date => {
    const sample = rows.filter(x => x.date === date);
    return {
      date, n: sample.length, observedCTR: sample.reduce((s, r) => s + r.reward, 0) / sample.length,
      ipsByPolicy: Object.fromEntries(policyKeys.map(k => [k,
        sample.reduce((s, r) => s + r.reward * r.weights[k], 0) / sample.length])),
    };
  });
  return { modelComparison: summaries, perDay, bootstrap: {
    repeats: CI_REPLICATES, seed: SEED, confidenceLevel: 0.95,
    disclaimer: "IID impression bootstrap is only descriptive. Repeated users, slates, temporal dependence and research-sample selection can invalidate these intervals.",
  }};
}

async function main() {
  const source = await getRandomPolicySample();
  const model = trainCandidateModel(source.rows);
  const evaluated = evaluateLoggedRows(model);
  const stats = scorePolicies(evaluated.rows);
  const report = {
    evidenceType: "real-data-retrospective-exploratory_shadow_policy",
    classification: "NO_CAUSAL_OR_BUSINESS_LIFT_CERTIFICATION",
    version: "signal-actual-decision-gate-ope-v1",
    inputProvenance: { source: source.url, sourceBlob: source.blob, sourceGitSha: SOURCE_SHA,
      datasetVersion: DATASET_VERSION, exposurePolicy: "uniform random",
      experimentDates: "2019-11-24 through 2019-11-30" },
    precommittedAdapter: {
      scenario: "Should the given recommendation slot exploit an item ranker or sample uniformly?",
      signalRole: "Signal evaluateDecision gates/attenuates exploitation; does not choose the 34-arm candidate.",
      actionRanker: "Training-only item/position CTR with 150 pseudo-impressions from the cohort mean; add 0.0005 per past affinity click capped at 4.",
      ordinalInputScale: "65 + 20*ln(candidateScore/trainingGlobalCTR), capped to [25,95]. NOT A CLICK PROBABILITY.",
      evaluatedPolicy: "pi(item|x)=(1-epsilon)/34 + epsilon*1{item=rankerWinner}; epsilon=.2 for feature-only, epsilon=.2*Signal actionScale for Signal gating, zero if blocked.",
      namedBaselines: ["uniform random", "feature-only ranker without Signal"],
      cutoff: new Date(TEST_CUTOFF_MS).toISOString(),
      trainingCount: model.training.length, testCount: model.testing.length,
      trainingClicks: model.totalClicks,
      trainingCTR: model.globalCtr,
      noOutcomeLeakage: true,
      allArmsSupported: true,
    },
    signalDiagnostics: evaluated.signalDiagnostics,
    ...stats,
    limitations: [
      "Signal's native evaluateDecision outputs an action gate, not a 34-item recommendation policy. Item selection, reward mapping and exploration mixture come from a domain adapter declared before evaluation.",
      "Source is a published 10k research example; only the randomized men's subset is evaluated; not representative of production use.",
      "Each sample records the clicked item at a specific slot. No counterfactual clicks for unchosen items were fabricated.",
      "Per-position propensity is 1/34 in this sample. Full slate interference and multi-slot joint propensities are not modeled.",
      "Replayed past-click affinities and historical training means are pre-outcome features; source extraction method cannot be independently audited from the released anonymized file.",
      "Uncertainty is based on an IID impression bootstrap; user clustering and time dependence are not resolved.",
      "Click rate, not profit or lifetime customer welfare, is evaluated. No monetary cost was inferred.",
      "Zero historical execution by Signal; this is a shadow-policy audit and does not test applied outcomes or operational durability.",
      "Claims about policy superiority, causality, subgroup fairness, deployment safety or generalization remain unsupported.",
    ],
  };
  await mkdir("artifacts/validation", { recursive: true });
  await writeFile("artifacts/validation/actual-policy-ope-report.json", JSON.stringify(report, null, 2) + "\n");
  console.log("REAL LOGGED RANDOM POLICY N", model.testing.length, "TRAIN", model.training.length);
  console.log("Legacy allowed", report.signalDiagnostics.legacy.allowedCount,
    "Governed allowed", report.signalDiagnostics.withEvidence.allowedCount);
  for (const [name, result] of Object.entries(stats.modelComparison)) {
    console.log(name, "IPS", result.ipsCTR.toFixed(8),
      "CI", JSON.stringify(result.ipsCI95IID),
      "ESS", result.effectiveSampleSize.toFixed(1));
  }
  console.log("STATUS:", report.classification, "real-data shadow policy; no verified Signal business lift");
  if (process.env.GITHUB_STEP_SUMMARY) {
    await appendFile(process.env.GITHUB_STEP_SUMMARY,
      "## Signal actual decision gate on real randomized data\n\n" +
      "Training: " + model.training.length + "; holdout: " + model.testing.length + ". " +
      "Legacy allowed: " + report.signalDiagnostics.legacy.allowedCount +
      "; evidence-governed allowed: " + report.signalDiagnostics.withEvidence.allowedCount +
      ".\n\n" + Object.entries(stats.modelComparison).map(([key, r]) =>
        "- " + key + ": IPS CTR " + (r.ipsCTR * 100).toFixed(4) + "%, 95% IID CI [" +
        r.ipsCI95IID.map(x => (x * 100).toFixed(4) + "%").join(", ") + "], ESS " +
        r.effectiveSampleSize.toFixed(0)).join("\n") +
      "\n\n**No verified policy lift or production certification.**\n");
  }
}

await main();
