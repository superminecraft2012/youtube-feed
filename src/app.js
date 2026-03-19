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
    // Enter resting state: loader dots fade, ring pulses, icon becomes tappable
    splash.classList.add("splash-ready");
    const ring = splash.querySelector(".splash-logo-ring");
    if (ring) ring.classList.add("ring-idle");

    const icon = splash.querySelector(".splash-icon");
    if (icon) {
      // Haptic fires immediately on finger-down for best mobile feel
      icon.addEventListener("touchstart", () => {
        navigator.vibrate?.(8);
      }, { once: true, passive: true });

      icon.addEventListener("click", () => {
        clearInterval(_taglineTimer);

        // Bounce animation + ring burst start together
        icon.classList.add("splash-icon--tapped");
        if (ring) {
          ring.classList.remove("ring-idle");
          ring.classList.add("ring-exit");
        }

        // After bounce settles, icon expands and fades following the ring
        setTimeout(() => {
          icon.classList.remove("splash-icon--tapped");
          icon.classList.add("splash-icon--exit");
        }, 450);

        // After all exit animations finish, dissolve the splash
        setTimeout(() => {
          splash.classList.add("hide");
          splash.addEventListener("transitionend", () => splash.classList.add("gone"), { once: true });
        }, 900);
      }, { once: true });
    }
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

async function fetchFeed(handle, retries = 2) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(`/.netlify/functions/rss?handle=${handle}`);
      if (!res.ok) throw new Error(`Failed to fetch ${handle}: ${res.status}`);
      const xml = await res.text();
      return parseRSS(xml, handle);
    } catch (err) {
      if (attempt < retries) {
        await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
        continue;
      }
      throw err;
    }
  }
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

  // Fetch in batches of 6 to avoid rate-limiting
  const BATCH_SIZE = 6;
  const results = [];
  for (let i = 0; i < CHANNELS.length; i += BATCH_SIZE) {
    const batch = CHANNELS.slice(i, i + BATCH_SIZE);
    const batchResults = await Promise.allSettled(
      batch.map(c => fetchFeed(c.handle))
    );
    results.push(...batchResults);
  }

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
  renderTally();
  // Passive theme drop (non-interrupting). Trigger before deepLink/navigation.
  try {
    const drop = typeof window.tryPassiveDrop === "function" ? window.tryPassiveDrop("video") : null;
    if (drop && typeof window.showPassiveToast === "function") window.showPassiveToast(drop);
  } catch {}
  deepLink(videoId);
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
    const progress = travel / MAX_PULL;                // 0 → 1
    const scaleY = 1 + progress * 0.65;               // stretch tall
    const scaleX = 1 - progress * 0.22;               // squish wide

    const ind = getIndicator();
    if (!ind) return;

    // ptr-stretching disables CSS transitions so the icon tracks the finger instantly
    ind.classList.add('ptr-pulling', 'ptr-stretching');
    ind.style.transform = `translateX(-50%) translateY(${travel}px) scaleY(${scaleY}) scaleX(${scaleX})`;
    ind.classList.toggle('ptr-ready', travel >= THRESHOLD * 0.45);
  }, { passive: true });

  document.addEventListener('touchend', async () => {
    if (!pulling) return;
    pulling = false;

    const ind = getIndicator();
    if (!ind) return;

    const wasReady = ind.classList.contains('ptr-ready');
    ind.classList.remove('ptr-ready', 'ptr-stretching'); // re-enable spring transition

    // rAF ensures the transition is active before we set the snap-back target
    requestAnimationFrame(() => {
      ind.style.transform = 'translateX(-50%) translateY(0px) scaleY(1) scaleX(1)';
      if (!wasReady) ind.classList.remove('ptr-pulling');
    });

    if (wasReady) {
      // Wait for spring snap-back to finish, then switch to rainbow spin
      await new Promise(r => setTimeout(r, 400));
      ind.classList.remove('ptr-pulling');
      ind.classList.add('ptr-spinning');
      await loadFeed();
      ind.classList.remove('ptr-spinning');
    }
  });
})();

loadFeed();

// ─── Call a Friend ─────────────────────────────────────────────────────────────
const CAF_NAMES = ["Eric", "Cole", "Melis", "Tyler", "Kohki", "Blake", "Dad", "Mom", "Minsong", "Popov"];

let cafSpinning = false;

