# Top 5 Easy-Win Features

Analysis of high-return features that fit the existing vanilla JS + localStorage client-side architecture (no backend — Netlify Functions are thin CORS proxies only).

---

## 1. Feed Search & Video Bookmarks

**Effort:** ~50 lines JS, ~30 lines CSS
**Return:** Used every session

Add a search input to the feed tab that filters videos by title/channel in real-time (just filtering existing DOM nodes). Pair with a bookmark button on each card that saves video URLs + titles to localStorage, surfaced as a "Saved" filter pill alongside the channel pills.

Why it's easy: feed data is already in memory, filtering is just `style.display` toggling. Bookmarks are a localStorage array + one new filter mode. Pure client-side.

---

## 2. Audiobook Sleep Timer

**Effort:** ~40 lines JS, ~20 lines CSS
**Return:** Solves real use-case for the audiobook player

Add a sleep timer button to the audiobook player (15m / 30m / 45m / 1h options). When timer expires, fade out volume over 10 seconds then pause. Show countdown in the player UI.

Why it's easy: it's a `setTimeout` + `setInterval` combo with a volume ramp. The player already has full play/pause control via the audio element. UI is one button + a small countdown display. Entirely client-side.

---

## 3. Watch History & Stats Dashboard

**Effort:** ~120 lines JS, ~60 lines CSS
**Return:** Drives engagement with existing gamification

The Settings modal already has a disabled "Stats" button — wire it up. Track watches (already captured by the mindful watching modal) into localStorage with timestamps. Display:

- Total videos watched (today / this week / all time)
- Breakdown by watch reason (Learning vs Entertainment vs Habit)
- Current quest streak (days with at least one quest completed)
- Coins earned / wagered / won lifetime summary (data already in `coinState`)

Why it's easy: the mindful watching modal already captures watch reasons — just persist them. Coin/quest state already exists in localStorage. It's a read-only UI over existing client-side data.

---

## 4. Quick-Add Channel from URL

**Effort:** ~60 lines JS, ~40 lines CSS
**Return:** Makes the app customizable without code changes

Add a "+" button in the feed tab that accepts a YouTube channel URL or handle. Extract the channel identifier, test it via the existing `rss` Netlify Function (already a proxy), and add it to a user-channels list in localStorage that merges with the hardcoded `CHANNELS` array on load.

Why it's easy: the RSS proxy already resolves handles → channel IDs. The feed rendering is channel-agnostic. Just need a small modal with an input field + localStorage persistence. All logic is client-side; the existing proxy handles the fetch.

---

## 5. Keyboard Shortcuts & Swipe Gestures

**Effort:** ~50 lines JS, no CSS
**Return:** Makes the app feel native and fast

Add swipe left/right to switch tabs (touch events on the main content area). Add keyboard shortcuts for desktop: arrow keys for tab switching, space to play/pause audiobook, `s` for search, `?` for shortcut help overlay.

Why it's easy: it's pure event listeners on `touchstart`/`touchmove`/`touchend` and `keydown`. Tab switching function (`switchTab()`) already exists. No data layer, no API calls, no persistence needed.

---

## Priority Order

| # | Feature | Effort | Daily Use | Engagement |
|---|---------|--------|-----------|------------|
| 1 | Feed Search + Bookmarks | Low | High | Medium |
| 2 | Sleep Timer | Low | High | Low |
| 3 | Watch History + Stats | Medium | Medium | High |
| 4 | Quick-Add Channel | Medium | Medium | High |
| 5 | Keyboard/Swipe Navigation | Low | High | Low |

Start with **Feed Search + Bookmarks** and **Sleep Timer** — smallest lifts with immediate daily utility. Then layer in **Stats** to leverage the data those features generate.

All five features are 100% client-side — no new Netlify Functions or backend changes required.
