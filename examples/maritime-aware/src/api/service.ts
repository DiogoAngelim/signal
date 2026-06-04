import {
  createDefaultMaritimeAdapters,
  createFixtureMaritimeAdapters,
  createMaritimeAreaService,
  type MaritimeAreaService,
  type MaritimeDataAdapter
} from "../adapters.js";
import type { FeedbackInput, FixtureScenarioId, MaritimeReviewInput } from "../contracts.js";
import { createMaritimeSignalApp, type MaritimeSignalApp } from "../signal.js";

export type MaritimeApiService = {
  app: MaritimeSignalApp;
};

export type MaritimeApiServiceOptions = {
  app?: MaritimeSignalApp;
  areas?: MaritimeAreaService;
  adapters?: MaritimeDataAdapter[];
  fixtureId?: FixtureScenarioId;
  now?: () => Date;
};

export function createMaritimeApiService(options: MaritimeApiServiceOptions = {}): MaritimeApiService {
  if (options.app) return { app: options.app };
  return {
    app: createMaritimeSignalApp({
      areas: options.areas ?? createMaritimeAreaService(),
      adapters: options.adapters ?? (options.fixtureId ? createFixtureMaritimeAdapters(options.fixtureId) : createDefaultMaritimeAdapters({ now: options.now })),
      now: options.now
    })
  };
}

export async function searchAreas(service: MaritimeApiService, query: string) {
  return service.app.searchAreas(query);
}

export async function getAreaGuide(service: MaritimeApiService, areaId: string, fixtureId?: FixtureScenarioId) {
  return service.app.getGuide(areaId, { fixtureId });
}

export async function getGuideDetails(service: MaritimeApiService, briefingId: string) {
  return service.app.getGuideDetails(briefingId);
}

export async function listGuideSources(service: MaritimeApiService, briefingId: string) {
  return service.app.listSources(briefingId);
}

export async function submitFeedback(service: MaritimeApiService, input: FeedbackInput) {
  return service.app.submitFeedback(input);
}

export async function reviewGuide(service: MaritimeApiService, input: MaritimeReviewInput) {
  return service.app.reviewGuide(input);
}
