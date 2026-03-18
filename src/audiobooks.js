// ─── Proxy config ─────────────────────────────────────────────────────────────
// PROXY_TOKEN must match the PROXY_SECRET environment variable set in Netlify.
const PROXY_TOKEN = "bcf54359503b7799d1850602f5b78fee";

// ─── Book library ─────────────────────────────────────────────────────────────
// Populated dynamically from /.netlify/functions/library on first load.
// Falls back to empty array until the fetch completes.
let BOOKS = [];
