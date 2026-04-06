// Batch RSS fetcher: returns all channel feeds in a single invocation.
// Usage: /.netlify/functions/rss-batch?handles=PewDiePie,AlexHormozi,...

const channelIdCache = new Map();

export async function handler(event) {
  const { handles } = event.queryStringParameters || {};

  if (!handles) {
    return { statusCode: 400, body: JSON.stringify({ error: "Missing handles parameter" }) };
  }

  const handleList = handles.split(",").map(h => h.trim()).filter(Boolean);
  if (handleList.length === 0) {
    return { statusCode: 400, body: JSON.stringify({ error: "No valid handles" }) };
  }

  // Fetch all feeds in parallel
  const results = {};
  const errors = {};

  await Promise.allSettled(
    handleList.map(async (handle) => {
      try {
        const channelId = await resolveChannelId(handle);
        const rssRes = await fetchWithRetry(
          `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`
        );
        if (!rssRes.ok) throw new Error(`RSS fetch failed: ${rssRes.status}`);
        results[handle] = await rssRes.text();
      } catch (err) {
        errors[handle] = err.message;
      }
    })
  );

  return {
    statusCode: 200,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=900",
      "Access-Control-Allow-Origin": "*",
    },
    body: JSON.stringify({ results, errors }),
  };
}

async function fetchWithRetry(url, options = {}, retries = 2) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, options);
      if (res.ok || res.status < 500) return res;
      throw new Error(`HTTP ${res.status}`);
    } catch (err) {
      if (attempt < retries) {
        await new Promise(r => setTimeout(r, 500 * (attempt + 1)));
        continue;
      }
      throw err;
    }
  }
}

async function resolveChannelId(handle) {
  if (channelIdCache.has(handle)) return channelIdCache.get(handle);

  const pageRes = await fetchWithRetry(`https://www.youtube.com/@${handle}`, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
    }
  });

  if (!pageRes.ok) throw new Error(`Page fetch failed: ${pageRes.status}`);
  const html = await pageRes.text();

  const patterns = [
    /feeds\/videos\.xml\?channel_id=(UC[\w-]+)/,
    /"channelId":"(UC[\w-]+)"/,
    /"externalChannelId":"(UC[\w-]+)"/,
    /channel\/(UC[\w-]+)/,
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match) {
      channelIdCache.set(handle, match[1]);
      return match[1];
    }
  }

  throw new Error(`Channel ID not found for @${handle}`);
}
