const symbols = process.argv.slice(2);

if (!symbols.length) {
  console.error("Usage: node scripts/probe-tradingview-symbols.mjs 'EURONEXT OSLO:ASA' ASA ASA.OL EURONEXT:ASA OSL:ASA");
  process.exit(1);
}

function variants(raw) {
  const value = String(raw).trim();
  const base = value.includes(":") ? value.split(":").at(-1) : value;

  const stripped = base
    .replace(/\.OL$/i, "")
    .replace(/\.BR$/i, "")
    .replace(/\.AS$/i, "")
    .replace(/\.PA$/i, "")
    .replace(/\.LS$/i, "")
    .replace(/\.IR$/i, "");

  const marketPrefix = value.includes(":") ? value.split(":")[0] : "";

  const result = new Set([
    value,
    base,
    stripped,
    `${stripped}.OL`,
    `${stripped}.BR`,
    `${stripped}.AS`,
    `${stripped}.PA`,
    `EURONEXT:${stripped}`,
    `OSL:${stripped}`,
    `OSLO:${stripped}`,
    `OSE:${stripped}`,
    `EURONEXT:${stripped}.OL`,
  ]);

  if (/OSLO/i.test(marketPrefix)) {
    result.add(`OSL:${stripped}`);
    result.add(`${stripped}.OL`);
  }

  if (/BRUSSELS/i.test(marketPrefix)) {
    result.add(`${stripped}.BR`);
    result.add(`EURONEXT:${stripped}`);
  }

  if (/AMSTERDAM/i.test(marketPrefix)) {
    result.add(`${stripped}.AS`);
    result.add(`EURONEXT:${stripped}`);
  }

  return Array.from(result).filter(Boolean);
}

async function fetchYahooChart(symbol) {
  const encoded = encodeURIComponent(symbol);
  const url = `https:

  try {
    const res = await fetch(url, {
      headers: {
        Accept: "application/json, text/plain, */*",
        "User-Agent": "Mozilla/5.0",
      },
    });

    if (!res.ok) return { ok: false, status: res.status };

    const payload = await res.json();
    const result = payload?.chart?.result?.[0];
    const timestamps = result?.timestamp ?? [];
    const quote = result?.indicators?.quote?.[0] ?? {};
    const closes = quote?.close ?? [];
    const lastClose = closes.filter((x) => Number.isFinite(Number(x))).at(-1);

    return {
      ok: Number.isFinite(Number(lastClose)),
      status: res.status,
      rows: timestamps.length,
      lastClose,
    };
  } catch (err) {
    return { ok: false, error: err?.message ?? String(err) };
  }
}

async function fetchTradingViewSymbolSearch(query) {
  const url = `https://symbol-search.tradingview.com/symbol_search/?text=${encodeURIComponent(query)}&hl=1&exchange=&lang=en&type=&domain=production`;

  try {
    const res = await fetch(url, {
      headers: {
        Accept: "application/json, text/plain, */*",
        "User-Agent": "Mozilla/5.0",
      },
    });

    if (!res.ok) return { ok: false, status: res.status };

    const payload = await res.json();

    return {
      ok: Array.isArray(payload) && payload.length > 0,
      status: res.status,
      count: Array.isArray(payload) ? payload.length : 0,
      first: Array.isArray(payload)
        ? payload.slice(0, 5).map((item) => ({
            symbol: item.symbol,
            exchange: item.exchange,
            full_name: item.full_name,
            description: item.description,
            type: item.type,
          }))
        : [],
    };
  } catch (err) {
    return { ok: false, error: err?.message ?? String(err) };
  }
}

for (const raw of symbols) {
  console.log(`\n=== ${raw} ===`);

  for (const candidate of variants(raw)) {
    const [yahoo, tvSearch] = await Promise.all([
      fetchYahooChart(candidate),
      fetchTradingViewSymbolSearch(candidate.includes(":") ? candidate.split(":").at(-1) : candidate),
    ]);

    console.log(candidate, {
      yahoo,
      tvSearch,
    });

    if (yahoo.ok) {
      console.log("WORKING_YAHOO_SYMBOL:", candidate);
      break;
    }

    if (tvSearch.ok && tvSearch.first?.length) {
      console.log("TV_SEARCH_MATCHES:", tvSearch.first);
    }
  }
}
