async function fetchFeed(handle) {
  const res = await fetch(`/.netlify/functions/rss?handle=${handle}`);
  if (!res.ok) throw new Error(`Failed to fetch ${handle}`);
  const xml = await res.text();
  return parseRSS(xml, handle);
}

function parseRSS(xml, handle) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xml, "application/xml");
  return [...doc.querySelectorAll("entry")].map(entry => ({
    id: entry.querySelector("videoId")?.textContent,
    title: entry.querySelector("title")?.textContent,
    channel: entry.querySelector("author name")?.textContent,
    published: new Date(entry.querySelector("published")?.textContent),
    thumbnail: entry.querySelector("thumbnail")?.getAttribute("url"),
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
  const videos = results
    .filter(r => r.status === "fulfilled")
    .flatMap(r => r.value)
    .filter(v => v.id && v.title)
    .sort((a, b) => b.published - a.published);

  statusEl.hidden = true;

  if (videos.length === 0) {
    feed.innerHTML = `<p class="empty">No videos found. ${failed} channel(s) failed to load.</p>`;
    return;
  }

  renderFeed(videos);

  if (failed > 0) {
    statusEl.textContent = `${failed} channel(s) failed to load`;
    statusEl.classList.add("warn");
    statusEl.hidden = false;
  }
}

function renderFeed(videos) {
  const feed = document.getElementById("feed");
  feed.innerHTML = videos.map(v => `
    <div class="card" onclick="openVideo('${escapeHtml(v.id)}')">
      <div class="thumb-wrap">
        <img src="${escapeHtml(v.thumbnail || '')}" alt="" loading="lazy" />
      </div>
      <div class="info">
        <p class="title">${escapeHtml(v.title || '')}</p>
        <p class="meta">${escapeHtml(v.channel || '')} · ${timeAgo(v.published)}</p>
      </div>
    </div>
  `).join("");
}

function openVideo(videoId) {
  window.location = `youtube://www.youtube.com/watch?v=${videoId}`;
  setTimeout(() => {
    window.location = `https://www.youtube.com/watch?v=${videoId}`;
  }, 1500);
}

function timeAgo(date) {
  const diff = (Date.now() - date) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)}d ago`;
  return date.toLocaleDateString();
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

loadFeed();
