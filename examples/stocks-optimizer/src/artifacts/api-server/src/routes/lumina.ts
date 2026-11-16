import type { NextFunction, Request, Response } from "express";
import { Router } from "express";
import { fromNodeHeaders } from "better-auth/node";
import { z } from "zod";
import { ApiProblem } from "../observability/signal-http.js";
import { getLuminaAuth, luminaConfigured, luminaMailReady } from "../lib/lumina-auth.js";
import { getLuminaMarketQuote, LUMINA_MARKETS, luminaSymbol } from "../lib/lumina-market.js";
import { luminaAssistantReply } from "../lib/lumina-assistant.js";
import {
  addGoal, addPractice, addConversation, appendMessages, clearPractice,
  deleteGoal, eraseLuminaData, listConversations, listGoals, listMessages,
  listPractice, luminaDb, removeConversation, removePractice, updateGoal,
} from "../lib/lumina-store.js";
import {
  addMarketWatch, deleteMarketWatch, evaluateWatchesOnVisit, listInbox,
  listMarketWatches, setInboxState,
} from "../lib/lumina-watches.js";

const router = Router();
type Handler = (req: Request, res: Response) => Promise<unknown>;
const run = (fn: Handler) => async (req: Request, res: Response, next: NextFunction) => {
  try { await fn(req, res); } catch (error) {
    if (error instanceof z.ZodError) {
      next(new ApiProblem(400, "invalid_input", "Please check the information you entered.",
        error.issues.map((item) => ({ field: item.path.join("."), message: item.message }))));
    } else { next(error); }
  }
};
const GoalInput = z.object({
  title: z.string().trim().min(1).max(160),
  targetAmount: z.number().finite().nonnegative().max(1_000_000_000).nullable().optional(),
  targetDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  description: z.string().trim().max(1600).optional(),
}).strict();
const PracticeInput = z.object({
  amount: z.number().finite().min(100).max(10_000_000),
  exposedPercent: z.number().int().min(0).max(100).multipleOf(5),
  goal: z.string().trim().min(1).max(160),
  goalId: z.string().uuid().nullable().optional(),
  horizon: z.enum(["soon", "middle", "later", "unsure"]).nullable().optional(),
  rationale: z.string().trim().max(1000).optional(),
}).strict();
const ConversationInput = z.object({
  title: z.string().trim().min(1).max(160).default("A thought"),
}).strict();
const ReplyInput = z.object({ message: z.string().trim().min(1).max(2000), useAi: z.boolean().optional().default(false) }).strict();
const WatchInput = z.object({
  symbol: z.enum(["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT"]),
  direction: z.enum(["above", "below"]),
  threshold: z.number().positive().finite().max(10_000_000),
}).strict();
const ActionInput = z.object({ action: z.enum(["seen", "resolved"]) }).strict();

function owner(req: Request): string {
  const id = (req as Request & { luminaOwner?: string }).luminaOwner;
  if (!id) throw new ApiProblem(401, "unauthenticated", "Sign in to continue.");
  return id;
}
async function requireAccount(req: Request, res: Response, next: NextFunction) {
  try {
    const session = await getLuminaAuth().api.getSession({
      headers: fromNodeHeaders(req.headers),
    });
    if (!session?.user?.id) {
      res.status(401).json({ error: { code: "unauthenticated", message: "Sign in to continue." } });
      return;
    }
    (req as Request & { luminaOwner?: string }).luminaOwner = session.user.id;
    res.setHeader("Cache-Control", "private, no-store");
    next();
  } catch (error) { next(error); }
}

