"""One-shot, assertion-guarded integration on the isolated feature branch."""
from pathlib import Path
import json
changes = {}
def read(path):
    return changes.get(path, Path(path).read_text())
def replace(path, old, new):
    text = read(path)
    if text.count(old) != 1:
        raise RuntimeError(f'Expected exactly one source anchor in {path}: {old[:75]!r}')
    changes[path] = text.replace(old, new, 1)
def append(path, text):
    if text.strip() in read(path):
        raise RuntimeError('Already integrated: ' + path)
    changes[path] = read(path).rstrip() + '\n' + text + '\n'
base = 'examples/stocks-optimizer/src/artifacts/'
ui = base + 'signal-markets/src/'
api = base + 'api-server/src/'
app = ui + 'pages/lumina-app.tsx'
route = api + 'routes/lumina.ts'
assistant = api + 'lib/lumina-assistant.ts'
append('packages/decision/src/core.ts', 'export { HUMAN_SUPPORT_VERSION, DEFAULT_SUPPORT_PREFERENCES, normalizeSupportPreferences, observeExplicitSupportCue, buildHumanSupportPlan, describeMeaningfulMoment, inspectSupportResponse, shouldUseSupportOnly, parsePracticeAllocation } from "./human-support";\nexport type { SupportMode, SupportLocale, SupportCue, SupportPreferences, HumanSupportPlan, MeaningfulMoment } from "./human-support";')
replace(app, 'import "./lumina-app.css";', '''import "./lumina-app.css";
import "./lumina-support.css";
import { toast } from "@/hooks/use-toast";
import { buildHumanSupportPlan, DEFAULT_SUPPORT_PREFERENCES, describeMeaningfulMoment, shouldUseSupportOnly, parsePracticeAllocation, type HumanSupportPlan, type SupportPreferences } from "@signal/decision/core";
import { LuminaSupportControls, LuminaSupportExplanation } from "./lumina-support";''')
replace(app, '  const [notice, setNotice] = useState("");', '''  const noticeRef = useRef<ReturnType<typeof toast> | null>(null);
  const setNotice = useCallback((message: string) => {
    noticeRef.current?.dismiss();
    noticeRef.current = message ? toast({ description: message, duration: 9000 }) : null;
  }, []);
  useEffect(() => () => { noticeRef.current?.dismiss(); }, []);''')
replace(app, '  const bottomRef = useRef<HTMLDivElement>(null);', '''  const bottomRef = useRef<HTMLDivElement>(null);
  const [supportPreferences, setSupportPreferences] = useState<SupportPreferences>({ ...DEFAULT_SUPPORT_PREFERENCES });
  const [support, setSupport] = useState<{ plan: HumanSupportPlan; standalone: boolean } | null>(null);
  const thoughtRevision = useRef(0);
  useEffect(() => {
    thoughtRevision.current += 1;
    setSupport(null);
    setSupportPreferences({ ...DEFAULT_SUPPORT_PREFERENCES });
  }, [user?.id]);''')
replace(app, '  function startThought() {', '''  function startThought() {
    thoughtRevision.current += 1;
    setBusy(false);
    setSupport(null); setSupportPreferences({ ...DEFAULT_SUPPORT_PREFERENCES });''')
replace(app, '''    setDraft("");
    setNotice("");
    if (awaitingHorizon) {''', '''    setDraft("");
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
    if (awaitingHorizon) {''')
start = '    const percent = text.match(/\\b(\\d{1,3})\\s*%/);'
end = '    const asset = text.match('
s = read(app)
a, b = s.index(start), s.index(end, s.index(start))
changes[app] = s[:a] + '''    const allocation = parsePracticeAllocation(text);
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
''' + s[b:]
replace(app, '''    setBusy(true);
    try {
      let conversationId = activeConversation;''', '''    const revision = thoughtRevision.current;
    setBusy(true);
    try {
      let conversationId = activeConversation;''')
replace(app, '''        const created = await luminaApi.addConversation(text.slice(0, 75));
        conversationId = created.conversation.id;''', '''        const created = await luminaApi.addConversation(text.slice(0, 75));
        if (thoughtRevision.current !== revision) return;
        conversationId = created.conversation.id;''')
