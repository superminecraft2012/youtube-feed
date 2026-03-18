// ─── State ────────────────────────────────────────────────────────────────────
let abCurrentBook = null;
let abFileIndex = 0;
let abSaveTimer = null;

const abAudio = document.getElementById("ab-audio");

// ─── Proxy URL ────────────────────────────────────────────────────────────────
function abProxyUrl(rawUrl) {
  const params = new URLSearchParams({ url: rawUrl, t: PROXY_TOKEN });
  return `/.netlify/functions/audio-proxy?${params}`;
}

// ─── Progress persistence ─────────────────────────────────────────────────────
function abSaveProgress() {
  if (!abCurrentBook || isNaN(abAudio.currentTime)) return;
  const data = { fileIndex: abFileIndex, position: abAudio.currentTime };
  localStorage.setItem(`audiobook-progress-${abCurrentBook.id}`, JSON.stringify(data));
}

function abLoadProgress(bookId) {
  try {
    const raw = localStorage.getItem(`audiobook-progress-${bookId}`);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function abStartSaveTimer() {
  clearInterval(abSaveTimer);
  abSaveTimer = setInterval(abSaveProgress, 5000);
}

function abStopSaveTimer() {
  clearInterval(abSaveTimer);
}

// ─── Tab switching ─────────────────────────────────────────────────────────────
function switchTab(tab) {
  const feedSection = document.getElementById("section-feed");
  const abSection = document.getElementById("section-audiobooks");
  const filterBar = document.getElementById("filter-bar");
  const watchTally = document.getElementById("watch-tally");
  const tabs = document.querySelectorAll(".tab-btn");
  const headerTitle = document.getElementById("header-title");
  const refreshBtn = document.querySelector(".refresh-btn");

  tabs.forEach(t => t.classList.toggle("active", t.dataset.tab === tab));

  if (tab === "feed") {
    feedSection.hidden = false;
    abSection.hidden = true;
    filterBar.hidden = document.getElementById("filter-pills").children.length === 0;
    watchTally.hidden = !watchTally.textContent;
    headerTitle.textContent = "My Feed";
    refreshBtn.hidden = false;
    // Save audiobook progress when leaving tab
    abSaveProgress();
  } else {
    feedSection.hidden = true;
    abSection.hidden = false;
    filterBar.hidden = true;
    watchTally.hidden = true;
    headerTitle.textContent = "My Books";
    refreshBtn.hidden = true;
    renderAbLibrary();
  }
}

// ─── Library view ─────────────────────────────────────────────────────────────
function renderAbLibrary() {
  const grid = document.getElementById("ab-library");

  grid.innerHTML = BOOKS.map(book => {
    const progress = abLoadProgress(book.id);
    let resumeBadge = "";
    if (progress) {
      const chapterName = book.files[progress.fileIndex]?.chapter || "Chapter";
      resumeBadge = `<span class="ab-resume">${escapeHtml(chapterName)} — ${formatDuration(Math.floor(progress.position))}</span>`;
    }

    const coverHtml = book.cover
      ? `<img class="ab-cover" src="${escapeHtml(book.cover)}" alt="" loading="lazy" />`
      : `<div class="ab-cover ab-cover-placeholder">📖</div>`;

    return `
      <div class="ab-card" onclick="openBook('${escapeHtml(book.id)}')">
        ${coverHtml}
        <div class="ab-card-info">
          <p class="ab-title">${escapeHtml(book.title)}</p>
          <p class="ab-author">${escapeHtml(book.author)}</p>
          ${resumeBadge}
        </div>
      </div>`;
  }).join("");
}

// ─── Open book → player ───────────────────────────────────────────────────────
function openBook(bookId) {
  const book = BOOKS.find(b => b.id === bookId);
  if (!book) return;

  abCurrentBook = book;

  const progress = abLoadProgress(bookId);
  abFileIndex = progress?.fileIndex ?? 0;

  document.getElementById("ab-library-view").hidden = true;
  document.getElementById("ab-player-view").hidden = false;

  renderAbPlayer();
  loadAbFile(progress?.position ?? 0);
}

function closePlayer() {
  abSaveProgress();
  abStopSaveTimer();
  document.getElementById("ab-player-view").hidden = true;
  document.getElementById("ab-library-view").hidden = false;
  renderAbLibrary();
}

// ─── Player render ────────────────────────────────────────────────────────────
function renderAbPlayer() {
  const book = abCurrentBook;

  document.getElementById("ab-player-title").textContent = book.title;
  document.getElementById("ab-player-author").textContent = book.author;

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

  updateAbPlayPause();
}

function loadAbFile(seekTo = 0) {
  const file = abCurrentBook.files[abFileIndex];
  if (!file) return;

  abAudio.src = abProxyUrl(file.url);
  abAudio.load();

  // Seek to saved position once metadata is ready
  const onMeta = () => {
    if (seekTo > 0) abAudio.currentTime = seekTo;
    abAudio.removeEventListener("loadedmetadata", onMeta);
  };
  abAudio.addEventListener("loadedmetadata", onMeta);
}

// ─── Playback controls ────────────────────────────────────────────────────────
function abTogglePlay() {
  if (abAudio.paused) {
    abAudio.play();
    abStartSaveTimer();
  } else {
    abAudio.pause();
    abStopSaveTimer();
    abSaveProgress();
  }
}

function abSkip(seconds) {
  abAudio.currentTime = Math.max(0, Math.min(abAudio.duration || 0, abAudio.currentTime + seconds));
}

function abSetSpeed(speed) {
  abAudio.playbackRate = speed;
  document.querySelectorAll(".ab-speed-btn").forEach(btn => {
    btn.classList.toggle("active", parseFloat(btn.dataset.speed) === speed);
  });
}

function abSelectChapter() {
  const sel = document.getElementById("ab-chapter-select");
  abFileIndex = parseInt(sel.value, 10);
  abSaveProgress();
  loadAbFile(0);
  if (!abAudio.paused) {
    abAudio.addEventListener("canplay", () => abAudio.play(), { once: true });
  }
}

// ─── Audio element event listeners ───────────────────────────────────────────
abAudio.addEventListener("play", updateAbPlayPause);
abAudio.addEventListener("pause", updateAbPlayPause);

abAudio.addEventListener("timeupdate", () => {
  const current = abAudio.currentTime;
  const duration = abAudio.duration || 0;

  document.getElementById("ab-current-time").textContent = formatDuration(Math.floor(current));
  document.getElementById("ab-duration").textContent = formatDuration(Math.floor(duration));

  const pct = duration > 0 ? (current / duration) * 100 : 0;
  document.getElementById("ab-scrub").value = pct;
});

abAudio.addEventListener("ended", () => {
  abStopSaveTimer();
  // Auto-advance to next chapter if available
  if (abFileIndex < abCurrentBook.files.length - 1) {
    abFileIndex++;
    abSaveProgress();
    renderAbPlayer();
    loadAbFile(0);
    abAudio.addEventListener("canplay", () => abAudio.play(), { once: true });
  } else {
    // Book finished — clear progress
    localStorage.removeItem(`audiobook-progress-${abCurrentBook.id}`);
    updateAbPlayPause();
  }
});

function updateAbPlayPause() {
  const btn = document.getElementById("ab-play-btn");
  if (btn) btn.textContent = abAudio.paused ? "▶" : "⏸";
}

// Scrub bar interaction
document.getElementById("ab-scrub").addEventListener("input", e => {
  const pct = parseFloat(e.target.value);
  if (abAudio.duration) {
    abAudio.currentTime = (pct / 100) * abAudio.duration;
  }
});

// Save progress on page hide (tab switch, phone lock, etc.)
document.addEventListener("visibilitychange", () => {
  if (document.hidden) abSaveProgress();
});
