import { createElement, useEffect, useMemo, useState, type FormEvent } from "react";
import { BarChart3, Clock, ExternalLink, RefreshCw, ShieldCheck } from "lucide-react";
import {
  luminaApi, type MarketSymbol, type MarketHistory, type Quote, type LuminaUser,
} from "@/lib/lumina-api";

const CRYPTO_MARKETS: Array<{ symbol: MarketSymbol; title: string }> = [
  { symbol: "BTCUSDT", title: "Bitcoin" },
  { symbol: "ETHUSDT", title: "Ethereum" },
  { symbol: "SOLUSDT", title: "Solana" },
  { symbol: "BNBUSDT", title: "BNB" },
];
const STOCK_MARKETS: Array<{ symbol: MarketSymbol; title: string }> = [
  { symbol: "PETR4", title: "Petrobras" },
  { symbol: "VALE3", title: "Vale" },
  { symbol: "AAPL", title: "Apple" },
  { symbol: "MSFT", title: "Microsoft" },
];
const WIDGET_URL = "https://widgets.tradingview-widget.com/w/en/tv-advanced-chart.js";

function loadTradingView() {
  if (document.querySelector('script[data-lumina-tradingview="true"]')) return;
  const script = document.createElement("script");
  script.type = "module";
  script.src = WIDGET_URL;
  script.dataset.luminaTradingview = "true";
  document.head.appendChild(script);
}
function money(value: number, currency: "USD" | "BRL") {
  return new Intl.NumberFormat(currency === "BRL" ? "pt-BR" : "en-US", {
    style: "currency", currency,
    maximumFractionDigits: value > 100 ? 2 : 4,
  }).format(value);
}
function displayDate(value: string | null) {
  if (!value) return "Not verified";
  return new Date(value).toLocaleString();
}
function HistoryPlot({ history, currency }: {
  history: MarketHistory | null; currency: "BRL" | "USD";
}) {
  const curve = useMemo(() => {
    const bars = history?.status === "available" ? history.bars : [];
    if (bars.length < 2) return null;
    const first = bars[0];
    const last = bars[bars.length - 1];
    const prices = bars.map((bar) => bar.close);
    const minimum = Math.min(...prices);
    const maximum = Math.max(...prices);
    const span = Math.max(maximum - minimum, maximum * 0.002, 0.01);
    const pad = span * 0.08;
    const lower = minimum - pad;
    const upper = maximum + pad;
    const points = bars.map((bar, index) => {
      const x = 15 + index * 650 / Math.max(1, bars.length - 1);
      const y = 157 - (bar.close - lower) * 140 / (upper - lower);
      return x.toFixed(1) + "," + y.toFixed(1);
    }).join(" ");
    return { first, last, minimum, maximum, points, count: bars.length };
  }, [history]);

  return (
    <figure className="l-history-figure" data-testid="module-history">
      <div className="l-history-title">
        <div><span className="l-label">Historical daily closes</span>
          <strong>Looking backward, not predicting.</strong></div>
        <span className="l-record-badge">tradingview-data</span>
      </div>
      {curve ? (
        <>
          <svg className="l-history-plot" viewBox="0 0 680 178" role="img"
            aria-label={"Historical daily closing prices from " +
              curve.first.timestamp.slice(0, 10) + " to " +
              curve.last.timestamp.slice(0, 10) + ". Prices range from " +
              money(curve.minimum, currency) + " to " + money(curve.maximum, currency)}>
            <line x1="15" y1="157" x2="665" y2="157" stroke="#d7e7db" strokeWidth="1"/>
            <polyline points={curve.points} fill="none" stroke="#3b8062"
              strokeWidth="2.7" strokeLinejoin="round" strokeLinecap="round"/>
            <circle cx="665" cy={Number(curve.points.split(" ").at(-1)?.split(",")[1] ?? 0)}
              r="4" fill="#3b8062" stroke="white" strokeWidth="2"/>
          </svg>
          <div className="l-history-axis">
            <span>{curve.first.timestamp.slice(0, 10)}</span>
            <span>{curve.last.timestamp.slice(0, 10)}</span>
          </div>
          <div className="l-history-facts">
            <span>Observed range <strong>{money(curve.minimum, currency)} – {money(curve.maximum, currency)}</strong></span>
            <span>{curve.count} daily observations</span>
          </div>
        </>
      ) : <div className="l-history-empty" role="status">
        No historical chart is shown because reliable observations are unavailable.
      </div>}
      <figcaption>
        {history?.note ?? "Checking historical data from the tradingview-data module…"}
        {history?.status === "available" ? " Data source: " + (history.source ?? "not specified") + "." : ""}
      </figcaption>
    </figure>
  );
}

