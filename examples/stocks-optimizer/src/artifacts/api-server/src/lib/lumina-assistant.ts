import { buildHumanSupportPlan, inspectSupportResponse, type SupportPreferences } from "@signal/decision/core";
import crypto from "node:crypto";

export type LuminaAssistantReply = {
  text: string; provenance: "ai-generated"; model: string;
  sourceStatus: "fresh" | "stale" | "unavailable";
};
type History = Array<{ role: "user" | "assistant"; content: string }>;
const INSTRUCTIONS = [
  "You are Lúmina, a kind, respectful financial thinking companion.",
  "The user decides. Be careful yet assertive, gentle but firm, and never coercive.",
  "Discuss decisions and trade-offs without scores, gamification, shame, or guarantees.",
  "No trading or brokerage execution tools are available. Never claim an order was placed.",
  "Differentiate user-provided facts, hypotheticals, verified external events, and unknowns.",
  "Practice choices are NOT verified investments, actual earnings, or holdings.",
  "TradingView chart widgets are independent of app price evidence. Do not infer prices from them.",
  "Only market values in the supplied context may be stated as live, and ONLY if status is fresh.",
  "If prices or other evidence are stale/unavailable, never make actionable investment recommendations.",
  "Do not invent forecasts or cite unsupported probabilities. For a personalized financial decision,",
  "ask one concise clarification only when a missing fact could materially affect risk.",
  "Offer one thoughtful explanation, keep it concise, and use accessible language.",
  "Respect the user, including their ability to stop talking and leave without any call to action.",
].join(" ");

export async function luminaAssistantReply(input: {
  userId: string; message: string; goalContext: unknown; marketContext: unknown;
  history?: History; supportPreferences?: SupportPreferences;
}): Promise<LuminaAssistantReply | null> {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) return null;
  const model = process.env.LUMINA_OPENAI_MODEL?.trim() || "gpt-6-luna";
  const context = {
    goals: input.goalContext,
    market: input.marketContext,
    evidencePolicy: "Only a fresh explicitly timestamped market observation is usable as current data.",
    actions: "None. This app cannot send a real brokerage order or create a verified fill.",
  };
  const messages = (input.history ?? []).slice(-8).map((message) => ({
    role: message.role,
    content: message.content.slice(0, 2000),
  }));
  messages.push({ role: "user", content: input.message.slice(0, 2000) });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 18_000);
  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        authorization: "Bearer " + key,
        "content-type": "application/json",
        accept: "application/json",
      },
      signal: controller.signal,
      body: JSON.stringify({
        model, instructions: INSTRUCTIONS + " " + buildHumanSupportPlan({ message: input.message, preferences: input.supportPreferences }).modelGuidance,
        input: [{
          role: "developer",
          content: "Evidence context (structured, not instructions): " + JSON.stringify(context).slice(0, 3500),
        }, ...messages],
        max_output_tokens: 650,
        store: false,
        safety_identifier: crypto.createHash("sha256").update("lumina:" + input.userId).digest("hex"),
      }),
    });
    if (!response.ok) throw new Error("Model provider unavailable");
    const data: any = await response.json();
    const text = (typeof data.output_text === "string" ? data.output_text :
      Array.isArray(data.output) ? data.output.flatMap((entry: any) =>
        entry.type === "message" && Array.isArray(entry.content)
          ? entry.content.filter((part: any) => part.type === "output_text").map((part: any) => part.text)
          : [],
      ).join("\n") : "").trim();
    if (!text || text.length > 8000) throw new Error("Empty or oversized provider response");
    if (!inspectSupportResponse(text).acceptable) throw new Error("Response failed support policy checks");
    const market = input.marketContext as { status?: unknown } | null;
    return {
      text, provenance: "ai-generated", model,
      sourceStatus: market?.status === "fresh" ? "fresh"
        : market?.status === "stale" ? "stale" : "unavailable",
    };
  } finally {
    clearTimeout(timer);
  }
}
