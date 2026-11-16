import { useEffect, useReducer, useRef, useState } from "react";
import { ArrowUp, Bookmark, History, Info, ShieldCheck, X } from "lucide-react";
import {
  formatBRL, HORIZON_EXPLANATIONS, HORIZON_LABELS, journeyReducer, returningJourney,
  scenario, type Horizon, type JourneyMessage, type JourneyState, type PracticeChoice,
} from "@/lib/lumina-journey";
import { readPracticeChoices, writePracticeChoices } from "@/lib/lumina-practice-session";
import "./lumina-preview.css";

const STARTERS = [
  ["I have some money to invest", "I have R$ 5,000 and want to start investing, but I'm afraid of losing it."],
  ["I'm saving for a home", "I'm saving to buy a home."],
  ["I'm just curious", "Just explore a simple example"],
] as const;
const HORIZONS: Horizon[] = ["soon", "middle", "later", "unsure"];
const EXAMPLE_AMOUNTS = [5_000, 1_000, 20_000] as const;

function LuminaMark({ size = 28 }: { size?: number }) {
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} fill="none" aria-hidden="true" focusable="false">
      <path d="M5 18c0-7 5.4-12 12-12 5.6 0 10 4.2 10 9.4 0 5.6-4.8 9.6-10.2 9.6-3.6 0-6.8-2.7-6.8-6.4 0-3.1 2.5-5.3 5.4-5.3 2.3 0 4 1.6 4 3.8" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      <circle cx="23.5" cy="5.2" r="2" fill="currentColor" />
    </svg>
  );
}

/** Returning is a quiet doorway, not a dashboard or a simulated performance report. */
function ReturningExperience({
  latest, otherCount, onResume, onForget, onNew, onUpdate, onHistory,
}: {
  latest: PracticeChoice;
  otherCount: number;
  onResume: () => void;
  onForget: () => void;
  onNew: () => void;
  onUpdate: () => void;
  onHistory: () => void;
}) {
  return (
    <section className="l-welcome l-returning" aria-labelledby="lumina-return-title">
      <div className="l-orbit" aria-hidden="true"><span /></div>
      <div className="l-eyebrow">A little room to think</div>
      <h1 id="lumina-return-title">Good to have you back.</h1>
      <p>Your ideas are here when you want them. There's nothing you need to do.</p>
      <div className="l-return-card" data-provenance="illustrative">
        <div className="l-return-head">
          <div className="l-label">An idea you explored</div>
          <span className="l-concept-tag">Practice · Not a holding</span>
        </div>
        <h2>For {latest.goal}</h2>
        <div className="l-return-amount">{formatBRL(latest.amount)}</div>
        <div className="l-return-bar" role="img" aria-label={latest.accessiblePercent + "% accessible, " + latest.exposedPercent + "% market-exposed in this saved hypothetical allocation"}>
          <span className="l-return-liquid" style={{ width: latest.accessiblePercent + "%" }} />
          <span className="l-return-exposed" style={{ width: latest.exposedPercent + "%" }} />
        </div>
        <div className="l-return-labels">
          <span>Accessible · {latest.accessiblePercent}%</span>
          <span>Market-exposed · {latest.exposedPercent}%</span>
        </div>
        <p className="l-return-footnote">This is the illustration you saved, not an actual portfolio. We haven't monitored prices, events, or investment outcomes.</p>
        <div className="l-return-actions">
          <button type="button" className="l-primary" onClick={onResume}>Continue exploring</button>
          <button type="button" className="l-secondary" onClick={onNew}>Start a new thought</button>
        </div>
        <div className="l-return-links">
          <button type="button" onClick={onUpdate}>What changed?</button>
          <button type="button" onClick={onForget}>Forget this choice</button>
        </div>
      </div>
      {otherCount ? <button type="button" className="l-more-history" onClick={onHistory}>View {otherCount} other Practice {otherCount === 1 ? "choice" : "choices"}</button> : null}
      <div className="l-trustline"><ShieldCheck size={13} aria-hidden="true" />Saved in this browser tab's session · Not synced</div>
    </section>
  );
}