function cafOpen() {
  const modal    = document.getElementById('caf-modal');
  const backdrop = document.getElementById('caf-backdrop');
  const winner   = document.getElementById('caf-winner');
  const spinBtn  = document.getElementById('caf-spin-btn');
  const reel     = document.getElementById('caf-reel');
  const legStatus = document.getElementById('caf-legendary-status');
  const legConfirm = document.getElementById('caf-legendary-confirm');

  // Reset state
  winner.hidden = true;
  if (legStatus) legStatus.hidden = true;
  if (legConfirm) legConfirm.hidden = true;
  spinBtn.disabled = false;
  spinBtn.textContent = 'Spin';
  cafSpinning = false;

  // Populate reel with names (loop 4x for continuous feel)
  const repeated = [...CAF_NAMES, ...CAF_NAMES, ...CAF_NAMES, ...CAF_NAMES];
  reel.innerHTML = repeated.map(n => `<div class="caf-reel-item">${n}</div>`).join('');
  reel.style.transition = 'none';
  reel.style.transform  = 'translateY(0)';

  backdrop.classList.add('visible');
  modal.classList.add('visible');
}

function cafClose() {
  document.getElementById('caf-modal').classList.remove('visible');
  document.getElementById('caf-backdrop').classList.remove('visible');
}

function cafSpin() {
  if (cafSpinning) return;
  cafSpinning = true;

  const spinBtn = document.getElementById('caf-spin-btn');
  const winner  = document.getElementById('caf-winner');
  const reel    = document.getElementById('caf-reel');
  const legStatus = document.getElementById('caf-legendary-status');
  const legConfirm = document.getElementById('caf-legendary-confirm');

  spinBtn.disabled = true;
  winner.hidden = true;

  // Pick winner
  const winnerIndex = Math.floor(Math.random() * CAF_NAMES.length);
  const winnerName  = CAF_NAMES[winnerIndex];

  // Item height (must match CSS)
  const ITEM_H = 56;
  const VISIBLE_ITEMS = 5; // how many show in the window
  const CENTER_OFFSET  = Math.floor(VISIBLE_ITEMS / 2); // 2

  // We'll land on the 3rd repetition of winnerIndex
  // Total items = 40 (4 * 10)
  // Target = 2*10 + winnerIndex (mid-reel to avoid edge)
  const targetPos = 2 * CAF_NAMES.length + winnerIndex;
  const translateY = -(targetPos * ITEM_H) + (CENTER_OFFSET * ITEM_H);

  // Phase 1: fast spin (blur effect via CSS)
  reel.style.transition = 'transform 2.2s cubic-bezier(0.15, 0, 0.1, 1)';
  reel.style.transform  = `translateY(${translateY}px)`;

  // Phase 2: after spin settles, show winner
  setTimeout(() => {
    // Highlight the winner item
    const items = reel.querySelectorAll('.caf-reel-item');
    items.forEach((el, i) => {
      el.classList.toggle('caf-reel-item--winner', i === targetPos);
    });

    // Reveal winner card
    winner.hidden = false;
    document.getElementById('caf-winner-name').textContent = winnerName;
    winner.classList.remove('caf-winner--pop');
    void winner.offsetWidth; // force reflow
    winner.classList.add('caf-winner--pop');

    // Update spin button to allow re-spin
    spinBtn.disabled = false;
    spinBtn.textContent = 'Spin again';
    cafSpinning = false;

    // Legendary: conditionally prompt for the "call_friend" quest.
    try {
      const legendary = typeof window.getLegendaryQuest === "function" ? window.getLegendaryQuest() : null;
      const isCallFriend = !!legendary && legendary.id === "call_friend";
      if (legStatus) legStatus.hidden = !isCallFriend;
      if (legConfirm) legConfirm.hidden = !isCallFriend;
    } catch {}
  }, 2400);
}

// ─── Gamification UI: Settings, Wardrobe, Quests ──────────────────────────

function getEquippedSeed() {
  const state = typeof window.loadThemeState === "function" ? window.loadThemeState() : null;
  const equipped = state?.equipped;
  return equipped == null ? -1 : equipped;
}

function getEquippedThemeName() {
  const seed = getEquippedSeed();
  if (seed === -1) return "Default";
  try {
    const all = typeof window.getAllThemes === "function" ? window.getAllThemes() : [];
    const found = all.find(t => t.seed === seed);
    return found?.name || (typeof window.generateTheme === "function" ? window.generateTheme(seed)?.name : "Default");
  } catch {
    return "Default";
  }
}

function setSettingsSeedLine() {
  const elSeed = document.getElementById("settings-seed-line");
  if (!elSeed) return;
  const seed = getEquippedSeed();
  elSeed.textContent = `Theme seed: ${seed} · tap to copy`;
}

function setSettingsThemeSubtitle() {
  const subtitle = document.getElementById("settings-theme-subtitle");
  if (!subtitle) return;
  subtitle.textContent = getEquippedThemeName();
}

