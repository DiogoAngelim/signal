import {
  AlertCircle,
  Anchor,
  CheckCircle2,
  ChevronDown,
  Compass,
  Fish,
  Globe2,
  HelpCircle,
  Loader2,
  MapPin,
  Navigation,
  RefreshCw,
  Search,
  Shield,
  Ship,
  Waves
} from "lucide-react";
import { useState } from "react";
import { createCustomMaritimeArea } from "../adapters.js";
import type {
  Coordinate,
  GuidanceLevel,
  MaritimeArea,
  MaritimeBriefing,
  MaritimeMatter,
  MaritimeRisk,
  MatterStatus
} from "../contracts.js";
import { createMaritimeBrowserClient, type MaritimeBrowserClient } from "./client.js";
import { MaritimeMap } from "./MaritimeMap.js";

type AppStatus = "idle" | "searching" | "loading-guide" | "ready" | "error";

export type MaritimeAwareAppProps = {
  client?: MaritimeBrowserClient;
};

const defaultClient = createMaritimeBrowserClient();
const suggestedQueries = ["Port of Santos", "South Atlantic", "Galapagos", "Singapore Strait", "-23.95, -46.32"];

export function App({ client = defaultClient }: MaritimeAwareAppProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<MaritimeArea[]>([]);
  const [briefing, setBriefing] = useState<MaritimeBriefing | undefined>();
  const [status, setStatus] = useState<AppStatus>("idle");
  const [message, setMessage] = useState<string | undefined>();

  async function runSearch(event?: React.FormEvent) {
    event?.preventDefault();
    if (!query.trim()) return;
    setStatus("searching");
    setMessage(undefined);
    try {
      const found = await client.searchAreas(query);
      setResults(found);
      setStatus("idle");
      if (!found.length) setMessage("No matching maritime area was found.");
    } catch {
      setStatus("error");
      setMessage("Area search is unavailable right now.");
    }
  }

  async function chooseArea(area: MaritimeArea) {
    setStatus("loading-guide");
    setMessage(undefined);
    setResults([]);
    setQuery(area.name);
    try {
      const next = await client.getGuide(area.id);
      setBriefing(next);
      setStatus("ready");
    } catch {
      setStatus("error");
      setMessage("Some sources are unavailable right now. We are showing what can still be supported.");
    }
  }

  async function refreshGuide() {
    if (!briefing) return;
    await chooseArea(briefing.area);
  }

  function chooseMapArea(center: Coordinate) {
    const area = createCustomMaritimeArea({
      name: `Custom area near ${center.latitude.toFixed(2)}, ${center.longitude.toFixed(2)}`,
      center,
      radiusKm: Math.max(30, Math.min(briefing?.area.radiusKm ?? 60, 120)),
      method: "map",
      query: briefing?.area.name
    });
    void chooseArea(area);
  }

  if (!briefing) {
    return (
      <HomeScreen
        query={query}
        results={results}
        status={status}
        message={message}
        onQueryChange={setQuery}
        onSearch={runSearch}
        onChooseArea={(area) => void chooseArea(area)}
        onUseSuggestion={(value) => {
          setQuery(value);
          setMessage(undefined);
        }}
      />
    );
  }

  return (
    <GuideView
      briefing={briefing}
      query={query}
      results={results}
      status={status}
      message={message}
      onQueryChange={setQuery}
      onSearch={runSearch}
      onChooseArea={(area) => void chooseArea(area)}
      onRefresh={() => void refreshGuide()}
      onChooseMapArea={chooseMapArea}
    />
  );
}

