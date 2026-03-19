// quests.js
// Daily quests, legendary quests, and passive drop logic.

import { generateTheme, unlockTheme } from "./themeEngine.js";

const QUEST_STATE_KEY = "questState";

const DAILY_QUESTS_POOL = [
  // Health
  { id: "water", tier: 2, label: "Drink a glass of water", emoji: "💧", confirmText: "Done", category: "health" },
  { id: "stretch", tier: 2, label: "Stretch for 2 minutes", emoji: "🧘", confirmText: "Done", category: "fitness" },
  { id: "outside", tier: 2, label: "Step outside for fresh air", emoji: "🌤", confirmText: "Done", category: "health" },
  { id: "sleep", tier: 2, label: "Set a bedtime alarm for tonight", emoji: "😴", confirmText: "Done", category: "health" },
  // Fitness
  { id: "pushups20", tier: 2, label: "Do 20 pushups", emoji: "💪", confirmText: "Done", category: "fitness" },
  { id: "walk", tier: 2, label: "Go for a 10 minute walk", emoji: "🚶", confirmText: "Done", category: "fitness" },
  { id: "squats", tier: 2, label: "Do 30 squats", emoji: "🏋️", confirmText: "Done", category: "fitness" },
  // Social
  { id: "text", tier: 2, label: "Text someone you care about", emoji: "💬", confirmText: "Done", category: "social" },
  { id: "compliment", tier: 2, label: "Give someone a genuine compliment", emoji: "✨", confirmText: "Done", category: "social" },
  { id: "checkin", tier: 2, label: "Check in on someone you haven't talked to in a while", emoji: "📞", confirmText: "Done", category: "social" },
  // Mindfulness
  { id: "gratitude", tier: 2, label: "Write down one thing you're grateful for", emoji: "📝", confirmText: "Done", category: "mindfulness" },
  { id: "breathe", tier: 2, label: "Take 10 slow deep breaths", emoji: "🌬", confirmText: "Done", category: "mindfulness" },
  { id: "intention", tier: 2, label: "Set one intention for today", emoji: "🎯", confirmText: "Done", category: "mindfulness" },
  { id: "nophone", tier: 2, label: "Put your phone down for 30 minutes", emoji: "📵", confirmText: "Done", category: "mindfulness" },
];

const LEGENDARY_QUESTS_POOL = [
  { id: "pushups50", tier: 3, label: "Do 50 pushups", emoji: "🔥", confirmText: "Mark Complete", category: "fitness" },
  { id: "pullups18", tier: 3, label: "Do 18 pullups", emoji: "⚡", confirmText: "Mark Complete", category: "fitness" },
  { id: "run1mile", tier: 3, label: "Run a mile", emoji: "🏃", confirmText: "Mark Complete", category: "fitness" },
  { id: "call_friend", tier: 3, label: "Call a friend (use the CAF button)", emoji: "📞", confirmText: "Open CAF Spinner →", category: "social" },
  { id: "cold_shower", tier: 3, label: "Take a cold shower", emoji: "🧊", confirmText: "Mark Complete", category: "health" },
  { id: "no_scroll", tier: 3, label: "No social media for 4 hours", emoji: "🛑", confirmText: "Mark Complete", category: "mindfulness" },
  { id: "cook", tier: 3, label: "Cook a meal from scratch", emoji: "🍳", confirmText: "Mark Complete", category: "health" },
];

function getTodayISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function getDailyQuestSeed() {
  const d = new Date();
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
}

// Seeded RNG (Mulberry32)
function mulberry32(seed) {
  let s = seed >>> 0;
  return () => {
    s = Math.imul(s ^ (s >>> 15), s | 1);
    s ^= s + Math.imul(s ^ (s >>> 7), s | 61);
    return ((s ^ (s >>> 14)) >>> 0) / 0x100000000;
  };
}