function openSettings() {
  const backdrop = document.getElementById("settings-backdrop");
  const modal = document.getElementById("settings-modal");
  if (!backdrop || !modal) return;

  setSettingsThemeSubtitle();
  setSettingsSeedLine();

  const settingsView = document.getElementById("settings-view");
  const wardrobePanel = document.getElementById("wardrobe-panel");

  if (settingsView) settingsView.hidden = false;
  if (wardrobePanel) wardrobePanel.hidden = true;

  modal.hidden = false;
  backdrop.hidden = false;
  backdrop.classList.add("visible");
  modal.classList.add("visible");
}

function closeSettings() {
  const backdrop = document.getElementById("settings-backdrop");
  const modal = document.getElementById("settings-modal");
  if (!backdrop || !modal) return;

  backdrop.classList.remove("visible");
  modal.classList.remove("visible");

  // Match CSS close duration (220ms-ish).
  setTimeout(() => {
    modal.hidden = true;
    backdrop.hidden = true;
  }, 240);
}

function renderWardrobe() {
  const grid = document.getElementById("wardrobe-grid");
  const empty = document.getElementById("wardrobe-empty");
  if (!grid || !empty) return;

  const state = typeof window.loadThemeState === "function" ? window.loadThemeState() : null;
  const unlocked = state?.unlocked || [];
  const hasAnyUnlocked = unlocked.length > 0;

  if (!hasAnyUnlocked) {
    grid.innerHTML = "";
    empty.hidden = false;
    return;
  }

  empty.hidden = true;

  const all = typeof window.getAllThemes === "function" ? window.getAllThemes() : [];
  const defaultCard = all[0];
  const rest = all.slice(1).reverse(); // most recently unlocked first
  const themes = defaultCard ? [defaultCard, ...rest] : rest;

  const equippedSeed = getEquippedSeed();

  grid.innerHTML = themes
    .map(t => {
      const isEquipped = t.seed === equippedSeed || (equippedSeed === -1 && t.seed === -1);

      const vars = t.vars || {};
      const bg = vars["--theme-bg"] || "var(--theme-bg)";
      const text = vars["--theme-text"] || "var(--theme-text)";
      const accent = vars["--theme-accent"] || "var(--theme-accent)";
      const accent2 = vars["--theme-accent2"] || "var(--theme-accent2)";
      const surface = vars["--theme-surface"] || "var(--theme-surface)";

      const equipHtml = isEquipped
        ? `<span class="wardrobe-equipped" style="color:${accent}">Equipped ✓</span>`
        : `<button class="wardrobe-equip-btn" onclick="onEquipTheme(${t.seed})" style="border-color:${accent}">Equip</button>`;

      return `
        <div class="wardrobe-card" style="background:${bg}; color:${text}; border-color:${accent}">
          <div class="wardrobe-swatches" aria-hidden="true">
            <span class="wardrobe-swatch" style="background:${bg}"></span>
            <span class="wardrobe-swatch" style="background:${surface}"></span>
            <span class="wardrobe-swatch" style="background:${accent}"></span>
            <span class="wardrobe-swatch" style="background:${accent2}"></span>
          </div>
          <p class="wardrobe-name">${escapeHtml(t.name || "Theme")}</p>
          <p class="wardrobe-harmony">${escapeHtml(t.harmony || "")}</p>
          <div class="wardrobe-equip-slot">${equipHtml}</div>
        </div>
      `;
    })
    .join("");
}

function openWardrobe() {
  openSettings();
  const settingsView = document.getElementById("settings-view");
  const wardrobePanel = document.getElementById("wardrobe-panel");
  if (settingsView) settingsView.hidden = true;
  if (wardrobePanel) wardrobePanel.hidden = false;
  renderWardrobe();
}

function closeWardrobe() {
  const settingsView = document.getElementById("settings-view");
  const wardrobePanel = document.getElementById("wardrobe-panel");
  if (settingsView) settingsView.hidden = false;
  if (wardrobePanel) wardrobePanel.hidden = true;
  setSettingsThemeSubtitle();
}

function copyThemeSeed() {
  try {
    const seed = getEquippedSeed();
    const text = String(seed);
    if (!navigator.clipboard || typeof navigator.clipboard.writeText !== "function") return;
    navigator.clipboard.writeText(text);
  } catch {}
}

function onEquipTheme(seed) {
  try {
    if (typeof window.equipTheme === "function") window.equipTheme(seed);
    setSettingsThemeSubtitle();
    setSettingsSeedLine();
    renderWardrobe();
  } catch {}
}

// ─── Quests bottom sheet ─────────────────────────────────────────────────

