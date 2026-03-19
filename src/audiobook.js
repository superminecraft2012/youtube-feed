// ─── State ────────────────────────────────────────────────────────────────────
let abCurrentBook = null;
let abFileIndex = 0;
let abSaveTimer = null;
let abLibraryFilter = "all";
let abLibrarySort = "lastPlayed";
let abBookmarksExpanded = false;
let abMetaCache = {}; // bookId → meta object (in-memory, also persisted to localStorage)
let abMetaTimeout = null;

const abAudio = document.getElementById("ab-audio");

// ─── Proxy URL ────────────────────────────────────────────────────────────────
function abProxyUrl(rawUrl) {
  const params = new URLSearchParams({ url: rawUrl, t: PROXY_TOKEN });
  return `/.netlify/functions/audio-proxy?${params}`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// PERSISTENCE
// ═══════════════════════════════════════════════════════════════════════════════

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
const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;

async function abFetchMeta(book) {
  if (abMetaCache[book.id]) return abMetaCache[book.id];
  try {
    const cached = JSON.parse(localStorage.getItem(`audiobook-meta-${book.id}`));
    if (cached && Date.now() - cached.fetchedAt < THIRTY_DAYS) {
      abMetaCache[book.id] = cached;
      return cached;
    }
  } catch {}
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

  const feedSection     = document.getElementById("section-feed");
  const abSection       = document.getElementById("section-audiobooks");
  const finSection      = document.getElementById("section-finance");
  const questsBtn       = document.getElementById("quests-btn");
  const filterBar       = document.getElementById("filter-bar");
  const watchTally      = document.getElementById("watch-tally");
  const headerTitle     = document.getElementById("header-title");
  const cafBtn          = document.getElementById("caf-btn");

  // Hide all sections first
  feedSection.hidden = true;
  abSection.hidden   = true;
  if (finSection) finSection.hidden = true;
  filterBar.hidden   = true;
  watchTally.hidden  = true;
  if (cafBtn) cafBtn.hidden = true;
  if (questsBtn) questsBtn.hidden = true;

  if (tab === "feed") {
    feedSection.hidden = false;
    filterBar.hidden   = document.getElementById("filter-pills").children.length === 0;
    watchTally.hidden  = !watchTally.textContent.trim();
    headerTitle.textContent = "My Feed";
    if (cafBtn) cafBtn.hidden = false;
    if (questsBtn) questsBtn.hidden = false;
  } else if (tab === "finance") {
    if (finSection) finSection.hidden = false;
    headerTitle.textContent = "Finance";
    if (typeof finOnTabActivate === "function") finOnTabActivate();
  } else {
    abSection.hidden   = false;
    headerTitle.textContent = "My Books";
    abSaveProgress({ lastPlayed: Date.now() });
    loadLibrary();
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// DYNAMIC LIBRARY LOADING
// ═══════════════════════════════════════════════════════════════════════════════

let abLibraryLoaded = false;

async function loadLibrary(forceRefresh = false) {
  if (abLibraryLoaded && !forceRefresh) {
    renderAbLibrary();
    return;
  }

  const grid = document.getElementById("ab-library");
  grid.innerHTML = `<p class="ab-library-empty ab-loading">Scanning library…</p>`;

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
    const pa = pMap[a.id]?.lastPlayed ?? 0;
    const pb = pMap[b.id]?.lastPlayed ?? 0;
    return pb - pa;
  });

  return { books: filtered, pMap };
}

function renderAbLibrary() {
  const listEl = document.getElementById("ab-library");
  const { books, pMap } = abGetFilteredSortedBooks();

  if (books.length === 0) {
    listEl.innerHTML = `<p class="ab-library-empty">No books in this category.</p>`;
    return;
  }

  listEl.innerHTML = books.map(book => {
    const progress = pMap[book.id];
    let badge = "";

    if (progress?.finished) {
      badge = `<span class="ab-badge ab-badge-done">✓ Finished</span>`;
    } else if (progress && progress.position > 0) {
      const ch = book.files[progress.fileIndex]?.chapter || "Chapter";
      badge = `<span class="ab-badge ab-badge-progress">${escapeHtml(ch)} — ${formatDuration(Math.floor(progress.position))}</span>`;
    }

    return `
      <div class="ab-list-row" onclick="openBook('${escapeHtml(book.id)}')">
        <div class="ab-list-text">
          <p class="ab-title">${escapeHtml(book.title)}</p>
          <p class="ab-author">${escapeHtml(book.author)}</p>
        </div>
        <div class="ab-row-badge">${badge}</div>
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

  // Load cover art asynchronously
  const coverEl = document.getElementById("ab-cover-art");
  if (coverEl) {
    coverEl.innerHTML = "🎧"; // reset
    abFetchMeta(book).then(meta => {
      if (meta?.cover && coverEl) {
        coverEl.innerHTML = `<img src="${escapeHtml(meta.cover)}" alt="${escapeHtml(book.title)} cover" />`;
      }
    });
  }
}

function closePlayer() {
  abSaveProgress({ lastPlayed: Date.now() });
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

  const speed = progress?.speed ?? 1;
  abAudio.playbackRate = speed;
  document.querySelectorAll(".ab-speed-btn").forEach(btn =>
    btn.classList.toggle("active", parseFloat(btn.dataset.speed) === speed)
  );

  const chapterSel = document.getElementById("ab-chapter-select");
  if (book.files.length > 1) {
    chapterSel.hidden = false;
    chapterSel.innerHTML = book.files.map((f, i) =>
      `<option value="${i}" ${i === abFileIndex ? "selected" : ""}>${escapeHtml(f.chapter)}</option>`
    ).join("");
  } else {
    chapterSel.hidden = true;
  }

  const finishBtn = document.getElementById("ab-finish-btn");
  const isFinished = !!progress?.finished;
  finishBtn.textContent = isFinished ? "✓ Finished" : "Mark as Finished";
  finishBtn.classList.toggle("finished", isFinished);

  const list = document.getElementById("ab-bookmarks-list");
  list.hidden = !abBookmarksExpanded;
  renderAbBookmarks();

  updateAbPlayPause();
}

function loadAbFile(seekTo = 0) {
  const file = abCurrentBook.files[abFileIndex];
  if (!file) return;

  if (abDurationEl)    abDurationEl.textContent = "--:--";
  if (abCurrentTimeEl) abCurrentTimeEl.textContent = "0:00";
  if (abScrubEl)       abScrubEl.value = 0;

  abHideAudioError();

  clearTimeout(abMetaTimeout);
  abMetaTimeout = setTimeout(() => {
    const duration = abAudio.duration;
    if (!duration || isNaN(duration)) {
      abShowAudioError(
        "⚠️ Can't load audio metadata. Some .m4b files require re-muxing or converting to MP3."
      );
    }
  }, 12000);

  abAudio.src = abProxyUrl(file.url);
  abAudio.load();

  const onMeta = () => {
    if (abDurationEl && abAudio.duration && !isNaN(abAudio.duration)) {
      abDurationEl.textContent = formatDuration(Math.floor(abAudio.duration));
    }
    if (seekTo > 0) abAudio.currentTime = seekTo;
    clearTimeout(abMetaTimeout);
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

function abSetSpeed(speed) {
  abAudio.playbackRate = speed;
  document.querySelectorAll(".ab-speed-btn").forEach(btn =>
    btn.classList.toggle("active", parseFloat(btn.dataset.speed) === speed)
  );
  abSaveProgress();
}

function abSelectChapter() {
  const sel = document.getElementById("ab-chapter-select");
  abFileIndex = parseInt(sel.value, 10);
  abSaveProgress();
  const wasPlaying = !abAudio.paused;
  loadAbFile(0);
  if (wasPlaying) abAudio.addEventListener("canplay", () => abAudio.play(), { once: true });
}

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
// BOOKMARKS
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

  if (abCurrentBook) {
    abUpdateMediaSession(abCurrentBook, abMetaCache[abCurrentBook.id] || null);
  }
});

abAudio.addEventListener("pause", () => {
  updateAbPlayPause();
  abStopSaveTimer();
  abSaveProgress();
});

const abCurrentTimeEl = document.getElementById("ab-current-time");
const abDurationEl    = document.getElementById("ab-duration");
const abScrubEl       = document.getElementById("ab-scrub");

let abLastTimeUpdate = 0;
abAudio.addEventListener("timeupdate", () => {
  const now = performance.now();
  if (now - abLastTimeUpdate < 1000) return;
  abLastTimeUpdate = now;

  const current  = abAudio.currentTime;
  const duration = abAudio.duration || 0;

  if (abCurrentTimeEl) abCurrentTimeEl.textContent = formatDuration(Math.floor(current));
  if (abDurationEl && duration && !isNaN(duration)) {
    abDurationEl.textContent = formatDuration(Math.floor(duration));
  }
  if (abScrubEl && duration) {
    abScrubEl.value = (current / duration) * 100;
  }

  // Auto-advance to next chapter
  if (duration > 0 && current >= duration - 0.5 && abCurrentBook) {
    if (abFileIndex < abCurrentBook.files.length - 1) {
      // Passive theme drop on chapter completion (non-interrupting).
      try {
        const drop = typeof window.tryPassiveDrop === "function" ? window.tryPassiveDrop("chapter") : null;
        if (drop && typeof window.showPassiveToast === "function") window.showPassiveToast(drop);
      } catch {}

      abFileIndex++;
      const wasPlaying = !abAudio.paused;
      renderAbPlayer();
      loadAbFile(0);
      if (wasPlaying) abAudio.addEventListener("canplay", () => abAudio.play(), { once: true });
    }
  }
});

abAudio.addEventListener("error", () => {
  abShowAudioError("⚠️ Audio failed to load. Check your connection or try another file.");
});

// Scrub bar interaction
if (abScrubEl) {
  abScrubEl.addEventListener("input", () => {
    if (abAudio.duration) {
      abAudio.currentTime = (abScrubEl.value / 100) * abAudio.duration;
    }
  });
}

// ─── Play/Pause UI ────────────────────────────────────────────────────────────
function updateAbPlayPause() {
  const btn = document.getElementById("ab-play-btn");
  if (!btn) return;
  btn.textContent = abAudio.paused ? "▶" : "⏸";
  btn.setAttribute("aria-label", abAudio.paused ? "Play" : "Pause");
}

// ─── Audio error helpers ──────────────────────────────────────────────────────
let abErrorEl = null;

function abShowAudioError(msg) {
  abHideAudioError();
  abErrorEl = document.createElement("p");
  abErrorEl.className = "ab-audio-error";
  abErrorEl.textContent = msg;
  const body = document.querySelector(".ab-player-body");
  if (body) body.insertBefore(abErrorEl, body.firstChild);
}

function abHideAudioError() {
  if (abErrorEl) {
    abErrorEl.remove();
    abErrorEl = null;
  }
}

// ─── MediaSession ─────────────────────────────────────────────────────────────
function abUpdateMediaSession(book, meta) {
  if (!("mediaSession" in navigator)) return;

  const artwork = [];
  if (meta?.cover) {
    artwork.push({ src: meta.cover, sizes: "512x512", type: "image/jpeg" });
  }

  navigator.mediaSession.metadata = new MediaMetadata({
    title:  book.title,
    artist: book.author,
    album:  "Audiobook",
    artwork,
  });

  navigator.mediaSession.setActionHandler("play",    () => abAudio.play());
  navigator.mediaSession.setActionHandler("pause",   () => abAudio.pause());
  navigator.mediaSession.setActionHandler("seekbackward", () => abSkip(-30));
  navigator.mediaSession.setActionHandler("seekforward",  () => abSkip(30));
}
