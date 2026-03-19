// Netlify function: proxy Stooq finance API (no auth, no rate limits).
// Usage: /.netlify/functions/quote?symbols=AAPL,BTC-USD,MSFT
//        /.netlify/functions/quote?symbol=AAPL  (single, backwards-compat)

export async function handler(event) {
  const params = event.queryStringParameters || {};
  const raw = params.symbols || params.symbol || "";
  const symbolList = raw.split(",").map(s => s.trim()).filter(Boolean);

  if (symbolList.length === 0) {
    return { statusCode: 400, body: JSON.stringify({ error: "Missing symbol(s) parameter" }) };
  }

  for (const s of symbolList) {
    if (!/^[A-Z0-9.\-\^\s]{1,20}$/i.test(s)) {
      return { statusCode: 400, body: JSON.stringify({ error: `Invalid symbol: ${s}` }) };
    }
  }

  const results = await Promise.allSettled(symbolList.map(sym => fetchQuote(sym)));

  // If single symbol (backwards compat), return flat object
  if (symbolList.length === 1) {
    const r = results[0];
    if (r.status === "fulfilled") {
      return {
        statusCode: 200,
        headers: jsonHeaders(),
        body: JSON.stringify(r.value),
      };
    }
    return { statusCode: r.value?.status || 500, body: JSON.stringify({ error: r.reason?.message || "Unknown error" }) };
  }

  // Multiple symbols: return array
  const out = results.map((r, i) =>
    r.status === "fulfilled"
      ? r.value
      : { symbol: symbolList[i].toUpperCase(), error: r.reason?.message || "Fetch failed" }
  );

  return {
    statusCode: 200,
    headers: jsonHeaders(),
    body: JSON.stringify(out),
  };
}

function jsonHeaders() {
  return {
    "Content-Type": "application/json",
    "Cache-Control": "public, max-age=300",
    "Access-Control-Allow-Origin": "*",
  };
}

async function fetchQuote(symbol) {
  const stooqSym = toStooqSymbol(symbol.toUpperCase().trim());

  const quoteUrl = `https://stooq.com/q/l/?s=${encodeURIComponent(stooqSym)}&f=sd2t2ohlcvn&e=json`;
  const quoteRes = await fetch(quoteUrl);
  if (!quoteRes.ok) throw new Error(`Stooq returned ${quoteRes.status}`);
  const quoteJson = await quoteRes.json();
  const q = quoteJson?.symbols?.[0];
  if (!q || q.close == null || q.close === "N/D") {
    const err = new Error("Symbol not found");
    err.status = 404;
    throw err;
  }

  const histUrl = `https://stooq.com/q/d/l/?s=${encodeURIComponent(stooqSym)}&i=d`;
  const histRes = await fetch(histUrl);
  const histCsv = histRes.ok ? await histRes.text() : "";
  const sparkline = parseCsvCloses(histCsv, 30);

  const prevClose = sparkline.length >= 2
    ? sparkline[sparkline.length - 2]
    : (q.open ?? q.close);
  const change    = q.close - prevClose;
  const changePct = prevClose !== 0 ? (change / prevClose) * 100 : 0;

  return {
    symbol: symbol.toUpperCase(),
    name: q.name || symbol,
    price: q.close,
    change,
    changePct,
    currency: "USD",
    sparkline,
  };
}

function toStooqSymbol(sym) {
  const cryptoMatch = sym.match(/^([A-Z]+)-USD$/);
  if (cryptoMatch) return cryptoMatch[1] + ".V";
  if (sym.startsWith("^")) return sym;
  if (!sym.includes(".")) return sym + ".US";
  return sym;
}

function parseCsvCloses(csv, n) {
  if (!csv || !csv.trim()) return [];
  const lines = csv.trim().split(/\r?\n/);
  const closes = [];
  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(",");
    const close = parseFloat(parts[4]);
    if (!isNaN(close)) closes.push(close);
  }
  return closes.slice(-n);
}