function GuideMessage({
  message, state, isLatestPrompt, onHorizon, onAmount, onExposure, onSave, onStart, storageAvailable,
}: {
  message: JourneyMessage;
  state: JourneyState;
  isLatestPrompt: boolean;
  onHorizon: (value: Horizon) => void;
  onAmount: (value: number) => void;
  onExposure: (value: number) => void;
  onSave: () => void;
  onStart: (text: string) => void;
  storageAvailable: boolean;
}) {
  return (
    <section className="l-message l-reply">
      <span className="l-reply-mark"><LuminaMark size={22} /></span>
      <div className="l-reply-body">
        {message.kind === "text" ? <p>{message.text}</p> : null}
        {message.kind === "horizon" ? (
          <>
            <div className="l-kicker">One thing worth understanding</div>
            <h2 className="l-question">When do you think you might need this money?</h2>
            <p>It matters more to this illustration than choosing an investment right away.</p>
            <div className="l-choices" role="group" aria-label="When you might need the money">
              {HORIZONS.map((value) => (
                <button key={value} type="button" className="l-choice" disabled={!isLatestPrompt || state.step !== "horizon"} onClick={() => onHorizon(value)}>{HORIZON_LABELS[value]}</button>
              ))}
            </div>
          </>
        ) : null}
        {message.kind === "amount" ? (
          <>
            <div className="l-kicker">A number to explore</div>
            <h2 className="l-question">How much would you like to use for this example?</h2>
            <p>It can be a made-up amount. We won't ask you to verify it.</p>
            <div className="l-choices">
              {EXAMPLE_AMOUNTS.map((value) => <button key={value} type="button" className="l-choice" disabled={!isLatestPrompt || state.step !== "amount"} onClick={() => onAmount(value)}>Try {formatBRL(value)}</button>)}
            </div>
            <p className="l-hint">Or type any amount, for example “R$ 7.500”.</p>
          </>
        ) : null}
        {message.kind === "scenario" ? (
          <ScenarioWithSave state={state} onExposure={onExposure} onSave={onSave} />
        ) : null}
        {message.kind === "saved" ? (
          <>
            <div className="l-notice" role="status">
              <Bookmark size={18} aria-hidden="true" />
              <div><strong>Saved as a practice choice.</strong><br />No asset was purchased, and no real balance changed.</div>
            </div>
            <p className="l-hint">You can revisit this choice in History. {storageAvailable ? "Saved in this browser tab across reloads, not synced." : "Browser storage is unavailable, so this choice lasts only while this page is open."}</p>
          </>
        ) : null}
        {message.kind === "unsupported" ? (
          <>
            <p>I can explore an illustrative money allocation here, but this prototype understands only a few example requests. It doesn't have live financial data or an AI advisor behind it.</p>
            <div className="l-choices">
              {STARTERS.filter((_, index) => index !== 1).map(([label, value]) => (
                <button key={value} type="button" className="l-choice" onClick={() => onStart(value)}>{label}</button>
              ))}
            </div>
          </>
        ) : null}
      </div>
    </section>
  );
}