export default function LuminaMarketPanel({
  user, onWatchCreated, initialSymbol,
}: { user: LuminaUser | null; onWatchCreated?: () => void; initialSymbol?: MarketSymbol }) {
  const [category, setCategory] = useState<"crypto" | "stocks">(
    initialSymbol && STOCK_MARKETS.some((m) => m.symbol === initialSymbol) ? "stocks" : "crypto");
  const [symbol, setSymbol] = useState<MarketSymbol>(initialSymbol ?? "BTCUSDT");
  const [quote, setQuote] = useState<Quote | null>(null);
  const [history, setHistory] = useState<MarketHistory | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [historyLoading, setHistoryLoading] = useState(true);
  const [chartOpen, setChartOpen] = useState(false);
  const [threshold, setThreshold] = useState("");
  const [direction, setDirection] = useState<"above" | "below">("above");
  const [notice, setNotice] = useState("");
  const [creating, setCreating] = useState(false);
  const currency = quote?.currency ?? (category === "stocks" && ["PETR4", "VALE3"].includes(symbol) ? "BRL" : "USD");
  const isCrypto = category === "crypto";

  useEffect(() => {
    if (!initialSymbol) return;
    setSymbol(initialSymbol);
    setCategory(STOCK_MARKETS.some((m) => m.symbol === initialSymbol) ? "stocks" : "crypto");
  }, [initialSymbol]);

  useEffect(() => {
    let active = true;
    setQuote(null); setHistory(null); setStatus("loading"); setHistoryLoading(true);
    void luminaApi.quote(symbol).then((next) => {
      if (!active) return;
      setQuote(next);
      setStatus("ready");
    }).catch(() => {
      if (active) { setQuote(null); setStatus("error"); }
    });
    void luminaApi.history(symbol, 90).then((next) => {
      if (active) setHistory(next);
    }).catch(() => {
      if (active) setHistory(null);
    }).finally(() => {
      if (active) setHistoryLoading(false);
    });
    return () => { active = false; };
  }, [symbol]);

  useEffect(() => { if (chartOpen) loadTradingView(); }, [chartOpen]);

  function chooseCategory(value: "crypto" | "stocks") {
    if (value === category) return;
    setCategory(value);
    setSymbol(value === "crypto" ? "BTCUSDT" : "PETR4");
    setChartOpen(false); setNotice("");
  }
  async function refreshQuote() {
    setStatus("loading");
    try { setQuote(await luminaApi.quote(symbol)); setStatus("ready"); }
    catch { setQuote(null); setStatus("error"); }
  }
  async function addWatch(event: FormEvent) {
    event.preventDefault();
    if (!user || creating || !isCrypto) return;
    const value = Number(threshold);
    if (!Number.isFinite(value) || value <= 0) {
      setNotice("Enter a positive USD price.");
      return;
    }
    setCreating(true); setNotice("");
    try {
      await luminaApi.addWatch(symbol, direction, value);
      setNotice("Saved. We check your watch when you open the inbox, not continuously in the background.");
      setThreshold(""); onWatchCreated?.();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "The watch could not be saved.");
    } finally { setCreating(false); }
  }
  const statusLabel = quote?.status === "fresh" ? "Fresh exchange quote"
    : quote?.status === "delayed" ? "Indicative / delay unverified"
    : quote?.status === "stale" ? "Stale observation"
    : "Current price unavailable";

  return (
    <section className="l-market-panel" aria-label="Market information">
      <div className="l-market-head">
        <div>
          <div className="l-kicker">Evidence, not a prediction</div>
          <h2 className="l-question">Look closer at the market.</h2>
        </div>
        <span className="l-concept-tag">Independent data</span>
      </div>
      <p>Prices and history come through your <strong>tradingview-data</strong> module. It identifies the underlying provider and what can—or cannot—be verified as live.</p>
      <div className="l-market-categories" role="group" aria-label="Market category">
        <button type="button" aria-pressed={isCrypto} className={isCrypto ? "l-category-active" : ""}
          onClick={() => chooseCategory("crypto")}>Digital assets</button>
        <button type="button" aria-pressed={!isCrypto} className={!isCrypto ? "l-category-active" : ""}
          onClick={() => chooseCategory("stocks")}>Shares</button>
      </div>
      <div className="l-market-symbols" role="group" aria-label="Choose market">
        {(isCrypto ? CRYPTO_MARKETS : STOCK_MARKETS).map((entry) => (
          <button key={entry.symbol} type="button" aria-pressed={symbol === entry.symbol}
            className={symbol === entry.symbol ? "l-active-symbol" : ""}
            onClick={() => { setSymbol(entry.symbol); setNotice(""); setChartOpen(false); }}>
            {entry.title}
          </button>
        ))}
      </div>
      <div className="l-market-quote" aria-live="polite">
        <div>
          <span className="l-label">tradingview-data quote · {symbol}</span>
          <strong>{status === "loading" ? "Checking…" :
            quote?.price != null ? money(quote.price, quote.currency) : "Unavailable"}</strong>
          <span className="l-market-change">
            {quote?.status === "fresh" && quote.change24hPercent != null
              ? (quote.change24hPercent >= 0 ? "+" : "") + quote.change24hPercent.toFixed(2) + "% vs 24h opening price"
              : statusLabel}
          </span>
        </div>
        <button className="l-market-refresh" type="button" onClick={() => void refreshQuote()}
          aria-label="Refresh market quote"><RefreshCw size={16} aria-hidden="true"/></button>
      </div>
      <p className={"l-source-note" + (quote?.status !== "fresh" ? " l-source-pause" : "")}>
        <Clock size={14} aria-hidden="true"/>
        <span>{quote?.note ?? "Market data connection isn't confirmed yet."}<br/>
          Provider: {quote?.underlyingProvider ?? "unavailable"} ·
          Observed: {displayDate(quote?.quoteAt ?? null)}
          {quote?.status === "fresh" ? " · Source-reported realtime" : " · Not verified realtime"}
        </span>
      </p>
      {historyLoading
        ? <p className="l-source-note" role="status">Checking historical observations…</p>
        : <HistoryPlot history={history} currency={currency}/>}
      <div className="l-chart-toggle">
        <button className="l-secondary" type="button" aria-expanded={chartOpen}
          onClick={() => setChartOpen((open) => !open)}>
          <BarChart3 size={16}/>{chartOpen ? "Hide interactive TradingView" : "Open interactive TradingView chart"}
        </button>
        <a href={"https://www.tradingview.com/symbols/" +
          encodeURIComponent((isCrypto ? "BINANCE" : ["PETR4","VALE3"].includes(symbol) ? "BMFBOVESPA" : "NASDAQ") + "-" + symbol) + "/"}
          target="_blank" rel="noopener noreferrer">
          TradingView <ExternalLink size={14} aria-hidden="true"/>
        </a>
      </div>
      {chartOpen ? (
        <div className="l-chart-shell" aria-label={"TradingView chart for " + symbol}>
          <div className="l-tv-widget">
            {createElement("tv-advanced-chart", {
              key: symbol,
              symbol: (quote?.tradingViewSymbol ??
                (isCrypto ? "BINANCE:" : ["PETR4","VALE3"].includes(symbol) ? "BMFBOVESPA:" : "NASDAQ:") + symbol),
              interval: "1D", theme: "light", autosize: "true", locale: "en",
              style: { display: "block", width: "100%", height: 410 },
            })}
          </div>
          <p>TradingView's third-party hosted chart. It has its own feed and privacy terms; it is not used by Lúmina's financial calculations.</p>
        </div>
      ) : null}
      {user && isCrypto ? (
        <form className="l-watch-form" onSubmit={(event) => void addWatch(event)}>
          <div className="l-kicker">An optional price watch</div>
          <p>Save a USD level for this crypto market. We'll check fresh, provider-verified quotes when you open the inbox. No push or continuous monitoring.</p>
          <div className="l-watch-controls">
            <label>When price is
              <select value={direction} onChange={(event) =>
                setDirection(event.target.value as "above" | "below")}>
                <option value="above">At or above</option>
                <option value="below">At or below</option>
              </select>
            </label>
            <label>USD
              <input type="number" min="0.00000001" step="any" required value={threshold}
                onChange={(event) => setThreshold(event.target.value)} placeholder="Price"/>
            </label>
            <button type="submit" className="l-secondary" disabled={creating}>Save watch</button>
          </div>
          {notice ? <p role="status" className="l-inline-note">{notice}</p> : null}
        </form>
      ) : user ? (
        <div className="l-market-guest">
          <ShieldCheck size={16}/><span>Price watches for shares are paused because guest TradingView quote timeliness is unverified.</span>
        </div>
      ) : (
        <div className="l-market-guest"><ShieldCheck size={16}/>
          <span>Sign in to save a crypto price watch. You can explore prices and history without connecting anything.</span>
        </div>
      )}
    </section>
  );
}
