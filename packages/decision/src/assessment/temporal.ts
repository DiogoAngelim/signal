import type {
  DecisionEvidence,
  DecisionEvidenceTemporalAssessment,
} from "../types";

const ISO_TIMESTAMP =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(Z|[+-]\d{2}:\d{2})$/;

function parseIsoTimestamp(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const match = ISO_TIMESTAMP.exec(value);
  if (!match) return undefined;

  const [, year, month, day, hour, minute, second] = match;
  const yearNumber = Number(year);
  const monthNumber = Number(month);
  const dayNumber = Number(day);
  const hourNumber = Number(hour);
  const minuteNumber = Number(minute);
  const secondNumber = Number(second);
  const calendarCheck = new Date(0);
  calendarCheck.setUTCFullYear(yearNumber, monthNumber - 1, dayNumber);
  calendarCheck.setUTCHours(hourNumber, minuteNumber, secondNumber, 0);

  if (
    calendarCheck.getUTCFullYear() !== yearNumber ||
    calendarCheck.getUTCMonth() !== monthNumber - 1 ||
    calendarCheck.getUTCDate() !== dayNumber ||
    hourNumber > 23 ||
    minuteNumber > 59 ||
    secondNumber > 59
  ) {
    return undefined;
  }

  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : undefined;
}

export function assessEvidenceTemporalValidity(
  evidence: readonly DecisionEvidence[],
  asOf: string,
): DecisionEvidenceTemporalAssessment {
  const asOfTimestamp = parseIsoTimestamp(asOf);
  if (asOfTimestamp === undefined) {
    throw new TypeError("Evidence temporal assessment requires a valid ISO asOf timestamp");
  }

  const currentEvidenceIds: string[] = [];
  const expiredEvidenceIds: string[] = [];
  const notYetValidEvidenceIds: string[] = [];
  const staleEvidenceIds: string[] = [];
  const unknownValidityEvidenceIds: string[] = [];
  const invalidEvidenceIds: string[] = [];

  for (const item of evidence) {
    const timestamps = [
      item.eventAt,
      item.observedAt,
      item.recordedAt,
      item.verifiedAt,
      item.validFrom,
      item.validUntil,
    ];
    const parsed = timestamps.map(parseIsoTimestamp);
    const hasInvalidTimestamp = timestamps.some(
      (value, index) => value !== undefined && parsed[index] === undefined,
    );
    const observedAt = parseIsoTimestamp(item.observedAt);
    const validFrom = parseIsoTimestamp(item.validFrom);
    const validUntil = parseIsoTimestamp(item.validUntil);
    const freshnessWindowMs = item.sourceRef?.freshnessWindowMs;

    if (
      hasInvalidTimestamp ||
      (freshnessWindowMs !== undefined &&
        (!Number.isFinite(freshnessWindowMs) || freshnessWindowMs < 0)) ||
      (validFrom !== undefined &&
        validUntil !== undefined &&
        validFrom > validUntil) ||
      (observedAt !== undefined && observedAt > asOfTimestamp)
    ) {
      invalidEvidenceIds.push(item.evidenceId);
      continue;
    }

    if (validFrom !== undefined && asOfTimestamp < validFrom) {
      notYetValidEvidenceIds.push(item.evidenceId);
    } else if (validUntil !== undefined && asOfTimestamp > validUntil) {
      expiredEvidenceIds.push(item.evidenceId);
    } else if (validFrom !== undefined || validUntil !== undefined) {
      currentEvidenceIds.push(item.evidenceId);
    } else {
      unknownValidityEvidenceIds.push(item.evidenceId);
    }

    if (
      freshnessWindowMs !== undefined &&
      observedAt !== undefined &&
      asOfTimestamp - observedAt > freshnessWindowMs
    ) {
      staleEvidenceIds.push(item.evidenceId);
    }
  }

  const explanation = [
    `Temporal validity was evaluated as of ${asOf}.`,
    `${currentEvidenceIds.length} evidence item(s) are within their declared validity interval.`,
    `${expiredEvidenceIds.length} evidence item(s) are expired and ${notYetValidEvidenceIds.length} are not yet valid.`,
    `${staleEvidenceIds.length} evidence item(s) exceed their source freshness window.`,
  ];
  if (unknownValidityEvidenceIds.length) {
    explanation.push(
      `${unknownValidityEvidenceIds.length} evidence item(s) have no declared validity interval.`,
    );
  }
  if (invalidEvidenceIds.length) {
    explanation.push(
      `${invalidEvidenceIds.length} evidence item(s) have invalid temporal metadata.`,
    );
  }

  return {
    asOf,
    currentEvidenceIds: currentEvidenceIds.sort(),
    expiredEvidenceIds: expiredEvidenceIds.sort(),
    notYetValidEvidenceIds: notYetValidEvidenceIds.sort(),
    staleEvidenceIds: staleEvidenceIds.sort(),
    unknownValidityEvidenceIds: unknownValidityEvidenceIds.sort(),
    invalidEvidenceIds: invalidEvidenceIds.sort(),
    explanation,
  };
}
