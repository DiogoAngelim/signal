/**
 * Real HTTP + PostgreSQL integration exercise. Run only in isolated CI after
 * both Lúmina and Better Auth migrations. No real external services required.
 *
 * Run: pnpm --filter @workspace/api-server exec tsx src/tests/lumina-http.integration.ts
 */
import assert from "node:assert/strict";
import { createServer } from "node:http";
import app from "../app.js";

if (!process.env.DATABASE_URL || !process.env.BETTER_AUTH_SECRET) {
  throw new Error("Isolated DATABASE_URL and BETTER_AUTH_SECRET are required.");
}
const server = createServer(app);
await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
const address = server.address();
if (!address || typeof address === "string") throw Error("No local address");
const base = "http://127.0.0.1:" + address.port;
process.env.BETTER_AUTH_URL = base;
process.env.LUMINA_REQUIRE_EMAIL_VERIFICATION = "false";

type Http = { status: number; json: any; cookie: string };
async function request(
  path: string,
  options: { method?: string; body?: unknown; cookie?: string } = {},
): Promise<Http> {
  const response = await fetch(base + path, {
    method: options.method ?? "GET",
    headers: {
      origin: base,
      accept: "application/json",
      ...(options.body !== undefined ? { "content-type": "application/json" } : {}),
      ...(options.cookie ? { cookie: options.cookie } : {}),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    redirect: "manual",
  });
  const json = await response.json().catch(() => ({}));
  const cookies = response.headers.getSetCookie().map((value) => value.split(";")[0]).join("; ");
  return { status: response.status, json, cookie: cookies };
}
function assertStatus(actual: Http, expected: number, context: string) {
  assert.equal(actual.status, expected, context + ": " + JSON.stringify(actual.json).slice(0, 400));
}
async function signup(email: string) {
  const r = await request("/api/auth/sign-up/email", {
    method: "POST", body: {
      name: "Lúmina Test Account", email,
      password: "test-only-unique-password#2026",
    },
  });
  assertStatus(r, 200, "sign up");
  assert.ok(r.cookie, "sign-up must set a secure server-managed session cookie");
  return r.cookie;
}

try {
  const capabilities = await request("/api/lumina/capabilities");
  assertStatus(capabilities, 200, "capabilities");
  assert.equal(capabilities.json.auth, true);
  assert.equal(capabilities.json.realExecution, false);
  assert.equal(capabilities.json.connectedBroker, false);
  assert.equal(capabilities.json.practiceMode, true);
  const anonymous = await request("/api/lumina/goals");
  assertStatus(anonymous, 401, "private goals require authentication");

  const suffix = Date.now() + "-" + Math.floor(Math.random() * 100000);
  const alice = await signup("alice-" + suffix + "@example.org");
  const bob = await signup("bob-" + suffix + "@example.org");
  const first = await request("/api/lumina/goals", {
    method: "POST", cookie: alice,
    body: { title: "Buy a home", targetAmount: 100000, targetDate: "2030-12-01" },
  });
  assertStatus(first, 201, "save private goal");
  const goalId = first.json.goal.id;
  assert.ok(goalId);
  assert.equal(first.json.goal.targetDate, "2030-12-01", "create preserves the civil date");

  const aGoals = await request("/api/lumina/goals", { cookie: alice });
  assertStatus(aGoals, 200, "read own goals");
  assert.equal(aGoals.json.goals.some((item: any) => item.id === goalId), true);
  assert.equal(aGoals.json.goals.find((item: any) => item.id === goalId).targetDate, "2030-12-01");
  const updated = await request("/api/lumina/goals/" + goalId, {
    method: "PUT", cookie: alice,
    body: { title: "Buy a home", targetAmount: 100000, targetDate: "2031-03-30" },
  });
  assertStatus(updated, 200, "update private goal");
  assert.equal(updated.json.goal.targetDate, "2031-03-30", "update preserves the civil date");
  const restoredGoals = await request("/api/lumina/goals", { cookie: alice });
  assert.equal(restoredGoals.json.goals.find((item: any) => item.id === goalId).targetDate, "2031-03-30");
  const bGoals = await request("/api/lumina/goals", { cookie: bob });
  assertStatus(bGoals, 200, "read other user's goals");
  assert.equal(bGoals.json.goals.some((item: any) => item.id === goalId), false);
  const attempt = await request("/api/lumina/goals/" + goalId, {
    method: "DELETE", cookie: bob,
  });
  assertStatus(attempt, 404, "other user cannot delete a goal");

  const practice = await request("/api/lumina/practice", {
    method: "POST", cookie: alice,
    body: { amount: 5000, exposedPercent: 30, goal: "your home", goalId,
      horizon: "middle", rationale: "Exploring the trade-off" },
  });
  assertStatus(practice, 201, "save Practice");
  assert.equal(practice.json.choice.provenance, "illustrative");
  assert.equal(practice.json.choice.executed, false);
  const invalid = await request("/api/lumina/practice", {
    method: "POST", cookie: alice,
    body: { amount: 5000, exposedPercent: 30, goal: "your home", executed: true },
  });
  assertStatus(invalid, 400, "no way to submit executed true");
  const bPractice = await request("/api/lumina/practice", { cookie: bob });
  assertStatus(bPractice, 200, "other user's Practice");
  assert.equal(bPractice.json.choices.length, 0);

  const conversation = await request("/api/lumina/conversations", {
    method: "POST", cookie: alice, body: { title: "One calm thought" },
  });
  assertStatus(conversation, 201, "create conversation");
  const conversationId = conversation.json.conversation.id;
  const inaccessible = await request(
    "/api/lumina/conversations/" + conversationId + "/messages", { cookie: bob },
  );
  assertStatus(inaccessible, 404, "other user cannot read messages");
  const reply = await request("/api/lumina/conversations/" + conversationId + "/reply", {
    method: "POST", cookie: alice,
    body: { message: "Could we explore what matters for buying a home?" },
  });
  assertStatus(reply, 200, "persist honest assistant conversation");
  assert.equal(reply.json.messages.length, 2);
  assert.equal(reply.json.messages[0].provenance, "user-provided");
  assert.equal(reply.json.messages[1].provenance, "illustrative");
  assert.match(reply.json.messages[1].content, /AI conversation isn't configured|AI conversation isn't configured or available/);

  const account = await request("/api/lumina/me", { cookie: alice });
  assertStatus(account, 200, "restore authenticated account across requests");
  assert.equal(account.json.user.email, "alice-" + suffix + "@example.org");
  const history = await request(
    "/api/lumina/conversations/" + conversationId + "/messages", { cookie: alice },
  );
  assert.equal(history.json.messages.length, 2);

  const supportReply = await request("/api/lumina/conversations/" + conversationId + "/reply", {
    method: "POST", cookie: alice, body: { message: "Estou confuso", useAi: true,
      supportPreferences: { mode: "step-by-step", locale: "pt-BR", adaptToExplicitCues: true } },
  });
  assertStatus(supportReply, 200, "deterministic support without a configured provider");
  assert.equal(supportReply.json.ai, false);
  assert.match(supportReply.json.messages[1].content, /Podemos separar/);
  assert.equal(Object.hasOwn(supportReply.json, "emotionalProfile"), false);
  const malformedSupport = await request("/api/lumina/conversations/" + conversationId + "/reply", {
    method: "POST", cookie: alice, body: { message: "hello", supportPreferences: {
      mode: "direct", locale: "en", adaptToExplicitCues: true, diagnosis: "fabricated" } },
  });
  assertStatus(malformedSupport, 400, "unrecognized profile fields are rejected");
  const otherOwner = await request("/api/lumina/conversations/" + conversationId + "/reply", {
    method: "POST", cookie: bob, body: { message: "I am worried" },
  });
  assertStatus(otherOwner, 404, "support cannot cross conversation ownership");
  const disabled = await request("/api/lumina/conversations/" + conversationId + "/reply", {
    method: "POST", cookie: alice, body: { message: "I am worried", supportPreferences: {
      mode: "direct", locale: "en", adaptToExplicitCues: false } },
  });
  assertStatus(disabled, 200, "direct opt-out survives the API boundary");
  assert.match(disabled.json.messages[1].content, /AI conversation isn't configured/);
  const erase = await request("/api/lumina/my-data", { method: "DELETE", cookie: alice });
  assertStatus(erase, 200, "erase personal app data");
  const erased = await request("/api/lumina/practice", { cookie: alice });
  assert.equal(erased.json.choices.length, 0);
  const erasedGoals = await request("/api/lumina/goals", { cookie: alice });
  assert.equal(erasedGoals.json.goals.length, 0);
  const stillSignedIn = await request("/api/lumina/me", { cookie: alice });
  assertStatus(stillSignedIn, 200, "account retained when app data deleted");
  console.info("Lúmina integration passed: auth → owner-scoped data → Practice → chat → delete");
} finally {
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}
