import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  CloudRain,
  Droplets,
  Info,
  Leaf,
  Loader2,
  MapPin,
  RefreshCw,
  Search,
  Shield,
  Sun,
  Wind
} from "lucide-react";
import { useState } from "react";
import type { AttentionLevel, Briefing, BriefingItem, Region } from "../contracts.js";
import { createAwareBrowserClient, type AwareBrowserClient } from "./client.js";

type AppStatus = "idle" | "searching" | "loading-briefing" | "ready" | "error";

export type AwareAppProps = {
  client?: AwareBrowserClient;
};

const defaultClient = createAwareBrowserClient();

export function App({ client = defaultClient }: AwareAppProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Region[]>([]);
  const [briefing, setBriefing] = useState<Briefing | undefined>();
  const [status, setStatus] = useState<AppStatus>("idle");
  const [message, setMessage] = useState<string | undefined>();

  async function runSearch(event?: React.FormEvent) {
    event?.preventDefault();
    if (!query.trim()) return;
    setStatus("searching");
    setMessage(undefined);
    try {
      const found = await client.searchRegions(query);
      setResults(found);
      setStatus("idle");
      if (!found.length) setMessage("No matching region was found.");
    } catch {
      setStatus("error");
      setMessage("Region search is unavailable right now.");
    }
  }

  async function chooseRegion(region: Region) {
    setStatus("loading-briefing");
    setMessage(undefined);
    setResults([]);
    setQuery(region.name);
    try {
      const next = await client.getBriefing(region.id);
      setBriefing(next);
      setStatus("ready");
    } catch {
      setStatus("error");
      setMessage("Some sources are unavailable right now. We are showing what can still be supported.");
    }
  }

  async function refreshBriefing() {
    if (!briefing) return;
    await chooseRegion(briefing.region);
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
        onChooseRegion={(region) => void chooseRegion(region)}
      />
    );
  }

  return (
    <BriefingView
      briefing={briefing}
      query={query}
      results={results}
      status={status}
      message={message}
      onQueryChange={setQuery}
      onSearch={runSearch}
      onChooseRegion={(region) => void chooseRegion(region)}
      onRefresh={() => void refreshBriefing()}
    />
  );
}

export function HomeScreen(props: {
  query: string;
  results: Region[];
  status: AppStatus;
  message?: string;
  onQueryChange(query: string): void;
  onSearch(event?: React.FormEvent): void;
  onChooseRegion(region: Region): void;
}) {
  const loading = props.status === "searching";
  return (
    <main className="aware-home">
      <section className="question-panel" aria-labelledby="aware-question">
        <p className="brand-mark">Aware</p>
        <h1 id="aware-question">Where are you today?</h1>
        <form className="location-search" onSubmit={props.onSearch}>
          <Search size={20} aria-hidden="true" />
          <input
            value={props.query}
            onChange={(event) => props.onQueryChange(event.target.value)}
            placeholder="Search city or region"
            aria-label="Search city or region"
          />
          <button type="submit" disabled={loading || !props.query.trim()} aria-label="Search">
            {loading ? <Loader2 className="spin" size={18} aria-hidden="true" /> : <Search size={18} aria-hidden="true" />}
          </button>
        </form>
        <StatusLine status={props.status} message={props.message} empty={!props.results.length && !props.query} />
        {props.results.length > 0 ? (
          <RegionResults regions={props.results} onChooseRegion={props.onChooseRegion} />
        ) : null}
      </section>
    </main>
  );
}

export function BriefingView(props: {
  briefing: Briefing;
  query: string;
  results: Region[];
  status: AppStatus;
  message?: string;
  onQueryChange(query: string): void;
  onSearch(event?: React.FormEvent): void;
  onChooseRegion(region: Region): void;
  onRefresh(): void;
}) {
  const loading = props.status === "searching" || props.status === "loading-briefing";
  return (
    <main className="aware-app">
      <header className="app-header">
        <form className="small-search" onSubmit={props.onSearch}>
          <Search size={18} aria-hidden="true" />
          <input
            value={props.query}
            onChange={(event) => props.onQueryChange(event.target.value)}
            placeholder="Search city"
            aria-label="Search city"
          />
          <button type="submit" disabled={loading || !props.query.trim()} aria-label="Search">
            {props.status === "searching" ? <Loader2 className="spin" size={17} aria-hidden="true" /> : <Search size={17} aria-hidden="true" />}
          </button>
        </form>
        <button className="icon-button" type="button" onClick={props.onRefresh} aria-label="Refresh briefing" title="Refresh briefing">
          <RefreshCw size={18} aria-hidden="true" className={props.status === "loading-briefing" ? "spin" : undefined} />
        </button>
      </header>

      {props.results.length > 0 ? (
        <div className="floating-results">
          <RegionResults regions={props.results} onChooseRegion={props.onChooseRegion} compact />
        </div>
      ) : null}

      <section className="briefing-hero" aria-labelledby="briefing-title">
        <div className="location-line">
          <MapPin size={18} aria-hidden="true" />
          <span>{props.briefing.region.name}, {props.briefing.region.adminArea}</span>
        </div>
        <h1 id="briefing-title">{props.briefing.summary}</h1>
        <div className="briefing-meta">
          <AttentionBadge level={props.briefing.attentionLevel} label={props.briefing.attentionLabel} />
          <span>{props.briefing.itemCountText}</span>
        </div>
      </section>

      {props.briefing.degraded ? (
        <p className="degraded-banner"><Info size={17} aria-hidden="true" />{props.briefing.degradedMessage}</p>
      ) : null}
      {props.message ? <p className="degraded-banner"><Info size={17} aria-hidden="true" />{props.message}</p> : null}

      <section className="briefing-list" aria-label="Things worth knowing">
        {props.status === "loading-briefing" ? <LoadingBriefing /> : null}
        {props.briefing.items.length ? (
          props.briefing.items.map((item) => <BriefingCard key={item.id} item={item} />)
        ) : (
          <NormalState />
        )}
      </section>
    </main>
  );
}

