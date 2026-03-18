// ─── State ────────────────────────────────────────────────────────────────────
let abCurrentBook = null;
let abFileIndex = 0;
let abSaveTimer = null;
let abLibraryFilter = "all";
let abLibrarySort = "lastPlayed";
let abBookmarksExpanded = false;
let abMetaCache = {}; // bookId → meta object (in-memory, also persisted to localStorage)

const abAudio = document.getElementById("ab-audio");

// Audio URLs are served directly from ultra.cc.
// The Service Worker (sw.js) intercepts these requests and injects Basic Auth.

// ═══════════════════════════════════════════════════════════════════════════════
// PERSISTENCE
// ═══════════════════════════════════════════════════════════════════════════════

// ─── Progress ─────────────────────────────────────────────────────────────────
// Schema: { fileIndex, position, speed, finished, lastPlayed }

function abGetProgress(bookId) {
  try {
    const raw = localStorage.getItem(`audiobook-progress-${bookId}`);
    if (!raw) return null;
    const p = JSON.parse(raw);
    return {
      fileIndex:  p.fileIndex  ?? 0,
      position:   p.position   ?? 0,
      speed:      p.speed      ?? 1,
      finished:   p.finished   ?? false,
      lastPlayed: p.lastPlayed ?? null,
    };
  } catch { return null; }
}

function abSaveProgress(extra = {}) {
  if (!abCurrentBook) return;
  const existing = abGetProgress(abCurrentBook.id) || {};
  const position = isNaN(abAudio.currentTime) ? (existing.position ?? 0) : abAudio.currentTime;
  const data = {
    fileIndex:  abFileIndex,
    position,
    speed:      abAudio.playbackRate || 1,
    finished:   existing.finished ?? false,
    lastPlayed: existing.lastPlayed ?? null,
    ...extra,
  };
  localStorage.setItem(`audiobook-progress-${abCurrentBook.id}`, JSON.stringify(data));
}

function abStartSaveTimer() {
  clearInterval(abSaveTimer);
  abSaveTimer = setInterval(abSaveProgress, 5000);
}

function abStopSaveTimer() {
  clearInterval(abSaveTimer);
}

// ─── Bookmarks ────────────────────────────────────────────────────────────────
// Schema: [{ fileIndex, position, note, createdAt }]