function renderQuestsSheet() {
  const dailyEl = document.getElementById("daily-quests");
  const legendaryEl = document.getElementById("legendary-quest");
  if (!dailyEl || !legendaryEl) return;

  const daily = typeof window.getDailyQuests === "function" ? window.getDailyQuests() : [];
  const state = typeof window.getQuestState === "function" ? window.getQuestState() : null;
  const dailyCompleted = new Set(state?.dailyCompleted || []);

  dailyEl.innerHTML = daily.map(q => {
    const done = dailyCompleted.has(q.id);
    if (done) {
      return `
        <div class="quest-row quest-row--done">
          <span class="quest-emoji">${escapeHtml(q.emoji || "✅")}</span>
          <span class="quest-label">${escapeHtml(q.label)}</span>
          <span class="quest-status">✓ Done</span>
        </div>
      `;
    }
    return `
      <div class="quest-row">
        <span class="quest-emoji">${escapeHtml(q.emoji || "✅")}</span>
        <span class="quest-label">${escapeHtml(q.label)}</span>
        <button class="quest-done-btn" onclick="onDailyQuestDone('${escapeHtml(q.id)}')">${escapeHtml(q.confirmText || "Done")}</button>
      </div>
    `;
  }).join("");

  const legendary = typeof window.getLegendaryQuest === "function" ? window.getLegendaryQuest() : null;
  if (!legendary) {
    legendaryEl.innerHTML = `<p class="quest-empty">No legendary quest.</p>`;
    return;
  }

  if (legendary.id === "call_friend") {
    legendaryEl.innerHTML = `
      <div class="legendary-card">
        <div class="legendary-badge">⚡ LEGENDARY</div>
        <div class="legendary-row">
          <span class="quest-emoji">${escapeHtml(legendary.emoji || "📞")}</span>
          <span class="quest-label">${escapeHtml(legendary.label)}</span>
        </div>
        <button class="legendary-complete-btn" onclick="closeQuests(); cafOpen()">Open CAF Spinner →</button>
      </div>
    `;
  } else {
    legendaryEl.innerHTML = `
      <div class="legendary-card">
        <div class="legendary-badge">⚡ LEGENDARY</div>
        <div class="legendary-row">
          <span class="quest-emoji">${escapeHtml(legendary.emoji || "🔥")}</span>
          <span class="quest-label">${escapeHtml(legendary.label)}</span>
        </div>
        <button class="legendary-complete-btn" onclick="onLegendaryQuestComplete('${escapeHtml(legendary.id)}')">Mark Complete</button>
      </div>
    `;
  }
}

function openQuests() {
  const backdrop = document.getElementById("quests-backdrop");
  const modal = document.getElementById("quests-modal");
  if (!backdrop || !modal) return;

  renderQuestsSheet();

  modal.hidden = false;
  backdrop.hidden = false;
  backdrop.classList.add("visible");
  modal.classList.add("visible");
}

function openQuestsFromSettings() {
  closeSettings();
  setTimeout(() => openQuests(), 240);
}

function closeQuests() {
  const backdrop = document.getElementById("quests-backdrop");
  const modal = document.getElementById("quests-modal");
  if (!backdrop || !modal) return;

  backdrop.classList.remove("visible");
  modal.classList.remove("visible");

  setTimeout(() => {
    modal.hidden = true;
    backdrop.hidden = true;
  }, 220);
}

function onDailyQuestDone(id) {
  try {
    const theme = typeof window.completeQuest === "function" ? window.completeQuest(id) : null;
    if (theme && typeof window.showLootBox === "function") window.showLootBox(theme);
    renderQuestsSheet();
  } catch {}
}

function onLegendaryQuestComplete(id) {
  try {
    const theme = typeof window.completeQuest === "function" ? window.completeQuest(id) : null;
    if (theme && typeof window.showLootBox === "function") window.showLootBox(theme);
    renderQuestsSheet();
  } catch {}
}

function onLegendaryCallFriendConfirm() {
  try {
    const theme = typeof window.completeQuest === "function" ? window.completeQuest("call_friend") : null;
    cafClose();
    if (theme && typeof window.showLootBox === "function") window.showLootBox(theme);
    // If quests sheet is open, refresh it so the new legendary appears immediately.
    const questsModal = document.getElementById("quests-modal");
    const isOpen = questsModal && !questsModal.hidden && questsModal.classList.contains("visible");
    if (isOpen) renderQuestsSheet();
  } catch {}
}

// Hook up hidden gesture: logo tap -> settings.
const appLogoEl = document.getElementById("app-logo");
if (appLogoEl && typeof openSettings === "function") {
  appLogoEl.addEventListener("click", () => openSettings());
}

