// Netlify function: proxy Yahoo Finance v8 chart API to avoid CORS restrictions.
// Usage: /.netlify/functions/quote?symbol=AAPL
//        /.netlify/functions/quote?symbol=BTC-USD&range=5d&interval=30m

const HOSTS = [
  "https://query1.finance.yahoo.com",
  "https://query2.finance.yahoo.com",
];

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  "Accept": "application/json,text/plain,*/*",
  "Accept-Language": "en-US,en;q=0.9",
};

export async function handler(event) {
  const { symbol, range = "5d", interval = "30m" } = event.queryStringParameters || {};

  if (!symbol) {
    return { statusCode: 400, body: JSON.stringify({ error: "Missing symbol parameter" }) };
  }

  if (!/^[A-Z0-9.\-\^]{1,20}$/i.test(symbol)) {
    return { statusCode: 400, body: JSON.stringify({ error: "Invalid symbol" }) };
  }

  const path = `/v8/finance/chart/${encodeURIComponent(symbol.toUpperCase())}?interval=${interval}&range=${range}`;

  let lastErr = null;
  for (const host of HOSTS) {
    try {
      const res = await fetch(host + path, { headers: HEADERS });
      if (res.status === 429 || res.status === 503) {
        lastErr = `${host} rate-limited (${res.status})`;
        continue; // try next host
      }
      if (!res.ok) {
        return { statusCode: res.status, body: JSON.stringify({ error: `Yahoo Finance returned ${res.status}` }) };
      }
      const json = await res.json();
      return {
        statusCode: 200,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "public, max-age=300",
          "Access-Control-Allow-Origin": "*",
        },
        body: JSON.stringify(json),
      };
    } catch (err) {
      lastErr = err.message;
    }
  }

  return { statusCode: 503, body: JSON.stringify({ error: lastErr || "All Yahoo Finance hosts unavailable" }) };
}
