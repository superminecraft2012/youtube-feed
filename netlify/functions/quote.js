// Netlify function: proxy Stooq finance API (no auth, no rate limits).
// Usage: /.netlify/functions/quote?symbol=AAPL
//        /.netlify/functions/quote?symbol=BTC-USD

export async function handler(event) {
  const { symbol } = event.queryStringParameters || {};

  if (!symbol) {
    return { statusCode: 400, body: JSON.stringify({ error: "Missing symbol parameter" }) };
  }

  if (!/^[A-Z0-9.\-\^\s]{1,20}$/i.test(symbol)) {
    return { statusCode: 400, body: JSON.stringify({ error: "Invalid symbol" }) };
  }

  const stooqSym = toStooqSymbol(symbol.toUpperCase().trim());

  try {
    // Fetch current quote
    const quoteUrl = `https://stooq.com/q/l/?s=${encodeURIComponent(stooqSym)}&f=sd2t2ohlcvn&e=json`;
    const quoteRes = await fetch(quoteUrl);
    if (!quoteRes.ok) throw new Error(`Stooq returned ${quoteRes.status}`);
    const quoteJson = await quoteRes.json();
    const q = quoteJson?.symbols?.[0];
    if (!q || q.close == null || q.close === "N/D") {
      return { statusCode: 404, body: JSON.stringify({ error: "Symbol not found" }) };
    }

    // Fetch 30-day daily history for sparkline
    const histUrl = `https://stooq.com/q/d/l/?s=${encodeURIComponent(stooqSym)}&i=d`;
    const histRes = await fetch(histUrl);
    const histCsv = histRes.ok ? await histRes.text() : "";
    const sparkline = parseCsvCloses(histCsv, 30);

    // Previous close = second-to-last sparkline point (or open if only one day)
    const prevClose = sparkline.length >= 2
      ? sparkline[sparkline.length - 2]
      : (q.open ?? q.close);
    const change    = q.close - prevClose;
    const changePct = prevClose !== 0 ? (change / prevClose) * 100 : 0;

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=300",
        "Access-Control-Allow-Origin": "*",
      },
      body: JSON.stringify({
        symbol: symbol.toUpperCase(),
        name: q.name || symbol,
        price: q.close,
        change,
        changePct,
        currency: "USD",
        sparkline,
      }),
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
}

// Map user-friendly symbols to Stooq format
function toStooqSymbol(sym) {
  // Crypto: BTC-USD → BTC.V, ETH-USD → ETH.V
  const cryptoMatch = sym.match(/^([A-Z]+)-USD$/);
  if (cryptoMatch) return cryptoMatch[1] + ".V";

  // Indices already have ^ prefix — Stooq uses ^SPX, ^NDX etc.
  if (sym.startsWith("^")) return sym;

  // US stocks/ETFs: AAPL → AAPL.US
  // If it already has a dot (e.g. BRK.B) keep as-is but add .US
  if (!sym.includes(".")) return sym + ".US";
  return sym;
}

// Parse Stooq CSV history — returns array of last N close prices
function parseCsvCloses(csv, n) {
  if (!csv || !csv.trim()) return [];
  const lines = csv.trim().split(/\r?\n/);
  // First line is header: Date,Open,High,Low,Close,Volume
  const closes = [];
  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(",");
    const close = parseFloat(parts[4]);
    if (!isNaN(close)) closes.push(close);
  }
  return closes.slice(-n);
}