export function BriefingCard({ item }: { item: BriefingItem }) {
  const [open, setOpen] = useState(false);
  const updated = formatUpdatedTime(item.updatedAt);
  return (
    <article className={`briefing-card level-${item.attentionLevel}`}>
      <div className="card-main">
        <div className="card-icon" aria-hidden="true">{iconFor(item)}</div>
        <div className="card-copy">
          <div className="card-heading">
            <h2>{item.title}</h2>
            <AttentionBadge level={item.attentionLevel} label={item.attentionLabel} />
          </div>
          <p>{item.meaning}</p>
          <div className="primary-action">
            <Shield size={16} aria-hidden="true" />
            <span>{item.primaryAction}</span>
          </div>
        </div>
      </div>
      <button className="learn-more" type="button" onClick={() => setOpen((current) => !current)} aria-expanded={open}>
        <span>Learn more</span>
        <ChevronDown size={18} aria-hidden="true" />
      </button>
      {open ? (
        <div className="expanded-card">
          <InfoBlock title="Why this matters" lines={item.whyThisMatters} />
          <InfoBlock title="What you can do" lines={item.whatYouCanDo} />
          <InfoBlock title="When it matters" lines={[item.whenItMatters]} />
          <p className="plain-explainer">{item.plainLanguageExplanation}</p>
          <details className="source-details">
            <summary>Source details</summary>
            <dl>
              <div>
                <dt>Updated</dt>
                <dd>{updated}</dd>
              </div>
              <div>
                <dt>Freshness</dt>
                <dd>{item.freshnessStatus}</dd>
              </div>
              <div>
                <dt>Reliability</dt>
                <dd>{item.reliability}</dd>
              </div>
              {item.sources.map((source) => (
                <div key={source.id}>
                  <dt>{source.name}</dt>
                  <dd>{source.note}</dd>
                </div>
              ))}
              {item.technicalDetails.map((detail) => (
                <div key={`${item.id}:${detail.label}`}>
                  <dt>{detail.label}</dt>
                  <dd>{detail.value}</dd>
                </div>
              ))}
            </dl>
          </details>
        </div>
      ) : null}
    </article>
  );
}

function RegionResults(props: {
  regions: Region[];
  compact?: boolean;
  onChooseRegion(region: Region): void;
}) {
  return (
    <div className={props.compact ? "region-results compact" : "region-results"} aria-label="Region results">
      {props.regions.map((region) => (
        <button key={region.id} type="button" onClick={() => props.onChooseRegion(region)}>
          <MapPin size={17} aria-hidden="true" />
          <span>
            <strong>{region.name}</strong>
            <small>{region.adminArea}, {region.country}</small>
          </span>
        </button>
      ))}
    </div>
  );
}

function StatusLine(props: { status: AppStatus; message?: string; empty: boolean }) {
  if (props.status === "searching") {
    return <p className="status-line"><Loader2 className="spin" size={17} aria-hidden="true" />Looking now.</p>;
  }
  if (props.message) {
    return <p className="status-line"><Info size={17} aria-hidden="true" />{props.message}</p>;
  }
  if (props.empty) {
    return <p className="status-line muted"><CheckCircle2 size={17} aria-hidden="true" />Start with a city or region.</p>;
  }
  return null;
}

function LoadingBriefing() {
  return (
    <div className="loading-briefing" role="status">
      <Loader2 className="spin" size={20} aria-hidden="true" />
      <span>Building today’s briefing.</span>
    </div>
  );
}

function NormalState() {
  return (
    <div className="normal-note">
      <CheckCircle2 size={22} aria-hidden="true" />
      <p>Nothing unusual requires attention right now.</p>
    </div>
  );
}

function InfoBlock({ title, lines }: { title: string; lines: string[] }) {
  return (
    <section className="info-block">
      <h3>{title}</h3>
      {lines.map((line) => <p key={line}>{line}</p>)}
    </section>
  );
}

function AttentionBadge({ level, label }: { level: AttentionLevel; label: string }) {
  return <span className={`attention-badge badge-${level}`}>{label}</span>;
}

function iconFor(item: BriefingItem) {
  const props = { size: 20, "aria-hidden": true };
  if (item.icon === "sun") return <Sun {...props} />;
  if (item.icon === "cloud-rain") return <CloudRain {...props} />;
  if (item.icon === "wind") return <Wind {...props} />;
  if (item.icon === "leaf") return <Leaf {...props} />;
  if (item.icon === "shield") return <Shield {...props} />;
  if (item.icon === "droplets") return <Droplets {...props} />;
  return <AlertTriangle {...props} />;
}

function formatUpdatedTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "not available";
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}
