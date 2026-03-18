// ─── State ────────────────────────────────────────────────────────────────────
let allVideos = [];
let activeFilter = null;   // null = show all; string = handle to filter
let expandedId = null;     // currently expanded card videoId
let pendingVideoId = null; // video waiting on reason modal

// ─── Data fetching ─────────────────────────────────────────────────────────────
const rssParser = new DOMParser(); // reuse across all RSS parses

async function fetchFeed(handle) {
  const res = await fetch(`/.netlify/functions/rss?handle=${handle}`);
  if (!res.ok) throw new Error(`Failed to fetch ${handle}`);
  const xml = await res.text();
  return parseRSS(xml, handle);
}

function parseRSS(xml, handle) {
  const doc = rssParser.parseFromString(xml, "application/xml");
  return [...doc.querySelectorAll("entry")].map(entry => ({
    id: entry.querySelector("videoId")?.textContent,
    title: entry.querySelector("title")?.textContent,
    channel: entry.querySelector("author name")?.textContent,
    published: new Date(entry.querySelector("published")?.textContent),
    thumbnail: entry.querySelector("thumbnail")?.getAttribute("url"),
    duration: entry.querySelector("duration")?.getAttribute("seconds"),
    description: entry.querySelector("description")?.textContent?.trim() || "",
    handle
  }));
}

async function loadFeed() {
  const statusEl = document.getElementById("status");
  const feed = document.getElementById("feed");

  statusEl.textContent = `Loading ${CHANNELS.length} channels…`;
  statusEl.hidden = false;

  const results = await Promise.allSettled(
    CHANNELS.map(c => fetchFeed(c.handle))
  );

  const failed = results.filter(r => r.status === "rejected").length;
  allVideos = results
    .filter(r => r.status === "fulfilled")
    .flatMap(r => r.value)
    .filter(v => v.id && v.title)
    .sort((a, b) => b.published - a.published);

  statusEl.hidden = true;

  if (allVideos.length === 0) {
    feed.innerHTML = `<p class="empty">No videos found. ${failed} channel(s) failed to load.</p>`;
    return;
  }

  renderFilterPills();
  renderFeed();
  renderTally();

  if (failed > 0) {
    statusEl.textContent = `${failed} channel(s) failed to load`;
    statusEl.classList.add("warn");
    statusEl.hidden = false;
  }
}

// ─── Feature 1: Channel filter pills ──────────────────────────────────────────
function renderFilterPills() {
  const bar = document.getElementById("filter-bar");
  const pillsEl = document.getElementById("filter-pills");

  // Only show channels that actually returned videos
  const seenHandles = new Set(allVideos.map(v => v.handle));
  const channels = CHANNELS
    .filter(c => seenHandles.has(c.handle))
    .sort((a, b) => a.name.localeCompare(b.name));

  const allPill = `<button class="pill active" data-handle="" onclick="filterByChannel('')">All</button>`;
  const channelPills = channels.map(c =>
    `<button class="pill" data-handle="${escapeHtml(c.handle)}" onclick="filterByChannel('${escapeHtml(c.handle)}')">${escapeHtml(c.name)}</button>`
  ).join("");

  pillsEl.innerHTML = allPill + channelPills;
  bar.hidden = false;
}

function filterByChannel(handle) {
  // Empty string = "All"
  activeFilter = handle || null;

  document.querySelectorAll(".pill").forEach(pill => {
    pill.classList.toggle("active", pill.dataset.handle === (handle || ""));
  });

  // Collapse any expanded card when filter changes
  expandedId = null;
  renderFeed();
}

// ─── Feature 3: Card expand/collapse ──────────────────────────────────────────
function handleCardTap(videoId) {
  if (expandedId === videoId) return; // Watch button handles opening
  if (expandedId) {
    const prev = document.querySelector(`[data-id="${expandedId}"]`);
    if (prev) prev.classList.remove("expanded");
  }
  expandedId = videoId;
  const card = document.querySelector(`[data-id="${videoId}"]`);
  if (card) card.classList.add("expanded");
}

// Collapse card when tapping outside
document.getElementById("feed").addEventListener("click", e => {
  if (!e.target.closest(".card") && expandedId) {
    const card = document.querySelector(`[data-id="${expandedId}"]`);
    if (card) card.classList.remove("expanded");
    expandedId = null;
  }
});

