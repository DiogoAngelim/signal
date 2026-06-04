import type { FixtureScenarioId } from "../contracts.js";
import {
  createMaritimeApiService,
  getAreaGuide,
  getGuideDetails,
  listGuideSources,
  reviewGuide,
  searchAreas,
  submitFeedback,
  type MaritimeApiService
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

export type MaritimeApiResponse<T> = ApiSuccess<T> | ApiFailure;

export async function handleMaritimeApiRequest(
  request: Request,
  service: MaritimeApiService = createMaritimeApiService()
): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, "");
  try {
    if (request.method === "GET" && path === "/api/areas/search") {
      const query = url.searchParams.get("q") ?? "";
      return json({ ok: true, data: { areas: await searchAreas(service, query) } });
    }

    const areaGuideMatch = path.match(/^\/api\/areas\/([^/]+)\/guide$/);
    if (request.method === "GET" && areaGuideMatch?.[1]) {
      const areaId = decodeURIComponent(areaGuideMatch[1]);
      if (!service.app.areas.get(areaId)) {
        return json(error("NOT_FOUND", "Maritime area was not found."), 404);
      }
      const fixture = fixtureFromQuery(url.searchParams.get("fixture"));
      const briefing = await getAreaGuide(service, areaId, fixture);
      return json({ ok: true, data: { briefing } });
    }

    const guideSourcesMatch = path.match(/^\/api\/guides\/([^/]+)\/sources$/);
    if (request.method === "GET" && guideSourcesMatch?.[1]) {
      const briefingId = decodeURIComponent(guideSourcesMatch[1]);
      const result = await listGuideSources(service, briefingId);
      if (!result.found) return json(error("NOT_FOUND", "Guide was not found."), 404);
      return json({ ok: true, data: result });
    }

    const guideMatch = path.match(/^\/api\/guides\/([^/]+)$/);
    if (request.method === "GET" && guideMatch?.[1]) {
      const briefingId = decodeURIComponent(guideMatch[1]);
      const result = await getGuideDetails(service, briefingId);
      if (!result.found) return json(error("NOT_FOUND", "Guide was not found."), 404);
      return json({ ok: true, data: result });
    }

    if (request.method === "POST" && path === "/api/feedback") {
      const body = await readJson(request);
      const idempotencyKey = request.headers.get("Idempotency-Key") ?? stringField(body, "idempotencyKey");
      const feedback = await submitFeedback(service, {
        briefingId: stringField(body, "briefingId") ?? "",
        riskId: stringField(body, "riskId"),
        helpful: Boolean(body["helpful"]),
        comment: stringField(body, "comment"),
        idempotencyKey
      });
      return json({ ok: true, data: { feedback } }, 201);
    }

    if (request.method === "POST" && path === "/api/reviews") {
      const body = await readJson(request);
      const idempotencyKey = request.headers.get("Idempotency-Key") ?? stringField(body, "idempotencyKey");
      const review = await reviewGuide(service, {
        briefingId: stringField(body, "briefingId") ?? "",
        classification: reviewClassification(body["classification"]),
        whatHappened: stringField(body, "whatHappened"),
        lesson: stringField(body, "lesson"),
        idempotencyKey
      });
      return json({ ok: true, data: { review } }, 201);
    }

    return json(error("NOT_FOUND", "Maritime Aware API route was not found."), 404);
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "Maritime Aware API request failed.";
    return json(error("REQUEST_FAILED", message), 500);
  }
}

function json<T>(body: MaritimeApiResponse<T>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}

function error(code: string, message: string): ApiFailure {
  return {
    ok: false,
    error: { code, message }
  };
}

async function readJson(request: Request): Promise<Record<string, unknown>> {
  const value = await request.json().catch(() => ({}));
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function stringField(body: Record<string, unknown>, key: string): string | undefined {
  const value = body[key];
  return typeof value === "string" && value.trim() ? value : undefined;
}

function fixtureFromQuery(value: string | null): FixtureScenarioId | undefined {
  if (
    value === "steady-harbor"
    || value === "rough-sea"
    || value === "busy-port"
    || value === "environment-watch"
    || value === "route-conflict"
    || value === "stale-evidence"
    || value === "custom-area"
  ) {
    return value;
  }
  return undefined;
}

function reviewClassification(value: unknown) {
  if (
    value === "useful"
    || value === "too_cautious"
    || value === "too_confident"
    || value === "missed_context"
    || value === "inconclusive"
  ) {
    return value;
  }
  return undefined;
}
