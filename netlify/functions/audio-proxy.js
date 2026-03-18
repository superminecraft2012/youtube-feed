export async function handler(event) {
  const ULTRA_HOST = process.env.ULTRA_HOST;
  const ULTRA_USER = process.env.ULTRA_USER;
  const ULTRA_PASS = process.env.ULTRA_PASS;
  const PROXY_SECRET = process.env.PROXY_SECRET;

  // Check shared secret (sent as query param because <audio> can't send custom headers)
  const token = event.queryStringParameters?.t;
  if (PROXY_SECRET && token !== PROXY_SECRET) {
    return { statusCode: 401, body: "Unauthorized" };
  }

  const url = event.queryStringParameters?.url;
  if (!url) {
    return { statusCode: 400, body: "Missing url parameter" };
  }

  // Whitelist: only proxy requests to your ultra.cc host
  if (!ULTRA_HOST || !url.startsWith(`https://${ULTRA_HOST}`)) {
    return { statusCode: 403, body: "Forbidden" };
  }

  try {
    const credentials = Buffer.from(`${ULTRA_USER}:${ULTRA_PASS}`).toString("base64");

    const fetchHeaders = {
      Authorization: `Basic ${credentials}`,
    };

    // Forward Range header so scrubbing/seeking works
    const range = event.headers["range"] || event.headers["Range"];
    if (range) fetchHeaders["Range"] = range;

    const upstream = await fetch(url, { headers: fetchHeaders });

    const responseHeaders = {
      "Content-Type": upstream.headers.get("content-type") || "audio/mpeg",
      "Accept-Ranges": "bytes",
      "Cache-Control": "private, max-age=3600",
      // Allow the browser audio element to read headers (CORS)
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Range",
      "Access-Control-Expose-Headers": "Content-Length, Content-Range, Accept-Ranges",
    };

    const contentLength = upstream.headers.get("content-length");
    const contentRange = upstream.headers.get("content-range");
    if (contentLength) responseHeaders["Content-Length"] = contentLength;
    if (contentRange) responseHeaders["Content-Range"] = contentRange;

    const arrayBuffer = await upstream.arrayBuffer();
    const body = Buffer.from(arrayBuffer).toString("base64");

    return {
      statusCode: upstream.status, // 206 Partial Content for range requests
      headers: responseHeaders,
      body,
      isBase64Encoded: true,
    };
  } catch (err) {
    return { statusCode: 500, body: `Proxy error: ${err.message}` };
  }
}