replace(app, '''      const result = await luminaApi.reply(conversationId, text, aiOptIn && capabilities?.ai === true);
      setThread((prev) => [...prev, ...result.messages.filter((m) => m.role === "assistant")]);''', '''      const result = await luminaApi.reply(conversationId, text, aiOptIn && capabilities?.ai === true, supportPreferences);
      if (thoughtRevision.current !== revision) return;
      setThread((prev) => [...prev, ...result.messages.filter((m) => m.role === "assistant")]);''')
replace(app, '''    } catch (error) {
      setNotice(error instanceof Error ? error.message : "This thought wasn't saved. You can try again.");
    } finally { setBusy(false); }''', '''    } catch (error) {
      if (thoughtRevision.current !== revision) return;
      setDraft(current => current || text);
      setNotice(error instanceof Error ? error.message : "This thought wasn't saved. Your draft is available to retry.");
    } finally { if (thoughtRevision.current === revision) setBusy(false); }''')
replace(app, 'setNotice("Saved as a Practice choice across your signed-in devices. Nothing was purchased.");', 'setNotice(describeMeaningfulMoment("practice-saved", supportPreferences) + " Saved to your account.");')
replace(app, '? "Saved as a Practice choice in this browser tab. No real investment occurred."', '? describeMeaningfulMoment("practice-saved", supportPreferences) + " Saved in this browser tab only."')
replace(app, 'setNotice("Resuming an illustration\u2014not a verified portfolio or an investment outcome.");', 'setSupport(null);\n    setNotice(describeMeaningfulMoment("choice-revisited", supportPreferences));')
replace(app, 'setNotice("Your goal is saved. L\u00famina won\'t assume you can invest money reserved for it.");', 'setNotice(describeMeaningfulMoment("goal-saved", supportPreferences));')
replace(app, '  async function openConversation(conversation: Conversation) {', '''  async function openConversation(conversation: Conversation) {
    thoughtRevision.current += 1;
    const revision = thoughtRevision.current;
    setSupport(null); setBusy(false);''')
replace(app, '''      const result = await luminaApi.messages(conversation.id);
      setThread(result.messages);''', '''      const result = await luminaApi.messages(conversation.id);
      if (thoughtRevision.current !== revision) return;
      setThread(result.messages);''')
old_notice = '''        {notice ? <div className="l-status" role="status"><Info size={17}/><span>{notice}</span>
          <button type="button" className="l-status-close" aria-label="Dismiss notice" onClick={() => setNotice("")}><X size={14}/></button>
        </div> : null}'''
replace(app, old_notice, '''        <LuminaSupportControls value={supportPreferences} onChange={next => { setSupportPreferences(next); setSupport(null); }} />
        {support ? <LuminaSupportExplanation plan={support.plan} showAcknowledgement={!support.standalone}
          onCorrect={() => {
            setSupport(null);
            setSupportPreferences(current => ({ ...current, mode: "direct", adaptToExplicitCues: false }));
            document.getElementById("lumina-app-message")?.focus();
          }} /> : null}''')
replace(app, '''<span className="l-response-source">Guided explanation \u00b7 Not financial advice</span>''', '''<span className="l-response-source">{message.conversationId === "guest" ? "Guided reply on this page" : "Saved guided reply"} \u00b7 Not financial advice</span>''')
replace(app, '"Saved to your account \u00b7 No trading"', '"Signed in \u00b7 Guided replies may stay on this page \u00b7 No trading"')
replace(app, '''setUser(null); setAiOptIn(false); setGoals([]); setChoices([]); setConversations([]); setThread([]);''', '''thoughtRevision.current += 1; setBusy(false); setSupport(null); setDraft(""); setNotice("");
                      setSupportPreferences({ ...DEFAULT_SUPPORT_PREFERENCES });
                      setUser(null); setAiOptIn(false); setGoals([]); setChoices([]); setConversations([]); setThread([]);''')
replace(app, '''setGoals([]); setChoices([]); setConversations([]); setThread([]); setEvents([]);''', '''thoughtRevision.current += 1; setBusy(false); setSupport(null); setDraft("");
                          setSupportPreferences({ ...DEFAULT_SUPPORT_PREFERENCES });
                          setGoals([]); setChoices([]); setConversations([]); setThread([]); setEvents([]);''')
