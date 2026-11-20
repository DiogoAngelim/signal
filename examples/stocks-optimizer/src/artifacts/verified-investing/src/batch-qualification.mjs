import { check, integer } from './contracts.mjs';
import { blockMeanInterval } from './research.mjs';

/** Additional, never substitutive, family-size-adjusted historical evidence gate. */
export function qualifyResearchBatchMember(report, familySize = 4) {
  integer(familySize, 'research_family_size', 1, 50);
  check(report && typeof report.validation?.passed === 'boolean' && Array.isArray(report.validation.blockers), 'invalid_research_report');
  const values = report.finalTest?.excess;
  check(Array.isArray(values) && values.length >= 5, 'insufficient_batch_evidence');
  const interval = blockMeanInterval(values, { confidence: 1 - 0.05 / familySize, blockLength: 5, draws: 10000 });
  const familyAdjustedExcessPass = interval.lower > 0;
  return { historicalResearchQualified: report.validation.passed && familyAdjustedExcessPass,
    existingGatesPassed: report.validation.passed, familyAdjustedExcessPass, familySize, interval,
    blockers: [...report.validation.blockers, ...(familyAdjustedExcessPass ? [] : ['family_adjusted_excess_not_established'])],
    prospectivePassed: false, portfolioPolicyPerformanceVerified: false, liveTradingApproved: false,
    interpretation: 'Additional estimated bootstrap evidence on a fixed research family, not a live trading authorization or guaranteed family-wise error control.' };
}
