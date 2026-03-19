// Netlify function: proxy Yahoo Finance v8 chart API to avoid CORS restrictions.
// Usage: /.netlify/functions/quote?symbol=AAPL
//        /.netlify/functions/quote?symbol=AAPL&range=5d&interval=30m

export async function handler(event) {
  const { symbol, range = "5d", interval = "30m" } = event.queryStringParameters || {};

  if (!symbol) {
    return { statusCode: 400, body: JSON.stringify({ error: "Missing symbol parameter" }) };
  }

  // Basic symbol validation
  if (!/^[A-Z0-9.\-\^]{1,20}$/i.test(symbol)) {
    return { statusCode: 400, body: JSON.stringify({ error: "Invalid symbol" }) };
  }

  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol.toUpperCase())}?interval=${interval}&range=${range}`;

  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        "Accept": "application/json",
      },
    });

    if (!res.ok) {
      return { statusCode: res.status, body: JSON.stringify({ error: `Yahoo Finance returned ${res.status}` }) };
    }

    const json = await res.json();

    // Cache for 5 minutes — prices don't need to be real-time
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
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
}