function ScenarioWithSave({ state, onExposure, onSave }: { state: JourneyState; onExposure: (value: number) => void; onSave: () => void }) {
  const [details, setDetails] = useState(false);
  if (state.amount === null) return null;
  const values = scenario(state.amount, state.exposedPercent);
  return (
    <>
      <div className="l-kicker">A first picture, not an answer</div>
      <h2 className="l-question">Let's see what flexibility could look like.</h2>
      <p>{state.horizon ? HORIZON_EXPLANATIONS[state.horizon] : "We don't have a timeframe yet."} We can explore a simple split without treating it as a judgment about what you should do.</p>
      <section className="l-visual" aria-label="Interactive hypothetical allocation">
        <div className="l-visual-head">
          <div><div className="l-label">Illustration · Not a recommendation</div><h3>Make room for possibility.<br />Keep room to breathe.</h3></div>
          <span className="l-concept-tag">Practice</span>
        </div>
        <p className="l-visual-description">This is an adjustable example of how much money you could keep accessible versus expose to market price changes. It isn't a personalized recommendation.</p>
        <div className="l-split" role="img" aria-label={"Illustrative allocation: " + values.accessiblePercent + "% accessible, " + values.exposedPercent + "% market-exposed"}>
          <div className={"l-slice l-liquid" + (values.accessiblePercent <= 8 ? " l-minimal" : "")} style={{ flexGrow: Math.max(values.accessiblePercent, 0.1), display: values.accessiblePercent === 0 ? "none" : undefined }}><span>Accessible<strong>{values.accessiblePercent}%</strong></span></div>
          <div className={"l-slice l-exposed" + (values.exposedPercent <= 8 ? " l-minimal" : "")} style={{ flexGrow: Math.max(values.exposedPercent, 0.1), display: values.exposedPercent === 0 ? "none" : undefined }}><span>Market-exposed<strong>{values.exposedPercent}%</strong></span></div>
        </div>
        <div className="l-slider-heading"><label htmlFor="lumina-exposure"><strong>Move the balance</strong>Market-exposed portion</label><strong>{values.exposedPercent}%</strong></div>
        <input id="lumina-exposure" className="l-slider" type="range" min={0} max={100} step={5} value={values.exposedPercent} onChange={(event) => onExposure(Number(event.currentTarget.value))} aria-label="Percentage allocated to market-exposed investments in this example" />
        <div className="l-balances"><div className="l-stat"><span>Accessible in this example</span><strong>{formatBRL(values.accessibleValue)}</strong></div><div className="l-stat l-stat-alt"><span>Exposed to market moves</span><strong>{formatBRL(values.exposedValue)}</strong></div></div>
        <div className="l-stress"><p><strong>What if the exposed portion fell 20%?</strong><br />This hypothetical market drop would reduce the example by:</p><strong>{values.hypotheticalLoss20 ? "−" : ""}{formatBRL(values.hypotheticalLoss20)}</strong></div>
        <p className="l-disclaimer">A 20% fall is an illustrative stress event, not a probability or forecast. “Accessible” doesn't mean risk-free; this simplified model excludes taxes, fees, inflation, and asset liquidity constraints. No investments or live prices are used.</p>
      </section>
      <div className="l-actions">
        <button type="button" className="l-primary" onClick={onSave}><Bookmark size={16} aria-hidden="true" /> Save this practice choice</button>
        <button type="button" className="l-secondary" aria-expanded={details} aria-controls="lumina-assumptions" onClick={() => setDetails((open) => !open)}><Info size={16} aria-hidden="true" /> What am I seeing?</button>
      </div>
      {details ? <div className="l-details" id="lumina-assumptions"><p><strong>Known:</strong> only the hypothetical amount and timeframe you provided.</p><p><strong>Assumed:</strong> allocation categories and the 20% stress example.</p><p><strong>Unknown:</strong> real holdings, emergency needs, tax situation, prices, and suitable assets.</p><p>This prototype cannot make verified personalized recommendations or trade. Adjusting the slider or saving a practice choice changes this temporary exploration only.</p></div> : null}
    </>
  );
}