client = ui + 'lib/lumina-api.ts'
changes[client] = 'import type { SupportPreferences } from "@signal/decision/core";\n' + read(client)
replace(client, 'reply: (id: string, message: string, useAi = false) =>', 'reply: (id: string, message: string, useAi = false, supportPreferences?: SupportPreferences) =>')
replace(client, 'JSON.stringify({ message, useAi })', 'JSON.stringify({ message, useAi, supportPreferences })')
changes[route] = 'import { buildHumanSupportPlan, shouldUseSupportOnly } from "@signal/decision/core";\n' + read(route)
replace(route, 'const ReplyInput = z.object({ message: z.string().trim().min(1).max(2000), useAi: z.boolean().optional().default(false) }).strict();', '''const ReplyInput = z.object({
  message: z.string().trim().min(1).max(2000), useAi: z.boolean().optional().default(false),
  supportPreferences: z.object({ mode: z.enum(["balanced", "direct", "step-by-step"]),
    locale: z.enum(["en", "pt-BR"]), adaptToExplicitCues: z.boolean() }).strict().optional(),
}).strict();''')
replace(route, '''  const conversationId = String(req.params.id);
  const past = await listMessages(userId, conversationId);''', '''  const conversationId = String(req.params.id);
  const owned = await luminaDb().query("SELECT id FROM lumina_conversations WHERE id=$1 AND owner_id=$2", [conversationId, userId]);
  if (!owned.rowCount) throw new ApiProblem(404, "conversation_not_found", "Conversation not found.");
  const support = buildHumanSupportPlan({ message: data.message, preferences: data.supportPreferences });
  const supportOnly = shouldUseSupportOnly(support, data.message);
  const past = await listMessages(userId, conversationId);''')
replace(route, 'const quote = symbol ? await getLuminaMarketQuote(symbol) : null;', 'const quote = symbol && !supportOnly ? await getLuminaMarketQuote(symbol) : null;')
replace(route, 'const ai = data.useAi ? await luminaAssistantReply({', 'const ai = data.useAi && !supportOnly ? await luminaAssistantReply({')
replace(route, '    history: past.slice(-8),', '    history: past.slice(-8), supportPreferences: data.supportPreferences,')
replace(route, '  const assistantText = ai?.text ?? (', '  const assistantText = supportOnly ? support.response : ai?.text ?? (')
changes[assistant] = 'import { buildHumanSupportPlan, inspectSupportResponse, type SupportPreferences } from "@signal/decision/core";\n' + read(assistant)
replace(assistant, '  history?: History;', '  history?: History; supportPreferences?: SupportPreferences;')
replace(assistant, '        model, instructions: INSTRUCTIONS,', '        model, instructions: INSTRUCTIONS + " " + buildHumanSupportPlan({ message: input.message, preferences: input.supportPreferences }).modelGuidance,')
replace(assistant, '    if (!text || text.length > 8000) throw new Error("Empty or oversized provider response");', '    if (!text || text.length > 8000) throw new Error("Empty or oversized provider response");\n    if (!inspectSupportResponse(text).acceptable) throw new Error("Response failed support policy checks");')
package = base + 'signal-markets/package.json'
data = json.loads(read(package))
data['scripts']['test'] += ' src/pages/lumina-support.test.tsx'
changes[package] = json.dumps(data, indent=2) + '\n'
integration = api + 'tests/lumina-http.integration.ts'
replace(integration, '  const erase = await request("/api/lumina/my-data", { method: "DELETE", cookie: alice });', '''  const supportReply = await request("/api/lumina/conversations/" + conversationId + "/reply", {
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
  const erase = await request("/api/lumina/my-data", { method: "DELETE", cookie: alice });''')
for path, text in changes.items():
    Path(path).write_text(text)
Path('.automation/apply-emotional-experience.py').unlink()
Path('.github/workflows/emotional-experience-bootstrap.yml').unlink()
print('Integrated', len(changes), 'reviewed source files; bootstrap removed.')
