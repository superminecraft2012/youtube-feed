// ─── Proxy config ─────────────────────────────────────────────────────────────
// Set PROXY_TOKEN to match the PROXY_SECRET environment variable in Netlify.
// It's sent as a URL query param (the only option for native <audio> elements).
// For a personal private tool this is acceptable — it stops bots, not a determined attacker.
const PROXY_TOKEN = "REPLACE_ME";

// Base URL of your ultra.cc server
const ULTRA_BASE = "https://bennen011.nova.usbx.me/downloads/deluge";

// ─── Book library ──────────────────────────────────────────────────────────────
// For single-file books: one entry in files[].
// For multi-part books: one entry per chapter/part.
// cover: optional path to a local image in src/covers/ (e.g. "/covers/book-001.jpg")
const BOOKS = [
  {
    id: "power-of-now",
    title: "The Power of Now",
    author: "Eckhart Tolle",
    cover: null,
    files: [
      { chapter: "Full Book", url: `${ULTRA_BASE}/The Power of Now.m4b` },
    ],
  },
  {
    id: "letting-go",
    title: "Letting Go",
    author: "David R. Hawkins",
    cover: null,
    files: [
      { chapter: "Full Book", url: `${ULTRA_BASE}/Letting Go.m4b` },
    ],
  },
  {
    id: "unfuk-yourself",
    title: "Unfu*k Yourself",
    author: "Gary John Bishop",
    cover: null,
    files: [
      { chapter: "Full Book", url: `${ULTRA_BASE}/Unfuk Yourself - Gary John Bishop.mp3` },
    ],
  },
  // ── Multi-part examples — fill in the actual filenames from your directory ──
  // {
  //   id: "fractured-infinity",
  //   title: "A Fractured Infinity",
  //   author: "Nathan Tavares",
  //   cover: null,
  //   files: [
  //     { chapter: "Part 1", url: `${ULTRA_BASE}/A Fractured Infinity (Nathan Tavares)/part1.mp3` },
  //     { chapter: "Part 2", url: `${ULTRA_BASE}/A Fractured Infinity (Nathan Tavares)/part2.mp3` },
  //   ],
  // },
  // {
  //   id: "game-of-thrones",
  //   title: "A Game of Thrones",
  //   author: "George R.R. Martin",
  //   cover: null,
  //   files: [
  //     { chapter: "Part 1", url: `${ULTRA_BASE}/A Game of Thrones [Enhanced Edition] - George R.R. Martin/part1.m4b` },
  //   ],
  // },
];
