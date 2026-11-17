import * as core from "@signal/decision/core";
import { createLuminaHumanSupport } from "../../../signal-framework/adapters/lumina-human-support.js";

export const { buildHumanSupportPlan, observeExplicitSupportCue, inspectSupportResponse,
  describeMeaningfulMoment, parsePracticeAllocation, normalizeSupportPreferences,
  shouldUseSupportOnly } = createLuminaHumanSupport(core);
export { DEFAULT_SUPPORT_PREFERENCES } from "@signal/decision/core";
export type { SupportPreferences, HumanSupportPlan } from "@signal/decision/core";