function clone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function safeParseState(raw) {
  try {
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function persistState(state) {
  localStorage.setItem(QUEST_STATE_KEY, JSON.stringify(state));
}

function ensureLegendaryActive(state) {
  if (state.legendaryActive) return state;
  // Initial assignment: random from pool
  const ids = LEGENDARY_QUESTS_POOL.map(q => q.id);
  state.legendaryActive = ids[Math.floor(Math.random() * ids.length)];
  return state;
}

function silentAwardFirstLaunchIfMissing() {
  const existing = localStorage.getItem(QUEST_STATE_KEY);
  if (existing) return;

  const today = getTodayISO();
  const state = {
    dailyDate: today,
    dailyCompleted: [],
    legendaryActive: null,
    legendaryCompleted: [],
    passiveDropCount: 0,
  };

  ensureLegendaryActive(state);

  // Award one passive drop to ensure wardrobe isn't empty.
  // Do not show loot box; just unlock the theme.
  const seed = Math.floor(Math.random() * 1_000_001);
  unlockTheme(seed);
  state.passiveDropCount = (state.passiveDropCount || 0) + 1;

  persistState(state);
}

function loadState() {
  silentAwardFirstLaunchIfMissing();
  const parsed = safeParseState(localStorage.getItem(QUEST_STATE_KEY));
  if (!parsed) {
    const today = getTodayISO();
    const state = {
      dailyDate: today,
      dailyCompleted: [],
      legendaryActive: null,
      legendaryCompleted: [],
      passiveDropCount: 0,
    };
    persistState(state);
    return ensureLegendaryActive(state);
  }
  return ensureLegendaryActive(parsed);
}

function getQuestDef(id) {
  return (
    DAILY_QUESTS_POOL.find(q => q.id === id) ||
    LEGENDARY_QUESTS_POOL.find(q => q.id === id) ||
    null
  );
}

// Only reset daily state when the quest sheet opens (i.e. when getDailyQuests() is called).
function maybeResetDailyState(state) {
  const today = getTodayISO();
  if (state.dailyDate !== today) {
    state.dailyDate = today;
    state.dailyCompleted = [];
  }
}

export function getQuestState() {
  return clone(loadState());
}

function saveAndReturn(state) {
  persistState(state);
  return clone(state);
}

export function isDailyCompleted(id) {
  const state = loadState();
  return !!state.dailyCompleted?.includes(id);
}

export function isLegendaryCompleted() {
  const state = loadState();
  return !!state.legendaryActive && state.legendaryCompleted?.includes(state.legendaryActive);
}

export function getDailyQuests() {
  const state = loadState();
  maybeResetDailyState(state);
  persistState(state);

  const seed = getDailyQuestSeed();
  const rng = mulberry32(seed);

  // Deterministic shuffle (Fisher-Yates) so the daily quest set is stable.
  const shuffled = DAILY_QUESTS_POOL.map(q => q);
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = shuffled[i];
    shuffled[i] = shuffled[j];
    shuffled[j] = tmp;
  }

  const chosen = shuffled.slice(0, 3);
  return chosen;
}

export function getLegendaryQuest() {
  const state = loadState();
  const q = LEGENDARY_QUESTS_POOL.find(x => x.id === state.legendaryActive) || LEGENDARY_QUESTS_POOL[0];
  return q || null;
}

function chooseNextLegendary(state) {
  const ids = LEGENDARY_QUESTS_POOL.map(q => q.id);
  const completed = new Set(state.legendaryCompleted || []);
  let remaining = ids.filter(id => !completed.has(id));
  if (remaining.length === 0) {
    state.legendaryCompleted = [];
    remaining = ids.slice();
  }
  const next = remaining[Math.floor(Math.random() * remaining.length)];
  state.legendaryActive = next;
  return state;
}

function seedForTier(tier) {
  if (tier === 2) {
    return 500000 + Math.floor(Math.random() * (750000 - 500000 + 1));
  }
  if (tier === 3) {
    return 750001 + Math.floor(Math.random() * (1000000 - 750001 + 1));
  }
  // tier 1 default
  return Math.floor(Math.random() * 1_000_001);
}

function unlockAndBuildTheme(seed) {
  unlockTheme(seed);
  return generateTheme(seed);
}

export function completeQuest(id) {
  const def = getQuestDef(id);
  if (!def) return null;

  const state = loadState();

  // Daily completion
  if (def.tier === 2) {
    maybeResetDailyState(state); // if open after midnight, keep consistent
    if (state.dailyCompleted.includes(id)) return null;
    state.dailyCompleted.push(id);
    persistState(state);

    const seed = seedForTier(2);
    return unlockAndBuildTheme(seed);
  }

  // Legendary completion
  if (def.tier === 3) {
    if (state.legendaryActive !== id) {
      // Ignore completing a non-active legendary.
      return null;
    }

    if (!state.legendaryCompleted.includes(id)) {
      state.legendaryCompleted.push(id);
    }

    // Assign next legendary immediately.
    chooseNextLegendary(state);
    persistState(state);

    const seed = seedForTier(3);
    return unlockAndBuildTheme(seed);
  }

  return null;
}

export function tryPassiveDrop(trigger) {
  const state = loadState();

  const chances = {
    video: 0.15,
    chapter: 0.20,
    finance: 0.10,
  };
  const chance = chances[trigger] ?? 0;

  if (Math.random() > chance) return null;

  const seed = Math.floor(Math.random() * 1_000_001);
  const theme = unlockAndBuildTheme(seed);

  state.passiveDropCount = (state.passiveDropCount || 0) + 1;
  persistState(state);

  return theme;
}

