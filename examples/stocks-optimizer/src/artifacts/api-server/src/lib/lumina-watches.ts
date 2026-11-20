import { luminaDb, luminaId } from "./lumina-store.js";
import type { LuminaSymbol } from "./lumina-market.js";

export type MarketWatch = {
  id: string; symbol: LuminaSymbol; direction: "above" | "below";
  threshold: number; active: boolean; triggeredAt: string | null; createdAt: string;
};
function fromRow(row: any): MarketWatch {
  return {
    id: row.id, symbol: row.symbol, direction: row.direction,
    threshold: Number(row.threshold), active: row.active,
    triggeredAt: row.triggered_at ? new Date(row.triggered_at).toISOString() : null,
    createdAt: new Date(row.created_at).toISOString(),
  };
}
export async function addMarketWatch(owner: string, data: {
  symbol: LuminaSymbol; direction: "above" | "below"; threshold: number;
}) {
  const { rows } = await luminaDb().query(
    "INSERT INTO lumina_market_watches(id,owner_id,symbol,direction,threshold)" +
    " VALUES($1,$2,$3,$4,$5) RETURNING *",
    [luminaId(), owner, data.symbol, data.direction, data.threshold],
  );
  return fromRow(rows[0]);
}
export async function listMarketWatches(owner: string) {
  const { rows } = await luminaDb().query(
    "SELECT * FROM lumina_market_watches WHERE owner_id=$1 ORDER BY created_at DESC LIMIT 100",
    [owner],
  );
  return rows.map(fromRow);
}
export async function deleteMarketWatch(owner: string, id: string) {
  const { rowCount } = await luminaDb().query(
    "DELETE FROM lumina_market_watches WHERE id=$1 AND owner_id=$2", [id, owner],
  );
  return Boolean(rowCount);
}
export async function listInbox(owner: string) {
  const { rows } = await luminaDb().query(
    "SELECT * FROM lumina_inbox WHERE owner_id=$1 ORDER BY created_at DESC LIMIT 100",
    [owner],
  );
  return rows.map((row) => ({
    id: row.id, kind: row.kind, title: row.title, body: row.body,
    source: row.source,
    evidenceAt: row.evidence_at ? new Date(row.evidence_at).toISOString() : null,
    seenAt: row.seen_at ? new Date(row.seen_at).toISOString() : null,
    resolvedAt: row.resolved_at ? new Date(row.resolved_at).toISOString() : null,
    createdAt: new Date(row.created_at).toISOString(),
  }));
}
export async function setInboxState(owner: string, id: string, action: "seen" | "resolved") {
  const column = action === "seen" ? "seen_at" : "resolved_at";
  const { rowCount } = await luminaDb().query(
    "UPDATE lumina_inbox SET " + column + "=COALESCE(" + column + ",now()) WHERE owner_id=$1 AND id=$2",
    [owner, id],
  );
  return Boolean(rowCount);
}

/**
 * Evaluate on an authenticated visit only. The app cannot honestly promise
 * background monitoring or push notifications until scheduled delivery exists.
 */
export async function evaluateWatchesOnVisit(
  owner: string,
  quotes: Record<string, { price: number | null; status: string; quoteAt: string | null }>,
) {
  const { rows } = await luminaDb().query(
    "SELECT * FROM lumina_market_watches WHERE owner_id=$1 AND active=true", [owner],
  );
  for (const watch of rows) {
    const quote = quotes[watch.symbol];
    if (!quote || quote.status !== "fresh" || quote.price == null || !quote.quoteAt) continue;
    const threshold = Number(watch.threshold);
    const condition = watch.direction === "above" ? quote.price >= threshold : quote.price <= threshold;
    if (!condition) continue;
    const client = await luminaDb().connect();
    try {
      await client.query("BEGIN");
      const claimed = await client.query(
        "UPDATE lumina_market_watches SET active=false,triggered_at=$3" +
        " WHERE owner_id=$1 AND id=$2 AND active=true RETURNING id",
        [owner, watch.id, quote.quoteAt],
      );
      if (claimed.rowCount) {
        await client.query(
          "INSERT INTO lumina_inbox (id,owner_id,kind,title,body,source,evidence_at)" +
          " VALUES($1,$2,'market-watch',$3,$4,$5,$6)",
          [luminaId(), owner, watch.symbol + " reached your watch level",
            "Public price: " + String(quote.price) + " USD; your watch was " +
              watch.direction + " " + String(threshold) +
              " USD. This is informational only, not an investment recommendation.",
            "tradingview-data / Binance public", quote.quoteAt],
        );
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK"); throw error;
    } finally { client.release(); }
  }
}
