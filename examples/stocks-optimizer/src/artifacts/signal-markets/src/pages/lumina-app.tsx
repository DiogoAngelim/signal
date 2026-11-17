import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  ArrowUp, Bell, Bookmark, Check, ChevronRight, Compass, History,
  Info, LogOut, Plus, RefreshCw, ShieldCheck, SlidersHorizontal,
  Target, Trash2, X, ChartNoAxesCombined,
} from "lucide-react";
import { formatBRL, resolveGoal, resolveHorizon, resolveMoney, scenario, HORIZON_LABELS, type Horizon } from "@/lib/lumina-journey";
import { readPracticeChoices, writePracticeChoices } from "@/lib/lumina-practice-session";
import {
  luminaApi, type Capabilities, type Conversation, type Goal, type InboxEvent,
  type LuminaUser, type MarketSymbol, type Message, type PracticeRecord, type Watch,
} from "@/lib/lumina-api";
import LuminaAccountPanel from "./lumina-account";
import LuminaMarketPanel from "./lumina-market";
import "./lumina-preview.css";
import "./lumina-app.css";
import "./lumina-support.css";
import { toast } from "@/hooks/use-toast";
import { buildHumanSupportPlan, DEFAULT_SUPPORT_PREFERENCES, describeMeaningfulMoment, shouldUseSupportOnly, parsePracticeAllocation, type HumanSupportPlan, type SupportPreferences } from "@/lib/lumina-human-support";
import { LuminaSupportControls, LuminaSupportExplanation } from "./lumina-support";

type Drawer = "ideas" | "goals" | "thoughts" | "inbox" | "privacy" | null;
type Mode = "conversation" | "practice" | "market";
type GuestChoice = PracticeRecord;
const MAX_GUEST_HISTORY = 25;
const STARTERS = [
  ["Build a future", "I'm thinking about my financial future."],
  ["Explore a possibility", "I have R$ 5,000 to explore."],
  ["Understand Bitcoin", "I'd like to understand Bitcoin."],
] as const;

function LuminaLogo() {
  return (
    <svg viewBox="0 0 32 32" width={25} height={25} fill="none" aria-hidden="true">
      <path d="M5 18c0-7 5.4-12 12-12 5.6 0 10 4.2 10 9.4 0 5.6-4.8 9.6-10.2 9.6-3.6 0-6.8-2.7-6.8-6.4 0-3.1 2.5-5.3 5.4-5.3 2.3 0 4 1.6 4 3.8" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"/>
      <circle cx="23.5" cy="5.2" r="2" fill="currentColor"/>
    </svg>
  );
}
function createdMessage(role: Message["role"], content: string, provenance: Message["provenance"]): Message {
  return {
    id: crypto.randomUUID(), conversationId: "guest",
    role, content, provenance, createdAt: new Date().toISOString(),
  };
}

function LuminaPracticeCard({
  amount, setAmount, exposed, setExposed, goal, setGoal, onSave, saving,
}: {
  amount: number; setAmount: (value: number) => void;
  exposed: number; setExposed: (value: number) => void;
  goal: string; setGoal: (value: string) => void;
  onSave: () => void; saving: boolean;
}) {
  const values = scenario(amount, exposed);
  const [assumptions, setAssumptions] = useState(false);
  return (
    <section className="l-visual l-live-visual" aria-label="Reversible Practice illustration">
      <div className="l-visual-head">
        <div>
          <div className="l-label">Practice · A reversible idea</div>
          <h3>Make room for possibility.<br/>Keep room to breathe.</h3>
        </div>
        <span className="l-concept-tag">Illustration</span>
      </div>
      <p className="l-visual-description">Explore an imaginary allocation. Nothing here changes a real portfolio or executes a trade.</p>
      <div className="l-practice-inputs">
        <label>Amount to explore (BRL)
          <input type="number" min="100" max="10000000" step="100" value={amount}
            onChange={(event) => {
              const number = Number(event.target.value);
              if (Number.isFinite(number) && number >= 100 && number <= 10000000) setAmount(number);
            }} />
        </label>
        <label>What matters
          <select value={goal} onChange={(event) => setGoal(event.target.value)}>
            <option value="your money">Exploring possibilities</option>
            <option value="your future">My future</option>
            <option value="your home">A home</option>
            <option value="your travels">Travel</option>
          </select>
        </label>
      </div>
      <div className="l-split" role="img" aria-label={values.accessiblePercent + "% accessible and " + exposed + "% market-exposed, hypothetical"}>
        <div className={"l-slice l-liquid" + (values.accessiblePercent <= 8 ? " l-minimal" : "")}
          style={{ flexGrow: Math.max(values.accessiblePercent, .1), display: values.accessiblePercent ? undefined : "none" }}>
          <span>Accessible<strong>{values.accessiblePercent}%</strong></span>
        </div>
        <div className={"l-slice l-exposed" + (values.exposedPercent <= 8 ? " l-minimal" : "")}
          style={{ flexGrow: Math.max(values.exposedPercent, .1), display: values.exposedPercent ? undefined : "none" }}>
          <span>Market-exposed<strong>{values.exposedPercent}%</strong></span>
        </div>
      </div>
      <div className="l-slider-heading">
        <label htmlFor="lumina-app-exposure"><strong>Move the balance</strong>Market-exposed portion</label>
        <strong>{exposed}%</strong>
      </div>
      <input id="lumina-app-exposure" className="l-slider" type="range"
        min="0" max="100" step="5" value={exposed}
        onChange={(event) => setExposed(Number(event.target.value))} />
      <div className="l-balances">
        <div className="l-stat"><span>Accessible in the example</span><strong>{formatBRL(values.accessibleValue)}</strong></div>
        <div className="l-stat l-stat-alt"><span>Market-exposed example</span><strong>{formatBRL(values.exposedValue)}</strong></div>
      </div>
      <div className="l-stress">
        <p><strong>If the exposed portion fell 20%…</strong><br/>This simple stress example would show:</p>
        <strong>{values.hypotheticalLoss20 > 0 ? "−" : ""}{formatBRL(values.hypotheticalLoss20)}</strong>
      </div>
      <p className="l-disclaimer">Illustrative stress, not a prediction or return probability. Does not model taxes, fees, inflation, liquidity, or suitability. “Accessible” is not necessarily risk-free.</p>
      <div className="l-actions">
        <button className="l-primary" type="button" disabled={saving} onClick={onSave}>
          <Bookmark size={16}/>{saving ? "Saving…" : "Save this Practice choice"}
        </button>
        <button className="l-secondary" type="button" aria-expanded={assumptions}
          onClick={() => setAssumptions((v) => !v)}>
          <Info size={16}/>What's assumed?
        </button>
      </div>
      {assumptions ? <div className="l-details">
        <p>Only the amount and allocation you selected are known for this illustration. We have not verified your financial position, income, need for liquidity, tax situation, or investment suitability.</p>
        <p>No actual market quotes are used in this diagram. Saving the idea does not create a real holding.</p>
      </div> : null}
    </section>
  );
}