export function HomeScreen(props: {
  query: string;
  results: MaritimeArea[];
  status: AppStatus;
  message?: string;
  onQueryChange(query: string): void;
  onSearch(event?: React.FormEvent): void;
  onChooseArea(area: MaritimeArea): void;
  onUseSuggestion(query: string): void;
}) {
  const loading = props.status === "searching";
  return (
    <main className="maritime-home">
      <section className="area-question" aria-labelledby="area-question-title">
        <p className="brand-mark"><Anchor size={18} aria-hidden="true" />Maritime Aware</p>
        <h1 id="area-question-title">Choose a maritime area</h1>
        <form className="area-search" onSubmit={props.onSearch}>
          <Search size={20} aria-hidden="true" />
          <input
            value={props.query}
            onChange={(event) => props.onQueryChange(event.target.value)}
            placeholder="Port, coastline, city, ocean, or coordinates"
            aria-label="Search maritime area"
          />
          <button type="submit" disabled={loading || !props.query.trim()} aria-label="Search">
            {loading ? <Loader2 className="spin" size={18} aria-hidden="true" /> : <Search size={18} aria-hidden="true" />}
          </button>
        </form>
        <StatusLine status={props.status} message={props.message} empty={!props.results.length && !props.query} />
        <div className="suggestion-row" aria-label="Suggested maritime areas">
          {suggestedQueries.map((suggestion) => (
            <button key={suggestion} type="button" onClick={() => props.onUseSuggestion(suggestion)}>
              {suggestion}
            </button>
          ))}
        </div>
        {props.results.length > 0 ? (
          <AreaResults areas={props.results} onChooseArea={props.onChooseArea} />
        ) : null}
      </section>
      <section className="home-visual" aria-label="Maritime guidance preview">
        <div className="preview-map" aria-hidden="true">
          <div className="preview-lane lane-a" />
          <div className="preview-lane lane-b" />
          <span className="preview-vessel v1" />
          <span className="preview-vessel v2" />
          <span className="preview-vessel v3" />
          <span className="preview-coast" />
        </div>
        <div className="preview-copy">
          <span><Shield size={17} aria-hidden="true" />Evidence</span>
          <span><HelpCircle size={17} aria-hidden="true" />Uncertainty</span>
          <span><Compass size={17} aria-hidden="true" />Next action</span>
        </div>
      </section>
    </main>
  );
}

export function GuideView(props: {
  briefing: MaritimeBriefing;
  query: string;
  results: MaritimeArea[];
  status: AppStatus;
  message?: string;
  onQueryChange(query: string): void;
  onSearch(event?: React.FormEvent): void;
  onChooseArea(area: MaritimeArea): void;
  onRefresh(): void;
  onChooseMapArea(center: Coordinate): void;
}) {
  const loading = props.status === "searching" || props.status === "loading-guide";
  const topRisks = props.briefing.risks.slice(0, 4);
  return (
    <main className="maritime-app">
      <header className="app-header">
        <form className="small-search" onSubmit={props.onSearch}>
          <Search size={18} aria-hidden="true" />
          <input
            value={props.query}
            onChange={(event) => props.onQueryChange(event.target.value)}
            placeholder="Search maritime area"
            aria-label="Search maritime area"
          />
          <button type="submit" disabled={loading || !props.query.trim()} aria-label="Search">
            {props.status === "searching" ? <Loader2 className="spin" size={17} aria-hidden="true" /> : <Search size={17} aria-hidden="true" />}
          </button>
        </form>
        <button className="icon-button" type="button" onClick={props.onRefresh} aria-label="Refresh guide" title="Refresh guide">
          <RefreshCw size={18} aria-hidden="true" className={props.status === "loading-guide" ? "spin" : undefined} />
        </button>
      </header>

      {props.results.length > 0 ? (
        <div className="fixed-search-results">
          <AreaResults areas={props.results} onChooseArea={props.onChooseArea} compact />
        </div>
      ) : null}

      <section className={`guide-hero level-${props.briefing.guidanceLevel}`} aria-labelledby="guide-title">
        <div className="location-line">
          <MapPin size={18} aria-hidden="true" />
          <span>{props.briefing.area.name} · {props.briefing.area.label}</span>
        </div>
        <h1 id="guide-title">{props.briefing.summary}</h1>
        <div className="briefing-meta">
          <GuidanceBadge level={props.briefing.guidanceLevel} label={props.briefing.guidanceLabel} />
          <span>{props.briefing.risks.length ? `${props.briefing.risks.length} things worth attention` : "No clear concern"}</span>
        </div>
      </section>

      {props.briefing.degraded ? (
        <p className="source-banner"><HelpCircle size={17} aria-hidden="true" />{props.briefing.degradedMessage}</p>
      ) : null}
      {props.message ? <p className="source-banner"><HelpCircle size={17} aria-hidden="true" />{props.message}</p> : null}

      <div className="guide-layout">
        <div className="guide-main">
          <GuideSection title="Current Situation" kicker="Current Situation">
            <p className="lead-copy">{props.briefing.currentSituation}</p>
          </GuideSection>

          <GuideSection title="What Matters" kicker="What Matters">
            <MatterGrid statuses={props.briefing.whatMatters} />
          </GuideSection>

          <GuideSection title="What Is Threatened" kicker="What Is Threatened">
            {topRisks.length ? (
              <div className="risk-list">
                {topRisks.map((risk) => <RiskCard key={risk.id} risk={risk} />)}
              </div>
            ) : (
              <NormalState />
            )}
          </GuideSection>

          <GuideSection title="Why We Think That" kicker="Why We Think That">
            <EvidenceList risks={topRisks} sources={props.briefing.sources} />
          </GuideSection>
        </div>

        <aside className="guide-side" aria-label="Map and next steps">
          <MaritimeMap briefing={props.briefing} onCreateArea={props.onChooseMapArea} />
          <GuideSection title="What You Can Do" kicker="What You Can Do" compact>
            <SimpleList lines={props.briefing.whatYouCanDo} icon="action" />
          </GuideSection>
          <GuideSection title="What Remains Unclear" kicker="What Remains Unclear" compact>
            <SimpleList lines={props.briefing.remainsUnclear} icon="unclear" />
          </GuideSection>
          <GuideSection title="What To Watch Next" kicker="What To Watch Next" compact>
            <SimpleList lines={props.briefing.watchNext} icon="watch" />
          </GuideSection>
        </aside>
      </div>
    </main>
  );
}

