// In-memory channel ID cache (persists across warm invocations)
const channelIdCache = new Map();

export async function handler(event) {
  const { handle } = event.queryStringParameters;

  if (!handle) {
    return { statusCode: 400, body: "Missing handle parameter" };
  }

  try {
    const channelId = await resolveChannelId(handle);

    const rssRes = await fetchWithRetry(
      `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`
    );
    if (!rssRes.ok) throw new Error(`RSS fetch failed: ${rssRes.status}`);
    const xml = await rssRes.text();

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/xml",
        "Cache-Control": "public, max-age=900"
      },
      body: xml
    };
  } catch (err) {
    return { statusCode: 500, body: `Error: ${err.message}` };
  }
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
  // Return cached channel ID if available
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

  // Try patterns in order of reliability
  const patterns = [
    // RSS <link> tag embedded in page — most reliable
    /feeds\/videos\.xml\?channel_id=(UC[\w-]+)/,
    // JSON data blobs
    /"channelId":"(UC[\w-]+)"/,
    /"externalChannelId":"(UC[\w-]+)"/,
    // Canonical URL or meta tags
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