export default function LuminaApp() {
  const [capabilities, setCapabilities] = useState<Capabilities | null>(null);
  const [user, setUser] = useState<LuminaUser | null>(null);
  const [accountOpen, setAccountOpen] = useState(false);
  const [drawer, setDrawer] = useState<Drawer>(null);
  const [mode, setMode] = useState<Mode>("conversation");
  const [selectedMarketSymbol, setSelectedMarketSymbol] = useState<MarketSymbol>("BTCUSDT");
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [aiOptIn, setAiOptIn] = useState(false);
  const noticeRef = useRef<ReturnType<typeof toast> | null>(null);
  const setNotice = useCallback((message: string) => {
    noticeRef.current?.dismiss();
    noticeRef.current = message ? toast({ description: message, duration: 9000 }) : null;
  }, []);
  useEffect(() => () => { noticeRef.current?.dismiss(); }, []);
  const [serverStatus, setServerStatus] = useState<"checking" | "ready" | "unavailable">("checking");
  const [goals, setGoals] = useState<Goal[]>([]);
  const [choices, setChoices] = useState<PracticeRecord[]>([]);
  const [guestChoices, setGuestChoices] = useState<GuestChoice[]>(() =>
    readPracticeChoices().map((choice) => ({ ...choice, goalId: null, rationale: "" })));
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversation, setActiveConversation] = useState<string | null>(null);
  const [thread, setThread] = useState<Message[]>([]);
  const [events, setEvents] = useState<InboxEvent[]>([]);
  const [watches, setWatches] = useState<Watch[]>([]);
  const [goalTitle, setGoalTitle] = useState("");
  const [goalAmount, setGoalAmount] = useState("");
  const [goalDate, setGoalDate] = useState("");
  const [practiceAmount, setPracticeAmount] = useState(5000);
  const [exposure, setExposure] = useState(20);
  const [practiceGoal, setPracticeGoal] = useState("your money");
  const [horizon, setHorizon] = useState<Horizon | null>(null);
  const [awaitingHorizon, setAwaitingHorizon] = useState(false);
  const [confirmErase, setConfirmErase] = useState(false);
  const [persistBusy, setPersistBusy] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [supportPreferences, setSupportPreferences] = useState<SupportPreferences>({ ...DEFAULT_SUPPORT_PREFERENCES });
  const [support, setSupport] = useState<{ plan: HumanSupportPlan; standalone: boolean } | null>(null);
  const thoughtRevision = useRef(0);
  // Account reads must not restore private snapshots after sign-out or erasure.
  const accountRevision = useRef(0);
  useEffect(() => {
    accountRevision.current += 1;
    thoughtRevision.current += 1;
    setSupport(null);
    setSupportPreferences({ ...DEFAULT_SUPPORT_PREFERENCES });
    return () => { accountRevision.current += 1; };
  }, [user?.id]);
  const visibleChoices = user ? choices : guestChoices;
  const hasThread = thread.length > 0;

  useEffect(() => {
    document.title = "Lúmina — your space to think clearly";
    void Promise.allSettled([luminaApi.capabilities(), luminaApi.me()]).then(([caps, session]) => {
      if (caps.status === "fulfilled") {
        setCapabilities(caps.value);
        setServerStatus("ready");
      } else setServerStatus("unavailable");
      if (session.status === "fulfilled") setUser(session.value.user);
    });
  }, []);

  const reloadAccount = useCallback(async () => {
    if (!user) return;
    const revision = accountRevision.current;
    const results = await Promise.allSettled([
      luminaApi.goals(), luminaApi.practice(), luminaApi.conversations(),
      luminaApi.inbox(), luminaApi.watches(),
    ]);
    if (accountRevision.current !== revision) return;
    if (results[0].status === "fulfilled") setGoals(results[0].value.goals);
    if (results[1].status === "fulfilled") setChoices(results[1].value.choices);
    if (results[2].status === "fulfilled") setConversations(results[2].value.conversations);
    if (results[3].status === "fulfilled") setEvents(results[3].value.events);
    if (results[4].status === "fulfilled") setWatches(results[4].value.watches);
    if (results.some((r) => r.status === "rejected"))
      setNotice("Some saved information could not be loaded. Your last visible snapshot may be incomplete.");
  }, [user?.id]);
  useEffect(() => { void reloadAccount(); }, [reloadAccount]);
  // A session may be restored while the account dialog is still open.
  // Reconcile the dialog with the authenticated state, so successful sign-up
  // and cookie-based restoration never leave a sign-in overlay blocking the app.
  useEffect(() => {
    if (user) setAccountOpen(false);
  }, [user?.id]);
  useEffect(() => {
    if (hasThread) bottomRef.current?.scrollIntoView?.({
      behavior: typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
      block: "nearest",
    });
  }, [thread.length, mode]);
  useEffect(() => {
    if (!drawer && !accountOpen) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setDrawer(null); setAccountOpen(false); }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [drawer, accountOpen]);

  function startThought() {
    thoughtRevision.current += 1;
    setBusy(false);
    setSupport(null); setSupportPreferences({ ...DEFAULT_SUPPORT_PREFERENCES });
    setMode("conversation"); setThread([]); setActiveConversation(null);
    setDraft(""); setNotice("");
    setAwaitingHorizon(false); setHorizon(null);
    setDrawer(null);
  }
  function updateExposure(value: number) { setExposure(Math.min(100, Math.max(0, value))); }
  function showPractice(text?: string) {
    if (text) {
      const money = resolveMoney(text);
      if (money !== null) setPracticeAmount(money);
      setPracticeGoal(resolveGoal(text));
      setHorizon(resolveHorizon(text) ?? "unsure");
    }
    setAwaitingHorizon(false);
    setMode("practice"); setDrawer(null); setNotice("");
  }
  function showMarket(symbol?: MarketSymbol) {
    if (symbol) setSelectedMarketSymbol(symbol);
    setMode("market"); setDrawer(null); setNotice("");
  }
  function pickHorizon(value: Horizon) {
    setHorizon(value); setAwaitingHorizon(false); setMode("practice");
    setThread((prev) => [...prev,
      createdMessage("user", HORIZON_LABELS[value], "user-provided"),
      createdMessage("assistant", "Thank you. We can explore how accessibility and market exposure relate to that timing. This is still only an illustration.", "illustrative"),
    ]);
    setDraft("");
  }

  async function sendThought(event?: FormEvent) {
    event?.preventDefault();
    const text = draft.trim();
    if (!text || busy) return;
    setDraft("");
    setNotice("");
    const plan = buildHumanSupportPlan({ message: text, preferences: supportPreferences });
    const standalone = shouldUseSupportOnly(plan, text);
    setSupport(plan.handled ? { plan, standalone } : null);
    if (plan.cue === "correction") setSupportPreferences(current => ({ ...current, mode: "direct", adaptToExplicitCues: false }));
    if (standalone) {
      // Deliberately local: no provider call, persistence claim or visual action.
      setThread(previous => [...previous, createdMessage("user", text, "user-provided"),
        createdMessage("assistant", plan.response, "illustrative")]);
      return;
    }
    if (awaitingHorizon) {
      const answer = resolveHorizon(text);
      if (answer) {
        pickHorizon(answer);
      } else {
        setThread((prev) => [...prev,
          createdMessage("user", text, "user-provided"),
          createdMessage("assistant", "When might you need this money? A rough timeframe is enough; 'I'm not sure' is also fine.", "illustrative"),
        ]);
      }
      return;
    }
    const allocation = parsePracticeAllocation(text);
    if (mode === "practice" && allocation !== null) {
      updateExposure(allocation);
      setNotice("Adjusted the hypothetical allocation. No real holding changed.");
      return;
    }
    if (mode === "practice" && /^(less risk|less exposure|safer|more accessible)[.!]?$/i.test(text)) {
      updateExposure(exposure - 10); setNotice("Reduced hypothetical exposure by ten percentage points."); return;
    }
    if (mode === "practice" && /^(more risk|more exposure)[.!]?$/i.test(text)) {
      updateExposure(exposure + 10); setNotice("Raised hypothetical exposure by ten percentage points."); return;
    }
    const asset = text.match(/\b(bitcoin|btc|btcusdt|ethereum|eth|ethusdt|solana|sol|solusdt|bnb|bnbusdt|petr4|petrobras|vale3|aapl|apple|msft|microsoft)\b/i);
    const assetSymbols: Record<string, MarketSymbol> = {
      bitcoin: "BTCUSDT", btc: "BTCUSDT", btcusdt: "BTCUSDT",
      ethereum: "ETHUSDT", eth: "ETHUSDT", ethusdt: "ETHUSDT",
      solana: "SOLUSDT", sol: "SOLUSDT", solusdt: "SOLUSDT",
      bnb: "BNBUSDT", bnbusdt: "BNBUSDT",
      petr4: "PETR4", petrobras: "PETR4", vale3: "VALE3",
      aapl: "AAPL", apple: "AAPL", msft: "MSFT", microsoft: "MSFT",
    };
    if (asset || /\b(crypto|chart|market price|stocks|shares)\b/i.test(text)) {
      setThread((prev) => [...prev, createdMessage("user", text, "user-provided"),
        createdMessage("assistant",
          "We can explore the market through tradingview-data, keeping historical observations separate from verified realtime quotes. No price move alone makes an investment recommendation.",
          "illustrative")]);
      showMarket(asset ? assetSymbols[asset[0].toLowerCase()] : undefined);
      return;
    }
    if (/\b(have|invest|explore|allocate|practice)\b/i.test(text) && (resolveMoney(text) !== null || /\bpractice\b/i.test(text))) {
      const amount = resolveMoney(text);
      if (amount !== null) setPracticeAmount(amount);
      setPracticeGoal(resolveGoal(text));
      const when = resolveHorizon(text);
      const casual = /\b(just curious|made-up|just explore|hypothetical)\b/i.test(text);
      setThread((prev) => [...prev, createdMessage("user", text, "user-provided"),
        createdMessage("assistant", !when && !casual
          ? "One thing will help: when do you think you might need this money? We can keep the answer approximate."
          : "Let's make that a reversible illustration. You can change every number or leave whenever you like.", "illustrative")]);
      if (!when && !casual) { setAwaitingHorizon(true); setMode("conversation"); }
      else { setHorizon(when ?? "unsure"); setAwaitingHorizon(false); setMode("practice"); }
      return;
    }
    if (!user) {
      setThread((prev) => [...prev, createdMessage("user", text, "user-provided"),
        createdMessage("assistant", "That sounds worth exploring. You can try a hypothetical allocation, look at public market context, or sign in to keep a conversation. I'm not connected to an AI model for anonymous questions here.", "illustrative")]);
      return;
    }
    const revision = thoughtRevision.current;
    setBusy(true);
    try {
      let conversationId = activeConversation;
      if (!conversationId) {
        const created = await luminaApi.addConversation(text.slice(0, 75));
        if (thoughtRevision.current !== revision) return;
        conversationId = created.conversation.id;
        setActiveConversation(conversationId);
        setConversations((prev) => [created.conversation, ...prev]);
      }
      setThread((prev) => [...prev, createdMessage("user", text, "user-provided")]);
      const result = await luminaApi.reply(conversationId, text, aiOptIn && capabilities?.ai === true, supportPreferences);
      if (thoughtRevision.current !== revision) return;
      setThread((prev) => [...prev, ...result.messages.filter((m) => m.role === "assistant")]);
    } catch (error) {
      if (thoughtRevision.current !== revision) return;
      setDraft(current => current || text);
      setNotice(error instanceof Error ? error.message : "This thought wasn't saved. Your draft is available to retry.");
    } finally { if (thoughtRevision.current === revision) setBusy(false); }
  }

  async function savePractice() {
    if (persistBusy) return;
    setPersistBusy(true);
    setNotice("");
    try {
      if (user) {
        const result = await luminaApi.savePractice({
          amount: practiceAmount, exposedPercent: exposure, goal: practiceGoal,
          horizon: horizon ?? "unsure", rationale: "Explored as a reversible illustration.",
        });
        setChoices((prev) => [result.choice, ...prev]);
        setNotice(describeMeaningfulMoment("practice-saved", supportPreferences) + " Saved to your account.");
      } else {
        const record: GuestChoice = {
          id: crypto.randomUUID(), at: new Date().toISOString(),
          amount: practiceAmount, exposedPercent: exposure,
          accessiblePercent: 100 - exposure, goal: practiceGoal,
          goalId: null, horizon: horizon ?? "unsure", rationale: "",
          provenance: "illustrative", executed: false,
        };
        const next = [record, ...guestChoices].slice(0, MAX_GUEST_HISTORY);
        setGuestChoices(next);
        const ok = writePracticeChoices(next);
        setNotice(ok
          ? describeMeaningfulMoment("practice-saved", supportPreferences) + " Saved in this browser tab only."
          : "Saved for this page only. Browser storage is unavailable; reload will clear it.");
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "The Practice choice could not be saved.");
    } finally { setPersistBusy(false); }
  }

  function revisitPractice(choice: PracticeRecord) {
    setPracticeAmount(choice.amount); setExposure(choice.exposedPercent);
    setPracticeGoal(choice.goal); setHorizon(choice.horizon); setAwaitingHorizon(false); setMode("practice"); setDrawer(null);
    setSupport(null);
    setNotice(describeMeaningfulMoment("choice-revisited", supportPreferences));
  }
  async function forgetPractice(choice: PracticeRecord) {
    if (user) {
      try {
        await luminaApi.forgetPractice(choice.id);
        setChoices((prev) => prev.filter((item) => item.id !== choice.id));
        setNotice("That Practice choice was removed from your saved data.");
      } catch (error) { setNotice(error instanceof Error ? error.message : "Couldn't remove that choice."); }
    } else {
      const next = guestChoices.filter((item) => item.id !== choice.id);
      setGuestChoices(next); writePracticeChoices(next);
      setNotice("That Practice choice was forgotten from this browser tab.");
    }
  }

  async function saveGoal(event: FormEvent) {
    event.preventDefault();
    if (!user || persistBusy || !goalTitle.trim()) return;
    setPersistBusy(true);
    try {
      const result = await luminaApi.addGoal({
        title: goalTitle.trim(),
        targetAmount: goalAmount ? Number(goalAmount) : null,
        targetDate: goalDate || null,
      });
      setGoals((prev) => [result.goal, ...prev]);
      setGoalTitle(""); setGoalAmount(""); setGoalDate("");
      setNotice(describeMeaningfulMoment("goal-saved", supportPreferences));
    } catch (error) { setNotice(error instanceof Error ? error.message : "Goal couldn't be saved."); }
    finally { setPersistBusy(false); }
  }

  async function openConversation(conversation: Conversation) {
    thoughtRevision.current += 1;
    const revision = thoughtRevision.current;
    setSupport(null); setBusy(false);
    try {
      const result = await luminaApi.messages(conversation.id);
      if (thoughtRevision.current !== revision) return;
      setThread(result.messages);
      setActiveConversation(conversation.id);
      setMode("conversation"); setDrawer(null); setNotice("");
    } catch (error) { setNotice(error instanceof Error ? error.message : "Couldn't open that thought."); }
  }

  async function refreshInbox() {
    if (!user) return;
    const revision = accountRevision.current;
    try {
      const result = await luminaApi.inbox(true);
      if (accountRevision.current !== revision) return;
      const saved = await luminaApi.watches();
      if (accountRevision.current !== revision) return;
      setEvents(result.events);
      setWatches(saved.watches);
      setNotice("Watches checked against available fresh public quotes. This is not background monitoring.");
    } catch (error) {
      if (accountRevision.current === revision) setNotice(error instanceof Error ? error.message : "Couldn't verify watch levels.");
    }
  }
  const unread = events.filter((item) => !item.seenAt && !item.resolvedAt).length;
  const latestChoice = visibleChoices[0] ?? null;
  const greeting = useMemo(() => (user?.name ? "Welcome back." : "What would you like your money to make possible?"), [user?.name]);

  return (
    <div className="lumina-preview lumina-app" data-testid="lumina-app">
      <header className="l-top">
        <button type="button" className="l-brand" onClick={startThought} aria-label="Lúmina, start a new thought">
          <span className="l-brand-mark"><LuminaLogo /></span><span>lúmina<span className="l-brand-period">.</span></span>
        </button>
        <nav className="l-head-right" aria-label="Your financial space">
          <span className="l-mode" title="No actual investments or broker connection"><span className="l-dot"/>Practice</span>
          <button className="l-topbtn" type="button" onClick={() => setDrawer("ideas")} aria-label="Saved Practice choices">
            <Bookmark size={17}/><span>Saved</span>
          </button>
          <button className="l-topbtn" type="button" onClick={() => setDrawer("inbox")} aria-label={"Inbox" + (unread ? " (" + unread + " unread)" : "")}>
            <Bell size={17}/><span>Inbox{unread ? " · " + unread : ""}</span>
          </button>
          <button className="l-user-menu" type="button" onClick={() => user ? setDrawer("privacy") : setAccountOpen(true)}>
            {user ? "Account" : "Sign in"}
          </button>
        </nav>
      </header>
      <main className="l-shell" aria-label="Lúmina">
        {serverStatus === "unavailable" ? (
          <div className="l-status" role="status"><Info size={17}/>
            <span>The live service can't be reached. You can explore Practice, but sign-in and persistence aren't available right now.</span>
          </div>
        ) : null}
        <LuminaSupportControls value={supportPreferences} onChange={next => { setSupportPreferences(next); setSupport(null); }} />
        {support ? <LuminaSupportExplanation plan={support.plan} showAcknowledgement={!support.standalone}
          onCorrect={() => {
            setSupport(null);
            setSupportPreferences(current => ({ ...current, mode: "direct", adaptToExplicitCues: false }));
            document.getElementById("lumina-app-message")?.focus();
          }} /> : null}
        {!hasThread && mode === "conversation" ? (
          <section className="l-welcome l-home">
            <div className="l-orbit" aria-hidden="true"><span/></div>
            <div className="l-eyebrow">A calmer way to think about money</div>
            <h1>{greeting}</h1>
            <p>{user ? "Pick up an idea, explore something new, or simply leave things as they are." :
              "Start with a dream, a question, or just a thought. There's no right way to begin."}</p>
            {latestChoice ? (
              <div className="l-home-memory">
                <div className="l-label">A Practice idea you saved · Not an investment</div>
                <div className="l-home-memory-row">
                  <div><strong>{formatBRL(latestChoice.amount)}</strong>
                    <span>{latestChoice.exposedPercent}% market-exposed in the illustration</span></div>
                  <button type="button" onClick={() => revisitPractice(latestChoice)}>Continue <ChevronRight size={16}/></button>
                </div>
                <p>No market outcomes have been tracked for this choice.</p>
              </div>
            ) : null}
            <div className="l-prompts" role="group" aria-label="Conversation starters">
              {STARTERS.map(([label, text]) => (
                <button className="l-prompt" key={label} onClick={() => {
                  setDraft(text);
                  if (label === "Explore a possibility") showPractice(text);
                  else if (label === "Understand Bitcoin") showMarket();
                  else { setThread([createdMessage("user", text, "user-provided"),
                    createdMessage("assistant", "What would you like your money to make possible? We can consider it a little at a time.", "illustrative")]); }
                }}>{label}</button>
              ))}
            </div>
            <div className="l-home-tools">
              <button type="button" onClick={() => setDrawer("goals")}><Target size={15}/>Your goals</button>
              <button type="button" onClick={() => showMarket()}><ChartNoAxesCombined size={15}/>Market context</button>
              <button type="button" onClick={() => setDrawer("thoughts")}><History size={15}/>Past thoughts</button>
            </div>
            <div className="l-trustline"><ShieldCheck size={13}/>No brokerage credentials. No automatic trading.</div>
          </section>
        ) : (
          <section className="l-conversation l-app-conversation" aria-label="Conversation and contextual exploration">
            <div className="l-context-bar">
              <button className="l-link" type="button" onClick={startThought}>New thought</button>
              <span aria-hidden="true">/</span>
              <span>{mode === "practice" ? "Exploring a possibility" : mode === "market" ? "Market context" : "Conversation"}</span>
            </div>
            {thread.map((message) => (
              message.role === "user" ?
                <div className="l-message l-user" key={message.id}><div className="l-bubble">{message.content}</div></div> :
                <section className="l-message l-reply" key={message.id}>
                  <span className="l-reply-mark"><LuminaLogo /></span>
                  <div className="l-reply-body">
                    <p>{message.content}</p>
                    {message.provenance === "ai-generated" ? <span className="l-response-source">AI-generated · Verify financial facts</span> :
                      <span className="l-response-source">{message.conversationId === "guest" ? "Guided reply on this page" : "Saved guided reply"} · Not financial advice</span>}
                  </div>
                </section>
            ))}
            {awaitingHorizon ? (
              <section className="l-message l-reply" aria-label="Timing clarification">
                <span className="l-reply-mark"><Target size={17}/></span>
                <div className="l-reply-body">
                  <div className="l-kicker">One useful question</div>
                  <h2 className="l-question">When might you need this money?</h2>
                  <p>Your timing matters more than choosing a specific investment right away.</p>
                  <div className="l-choices" role="group" aria-label="When you may need this money">
                    {(["soon", "middle", "later", "unsure"] as Horizon[]).map((value) => (
                      <button type="button" className="l-choice" key={value} onClick={() => pickHorizon(value)}>{HORIZON_LABELS[value]}</button>
                    ))}
                  </div>
                </div>
              </section>
            ) : null}
            {mode === "practice" ? <div className="l-message l-reply">
              <span className="l-reply-mark"><SlidersHorizontal size={18}/></span>
              <div className="l-reply-body">
                <div className="l-kicker">An idea you can adjust</div>
                <h2 className="l-question">What if we tried it this way?</h2>
                <p>This is just a scenario. You can change the amount or balance directly, or type an allocation like “30% market.”</p>
                <LuminaPracticeCard amount={practiceAmount} setAmount={setPracticeAmount} exposed={exposure}
                  setExposed={updateExposure} goal={practiceGoal} setGoal={setPracticeGoal}
                  onSave={() => void savePractice()} saving={persistBusy}/>
              </div>
            </div> : null}
            {mode === "market" ? <div className="l-message l-reply">
              <span className="l-reply-mark"><ChartNoAxesCombined size={18}/></span>
              <div className="l-reply-body">
                <LuminaMarketPanel user={user} initialSymbol={selectedMarketSymbol} onWatchCreated={() => void reloadAccount()}/>
              </div>
            </div> : null}
            {busy ? <p className="l-busy" role="status">Thinking through that…</p> : null}
            <div ref={bottomRef} aria-hidden="true"/>
          </section>
        )}
      </main>

      <div className="l-composer-wrap">
        <form className="l-composer" onSubmit={(event) => void sendThought(event)}>
          <div className="l-composer-row">
            <label htmlFor="lumina-app-message" className="l-sr-only">Your message</label>
            <textarea id="lumina-app-message" rows={1} maxLength={2000} value={draft}
              placeholder="What's on your mind?" onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void sendThought(); }
              }}/>
            <button type="submit" className="l-send" disabled={!draft.trim() || busy} aria-label="Send message">
              <ArrowUp size={19}/>
            </button>
          </div>
          <div className="l-composer-foot">
            <span><ShieldCheck size={12}/>{user ? "Signed in · Guided replies may stay on this page · No trading" : "Explore without an account · Practice only"}</span>
            <button type="button" onClick={startThought}>New thought</button>
          </div>
          {user && capabilities?.ai ? (
            <label className="l-ai-consent">
              <input type="checkbox" checked={aiOptIn} onChange={(event) => setAiOptIn(event.target.checked)} />
              Use OpenAI for chat (shares your message, recent conversation and goal context)
            </label>
          ) : null}
        </form>
      </div>

      {drawer ? (
        <div className="l-modal-backdrop" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setDrawer(null);
        }}>
          <section className="l-panel l-drawer" role="dialog" aria-modal="true" aria-labelledby="lumina-drawer-title">
            <div className="l-panel-header">
              <h2 id="lumina-drawer-title">{drawer === "ideas" ? "Ideas, not holdings." :
                drawer === "goals" ? "What matters to you." : drawer === "thoughts" ? "Thoughts you've kept." :
                drawer === "inbox" ? "Worth knowing." : "Privacy & control."}</h2>
              <button className="l-close" type="button" onClick={() => setDrawer(null)} aria-label="Close panel"><X size={17}/></button>
            </div>
            {drawer === "ideas" ? (
              <>
                <p>Every saved idea remains illustrative, even if markets move. No trade has been executed from Lúmina.</p>
                {visibleChoices.map((choice) => <article className="l-record" key={choice.id}>
                  <div className="l-record-head"><span>{new Date(choice.at).toLocaleDateString()}</span><span className="l-record-badge">Practice only</span></div>
                  <strong>{formatBRL(choice.amount)}</strong>
                  <small>{choice.accessiblePercent}% accessible · {choice.exposedPercent}% market-exposed<br/>No confirmed trade or outcome.</small>
                  <div className="l-record-actions">
                    <button type="button" onClick={() => revisitPractice(choice)}>Revisit idea</button>
                    <button type="button" onClick={() => void forgetPractice(choice)}>Forget choice</button>
                  </div>
                </article>)}
                {!visibleChoices.length ? <p>Nothing saved here yet. You can explore without saving anything.</p> : null}
              </>
            ) : null}
            {drawer === "goals" ? (
              <>
                <p>Your goals guide what needs protecting. Lúmina never assumes that money committed to one goal is freely available for another.</p>
                {goals.map((goal) => <article className="l-record" key={goal.id}>
                  <div className="l-record-head"><span>Personal goal</span><span>{goal.targetDate || "No deadline"}</span></div>
                  <strong>{goal.title}</strong>
                  <small>{goal.targetAmount == null ? "No target amount" : formatBRL(goal.targetAmount)}</small>
                  <div className="l-record-actions"><button type="button" onClick={() => {
                    void luminaApi.deleteGoal(goal.id).then(() => setGoals((prev) => prev.filter((g) => g.id !== goal.id)))
                      .catch(() => setNotice("This goal could not be removed."));
                  }}>Remove goal</button></div>
                </article>)}
                {user ? <form className="l-goal-form" onSubmit={(event) => void saveGoal(event)}>
                  <label>What do you want to make possible?<input value={goalTitle} maxLength={160} required
                    onChange={(event) => setGoalTitle(event.target.value)} placeholder="A home, breathing room, a trip…"/></label>
                  <div className="l-goal-grid">
                    <label>Target (BRL, optional)<input type="number" min="0" step="any" value={goalAmount}
                      onChange={(event) => setGoalAmount(event.target.value)}/></label>
                    <label>When (optional)<input type="date" value={goalDate}
                      onChange={(event) => setGoalDate(event.target.value)}/></label>
                  </div>
                  <button type="submit" className="l-primary" disabled={persistBusy}><Plus size={16}/>Save goal</button>
                </form> : <button className="l-primary l-auth-cta" onClick={() => { setDrawer(null); setAccountOpen(true); }}>Sign in to keep your goals</button>}
              </>
            ) : null}
            {drawer === "thoughts" ? (
              <>
                <p>Only signed-in conversations are saved. You can revisit or delete them whenever you choose.</p>
                {conversations.map((conversation) => <article className="l-record" key={conversation.id}>
                  <div className="l-record-head"><span>{new Date(conversation.updatedAt).toLocaleDateString()}</span></div>
                  <strong>{conversation.title}</strong>
                  <div className="l-record-actions">
                    <button onClick={() => void openConversation(conversation)}>Open thought</button>
                    <button onClick={() => {
                      void luminaApi.deleteConversation(conversation.id).then(() => {
                        setConversations((prev) => prev.filter((c) => c.id !== conversation.id));
                        if (activeConversation === conversation.id) startThought();
                      }).catch(() => setNotice("Couldn't delete that conversation."));
                    }}>Delete</button>
                  </div>
                </article>)}
                {!conversations.length ? <p>No saved conversations yet.</p> : null}
                {!user ? <button className="l-primary l-auth-cta" onClick={() => { setDrawer(null); setAccountOpen(true); }}>Sign in to remember conversations</button> : null}
              </>
            ) : null}
            {drawer === "inbox" ? (
              <>
                <p>An empty inbox is a good outcome. Price watches are checked only when you request a check, not pushed in the background.</p>
                {user ? <button type="button" className="l-secondary" onClick={() => void refreshInbox()}>
                  <RefreshCw size={15}/>Check saved watch levels
                </button> : <button className="l-primary l-auth-cta" onClick={() => { setDrawer(null); setAccountOpen(true); }}>Sign in to keep an inbox</button>}
                {events.map((item) => <article key={item.id} className="l-record">
                  <div className="l-record-head"><span>{item.source}</span><span className="l-record-badge">{item.resolvedAt ? "Resolved" : item.seenAt ? "Seen" : "New"}</span></div>
                  <strong>{item.title}</strong><small>{item.body}</small>
                  <div className="l-record-actions">
                    {!item.seenAt ? <button onClick={() => void luminaApi.updateInbox(item.id, "seen")
                      .then(() => setEvents((prev) => prev.map((e) => e.id === item.id ? { ...e, seenAt: new Date().toISOString() } : e)))
                      .catch(() => setNotice("Couldn't update the event."))}>Mark seen</button> : null}
                    {!item.resolvedAt ? <button onClick={() => void luminaApi.updateInbox(item.id, "resolved")
                      .then(() => setEvents((prev) => prev.map((e) => e.id === item.id ? { ...e, resolvedAt: new Date().toISOString() } : e)))
                      .catch(() => setNotice("Couldn't resolve the event."))}>Resolve</button> : null}
                  </div>
                </article>)}
                {!events.length ? <p>No events require your attention.</p> : null}
                {watches.map((watch) => <div className="l-watch-record" key={watch.id}>
                  <span>{watch.symbol} {watch.direction} {watch.threshold} USD · {watch.active ? "Watching on visit" : "Triggered"}</span>
                  <button type="button" onClick={() => void luminaApi.deleteWatch(watch.id)
                    .then(() => setWatches((prev) => prev.filter((w) => w.id !== watch.id)))
                    .catch(() => setNotice("Couldn't remove that watch."))}>Remove</button>
                </div>)}
              </>
            ) : null}
            {drawer === "privacy" ? (
              <>
                <p>{user ? "You're signed in as " + user.email : "You're exploring without a signed-in account."}</p>
                <div className="l-record">
                  <div className="l-record-head"><span>Data ownership</span><span className="l-record-badge">Your decision</span></div>
                  <p>Saved goals, Practice records, conversations, and inbox events are tied to your account. Trade execution and verified brokerage holdings are not available here.</p>
                  {user ? <>
                    <button className="l-secondary" onClick={() => void luminaApi.signOut().then(() => {
                      accountRevision.current += 1;
                      thoughtRevision.current += 1; setBusy(false); setSupport(null); setDraft(""); setNotice("");
                      setSupportPreferences({ ...DEFAULT_SUPPORT_PREFERENCES });
                      setUser(null); setAiOptIn(false); setGoals([]); setChoices([]); setConversations([]); setThread([]);
                      setEvents([]); setWatches([]); setActiveConversation(null); setDrawer(null); setMode("conversation");
                    }).catch(() => setNotice("Sign out failed. Please try again."))}><LogOut size={16}/>Sign out</button>
                    <div className="l-erase">
                      {!confirmErase ? <button type="button" onClick={() => setConfirmErase(true)}>
                        <Trash2 size={15}/>Delete my saved Lúmina data
                      </button> : <div>
                        <p>This deletes saved goals, practice ideas, conversations, watches and inbox events. Your authentication account and required security records remain.</p>
                        <button type="button" className="l-destructive" onClick={() => void luminaApi.erasePersonalData().then(() => {
                          accountRevision.current += 1;
                          thoughtRevision.current += 1; setBusy(false); setSupport(null); setDraft("");
                          setSupportPreferences({ ...DEFAULT_SUPPORT_PREFERENCES });
                          setGoals([]); setChoices([]); setConversations([]); setThread([]); setEvents([]);
                          setWatches([]); setActiveConversation(null); setConfirmErase(false); setDrawer(null); setMode("conversation");
                          setNotice("Your saved Lúmina application data was deleted. Your sign-in account remains.");
                        }).catch(() => setNotice("The deletion could not be completed."))}>Confirm deletion</button>
                        <button type="button" onClick={() => setConfirmErase(false)}>Cancel</button>
                      </div>}
                    </div>
                  </> : <button className="l-primary" onClick={() => { setDrawer(null); setAccountOpen(true); }}>Sign in</button>}
                </div>
              </>
            ) : null}
          </section>
        </div>
      ) : null}
      {accountOpen ? <LuminaAccountPanel capabilities={capabilities}
        onClose={() => setAccountOpen(false)}
        onAuthenticated={(account) => {
          setUser(account); setAccountOpen(false);
          setNotice("Signed in. Your saved goals and ideas can now follow you across devices.");
        }}/> : null}
    </div>
  );
}