function protectMutation(req: Request, res: Response, next: NextFunction) {
  const site = String(req.headers["sec-fetch-site"] ?? "");
  if (site === "cross-site") {
    res.status(403).json({ error: { code: "forbidden_origin" } });
    return;
  }
  const origin = req.headers.origin;
  if (origin) {
    let allowed = false;
    try {
      const parsed = new URL(origin);
      const ownHost = String(req.headers["x-forwarded-host"] ?? req.headers.host ?? "").split(",")[0].trim();
      const others = (process.env.LUMINA_AUTH_TRUSTED_ORIGINS ?? "").split(",").map((item) => item.trim());
      allowed = parsed.host === ownHost || others.includes(parsed.origin);
      if (process.env.NODE_ENV !== "production" && (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1")) allowed = true;
    } catch { allowed = false; }
    if (!allowed) {
      res.status(403).json({ error: { code: "forbidden_origin" } });
      return;
    }
  }
  next();
}
router.use((req, res, next) => {
  if (["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) return protectMutation(req, res, next);
  next();
});

// Public capabilities are honest about what has actually been configured.
router.get("/lumina/capabilities", (_req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.json({
    app: "lumina",
    auth: luminaConfigured(),
    registrationReady: luminaConfigured() && (process.env.NODE_ENV !== "production" || luminaMailReady()),
    persistentData: Boolean(process.env.DATABASE_URL),
    ai: Boolean(process.env.OPENAI_API_KEY),
    aiModel: process.env.OPENAI_API_KEY ? (process.env.LUMINA_OPENAI_MODEL || "gpt-6-luna") : null,
    tradingView: { type: "official-widget", source: "TradingView-hosted display", dataApi: false },
    marketQuotes: "Binance Spot public",
    quoteFreshnessLimitSeconds: 120,
    connectedBroker: false,
    realExecution: false,
    backgroundMonitoring: false,
    practiceMode: true,
  });
});

router.get("/lumina/market", run(async (req, res) => {
  const symbol = luminaSymbol(req.query.symbol ?? "BTCUSDT");
  if (!symbol) throw new ApiProblem(400, "unsupported_market", "Choose a supported market.");
  res.setHeader("Cache-Control", "no-store");
  res.json(await getLuminaMarketQuote(symbol));
}));
router.get("/lumina/markets", (_req, res) => {
  res.json({ symbols: LUMINA_MARKETS });
});

router.get("/lumina/me", requireAccount, run(async (req, res) => {
  const session = await getLuminaAuth().api.getSession({ headers: fromNodeHeaders(req.headers) });
  res.json({ user: { id: session!.user.id, email: session!.user.email, name: session!.user.name } });
}));
router.use("/lumina", requireAccount);

router.get("/lumina/goals", run(async (req, res) => res.json({ goals: await listGoals(owner(req)) })));
router.post("/lumina/goals", run(async (req, res) => {
  const data = GoalInput.parse(req.body);
  res.status(201).json({ goal: await addGoal(owner(req), data) });
}));
router.put("/lumina/goals/:id", run(async (req, res) => {
  const updated = await updateGoal(owner(req), String(req.params.id), GoalInput.parse(req.body));
  if (!updated) throw new ApiProblem(404, "goal_not_found", "Goal not found.");
  res.json({ goal: updated });
}));
router.delete("/lumina/goals/:id", run(async (req, res) => {
  const deleted = await deleteGoal(owner(req), String(req.params.id));
  res.status(deleted ? 204 : 404).end();
}));

router.get("/lumina/practice", run(async (req, res) => res.json({ choices: await listPractice(owner(req)) })));
router.post("/lumina/practice", run(async (req, res) => {
  const data = PracticeInput.parse(req.body);
  res.status(201).json({ choice: await addPractice(owner(req), data) });
}));
router.delete("/lumina/practice", run(async (req, res) => {
  res.json({ removed: await clearPractice(owner(req)) });
}));
router.delete("/lumina/practice/:id", run(async (req, res) => {
  const deleted = await removePractice(owner(req), String(req.params.id));
  res.status(deleted ? 204 : 404).end();
}));

router.get("/lumina/conversations", run(async (req, res) => {
  res.json({ conversations: await listConversations(owner(req)) });
}));
router.post("/lumina/conversations", run(async (req, res) => {
  const data = ConversationInput.parse(req.body ?? {});
  res.status(201).json({ conversation: await addConversation(owner(req), data.title) });
}));
router.get("/lumina/conversations/:id/messages", run(async (req, res) => {
  const id = String(req.params.id);
  const owned = await luminaDb().query(
    "SELECT id FROM lumina_conversations WHERE id=$1 AND owner_id=$2", [id, owner(req)],
  );
  if (!owned.rowCount) throw new ApiProblem(404, "conversation_not_found", "Conversation not found.");
  res.json({ messages: await listMessages(owner(req), id) });
}));
router.delete("/lumina/conversations/:id", run(async (req, res) => {
  const deleted = await removeConversation(owner(req), String(req.params.id));
  res.status(deleted ? 204 : 404).end();
}));

router.post("/lumina/conversations/:id/reply", run(async (req, res) => {
  const data = ReplyInput.parse(req.body);
  const userId = owner(req);
  const conversationId = String(req.params.id);
  const past = await listMessages(userId, conversationId);
  if (past.length >= 200) throw new ApiProblem(409, "conversation_full", "Start a new thought to continue.");
  const recentCount = await luminaDb().query(
    "SELECT count(*)::integer AS count FROM lumina_messages WHERE owner_id=$1" +
    " AND role='user' AND created_at > now()-interval '5 minutes'", [userId],
  );
  if (Number(recentCount.rows[0]?.count ?? 0) >= 12)
    throw new ApiProblem(429, "conversation_rate_limited", "You've reached the conversation limit. Try again later.");

  const goals = await listGoals(userId);
  const intent = data.message.match(/\b(bitcoin|btc|ethereum|eth|solana|sol)\b/i);
  const symbol = intent && /eth/i.test(intent[0]) ? "ETHUSDT"
    : intent && /sol/i.test(intent[0]) ? "SOLUSDT" : "BTCUSDT";
  const quote = await getLuminaMarketQuote(symbol);
  const ai = data.useAi ? await luminaAssistantReply({
    userId, message: data.message, goalContext: goals.map((g) => ({
      title: g.title, targetAmount: g.targetAmount, targetDate: g.targetDate,
    })),
    marketContext: quote,
    history: past.slice(-8),
  }).catch(() => null) : null;

  const assistantText = ai?.text ?? (
    "I can help you explore this without rushing into a decision. " +
    (goals.length ? "We can keep your goals in view as we compare choices. " : "What would you like your money to make possible? ") +
    "The AI conversation isn't configured, enabled, or available right now. You can still save goals, explore Practice, and inspect verified public prices."
  );
  const records = await appendMessages(userId, conversationId, [
    { role: "user", content: data.message, provenance: "user-provided" },
    { role: "assistant", content: assistantText, provenance: ai ? "ai-generated" : "illustrative" },
  ]);
  res.json({
    messages: records, ai: Boolean(ai),
    priceEvidence: { symbol: quote.symbol, status: quote.status, quoteAt: quote.quoteAt, source: quote.provider },
  });
}));

router.get("/lumina/watches", run(async (req, res) => {
  res.json({ watches: await listMarketWatches(owner(req)) });
}));
router.post("/lumina/watches", run(async (req, res) => {
  const input = WatchInput.parse(req.body);
  res.status(201).json({ watch: await addMarketWatch(owner(req), input) });
}));
router.delete("/lumina/watches/:id", run(async (req, res) => {
  const deleted = await deleteMarketWatch(owner(req), String(req.params.id));
  res.status(deleted ? 204 : 404).end();
}));

router.get("/lumina/inbox", run(async (req, res) => {
  if (req.query.check === "true") {
    const watches = await listMarketWatches(owner(req));
    const symbols = Array.from(new Set(watches.filter((watch) => watch.active).map((watch) => watch.symbol)));
    const quotes: Record<string, { price: number | null; status: string; quoteAt: string | null }> = {};
    await Promise.all(symbols.map(async (symbol) => { quotes[symbol] = await getLuminaMarketQuote(symbol); }));
    await evaluateWatchesOnVisit(owner(req), quotes);
  }
  res.json({
    events: await listInbox(owner(req)),
    monitoring: "checked-on-visit",
    pushNotifications: false,
  });
}));
router.patch("/lumina/inbox/:id", run(async (req, res) => {
  const action = ActionInput.parse(req.body);
  const updated = await setInboxState(owner(req), String(req.params.id), action.action);
  if (!updated) throw new ApiProblem(404, "inbox_item_not_found", "Event not found.");
  res.json({ ok: true });
}));

router.delete("/lumina/my-data", run(async (req, res) => {
  await eraseLuminaData(owner(req));
  res.json({ ok: true, scope: "lumina_app_data_only", note: "The auth account and necessary security records remain." });
}));

export default router;
