const AUDIO_EXT = /\.(mp3|m4b|m4a|ogg|opus|flac|aac|wav)$/i;

// Patterns that indicate a video/non-audio folder — skip these
const VIDEO_KW = /\b(bluray|blu-ray|1080p|720p|480p|2160p|4k|x264|x265|xvid|hevc|avc|hdtv|web-dl|webrip|bdrip|dvdrip|remux|hdr|dolby|atmos|dts)\b/i;

// Cache at module level — env vars don't change between invocations
const ULTRA_HOST   = process.env.ULTRA_HOST;
const PROXY_SECRET = process.env.PROXY_SECRET;
const credentials  = process.env.ULTRA_USER && process.env.ULTRA_PASS
  ? Buffer.from(`${process.env.ULTRA_USER}:${process.env.ULTRA_PASS}`).toString("base64")
  : null;

export async function handler(event) {
  const token = event.queryStringParameters?.t;
  if (PROXY_SECRET && token !== PROXY_SECRET) {
    return { statusCode: 401, body: "Unauthorized" };
  }

  const BASE        = `https://${ULTRA_HOST}/downloads/deluge`;
  const authHeaders = {
    Authorization: `Basic ${credentials}`,
    "User-Agent": "Mozilla/5.0",
  };

  try {
    // ── Step 1: Fetch root directory ──────────────────────────────────────────
    const rootHtml   = await fetchText(`${BASE}/`, authHeaders);
    const rootEntries = parseLinks(rootHtml, BASE);

    // Root-level audio files → instant single-file books
    const rootBooks = rootEntries
      .filter(e => !e.isDir && AUDIO_EXT.test(e.name))
      .map(e => singleFileBook(e.name, e.url));

    // Candidate folders: not obviously a video release
    const candidateFolders = rootEntries
      .filter(e => e.isDir && !VIDEO_KW.test(e.name))
      .slice(0, 25); // cap parallel requests to avoid function timeout

    // ── Step 2: Probe each candidate folder for audio files ───────────────────
    const folderResults = await Promise.allSettled(
      candidateFolders.map(async folder => {
        const html  = await fetchText(`${folder.url}/`, authHeaders);
        const items = parseLinks(html, folder.url);

        const audioFiles = items
          .filter(i => !i.isDir && AUDIO_EXT.test(i.name))
          .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));

        if (audioFiles.length === 0) return null;

        const { title, author } = parseMeta(folder.name);
        return {
          id:    slugify(folder.name),
          title,
          author,
          cover: null,
          files: audioFiles.map((f, i) => ({
            chapter: chapterLabel(f.name, i, audioFiles.length),
            url:     f.url,
          })),
        };
      })
    );

    const folderBooks = folderResults
      .filter(r => r.status === "fulfilled" && r.value !== null)
      .map(r => r.value);

    const books = [...rootBooks, ...folderBooks];

    return {
      statusCode: 200,
      headers: {
        "Content-Type":                "application/json",
        "Cache-Control":               "public, max-age=3600", // 1-hour CDN cache
        "Access-Control-Allow-Origin": "*",
      },
      body: JSON.stringify(books),
    };
  } catch (err) {
    return { statusCode: 500, body: `Library error: ${err.message}` };
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function fetchText(url, headers) {
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
  return res.text();
}

/**
 * Parse Apache/Nginx directory listing HTML into a flat list of entries.
 * Returns objects: { name (decoded), encoded (for URL), isDir, url }
 */
function parseLinks(html, base) {
  const results = [];
  const re      = /<a\s[^>]*href="([^"#?]+)"/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const raw = m[1];
    // Skip parent dir, query strings, and absolute URLs
    if (raw === "../" || raw.startsWith("?") || raw.startsWith("/") || raw.startsWith("http")) continue;

    const isDir   = raw.endsWith("/");
    const encoded = isDir ? raw.slice(0, -1) : raw;
    const name    = decodeURIComponent(encoded);

    results.push({ name, encoded, isDir, url: `${base}/${encoded}` });
  }
  return results;
}

function singleFileBook(filename, url) {
  const title = filename.replace(AUDIO_EXT, "").trim();
  return {
    id:    slugify(filename),
    title,
    author: "",
    cover:  null,
    files:  [{ chapter: "Full Book", url }],
  };
}

/**
 * Try to split "Title - Author Name" or "Title (Author Name)" folder names.
 * Falls back to using the full folder name as the title.
 */
function parseMeta(folderName) {
  // "Book Title - Author Name" — Author Name is two+ capitalised words after the dash
  const dash = folderName.match(/^(.+?)\s+-\s+([A-Z][a-zA-Z'.]+(?:\s+[A-Z][a-zA-Z'.]+)+)$/);
  if (dash) return { title: dash[1].trim(), author: dash[2].trim() };

  // "Book Title (Author Name)"
  const paren = folderName.match(/^(.+?)\s+\(([^)]+)\)\s*$/);
  if (paren) return { title: paren[1].trim(), author: paren[2].trim() };

  return { title: folderName, author: "" };
}

function chapterLabel(filename, index, total) {
  const base = filename.replace(AUDIO_EXT, "").trim();
  if (total === 1)       return "Full Book";
  if (/^\d+$/.test(base)) return `Part ${index + 1}`;
  return base;
}

function slugify(str) {
  return str.toLowerCase().replace(/[^\w]+/g, "-").replace(/^-+|-+$/, "");
}