export function RiskCard({ risk }: { risk: MaritimeRisk }) {
  const [open, setOpen] = useState(false);
  return (
    <article className={`risk-card level-${risk.guidanceLevel}`}>
      <div className="risk-card-main">
        <div className="risk-icon" aria-hidden="true">{matterIcon(risk.whatMatters)}</div>
        <div>
          <div className="risk-heading">
            <h3>{risk.title}</h3>
            <GuidanceBadge level={risk.guidanceLevel} label={risk.guidanceLabel} />
          </div>
          <p>{risk.meaning}</p>
          <div className="risk-action">
            <Compass size={16} aria-hidden="true" />
            <span>{risk.suggestedAction}</span>
          </div>
        </div>
      </div>
      <button className="learn-more" type="button" onClick={() => setOpen((current) => !current)} aria-expanded={open}>
        <span>Evidence and uncertainty</span>
        <ChevronDown size={18} aria-hidden="true" />
      </button>
      {open ? (
        <div className="risk-expanded">
          <InfoBlock title="What matters" lines={[risk.whatMatters]} />
          <InfoBlock title="Threat" lines={[risk.threat]} />
          <InfoBlock title="Evidence" lines={risk.evidence} />
          <InfoBlock title="Uncertainty" lines={risk.uncertainty} />
          <InfoBlock title="Watch next" lines={[risk.watchNext]} />
          <dl className="risk-details">
            <div>
              <dt>Confidence</dt>
              <dd>{risk.confidence}</dd>
            </div>
            <div>
              <dt>Freshness</dt>
              <dd>{risk.freshness}</dd>
            </div>
            <div>
              <dt>Severity</dt>
              <dd>{risk.severity}/4</dd>
            </div>
          </dl>
        </div>
      ) : null}
    </article>
  );
}

function AreaResults({ areas, onChooseArea, compact = false }: {
  areas: MaritimeArea[];
  onChooseArea(area: MaritimeArea): void;
  compact?: boolean;
}) {
  return (
    <div className={compact ? "area-results compact" : "area-results"}>
      {areas.map((area) => (
        <button key={area.id} type="button" onClick={() => onChooseArea(area)}>
          <span>{area.name}</span>
          <small>{area.label}</small>
        </button>
      ))}
    </div>
  );
}

