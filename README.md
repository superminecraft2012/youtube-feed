# My Feed

A personal, installable Progressive Web App (PWA) with two features: a curated YouTube feed and an audiobook player.

---

## What It Does

### Feed Tab (▶)
A chronological feed of the latest videos from your personal list of YouTube channels. No algorithm, no recommendations — just the channels you care about.

- Videos are fetched via RSS and sorted newest-first
- **Filter pills** at the top let you narrow to a single channel
- **Tap a card** to expand it and see the description
- **Watch button** opens a "Why are you watching this?" prompt before launching YouTube (a mindful friction layer)
- **Watch tally** at the top shows how many videos you've watched today and why

### Books Tab (🎧)
An audiobook player connected to a personal seedbox (ultra.cc) that hosts your audio files.

- **Library** — filter by All / In Progress / Unstarted / Finished; sort by Recently Played or A–Z
- **Player** — scrub bar, play/pause, skip ±30 seconds, playback speed (0.75×–2×)
- **Chapter selection** for multi-file books with auto-advance
- **Bookmarks** — tap 🔖 while playing to save your spot, add notes, or jump back
- **Mark as Finished** toggle
- Cover art loaded from Google Books API
- Progress (position, speed, chapter, bookmarks) persists in localStorage
- Lock-screen controls via the MediaSession API

---

## File Structure

```
youtube-feed/
├── src/                          ← Frontend (deployed by Netlify)
│   ├── index.html                ← App shell: header, tabs, splash, modals
│   ├── style.css                 ← All styles (design tokens, animations, layout)
│   ├── helpers.js                ← Shared utilities: formatDuration, escapeHtml
│   ├── channels.js               ← Your channel list (CHANNELS constant)
│   ├── app.js                    ← Feed logic: fetch, render cards, reason modal, tally
│   ├── audiobooks.js             ← Proxy token + BOOKS array declaration
│   ├── audiobook.js              ← Full audiobook player: state, controls, library, MediaSession
│   └── icon.png                  ← PWA icon (192×512 px)
│
├── netlify/
│   └── functions/
│       ├── rss.js                ← Proxy: resolves YouTube handle → channel ID → RSS feed
│       ├── audio-proxy.js        ← Proxy: streams audio from seedbox with Basic Auth injection
│       ├── library.js            ← Scans seedbox directory listing → JSON book library
│       └── book-meta.js          ← Fetches cover art + description from Google Books API
│
├── manifest.json                 ← PWA manifest (name, icons, display mode)
└── netlify.toml                  ← Build config: publish = src, functions = netlify/functions
```

---

## Key Files Explained

### `src/index.html`
The app shell. Contains:
- Intro splash screen (`#intro-splash`) — animated on first load, dismissed when feed data arrives
- Sticky header with logo and refresh button
- `#section-feed` — YouTube feed content (filter bar, tally, card grid)
- `#section-audiobooks` — library view and player view (shown/hidden by tab switching)
- `#reason-modal` — the "Why are you watching?" bottom sheet
- `#tab-bar` — bottom navigation with Feed and Books tabs
- Script tags load in order: helpers → channels → audiobooks → app → audiobook

### `src/style.css`
Organized in sections:
1. **Design Tokens** — all CSS custom properties (colors, spacing, type scale, motion curves)
2. **Intro Splash** — keyframe animations for the logo, wordmark, and loader dots
3. **Header** — sticky, frosted-glass backdrop
4. **Tab Bar** — fixed bottom nav with active indicator line
5. **Filter Bar** — sticky horizontal pill scroll
6. **Watch Tally** — session stats strip
7. **Feed Grid** — responsive 1→2 column card grid
8. **Video Card** — thumbnail, channel badge, expand/collapse, Watch button
9. **Reason Modal** — bottom sheet with backdrop blur
10. **Audiobook styles** — library rows, player layout, scrub bar, speed pills, bookmarks

### `src/app.js`
- `loadFeed()` — fetches all channels in parallel, shows skeletons while loading, dismisses splash on completion
- `renderFeed()` — renders video card HTML with staggered entry animations
- `handleCardTap()` — expand/collapse logic (one card open at a time)
- `openVideo()` / `selectReason()` — mindful watching modal flow
- `renderTally()` — today's watch count from localStorage
- `dismissSplash()` — respects a minimum display time so the animation always completes

### `src/audiobook.js`
- Progress persistence (position, speed, chapter, finished state) in localStorage
- `loadLibrary()` — fetches book list from Netlify function, caches in sessionStorage
- `renderAbLibrary()` — filter + sort the book list
- `openBook()` — loads player, restores progress, fetches cover art asynchronously
- `renderAbPlayer()` — populates all player UI elements
- `loadAbFile()` — sets audio src via proxy URL, handles loadedmetadata
- Playback controls: `abTogglePlay`, `abSkip`, `abSetSpeed`, `abSelectChapter`, `abMarkFinished`
- Bookmarks: `abAddBookmark`, `abDeleteBookmark`, `abEditBookmarkNote`, `abSeekToBookmark`
- `abUpdateMediaSession()` — lock-screen metadata + action handlers

### `netlify/functions/rss.js`
Resolves a YouTube handle to a channel ID by fetching the channel page, then returns the channel's Atom RSS feed. Responses are cached for 15 minutes at the CDN layer.

### `netlify/functions/audio-proxy.js`
Streams audio files from the seedbox, injecting HTTP Basic Auth server-side (avoids browser CORS issues with credentialed cross-origin requests). Caps response chunks to stay within Netlify's 6 MB function limit.

### `netlify/functions/library.js`
Scans the seedbox's Apache/Nginx directory listing and returns a structured JSON array of books: `[{ id, title, author, files: [{ url, chapter }] }]`.

### `netlify/functions/book-meta.js`
Queries the Google Books API for a title/author combination and returns `{ cover, description, fetchedAt }`. Cached for 30 days via CDN headers.

---

## Adding Channels

Edit `src/channels.js` and add an entry to the `CHANNELS` array:

```js
{ name: "Display Name", handle: "YouTubeHandle" },
```

The handle is the part of the URL after `@` (e.g., `youtube.com/@hubermanlab` → handle is `hubermanlab`).

---

## PWA Installation

On iOS: tap the Share button → "Add to Home Screen"  
On Android: tap the browser menu → "Install App" or "Add to Home Screen"

Once installed, the app opens in standalone mode (no browser chrome) with the system status bar blended into the header.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Vanilla HTML / CSS / JavaScript |
| Hosting | Netlify (static) |
| Serverless | Netlify Functions (Node.js) |
| Audio source | ultra.cc seedbox via HTTP Basic Auth proxy |
| Book metadata | Google Books API |
| YouTube data | YouTube Atom RSS feeds |

---