// ─── Render ────────────────────────────────────────────────────────────────────
function renderFeed() {
  const feed = document.getElementById("feed");
  const videos = activeFilter
    ? allVideos.filter(v => v.handle === activeFilter)
    : allVideos;

  if (videos.length === 0) {
    feed.innerHTML = `<p class="empty">No videos for this channel.</p>`;
    return;
  }

  feed.innerHTML = videos.map(v => {
    const durationStr = v.duration ? formatDuration(Number(v.duration)) : "";
    const descSnippet = v.description ? v.description.slice(0, 200) + (v.description.length > 200 ? "…" : "") : "";
    return `
    <div class="card" data-id="${escapeHtml(v.id)}" onclick="handleCardTap('${escapeHtml(v.id)}')">
      <div class="thumb-wrap">
        <img src="${escapeHtml(v.thumbnail || '')}" alt="" loading="lazy" />
        ${durationStr ? `<span class="duration-badge">${escapeHtml(durationStr)}</span>` : ""}
      </div>
      <div class="info">
        <p class="title">${escapeHtml(v.title || '')}</p>
        <p class="meta">${escapeHtml(v.channel || '')} · ${timeAgo(v.published)}</p>
        ${descSnippet ? `<p class="description">${escapeHtml(descSnippet)}</p>` : ""}
        <button class="watch-btn" onclick="event.stopPropagation(); openVideo('${escapeHtml(v.id)}')">▶ Watch</button>
      </div>
    </div>`;
  }).join("");
}

// ─── Feature 2: Reason modal ───────────────────────────────────────────────────
function openVideo(videoId) {
  pendingVideoId = videoId;
  document.getElementById("modal-backdrop").classList.add("visible");
  document.getElementById("reason-modal").classList.add("visible");
}

function closeModal() {
  document.getElementById("modal-backdrop").classList.remove("visible");
  document.getElementById("reason-modal").classList.remove("visible");
  pendingVideoId = null;
}

function selectReason(reason) {
  const videoId = pendingVideoId;
  logReason(reason, videoId);
  closeModal();
  deepLink(videoId);
  renderTally();
}

function logReason(reason, videoId) {
  const log = JSON.parse(localStorage.getItem("watchLog") || "[]");
  log.push({ videoId, reason, time: Date.now() });

  // Trim stale entries at most once per day to avoid filtering the entire array on every watch
  const lastTrim = Number(localStorage.getItem("watchLogLastTrim") || 0);
  const now = Date.now();
  if (now - lastTrim > 86400000) {
    const cutoff = now - 90 * 24 * 60 * 60 * 1000;
    const trimmed = log.filter(e => e.time > cutoff);
    localStorage.setItem("watchLog", JSON.stringify(trimmed));
    localStorage.setItem("watchLogLastTrim", String(now));
  } else {
    localStorage.setItem("watchLog", JSON.stringify(log));
  }
}

function renderTally() {
  const log = JSON.parse(localStorage.getItem("watchLog") || "[]");

  // Only count entries from today
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayLog = log.filter(e => e.time >= todayStart.getTime());

  if (todayLog.length === 0) return;

  const counts = {};
  todayLog.forEach(entry => { counts[entry.reason] = (counts[entry.reason] || 0) + 1; });

  const labels = { Learning: "📚", Entertainment: "😂", Background: "🎵", Habit: "😔" };
  const parts = Object.entries(counts)
    .map(([reason, n]) => `${labels[reason] || ""} ${n} ${reason}`)
    .join(" · ");

  const tallyEl = document.getElementById("watch-tally");
  tallyEl.textContent = `Today: ${parts}`;
  tallyEl.hidden = false;
}

function deepLink(videoId) {
  window.location = `youtube://www.youtube.com/watch?v=${videoId}`;
  setTimeout(() => {
    window.location = `https://www.youtube.com/watch?v=${videoId}`;
  }, 1500);
}

// ─── Helpers ───────────────────────────────────────────────────────────────────
// formatDuration and escapeHtml are in helpers.js (shared with audiobook.js)

function timeAgo(date) {
  const diff = (Date.now() - date) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)}d ago`;
  return date.toLocaleDateString();
}

loadFeed();
