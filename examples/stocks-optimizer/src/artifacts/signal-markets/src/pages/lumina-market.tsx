import { createElement, useEffect, useState, type FormEvent } from "react";
import { BarChart3, Clock, ExternalLink, RefreshCw, ShieldCheck } from "lucide-react";
import { luminaApi, type MarketSymbol, type Quote, type LuminaUser } from "@/lib/lumina-api";

const MARKETS: Array<{ symbol: MarketSymbol; title: string }> = [
  { symbol: "BTCUSDT", title: "Bitcoin" },
  { symbol: "ETHUSDT", title: "Ethereum" },
  { symbol: "SOLUSDT", title: "Solana" },
  { symbol: "BNBUSDT", title: "BNB" },
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
function priceText(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency", currency: "USD", maximumFractionDigits: value > 100 ? 2 : 4,
  }).format(value);
}

export default function LuminaMarketPanel({
  user, onWatchCreated,
}: { user: LuminaUser | null; onWatchCreated?: () => void }) {
  const [symbol, setSymbol] = useState<MarketSymbol>("BTCUSDT");
  const [quote, setQuote] = useState<Quote | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [chartOpen, setChartOpen] = useState(false);
  const [threshold, setThreshold] = useState("");
  const [direction, setDirection] = useState<"above" | "below">("above");
  const [notice, setNotice] = useState("");
  const [creating, setCreating] = useState(false);

  async function refresh(current: MarketSymbol = symbol) {
    setStatus("loading");
    try {
      setQuote(await luminaApi.quote(current));
      setStatus("ready");
    } catch {
      setQuote(null);
      setStatus("error");
    }
  }
  useEffect(() => { void refresh(symbol); }, [symbol]);
  useEffect(() => { if (chartOpen) loadTradingView(); }, [chartOpen]);

  async function addWatch(event: FormEvent) {
    event.preventDefault();
    if (!user || creating) return;
    const value = Number(threshold);
    if (!Number.isFinite(value) || value <= 0) {
      setNotice("Enter a positive USD price.");
      return;
    }
    setCreating(true);
    setNotice("");
    try {
      await luminaApi.addWatch(symbol, direction, value);
      setNotice("Your watch is saved. It will be checked when you open the inbox; background alerts aren't active yet.");
      setThreshold("");
      onWatchCreated?.();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "The watch could not be saved.");
    } finally { setCreating(false); }
  }

  return (
    <section className="l-market-panel" aria-label="Market information">
      <div className="l-market-head">
        <div>
          <div className="l-kicker">Evidence, not a prediction</div>
          <h2 className="l-question">Look closer at the market.</h2>
        </div>
        <span className="l-concept-tag">External data</span>
      </div>
      <p>Explore an official TradingView chart alongside a separately sourced public exchange quote. Neither is evidence that a trade was executed.</p>
      <div className="l-market-symbols" role="group" aria-label="Choose market">
        {MARKETS.map((entry) => (
          <button key={entry.symbol} type="button"
            aria-pressed={symbol === entry.symbol}
            className={symbol === entry.symbol ? "l-active-symbol" : ""}
            onClick={() => { setSymbol(entry.symbol); setNotice(""); }}>
            {entry.title}
          </button>
        ))}
      </div>
      <div className="l-market-quote" aria-live="polite">
        <div>
          <span className="l-label">Binance Spot public quote · {symbol}</span>
          <strong>{status === "loading" ? "Checking…" : quote?.price != null ? priceText(quote.price) : "Unavailable"}</strong>
          <span className="l-market-change">{quote?.status === "fresh" && quote.change24hPercent != null
            ? (quote.change24hPercent >= 0 ? "+" : "") + quote.change24hPercent.toFixed(2) + "% over 24h"
            : "No verified current change available"}</span>
        </div>
        <button className="l-market-refresh" type="button" onClick={() => void refresh()} aria-label="Refresh market quote">
          <RefreshCw size={16} aria-hidden="true" />
        </button>
      </div>
      <p className={"l-source-note" + (quote?.status !== "fresh" ? " l-source-pause" : "")}>
        <Clock size={14} aria-hidden="true" />
        {quote?.status === "fresh" && quote.quoteAt
          ? "Public exchange observation · " + new Date(quote.quoteAt).toLocaleString()
          : quote?.note ?? "Connection status not yet known."}
        {quote?.status !== "fresh" ? " No new actionable recommendation is available." : ""}
      </p>
      <div className="l-chart-toggle">
        <button className="l-secondary" type="button" aria-expanded={chartOpen} onClick={() => setChartOpen((v) => !v)}>
          <BarChart3 size={16} />{chartOpen ? "Hide TradingView chart" : "Explore TradingView chart"}
        </button>
        <a href={"https://www.tradingview.com/symbols/" + encodeURIComponent("BINANCE-" + symbol) + "/"}
          target="_blank" rel="noopener noreferrer">
          TradingView <ExternalLink size={14} aria-hidden="true" />
        </a>
      </div>
      {chartOpen ? (
        <div className="l-chart-shell" aria-label="TradingView chart for selected market">
          {/*
            The official widget owns the visuals, market feed and licensing.
            It is deliberately NOT used to make server-side financial calculations.
          */}
          <div className="l-tv-widget">
            {createElement("tv-advanced-chart", {
              key: symbol, symbol: "BINANCE:" + symbol, interval: "1D",
              theme: "light", autosize: "true", locale: "en",
              style: { display: "block", width: "100%", height: 410 },
            })}
          </div>
          <p>TradingView-hosted display · Its feed and timestamps may differ from the public quote above. This third-party widget is loaded only when opened.</p>
        </div>
      ) : null}
      {user ? (
        <form className="l-watch-form" onSubmit={(event) => void addWatch(event)}>
          <div className="l-kicker">An optional price watch</div>
          <p>Save a USD price level. We'll check it against fresh public quotes when you open your inbox—not continuously in the background.</p>
          <div className="l-watch-controls">
            <label>When price is
              <select value={direction} onChange={(event) => setDirection(event.target.value as "above" | "below")}>
                <option value="above">At or above</option>
                <option value="below">At or below</option>
              </select>
            </label>
            <label>USD
              <input type="number" min="0.00000001" step="any" required value={threshold}
                onChange={(event) => setThreshold(event.target.value)} placeholder="Price" />
            </label>
            <button type="submit" className="l-secondary" disabled={creating}>Save watch</button>
          </div>
          {notice ? <p role="status" className="l-inline-note">{notice}</p> : null}
        </form>
      ) : <div className="l-market-guest"><ShieldCheck size={16} /><span>Sign in to save a watch. You can explore the chart without connecting anything.</span></div>}
    </section>
  );
}

