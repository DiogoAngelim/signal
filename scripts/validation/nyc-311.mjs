/**
 * Public NYC 311 operational-data replay: deterministic source-boundary checks.
 * Uses no personal addresses, free text, coordinates, API tokens, or production DB.
 * The API provides current row state, NOT historical status transitions.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, writeFile, appendFile } from "node:fs/promises";
import signalDecision from "../../packages/decision/dist/index.js";
const { assessDecisionEvidence, createRealitySnapshot, compactRealityPayload } = signalDecision;

const SOURCE_ID = "erm2-nwe9";
const SELECT = "unique_key,created_date,closed_date,agency,complaint_type,status,borough";
const FROM = "2024-01-01T00:00:00";
const UNTIL = "2024-01-05T00:00:00";
const LIMIT = 1500;
const SOURCE = "NYC Open Data 311 / erm2-nwe9";

function requireLocalTimeString(value, field) {
  assert(typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value),
    "invalid " + field);
  const parsed = Date.parse(value.endsWith("Z") ? value : value + "Z");
  assert(Number.isFinite(parsed), "bad local timestamp " + field);
  return new Date(parsed).toISOString();
}

function canonical(row) {
  const id = String(row.unique_key || "");
  assert(/^\d+$/.test(id), "invalid unique key");
  const created = requireLocalTimeString(row.created_date, "created_date");
  const closed = row.closed_date ? requireLocalTimeString(row.closed_date, "closed_date") : null;
  return {
    id, created, closed,
    agency: String(row.agency || ""),
    complaintType: String(row.complaint_type || ""),
    statusAtQuery: String(row.status || ""),
    borough: String(row.borough || ""),
  };
}

async function downloadRows() {
  const url = new URL("https://data.cityofnewyork.us/resource/" + SOURCE_ID + ".json");
  url.searchParams.set("$select", SELECT);
  url.searchParams.set("$where", "created_date >= '" + FROM + "' AND created_date < '" + UNTIL + "'");
  url.searchParams.set("$order", "created_date ASC, unique_key ASC");
  url.searchParams.set("$limit", String(LIMIT));
  const response = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(60000),
  });
  assert(response.ok, "NYC public API fetch failed: HTTP " + response.status);
  const data = await response.json();
  assert(Array.isArray(data) && data.length >= 100 && data.length <= LIMIT,
    "unexpected API sample size or shape");
  const rows = data.map(canonical).sort((a, b) =>
    a.created.localeCompare(b.created) || a.id.localeCompare(b.id));
  assert(new Set(rows.map((r) => r.id)).size === rows.length,
    "duplicate 311 request keys");
  const digest = createHash("sha256").update(JSON.stringify(rows)).digest("hex");
  return { url: url.toString(), rows, digest };
}

function replay(rows) {
  const events = [];
  let invalidClosedBeforeCreated = 0;
  for (const row of rows) {
    events.push({ id: row.id, kind: "created", at: row.created });
    if (row.closed) {
      if (row.closed < row.created) { invalidClosedBeforeCreated += 1; continue; }
      events.push({ id: row.id, kind: "closed", at: row.closed });
    }
  }
  events.sort((a, b) => {
    const timeOrder = a.at.localeCompare(b.at);
    if (timeOrder) return timeOrder;
    const kindOrder = a.kind === b.kind ? 0 : a.kind === "created" ? -1 : 1;
    return kindOrder || a.id.localeCompare(b.id);
  });
  const open = new Set();
  let invalidTransitions = 0;
  for (const event of events) {
    if (event.kind === "created") {
      if (open.has(event.id)) invalidTransitions += 1;
      open.add(event.id);
    } else if (!open.delete(event.id)) {
      invalidTransitions += 1;
    }
  }
  return { inputRows: rows.length, events: events.length,
    createdEvents: rows.length, closedEvents: events.length - rows.length,
    outstandingInSample: open.size, invalidClosedBeforeCreated, invalidTransitions,
    eventStreamSHA256: createHash("sha256").update(JSON.stringify(events)).digest("hex"),
    caveat: "This reconstructs create/close *from current published rows* only. Intermediate status history is unavailable. End-of-stream balance is not an as-of population backlog." };
}

function assessRealEvidence(rows) {
  let checked = 0, lineageVerified = 0, expiryVerified = 0, snapshots = 0;
  let unknownValidity = 0;
  for (const row of rows.slice(0, 250)) {
    const evidenceId = "open-interval-" + row.id;
    const eventAt = row.created;
    const sourceRef = { sourceId: "NYC-311-official", sourceType: "api" };
    const original = {
      evidenceId, label: "311 request open interval (derived from published created/closed timestamps)",
      direction: "supporting",
      sourceRef, eventAt, observedAt: eventAt, recordedAt: eventAt,
      validFrom: eventAt, ...(row.closed && row.closed >= row.created ? { validUntil: row.closed } : {}),
    };
    const derived = {
      evidenceId: "derived-copy-" + row.id,
      label: "Same record, derived copy",
      direction: "supporting",
      sourceRef, eventAt, observedAt: eventAt, recordedAt: eventAt,
      validFrom: eventAt, ...(row.closed && row.closed >= row.created ? { validUntil: row.closed } : {}),
      derivedFromEvidenceIds: [evidenceId],
    };
    const assessment = assessDecisionEvidence({
      decisionId: "311-replay-" + row.id, createdAt: eventAt,
      desiredConfidence: 95, evidence: [original, derived],
      unknowns: ["The historical, point-in-time status is not published in this snapshot."],
    });
    checked += 1;
    if (assessment.evidenceQuality.lineage?.independentSourceCount === 1) lineageVerified += 1;
    if (assessment.evidenceQuality.temporal?.unknownValidityEvidenceIds.length) unknownValidity += 1;
    if (row.closed && row.closed >= row.created) {
      const after = new Date(Date.parse(row.closed) + 86400000).toISOString();
      const expired = assessDecisionEvidence({
        decisionId: "311-after-closure-" + row.id, createdAt: after,
        evidence: [original],
      });
      if (expired.evidenceQuality.temporal?.expiredEvidenceIds.includes(evidenceId)) {
        expiryVerified += 1;
      }
    }
    const snapshot = createRealitySnapshot({
      snapshotId: "nyc311-" + row.id, source: SOURCE,
      createdAt: eventAt, payload: compactRealityPayload({
        requestId: row.id, agency: row.agency,
        complaintType: row.complaintType, borough: row.borough,
      }, ["requestId", "agency", "complaintType", "borough"]),
      sourceRef,
    });
    if (snapshot.snapshotId === "nyc311-" + row.id) snapshots += 1;
  }
  assert.equal(lineageVerified, checked, "derived source counted as independent corroboration");
  assert.equal(snapshots, checked, "reality snapshot not reproducible");
  return { checked, lineageVerified, expiryVerified, unknownValidity, snapshots,
    caveat: "Evidence values, quality defaults and source identity are declared by the harness; no authenticity, point-in-time truth or calibrated confidence is demonstrated." };
}

async function main() {
  const { url, rows, digest } = await downloadRows();
  const replayResults = replay(rows);
  const evidence = assessRealEvidence(rows);
  const report = {
    source: "NYC 311 open data",
    datasetUrl: "https://data.cityofnewyork.us/d/erm2-nwe9",
    queryUrl: url,
    selection: { fromLocalWallClock: FROM, untilLocalWallClock: UNTIL,
      orderedLimit: LIMIT, selectedColumns: SELECT,
      snapshotIsMutable: true, snapshotHashSHA256: digest },
    counts: { sample: rows.length, rowsWithClosedDate: rows.filter(x => x.closed).length,
      agencies: new Set(rows.map(x => x.agency)).size,
      complaintCategories: new Set(rows.map(x => x.complaintType)).size },
    operationalReplay: replayResults, signalEvidenceAndReality: evidence,
    sanitizedRows: rows,
    overallStatus: "exploratory_public_data_operational_replay",
    limitations: [
      "NYC 311 mutable API results are a current snapshot, not a historical point-in-time state log.",
      "Date-time fields may use city-local wall time; a timezone offset has not been independently verified. Only relative ordering within this January period is used.",
      "The first ordered 1500 records are not a population-representative sample.",
      "Rows exclude addresses, coordinates and narrative descriptions but source attribution must be preserved.",
      "No external action side effects, enforcement, authorizations, tenancy, cross-process durability or production incident recovery were tested.",
    ],
  };
  await mkdir("artifacts/validation", { recursive: true });
  const out = "artifacts/validation/nyc-311-report.json";
  await writeFile(out, JSON.stringify(report, null, 2) + "\n");
  const messages = [
    "NYC 311 official public sample: " + rows.length + " records; SHA256 " + digest,
    "Replayed creation/closure events: " + replayResults.events,
    "Signal lineage tests: " + evidence.lineageVerified + "/" + evidence.checked,
    "Signal expiry detections: " + evidence.expiryVerified,
    "Signal reality snapshots: " + evidence.snapshots,
    "STATUS: exploratory_public_data_operational_replay; no production/causal validation.",
    "Evidence: " + out,
  ];
  for (const line of messages) console.log(line);
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY,
    "### NYC 311 operational replay\n\n" + messages.map(x => "- " + x).join("\n") + "\n");
}

await main();
