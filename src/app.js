// ─── Intro Splash ─────────────────────────────────────────────────────────────
const SPLASH_TAGLINES = [
  "Want to call a friend?",
  "Want to go to the gym?",
  "Want to stretch?",
  "Could you take a walk?",
  "Have you had water today?",
  "Want to read instead?",
  "Could this wait until later?",
  "Want to go outside?",
  "Have you eaten yet?",
  "Worth doing something first?",
  "Want to meditate for 5 min?",
  "Could you text someone you miss?",
];

let _taglineTimer = null;

function startTaglineCycle() {
  const el = document.getElementById("splash-tagline");
  if (!el) return;

  // Pick a random starting tagline (not the same one every time)
  let idx = Math.floor(Math.random() * SPLASH_TAGLINES.length);
  el.textContent = SPLASH_TAGLINES[idx];

  _taglineTimer = setInterval(() => {
    // Fade out, swap text, fade in
    el.style.opacity = "0";
    el.style.transform = "translateY(-4px)";
    el.style.transition = "opacity 0.2s ease-in, transform 0.2s ease-in";

    setTimeout(() => {
      idx = (idx + 1) % SPLASH_TAGLINES.length;
      el.textContent = SPLASH_TAGLINES[idx];
      el.style.transition = "opacity 0.3s cubic-bezier(0.16,1,0.3,1), transform 0.3s cubic-bezier(0.16,1,0.3,1)";
      el.style.opacity = "1";
      el.style.transform = "translateY(0)";
    }, 220);
  }, 2200);
}

// Kick off taglines after initial animation settles
setTimeout(startTaglineCycle, 950);

const SPLASH_MIN_MS = 3000;
const splashStart = Date.now();

function dismissSplash() {
  const splash = document.getElementById("intro-splash");
  if (!splash || splash.classList.contains("hide")) return;

  const elapsed = Date.now() - splashStart;
  const delay = Math.max(0, SPLASH_MIN_MS - elapsed);

  setTimeout(() => {
    clearInterval(_taglineTimer);
    splash.classList.add("hide");
    splash.addEventListener("transitionend", () => splash.classList.add("gone"), { once: true });
  }, delay);
}

// ─── Skeleton Loader ──────────────────────────────────────────────────────────
function showSkeletons(count = 6) {
  const skeletonEl = document.getElementById("skeleton-loader");
  if (!skeletonEl) return;
  skeletonEl.innerHTML = Array.from({ length: count }, () => `
    <div class="skeleton-card">
      <div class="skeleton-thumb"></div>
      <div class="skeleton-info">
        <div class="skeleton-line"></div>
        <div class="skeleton-line"></div>
        <div class="skeleton-line"></div>
      </div>
    </div>
  `).join("");
  skeletonEl.style.display = "";
}

function hideSkeletons() {
  const skeletonEl = document.getElementById("skeleton-loader");
  if (skeletonEl) skeletonEl.style.display = "none";
}

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

  // Show skeleton loading cards while we wait
  showSkeletons(6);

  statusEl.hidden = true;

  const results = await Promise.allSettled(
    CHANNELS.map(c => fetchFeed(c.handle))
  );

  const failed = results.filter(r => r.status === "rejected").length;
  allVideos = results
    .filter(r => r.status === "fulfilled")
    .flatMap(r => r.value)
    .filter(v => v.id && v.title)
    .sort((a, b) => b.published - a.published);

  hideSkeletons();
  dismissSplash();

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
  if (card) {
    card.classList.add("expanded");
    // Smooth scroll the card into view if partially hidden
    card.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }
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
    const descSnippet = v.description ? v.description.slice(0, 180) + (v.description.length > 180 ? "…" : "") : "";
    return `
    <div class="card" data-id="${escapeHtml(v.id)}" onclick="handleCardTap('${escapeHtml(v.id)}')">
      <div class="thumb-wrap">
        <img src="${escapeHtml(v.thumbnail || '')}" alt="" loading="lazy" />
        <span class="channel-badge">${escapeHtml(v.channel || '')}</span>
        ${durationStr ? `<span class="duration-badge">${escapeHtml(durationStr)}</span>` : ""}
      </div>
      <div class="info">
        <p class="title">${escapeHtml(v.title || '')}</p>
        <p class="meta">
          <span class="meta-channel">${escapeHtml(v.channel || '')}</span>
          <span class="meta-sep">·</span>
          <span class="meta-time">${timeAgo(v.published)}</span>
        </p>
        ${descSnippet ? `<p class="description">${escapeHtml(descSnippet)}</p>` : ""}
        <button class="watch-btn" onclick="event.stopPropagation(); openVideo('${escapeHtml(v.id)}')">
          <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><polygon points="6,3 20,12 6,21"/></svg>
          Watch
        </button>
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
  // Try the native YouTube app first.
  // If the app opens, the page loses focus/visibility — we detect that
  // and cancel the web fallback so it doesn't fire when you come back.
  window.location = `youtube://www.youtube.com/watch?v=${videoId}`;

  const fallbackDelay = 1800;
  let fallbackTimer = setTimeout(() => {
    // Only open the web URL if the page is still visible (app didn't open)
    if (!document.hidden) {
      window.location = `https://www.youtube.com/watch?v=${videoId}`;
    }
  }, fallbackDelay);

  // If the YouTube app opened, the page will hide — cancel the fallback
  const cancelFallback = () => {
    clearTimeout(fallbackTimer);
    document.removeEventListener("visibilitychange", cancelFallback);
  };
  document.addEventListener("visibilitychange", cancelFallback, { once: true });
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


// ─── Pull-to-Refresh ──────────────────────────────────────────────────────────
(function initPullToRefresh() {
  const THRESHOLD = 72;    // px of pull needed to trigger
  const MAX_PULL  = 100;   // max visual travel
  let startY = 0;
  let pulling = false;
  let indicator = null;

  function getIndicator() {
    if (!indicator) indicator = document.getElementById('ptr-indicator');
    return indicator;
  }

  document.addEventListener('touchstart', e => {
    // Only activate on feed tab, when scrolled to very top
    const feedSection = document.getElementById('section-feed');
    if (!feedSection || feedSection.hidden) return;
    if (window.scrollY > 2) return;
    startY = e.touches[0].clientY;
    pulling = true;
  }, { passive: true });

  document.addEventListener('touchmove', e => {
    if (!pulling) return;
    const dy = e.touches[0].clientY - startY;
    if (dy <= 0) { pulling = false; return; }

    const travel = Math.min(dy * 0.45, MAX_PULL);
    const ind = getIndicator();
    if (!ind) return;

    ind.style.transform = `translateY(${travel}px)`;
    ind.classList.toggle('ptr-ready', travel >= THRESHOLD * 0.45);
  }, { passive: true });

  document.addEventListener('touchend', async () => {
    if (!pulling) return;
    pulling = false;

    const ind = getIndicator();
    if (!ind) return;

    const wasReady = ind.classList.contains('ptr-ready');
    ind.classList.remove('ptr-ready');
    ind.style.transform = '';

    if (wasReady) {
      ind.classList.add('ptr-spinning');
      await loadFeed();
      ind.classList.remove('ptr-spinning');
    }
  });
})();

loadFeed();
