import {
  createDefaultAwareAdapters,
  createFixtureAwareAdapters,
  createRegionService,
  type RegionService,
  type SafetyDataAdapter
} from "../adapters.js";
import type { BriefingReviewInput, FeedbackInput, FixtureScenarioId } from "../contracts.js";
import { createAwareSignalApp, type AwareSignalApp } from "../signal.js";

export type AwareApiService = {
  app: AwareSignalApp;
};

export type AwareApiServiceOptions = {
  app?: AwareSignalApp;
  regions?: RegionService;
  adapters?: SafetyDataAdapter[];
  fixtureId?: FixtureScenarioId;
  now?: () => Date;
};

export function createAwareApiService(options: AwareApiServiceOptions = {}): AwareApiService {
  if (options.app) return { app: options.app };
  return {
    app: createAwareSignalApp({
      regions: options.regions ?? createRegionService(),
      adapters: options.adapters ?? (options.fixtureId ? createFixtureAwareAdapters(options.fixtureId) : createDefaultAwareAdapters()),
      now: options.now
    })
  };
}

export async function searchRegions(service: AwareApiService, query: string) {
  return service.app.searchRegions(query);
}

export async function getRegionBriefing(service: AwareApiService, regionId: string, fixtureId?: FixtureScenarioId) {
  return service.app.getBriefing(regionId, { fixtureId });
}

export async function getBriefingDetails(service: AwareApiService, briefingId: string) {
  return service.app.getBriefingDetails(briefingId);
}

export async function listBriefingSources(service: AwareApiService, briefingId: string) {
  return service.app.listSources(briefingId);
}

export async function submitFeedback(service: AwareApiService, input: FeedbackInput) {
  return service.app.submitFeedback(input);
}

export async function reviewBriefing(service: AwareApiService, input: BriefingReviewInput) {
  return service.app.reviewBriefing(input);
}