function MatterGrid({ statuses }: { statuses: MatterStatus[] }) {
  return (
    <div className="matter-grid">
      {statuses.map((status) => (
        <div className={`matter-pill status-${status.status}`} key={status.matter}>
          <span aria-hidden="true">{matterIcon(status.matter)}</span>
          <div>
            <strong>{status.matter}</strong>
            <small>{status.summary}</small>
          </div>
        </div>
      ))}
    </div>
  );
}

function EvidenceList({ risks, sources }: { risks: MaritimeRisk[]; sources: MaritimeBriefing["sources"] }) {
  const visible = risks.length ? risks : [];
  if (!visible.length) {
    return <p className="lead-copy">The available evidence does not point to a clear concern.</p>;
  }
  return (
    <div className="evidence-list">
      {visible.map((risk) => {
        const sourceNames = sources.filter((source) => risk.sourceIds.includes(source.id)).map((source) => source.name);
        return (
          <article key={risk.id}>
            <h3>{risk.threat}</h3>
            <p>{risk.evidence.join(" ")}</p>
            <small>{sourceNames.join(", ")} · confidence {risk.confidence}</small>
          </article>
        );
      })}
    </div>
  );
}

function GuideSection({ title, kicker, children, compact = false }: {
  title: string;
  kicker: string;
  children: React.ReactNode;
  compact?: boolean;
}) {
  return (
    <section className={compact ? "guide-section compact" : "guide-section"} aria-labelledby={slug(title)}>
      <p className="section-kicker">{kicker}</p>
      <h2 id={slug(title)}>{title}</h2>
      {children}
    </section>
  );
}

function SimpleList({ lines, icon }: { lines: string[]; icon: "action" | "unclear" | "watch" }) {
  return (
    <ul className="simple-list">
      {lines.map((line) => (
        <li key={line}>
          {icon === "action" ? <CheckCircle2 size={16} aria-hidden="true" /> : icon === "unclear" ? <HelpCircle size={16} aria-hidden="true" /> : <AlertCircle size={16} aria-hidden="true" />}
          <span>{line}</span>
        </li>
      ))}
    </ul>
  );
}

function InfoBlock({ title, lines }: { title: string; lines: string[] }) {
  return (
    <div className="info-block">
      <h4>{title}</h4>
      {lines.map((line) => <p key={line}>{line}</p>)}
    </div>
  );
}

function NormalState() {
  return (
    <div className="normal-state">
      <CheckCircle2 size={20} aria-hidden="true" />
      <p>No clear concern stands out from the available maritime context.</p>
    </div>
  );
}

function StatusLine({ status, message, empty }: { status: AppStatus; message?: string; empty: boolean }) {
  if (status === "searching") return <p className="status-line"><Loader2 className="spin" size={16} aria-hidden="true" />Looking now.</p>;
  if (message) return <p className="status-line"><HelpCircle size={16} aria-hidden="true" />{message}</p>;
  if (empty) return <p className="status-line"><Globe2 size={16} aria-hidden="true" />Start with any maritime place.</p>;
  return null;
}

function GuidanceBadge({ level, label }: { level: GuidanceLevel; label: string }) {
  return <span className={`guidance-badge level-${level}`}>{label}</span>;
}

function matterIcon(matter: MaritimeMatter) {
  if (matter === "Human Safety") return <Shield size={18} aria-hidden="true" />;
  if (matter === "Navigation") return <Navigation size={18} aria-hidden="true" />;
  if (matter === "Port Operations") return <Anchor size={18} aria-hidden="true" />;
  if (matter === "Marine Environment") return <Waves size={18} aria-hidden="true" />;
  if (matter === "Trade Flow") return <Ship size={18} aria-hidden="true" />;
  if (matter === "Fishing Resources") return <Fish size={18} aria-hidden="true" />;
  return <Compass size={18} aria-hidden="true" />;
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
