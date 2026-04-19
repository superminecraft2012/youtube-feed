// Fetches video durations by scraping watch pages.
// Usage: /.netlify/functions/duration?ids=VIDEOID1,VIDEOID2,...  (max 50)

const durationCache = new Map();

export async function handler(event) {
  const { ids } = event.queryStringParameters || {};

  if (!ids) {
    return { statusCode: 400, body: JSON.stringify({ error: "Missing ids parameter" }) };
  }

  const idList = ids.split(",").map(s => s.trim()).filter(Boolean).slice(0, 50);

  const durations = {};
  const uncached = [];

  for (const id of idList) {
    if (durationCache.has(id)) durations[id] = durationCache.get(id);
    else uncached.push(id);
  }

  const results = await Promise.allSettled(uncached.map(fetchDuration));
  results.forEach((r, i) => {
    if (r.status === "fulfilled") {
      const id = uncached[i];
      durations[id] = r.value;
      durationCache.set(id, r.value);
    }
  });

  return {
    statusCode: 200,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=86400",
      "Access-Control-Allow-Origin": "*",
    },
    body: JSON.stringify({ durations }),
  };
}

async function fetchDuration(id) {
  const res = await fetch(`https://www.youtube.com/watch?v=${id}`, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();
  const m = html.match(/"lengthSeconds":"(\d+)"/);
  if (!m) throw new Error("lengthSeconds not found");
  return Number(m[1]);
}