function abGetBookmarks(bookId) {
  try {
    const raw = localStorage.getItem(`audiobook-bookmarks-${bookId}`);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function abSaveBookmarks(bookId, bookmarks) {
  localStorage.setItem(`audiobook-bookmarks-${bookId}`, JSON.stringify(bookmarks));
}

// ─── Metadata cache ───────────────────────────────────────────────────────────
// Schema: { cover, description, fetchedAt }
const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;

async function abFetchMeta(book) {
  // 1. In-memory cache
  if (abMetaCache[book.id]) return abMetaCache[book.id];

  // 2. localStorage cache (if not stale)
  try {
    const cached = JSON.parse(localStorage.getItem(`audiobook-meta-${book.id}`));
    if (cached && Date.now() - cached.fetchedAt < THIRTY_DAYS) {
      abMetaCache[book.id] = cached;
      return cached;
    }
  } catch {}

  // 3. Fetch from Netlify function
  try {
    const params = new URLSearchParams({ title: book.title, author: book.author });
    const res = await fetch(`/.netlify/functions/book-meta?${params}`);
    if (!res.ok) return null;
    const meta = await res.json();
    if (meta) {
      abMetaCache[book.id] = meta;
      localStorage.setItem(`audiobook-meta-${book.id}`, JSON.stringify(meta));
    }
    return meta || null;
  } catch { return null; }
}

// ═══════════════════════════════════════════════════════════════════════════════
// TAB SWITCHING
// ═══════════════════════════════════════════════════════════════════════════════

function switchTab(tab) {
  document.querySelectorAll(".tab-btn").forEach(t =>
    t.classList.toggle("active", t.dataset.tab === tab)
  );

  const feedSection = document.getElementById("section-feed");
  const abSection   = document.getElementById("section-audiobooks");
  const filterBar   = document.getElementById("filter-bar");
  const watchTally  = document.getElementById("watch-tally");
  const headerTitle = document.getElementById("header-title");
  const refreshBtn  = document.querySelector(".refresh-btn");

  if (tab === "feed") {
    feedSection.hidden = false;
    abSection.hidden   = true;
    filterBar.hidden   = document.getElementById("filter-pills").children.length === 0;
    watchTally.hidden  = !watchTally.textContent.trim();
    headerTitle.textContent = "My Feed";
    refreshBtn.hidden  = false;
    abSaveProgress();
  } else {
    feedSection.hidden = true;
    abSection.hidden   = false;
    filterBar.hidden   = true;
    watchTally.hidden  = true;
    headerTitle.textContent = "My Books";
    refreshBtn.hidden  = true;
    loadLibrary();
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// DYNAMIC LIBRARY LOADING
// ═══════════════════════════════════════════════════════════════════════════════

let abLibraryLoaded = false;

async function loadLibrary(forceRefresh = false) {
  // Already loaded this session and not forcing a refresh
  if (abLibraryLoaded && !forceRefresh) {
    renderAbLibrary();
    return;
  }

  const grid = document.getElementById("ab-library");
  grid.innerHTML = `<p class="ab-library-empty ab-loading">Scanning library…</p>`;

  // Try session cache first (survives tab switches, cleared on reload)
  if (!forceRefresh) {
    try {
      const cached = sessionStorage.getItem("ab-library-cache");
      if (cached) {
        BOOKS = JSON.parse(cached);
        abLibraryLoaded = true;
        renderAbLibrary();
        return;
      }
    } catch {}
  }

  try {
    const params = new URLSearchParams({ t: PROXY_TOKEN });
    const res = await fetch(`/.netlify/functions/library?${params}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    BOOKS = await res.json();
    sessionStorage.setItem("ab-library-cache", JSON.stringify(BOOKS));
    abLibraryLoaded = true;
    renderAbLibrary();
  } catch (err) {
    grid.innerHTML = `
      <div class="ab-library-error">
        <p>Failed to load library.</p>
        <p class="ab-error-detail">${escapeHtml(err.message)}</p>
        <button onclick="loadLibrary(true)">Retry</button>
      </div>`;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// LIBRARY VIEW
// ═══════════════════════════════════════════════════════════════════════════════

function abSetLibraryFilter(filter) {
  abLibraryFilter = filter;
  document.querySelectorAll(".ab-filter-pill").forEach(p =>
    p.classList.toggle("active", p.dataset.filter === filter)
  );
  renderAbLibrary();
}

function abSetLibrarySort(sort) {
  abLibrarySort = sort;
  renderAbLibrary();
}

function abGetFilteredSortedBooks() {
  const pMap = {};
  BOOKS.forEach(b => { pMap[b.id] = abGetProgress(b.id); });

  const filtered = BOOKS.filter(book => {
    const p = pMap[book.id];
    switch (abLibraryFilter) {
      case "inprogress": return p && !p.finished && p.position > 0;
      case "unstarted":  return !p || (!p.finished && p.position === 0);
      case "finished":   return !!p?.finished;
      default:           return true;
    }
  });

  filtered.sort((a, b) => {
    if (abLibrarySort === "az") return a.title.localeCompare(b.title);
    if (abLibrarySort === "za") return b.title.localeCompare(a.title);
    // Recently Played — null lastPlayed goes to bottom
    const pa = pMap[a.id]?.lastPlayed ?? 0;
    const pb = pMap[b.id]?.lastPlayed ?? 0;
    return pb - pa;
  });

  return filtered;
}

function renderAbLibrary() {
  const grid  = document.getElementById("ab-library");
  const books = abGetFilteredSortedBooks();

  if (books.length === 0) {
    grid.innerHTML = `<p class="ab-library-empty">No books in this category.</p>`;
    return;
  }

  grid.innerHTML = books.map(book => {
    const progress = abGetProgress(book.id);
    let badge = "";

    if (progress?.finished) {
      badge = `<span class="ab-badge ab-badge-done">✓ Finished</span>`;
    } else if (progress && progress.position > 0) {
      const ch = book.files[progress.fileIndex]?.chapter || "Chapter";
      badge = `<span class="ab-badge ab-badge-progress">${escapeHtml(ch)} — ${formatDuration(Math.floor(progress.position))}</span>`;
    }

    const meta     = abMetaCache[book.id];
    const coverSrc = meta?.cover || book.cover;
    const coverHtml = coverSrc
      ? `<img class="ab-cover" src="${escapeHtml(coverSrc)}" alt="" loading="lazy" />`
      : `<div class="ab-cover ab-cover-placeholder">📖</div>`;

    return `
      <div class="ab-card" onclick="openBook('${escapeHtml(book.id)}')">
        ${coverHtml}
        <div class="ab-card-info">
          <p class="ab-title">${escapeHtml(book.title)}</p>
          <p class="ab-author">${escapeHtml(book.author)}</p>
          ${badge}
        </div>
      </div>`;
  }).join("");
}

// ═══════════════════════════════════════════════════════════════════════════════
// OPEN / CLOSE PLAYER
// ═══════════════════════════════════════════════════════════════════════════════

async function openBook(bookId) {
  const book = BOOKS.find(b => b.id === bookId);
  if (!book) return;

  abCurrentBook = book;
  abBookmarksExpanded = false;

  const progress = abGetProgress(bookId);
  abFileIndex = progress?.fileIndex ?? 0;

  document.getElementById("ab-library-view").hidden = true;
  document.getElementById("ab-player-view").hidden  = false;

  renderAbPlayer();
  loadAbFile(progress?.position ?? 0);

  // Fetch cover art in background; update UI when ready
  abFetchMeta(book).then(meta => {
    if (meta?.cover) {
      abMetaCache[book.id] = meta;
      abUpdatePlayerCover(meta.cover);
    }
  });
}

function closePlayer() {
  abSaveProgress();
  abStopSaveTimer();
  document.getElementById("ab-player-view").hidden  = true;
  document.getElementById("ab-library-view").hidden = false;
  renderAbLibrary();
}

// ═══════════════════════════════════════════════════════════════════════════════
// PLAYER RENDER
// ═══════════════════════════════════════════════════════════════════════════════

function renderAbPlayer() {
  const book     = abCurrentBook;
  const progress = abGetProgress(book.id);

  document.getElementById("ab-player-title").textContent  = book.title;
  document.getElementById("ab-player-author").textContent = book.author;

  // Cover
  const coverSrc = abMetaCache[book.id]?.cover || book.cover;
  abUpdatePlayerCover(coverSrc);

  // Speed — restore saved value
  const speed = progress?.speed ?? 1;
  abAudio.playbackRate = speed;
  document.querySelectorAll(".ab-speed-btn").forEach(btn =>
    btn.classList.toggle("active", parseFloat(btn.dataset.speed) === speed)
  );

  // Chapter selector
  const chapterSel = document.getElementById("ab-chapter-select");
  if (book.files.length > 1) {
    chapterSel.hidden = false;
    chapterSel.innerHTML = book.files.map((f, i) =>
      `<option value="${i}" ${i === abFileIndex ? "selected" : ""}>${escapeHtml(f.chapter)}</option>`
    ).join("");
  } else {
    chapterSel.hidden = true;
  }

  // Finish button
  const finishBtn = document.getElementById("ab-finish-btn");
  const isFinished = !!progress?.finished;
  finishBtn.textContent = isFinished ? "✓ Finished" : "Mark as Finished";
  finishBtn.classList.toggle("finished", isFinished);

  // Bookmarks
  const list = document.getElementById("ab-bookmarks-list");
  list.hidden = !abBookmarksExpanded;
  renderAbBookmarks();

  updateAbPlayPause();
}

function abUpdatePlayerCover(src) {
  const img         = document.getElementById("ab-player-cover-img");
  const placeholder = document.getElementById("ab-player-cover-placeholder");
  if (src) {
    img.src     = src;
    img.hidden  = false;
    placeholder.hidden = true;
  } else {
    img.hidden  = true;
    placeholder.hidden = false;
  }
}

function loadAbFile(seekTo = 0) {
  const file = abCurrentBook.files[abFileIndex];
  if (!file) return;

  abAudio.src = file.url; // direct URL — SW injects auth header
  abAudio.load();

  const onMeta = () => {
    if (seekTo > 0) abAudio.currentTime = seekTo;
    abAudio.removeEventListener("loadedmetadata", onMeta);
  };
  abAudio.addEventListener("loadedmetadata", onMeta);
}

// ═══════════════════════════════════════════════════════════════════════════════
// PLAYBACK CONTROLS
// ═══════════════════════════════════════════════════════════════════════════════

function abTogglePlay() {
  abAudio.paused ? abAudio.play() : abAudio.pause();
}

function abSkip(seconds) {
  abAudio.currentTime = Math.max(
    0,
    Math.min(abAudio.duration || 0, abAudio.currentTime + seconds)
  );
}

// Feature 1: Speed memory — saved inside abSaveProgress
function abSetSpeed(speed) {
  abAudio.playbackRate = speed;
  document.querySelectorAll(".ab-speed-btn").forEach(btn =>
    btn.classList.toggle("active", parseFloat(btn.dataset.speed) === speed)
  );
  abSaveProgress(); // persists speed immediately
}

function abSelectChapter() {
  const sel = document.getElementById("ab-chapter-select");
  abFileIndex = parseInt(sel.value, 10);
  abSaveProgress();
  const wasPlaying = !abAudio.paused;
  loadAbFile(0);
  if (wasPlaying) abAudio.addEventListener("canplay", () => abAudio.play(), { once: true });
}

// Feature 3: Mark as Finished
function abMarkFinished() {
  if (!abCurrentBook) return;
  const existing   = abGetProgress(abCurrentBook.id) || {};
  const isFinished = !existing.finished;
  localStorage.setItem(
    `audiobook-progress-${abCurrentBook.id}`,
    JSON.stringify({ ...existing, finished: isFinished })
  );
  const btn = document.getElementById("ab-finish-btn");
  btn.textContent = isFinished ? "✓ Finished" : "Mark as Finished";
  btn.classList.toggle("finished", isFinished);
}

// ═══════════════════════════════════════════════════════════════════════════════
// FEATURE 2: BOOKMARKS
// ═══════════════════════════════════════════════════════════════════════════════

function abAddBookmark() {
  if (!abCurrentBook || isNaN(abAudio.currentTime)) return;
  const bookmarks = abGetBookmarks(abCurrentBook.id);
  bookmarks.push({
    fileIndex: abFileIndex,
    position:  abAudio.currentTime,
    note:      "",
    createdAt: Date.now(),
  });
  abSaveBookmarks(abCurrentBook.id, bookmarks);
  renderAbBookmarks();

  // Brief visual feedback on the button
  const btn = document.getElementById("ab-bookmark-btn");
  btn.textContent = "✅";
  btn.disabled = true;
  setTimeout(() => { btn.textContent = "🔖"; btn.disabled = false; }, 800);
}

function abDeleteBookmark(index) {
  const bookmarks = abGetBookmarks(abCurrentBook.id);
  bookmarks.splice(index, 1);
  abSaveBookmarks(abCurrentBook.id, bookmarks);
  renderAbBookmarks();
}

function abEditBookmarkNote(index) {
  const bookmarks = abGetBookmarks(abCurrentBook.id);
  const current   = bookmarks[index]?.note || "";
  const note = prompt("Add a note:", current);
  if (note !== null) {
    bookmarks[index].note = note.trim();
    abSaveBookmarks(abCurrentBook.id, bookmarks);
    renderAbBookmarks();
  }
}

function abSeekToBookmark(fileIndex, position) {
  if (fileIndex !== abFileIndex) {
    abFileIndex = fileIndex;
    const wasPlaying = !abAudio.paused;
    renderAbPlayer();
    loadAbFile(position);
    if (wasPlaying) abAudio.addEventListener("canplay", () => abAudio.play(), { once: true });
  } else {
    abAudio.currentTime = position;
  }
}

function abToggleBookmarks() {
  abBookmarksExpanded = !abBookmarksExpanded;
  document.getElementById("ab-bookmarks-list").hidden = !abBookmarksExpanded;
  document.querySelector(".ab-bookmarks-toggle").classList.toggle("expanded", abBookmarksExpanded);
}

function renderAbBookmarks() {
  const bookmarks = abGetBookmarks(abCurrentBook.id);
  const countEl   = document.getElementById("ab-bookmark-count");
  const list      = document.getElementById("ab-bookmarks-list");

  countEl.textContent = bookmarks.length > 0 ? `(${bookmarks.length})` : "";

  if (bookmarks.length === 0) {
    list.innerHTML = `<p class="ab-bookmarks-empty">No bookmarks yet. Tap 🔖 while playing to add one.</p>`;
    return;
  }

  list.innerHTML = bookmarks.map((bm, i) => {
    const ch = abCurrentBook.files[bm.fileIndex]?.chapter || "Chapter";
    return `
      <div class="ab-bookmark-item" onclick="abSeekToBookmark(${bm.fileIndex}, ${bm.position})">
        <div class="ab-bookmark-info">
          <span class="ab-bookmark-pos">${escapeHtml(ch)} — ${formatDuration(Math.floor(bm.position))}</span>
          ${bm.note ? `<span class="ab-bookmark-note">"${escapeHtml(bm.note)}"</span>` : ""}
        </div>
        <div class="ab-bookmark-actions">
          <button onclick="event.stopPropagation(); abEditBookmarkNote(${i})" class="ab-bm-btn" title="Edit note">✏️</button>
          <button onclick="event.stopPropagation(); abDeleteBookmark(${i})"   class="ab-bm-btn" title="Delete">🗑</button>
        </div>
      </div>`;
  }).join("");
}

// ═══════════════════════════════════════════════════════════════════════════════
// AUDIO ELEMENT EVENT LISTENERS
// ═══════════════════════════════════════════════════════════════════════════════

abAudio.addEventListener("play", () => {
  updateAbPlayPause();
  abStartSaveTimer();
  abSaveProgress({ lastPlayed: Date.now() });

  // Feature 5: MediaSession
  if (abCurrentBook) {
    abUpdateMediaSession(abCurrentBook, abMetaCache[abCurrentBook.id] || null);
  }
});

abAudio.addEventListener("pause", () => {
  updateAbPlayPause();
  abStopSaveTimer();
  abSaveProgress();
});

abAudio.addEventListener("timeupdate", () => {
  const current  = abAudio.currentTime;
  const duration = abAudio.duration || 0;

  const currentEl = document.getElementById("ab-current-time");
  const durEl     = document.getElementById("ab-duration");
  const scrub     = document.getElementById("ab-scrub");

  if (currentEl) currentEl.textContent = formatDuration(Math.floor(current));
  if (durEl)     durEl.textContent     = formatDuration(Math.floor(duration));
  if (scrub)     scrub.value           = duration > 0 ? (current / duration) * 100 : 0;

  // MediaSession position state
  if ("mediaSession" in navigator && abAudio.duration && !isNaN(abAudio.duration)) {
    try {
      navigator.mediaSession.setPositionState({
        duration:     abAudio.duration,
        playbackRate: abAudio.playbackRate,
        position:     abAudio.currentTime,
      });
    } catch {}
  }
});

abAudio.addEventListener("error", () => {
  const err = abAudio.error;
  console.error("Audio error", err?.code, err?.message);
});

abAudio.addEventListener("ended", () => {
  abStopSaveTimer();
  if (abFileIndex < abCurrentBook.files.length - 1) {
    // Auto-advance chapter
    abFileIndex++;
    abSaveProgress();
    renderAbPlayer();
    loadAbFile(0);
    abAudio.addEventListener("canplay", () => abAudio.play(), { once: true });
  } else {
    updateAbPlayPause();
  }
});

function updateAbPlayPause() {
  const btn = document.getElementById("ab-play-btn");
  if (btn) btn.textContent = abAudio.paused ? "▶" : "⏸";
}

// Scrub bar interaction
document.getElementById("ab-scrub").addEventListener("input", e => {
  if (abAudio.duration) {
    abAudio.currentTime = (parseFloat(e.target.value) / 100) * abAudio.duration;
  }
});

// Save on page hide (lock screen, tab switch)
document.addEventListener("visibilitychange", () => {
  if (document.hidden) abSaveProgress();
});

// ═══════════════════════════════════════════════════════════════════════════════
// FEATURE 5: MEDIASESSION (lock screen controls + cover art)
// ═══════════════════════════════════════════════════════════════════════════════

function abUpdateMediaSession(book, meta) {
  if (!("mediaSession" in navigator)) return;

  const chapter = book.files[abFileIndex];
  const artwork = meta?.cover
    ? [{ src: meta.cover, sizes: "512x512", type: "image/jpeg" }]
    : [];

  navigator.mediaSession.metadata = new MediaMetadata({
    title:   book.title,
    artist:  book.author,
    album:   chapter?.chapter || "",
    artwork,
  });

  const prevChapter = () => {
    if (abFileIndex > 0) {
      abFileIndex--;
      renderAbPlayer();
      loadAbFile(0);
      abAudio.addEventListener("canplay", () => abAudio.play(), { once: true });
    }
  };

  const nextChapter = () => {
    if (abFileIndex < abCurrentBook.files.length - 1) {
      abFileIndex++;
      renderAbPlayer();
      loadAbFile(0);
      abAudio.addEventListener("canplay", () => abAudio.play(), { once: true });
    }
  };

  navigator.mediaSession.setActionHandler("play",          () => abAudio.play());
  navigator.mediaSession.setActionHandler("pause",         () => abAudio.pause());
  navigator.mediaSession.setActionHandler("seekbackward",  () => abSkip(-30));
  navigator.mediaSession.setActionHandler("seekforward",   () => abSkip(30));
  navigator.mediaSession.setActionHandler("previoustrack", prevChapter);
  navigator.mediaSession.setActionHandler("nexttrack",     nextChapter);
}
