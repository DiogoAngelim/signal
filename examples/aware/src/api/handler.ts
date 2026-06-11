import type { FixtureScenarioId } from "../contracts.js";
import {
  type AwareApiService,
  createAwareApiService,
  getBriefingDetails,
  getRegionBriefing,
  listBriefingSources,
  searchRegions,
  submitFeedback,
} from "./service.js";

type ApiSuccess<T> = {
  ok: true;
  data: T;
};

type ApiFailure = {
  ok: false;
  error: {
    code: string;
    message: string;
  };
};

export type AwareApiResponse<T> = ApiSuccess<T> | ApiFailure;

export async function handleAwareApiRequest(
  request: Request,
  service: AwareApiService = createAwareApiService(),
): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, "");
  try {
    if (request.method === "GET" && path === "/api/regions/search") {
      const query = url.searchParams.get("q") ?? "";
      return json({
        ok: true,
        data: { regions: await searchRegions(service, query) },
      });
    }

    const regionBriefingMatch = path.match(
      /^\/api\/regions\/([^/]+)\/briefing$/,
    );
    if (request.method === "GET" && regionBriefingMatch?.[1]) {
      const regionId = decodeURIComponent(regionBriefingMatch[1]);
      if (!service.app.regions.get(regionId)) {
        return json(error("NOT_FOUND", "Region was not found."), 404);
      }
      const fixture = fixtureFromQuery(url.searchParams.get("fixture"));
      const briefing = await getRegionBriefing(service, regionId, fixture);
      return json({ ok: true, data: { briefing } });
    }

    const briefingSourcesMatch = path.match(
      /^\/api\/briefings\/([^/]+)\/sources$/,
    );
    if (request.method === "GET" && briefingSourcesMatch?.[1]) {
      const briefingId = decodeURIComponent(briefingSourcesMatch[1]);
      const result = await listBriefingSources(service, briefingId);
      if (!result.found)
        return json(error("NOT_FOUND", "Briefing was not found."), 404);
      return json({ ok: true, data: result });
    }

    const briefingMatch = path.match(/^\/api\/briefings\/([^/]+)$/);
    if (request.method === "GET" && briefingMatch?.[1]) {
      const briefingId = decodeURIComponent(briefingMatch[1]);
      const result = await getBriefingDetails(service, briefingId);
      if (!result.found)
        return json(error("NOT_FOUND", "Briefing was not found."), 404);
      return json({ ok: true, data: result });
    }

    if (request.method === "POST" && path === "/api/feedback") {
      const body = await readJson(request);
      const idempotencyKey =
        request.headers.get("Idempotency-Key") ??
        stringField(body, "idempotencyKey");
      const feedback = await submitFeedback(service, {
        briefingId: stringField(body, "briefingId") ?? "",
        itemId: stringField(body, "itemId"),
        helpful: Boolean(body.helpful),
        comment: stringField(body, "comment"),
        idempotencyKey,
      });
      return json({ ok: true, data: { feedback } }, 201);
    }

    return json(error("NOT_FOUND", "Aware API route was not found."), 404);
  } catch (caught) {
    const message =
      caught instanceof Error ? caught.message : "Aware API request failed.";
    return json(error("REQUEST_FAILED", message), 500);
  }
}

function json<T>(body: AwareApiResponse<T>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function error(code: string, message: string): ApiFailure {
  return {
    ok: false,
    error: { code, message },
  };
}

async function readJson(request: Request): Promise<Record<string, unknown>> {
  const value = await request.json().catch(() => ({}));
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringField(
  body: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = body[key];
  return typeof value === "string" && value.trim() ? value : undefined;
}

function fixtureFromQuery(value: string | null): FixtureScenarioId | undefined {
  if (
    value === "normal-day" ||
    value === "strong-uv-day" ||
    value === "heat-warning-day" ||
    value === "heavy-rain-flood-risk-day" ||
    value === "poor-air-quality-day" ||
    value === "mosquito-activity-warning" ||
    value === "multiple-simultaneous-risks" ||
    value === "source-unavailable"
  ) {
    return value;
  }
  return undefined;
}
