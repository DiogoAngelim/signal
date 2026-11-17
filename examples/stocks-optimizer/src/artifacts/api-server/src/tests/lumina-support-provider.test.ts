import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { luminaAssistantReply } from "../lib/lumina-assistant.js";
const originalFetch = globalThis.fetch;
const originalKey = process.env.OPENAI_API_KEY;
const originalModel = process.env.LUMINA_OPENAI_MODEL;
afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = originalKey;
  if (originalModel === undefined) delete process.env.LUMINA_OPENAI_MODEL; else process.env.LUMINA_OPENAI_MODEL = originalModel;
});
const input = { userId: "synthetic-owner", message: "Explain the trade-off", goalContext: [], marketContext: { status: "unavailable" } };
describe("Lumina shared support provider boundary", () => {
  it("uses no external model when no key is configured", async () => {
    delete process.env.OPENAI_API_KEY;
    globalThis.fetch = async () => { throw new Error("unexpected network"); };
    assert.equal(await luminaAssistantReply(input), null);
  });
  it("carries explicit preferences without granting tools or storing provider output", async () => {
    process.env.OPENAI_API_KEY = "synthetic-local-test-only";
    process.env.LUMINA_OPENAI_MODEL = "test-model";
    let sent: Record<string, unknown> = {};
    globalThis.fetch = async (_url, options) => {
      sent = JSON.parse(String(options?.body));
      return new Response(JSON.stringify({ output_text: "Podemos comparar os fatos. Nenhuma compra foi feita." }), { status: 200 });
    };
    const result = await luminaAssistantReply({ ...input, supportPreferences: { mode: "direct", locale: "pt-BR", adaptToExplicitCues: false } });
    assert.equal(sent.store, false);
    assert.equal(sent.model, "test-model");
    assert.equal(Object.hasOwn(sent, "tools"), false);
    assert.match(String(sent.instructions), /direct language/);
    assert.match(String(sent.instructions), /adaptation is disabled/);
    assert.match(String(sent.instructions), /Brazilian Portuguese/);
    assert.equal(result?.sourceStatus, "unavailable");
  });
  it("rejects known coercive or false-authority output rather than presenting it", async () => {
    process.env.OPENAI_API_KEY = "synthetic-local-test-only";
    for (const output_text of ["Only I understand you", "Act now or lose everything", "I bought Bitcoin", "Guaranteed profit"]) {
      globalThis.fetch = async () => new Response(JSON.stringify({ output_text }), { status: 200 });
      await assert.rejects(() => luminaAssistantReply(input), /support policy/);
    }
  });
  it("does not turn a failed provider into a successful AI response", async () => {
    process.env.OPENAI_API_KEY = "synthetic-local-test-only";
    globalThis.fetch = async () => new Response("unavailable", { status: 503 });
    await assert.rejects(() => luminaAssistantReply(input), /unavailable/);
  });
});