export default function LuminaPreview() {
  const [state, dispatch] = useReducer(journeyReducer, undefined, () => returningJourney(readPracticeChoices()));
  const [text, setText] = useState("");
  const [storageAvailable, setStorageAvailable] = useState(true);
  const [panel, setPanel] = useState<"history" | "about" | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  const latestRef = useRef<HTMLDivElement>(null);
  const returningNoticeRef = useRef<HTMLDivElement>(null);
  const messageCount = state.messages.length;

  // Saving in Practice is explicit; do not persist messages, drafts or free-form financial text.
  useEffect(() => {
    const saved = writePracticeChoices(state.choices);
    if (state.choices.length && !saved) setStorageAvailable(false);
    else if (saved) setStorageAvailable(true);
  }, [state.choices]);

  useEffect(() => {
    const previousTitle = document.title;
    document.title = "Lúmina — a calmer way to think about money";
    return () => { document.title = previousTitle; };
  }, []);

  useEffect(() => {
    if (messageCount) latestRef.current?.scrollIntoView?.({
      behavior: typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth",
      block: "nearest",
    });
  }, [messageCount]);

  useEffect(() => {
    if (state.step === "returning" && state.notice) {
      returningNoticeRef.current?.scrollIntoView?.({ block: "nearest" });
    }
  }, [state.step, state.notice]);

  useEffect(() => {
    if (!panel) return;
    previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setPanel(null); return; }
      if (event.key !== "Tab") return;
      const section = closeRef.current?.closest("[role=dialog]");
      const focusable = Array.from(section?.querySelectorAll<HTMLElement>('button:not([disabled]),a[href],input:not([disabled])') ?? []);
      if (!focusable.length) return;
      if (event.shiftKey && document.activeElement === focusable[0]) { event.preventDefault(); focusable[focusable.length - 1].focus(); }
      else if (!event.shiftKey && document.activeElement === focusable[focusable.length - 1]) { event.preventDefault(); focusable[0].focus(); }
    };
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = originalOverflow;
      document.removeEventListener("keydown", onKeyDown);
      previousFocus.current?.focus();
    };
  }, [panel]);

  function submit() {
    if (!text.trim()) return;
    dispatch({ type: "SUBMIT", text });
    setText("");
  }
  function reset() { dispatch({ type: "RESET" }); setText(""); window.scrollTo({ top: 0, behavior: "instant" }); }
  function start(value: string) { dispatch({ type: "START", text: value }); setText(""); }
  function save() { dispatch({ type: "SAVE", at: new Date().toISOString(), id: String(Date.now()) + "-" + state.nextId }); }
  function resumeChoice(id: string) { dispatch({ type: "RESUME_CHOICE", id }); setPanel(null); }
  function forgetChoice(id: string) { dispatch({ type: "FORGET_CHOICE", id }); setPanel(null); }
  function describeChanges() { dispatch({ type: "SUBMIT", text: "What changed?" }); }
  const latestPromptId = [...state.messages].reverse().find((message) => message.kind === "horizon" || message.kind === "amount")?.id;

  return (
    <div className="lumina-preview" data-testid="lumina-first-journey" data-provenance="illustrative">
      <header className="l-top">
        <button type="button" className="l-brand" onClick={reset} aria-label="Lúmina, start a new thought">
          <span className="l-brand-mark"><LuminaMark size={26} /></span>
          <span>lúmina<span className="l-brand-period">.</span></span>
        </button>
        <div className="l-head-right">
          <span className="l-mode" title="Prototype: only hypothetical choices, no brokerage connection"><span className="l-dot" />Practice · Demo</span>
          <button type="button" className="l-topbtn" aria-label="Open practice history" onClick={() => setPanel("history")}><History size={17} /><span>History</span></button>
          <button type="button" className="l-topbtn" aria-label="About this prototype" onClick={() => setPanel("about")}><Info size={17} /><span>About</span></button>
        </div>
      </header>
      <main className="l-shell" aria-label="Lúmina conversation">
        {state.step !== "returning" && state.notice ? <div role="status" className="l-status"><Info size={16} aria-hidden="true" /><span>{state.notice}</span></div> : null}
        {state.step === "returning" && state.choices[0] ? (
          <>
          <ReturningExperience
            latest={state.choices[0]} otherCount={Math.max(0, state.choices.length - 1)}
            onResume={() => resumeChoice(state.choices[0].id)}
            onForget={() => forgetChoice(state.choices[0].id)}
            onNew={reset} onUpdate={describeChanges}
            onHistory={() => setPanel("history")}
          />
          {state.notice ? (
            <div role="status" className="l-status l-return-status" ref={returningNoticeRef}>
              <Info size={16} aria-hidden="true" /><span>{state.notice}</span>
            </div>
          ) : null}
          </>
        ) : state.step === "welcome" ? (
          <section className="l-welcome">
            <div className="l-orbit" aria-hidden="true"><span /></div>
            <div className="l-eyebrow">A little clarity, every day</div>
            <h1>What would you like your money to make possible?</h1>
            <p>Start with a dream, a question, or just a thought. There's no right way to begin.</p>
            <div className="l-prompts" role="group" aria-label="Conversation starters">
              {STARTERS.map(([label, value]) => <button key={label} type="button" className="l-prompt" onClick={() => start(value)}>{label}</button>)}
            </div>
            <div className="l-trustline"><ShieldCheck size={13} aria-hidden="true" />No account. No credentials. No real trades.</div>
          </section>
        ) : (
          <section className="l-conversation" role="log" aria-live="polite" aria-label="Conversation messages">
            {state.messages.map((message) => message.kind === "user" ? (
              <div key={message.id} className="l-message l-user"><div className="l-bubble">{message.text}</div></div>
            ) : (
              <GuideMessage
                key={message.id} message={message} state={state}
                isLatestPrompt={latestPromptId === message.id}
                onHorizon={(value) => dispatch({ type: "PICK_HORIZON", value })}
                onAmount={(value) => dispatch({ type: "PICK_AMOUNT", value })}
                onExposure={(value) => dispatch({ type: "EXPOSURE", value })}
                onSave={save}
                onStart={start}
                storageAvailable={storageAvailable}
              />
            ))}
            <div ref={latestRef} aria-hidden="true" />
          </section>
        )}
      </main>
      <div className="l-composer-wrap">
        <form className="l-composer" onSubmit={(event) => { event.preventDefault(); submit(); }}>
          <label className="l-sr-only" htmlFor="lumina-message">Your message to Lúmina</label>
          <div className="l-composer-row">
            <textarea
              id="lumina-message" rows={1} maxLength={400} value={text}
              placeholder="Tell me what's on your mind…" aria-label="Your message"
              onChange={(event) => setText(event.currentTarget.value)}
              onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); submit(); } }}
            />
            <button className="l-send" type="submit" aria-label="Send message" disabled={!text.trim()}><ArrowUp size={19} /></button>
          </div>
          <div className="l-composer-foot">
            <span><ShieldCheck size={12} aria-hidden="true" />{storageAvailable ? "Practice only · Tab session, not synced" : "Practice only · This page, not synced"}</span>
            <button type="button" onClick={reset}>New thought</button>
          </div>
        </form>
      </div>
      {panel ? (
        <div className="l-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setPanel(null); }}>
          <section role="dialog" aria-modal="true" aria-labelledby="lumina-panel-title" className="l-panel">
            <div className="l-panel-header">
              <h2 id="lumina-panel-title">{panel === "history" ? "Your practice history" : "About this first look"}</h2>
              <button className="l-close" type="button" ref={closeRef} aria-label="Close panel" onClick={() => setPanel(null)}><X size={17} /></button>
            </div>
            {panel === "history" ? (
              <>
                <p>What you chose to explore, never mistaken for what you actually bought.</p>
                {state.choices.length ? state.choices.map((choice) => (
                  <article className="l-record" key={choice.id} data-provenance={choice.provenance}>
                    <div className="l-record-head"><span>{new Date(choice.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} · Example allocation</span><span className="l-record-badge">Practice only</span></div>
                    <strong>{formatBRL(choice.amount)}</strong>
                    <small>{choice.accessiblePercent}% accessible · {choice.exposedPercent}% market-exposed<br />Explored for {choice.goal}. No real purchase or asset position.</small>
                    <div className="l-record-actions">
                      <button type="button" onClick={() => resumeChoice(choice.id)} aria-label={"Revisit Practice choice from " + choice.at}>Revisit idea</button>
                      <button type="button" onClick={() => forgetChoice(choice.id)} aria-label={"Forget Practice choice from " + choice.at}>Forget choice</button>
                    </div>
                  </article>
                )) : <p>Nothing saved yet. You can explore an example and save a practice choice without placing an order.</p>}
                {state.choices.length > 0 ? <button type="button" className="l-clear" onClick={() => dispatch({ type: "CLEAR_HISTORY" })}>Clear practice history</button> : null}
              </>
            ) : (
              <>
                <p>This is a focused experience prototype, not a live investing product. It includes an initial conversation, a question about timing, an interactive allocation illustration, limited text commands, and a browser-tab Practice history that survives refresh.</p>
                <div className="l-record"><div className="l-record-head"><span>What is real here?</span><span className="l-record-badge">Transparent by design</span></div><p>Only the interface and its arithmetic are functional. There are no market prices, executed orders, broker connections, notifications, AI-generated advice, or cross-device synchronization.</p></div>
                <p>Only explicitly saved Practice choices are kept in this tab's browser session storage, including across reloads. Free-form conversation text isn't stored. If browser session storage is blocked, choices last only while the page is open. Closing the tab generally clears its session. Nothing syncs across devices, and this preview sends no information to a server. Use “Forget choice” or “Clear practice history” to delete saved records.</p>
              </>
            )}
          </section>
        </div>
      ) : null}
    </div>
  );
}
