// Streams audio from ultra.cc with Basic Auth injected server-side.
// Responses are capped at CHUNK_SIZE bytes to stay within Netlify's 6 MB body limit.
// The browser's <audio> element makes multiple Range requests automatically — this is normal.
const CHUNK_SIZE = 512 * 1024; // 512 KB per response

export async function handler(event) {
  const ULTRA_HOST   = process.env.ULTRA_HOST;
  const ULTRA_USER   = process.env.ULTRA_USER;
  const ULTRA_PASS   = process.env.ULTRA_PASS;
  const PROXY_SECRET = process.env.PROXY_SECRET;

  const token = event.queryStringParameters?.t;
  if (PROXY_SECRET && token !== PROXY_SECRET) {
    return { statusCode: 401, body: "Unauthorized" };
  }

  const url = event.queryStringParameters?.url;
  if (!url) return { statusCode: 400, body: "Missing url" };

  if (!ULTRA_HOST || !url.startsWith(`https://${ULTRA_HOST}`)) {
    return { statusCode: 403, body: "Forbidden" };
  }

  try {
    const credentials = Buffer.from(`${ULTRA_USER}:${ULTRA_PASS}`).toString("base64");
    const rawRange    = event.headers["range"] || event.headers["Range"];
    const range       = clampRange(rawRange, CHUNK_SIZE);

    const upstream = await fetch(url, {
      headers: {
        Authorization: `Basic ${credentials}`,
        Range: range,
      },
    });

    const responseHeaders = {
      "Content-Type":                  upstream.headers.get("content-type") || "audio/mpeg",
      "Accept-Ranges":                 "bytes",
      "Cache-Control":                 "private, max-age=3600",
      "Access-Control-Allow-Origin":   "*",
      "Access-Control-Expose-Headers": "Content-Length, Content-Range, Accept-Ranges",
    };

    const contentLength = upstream.headers.get("content-length");
    const contentRange  = upstream.headers.get("content-range");
    if (contentLength) responseHeaders["Content-Length"] = contentLength;
    if (contentRange)  responseHeaders["Content-Range"]  = contentRange;

    const body = Buffer.from(await upstream.arrayBuffer()).toString("base64");

    return {
      statusCode: upstream.status,
      headers: responseHeaders,
      body,
      isBase64Encoded: true,
    };
  } catch (err) {
    return { statusCode: 500, body: `Proxy error: ${err.message}` };
  }
}

function clampRange(rawRange, chunkSize) {
  if (!rawRange) return `bytes=0-${chunkSize - 1}`;
  const m = rawRange.match(/^bytes=(\d+)-(\d*)$/);
  if (!m) return `bytes=0-${chunkSize - 1}`;
  const start = parseInt(m[1], 10);
  const end   = m[2] ? parseInt(m[2], 10) : NaN;
  if (isNaN(end) || end - start + 1 > chunkSize) {
    return `bytes=${start}-${start + chunkSize - 1}`;
  }
  return rawRange;
}
