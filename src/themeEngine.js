// themeEngine.js
// Seed-based infinite theme generation with color theory

// Sentinel default palette: matches the app's original dark scheme.
// (Used when equipped === -1 or no theme is equipped yet.)
export const DEFAULT_THEME = {
  seed: -1,
  name: "Default",
  harmony: "Original",
  vars: {
    "--theme-bg": "#090909",
    "--theme-surface": "#161616",
    "--theme-card": "#1e1e1e",
    "--theme-accent": "#ff2d2d",
    "--theme-accent2": "#3b82f6",
    "--theme-text": "#f0f0f0",
    "--theme-muted": "#8a8a8a",
    "--theme-border": "#2a2a2a",
  },
};

// ─── Seeded RNG (Mulberry32) ────────────────────────────────────────────────
function mulberry32(seed) {
  let s = seed >>> 0;
  return () => {
    s = Math.imul(s ^ (s >>> 15), s | 1);
    s ^= s + Math.imul(s ^ (s >>> 7), s | 61);
    return ((s ^ (s >>> 14)) >>> 0) / 0x100000000;
  };
}

// ─── Color Theory ─────────────────────────────────────────────────────────

// Perceptual brightness correction (Helmholtz-Kohlrausch approximation)
// Yellow/green appear brighter than blue at the same HSL lightness.
// We shift accent lightness up/down by up to ±7% based on hue.
function perceivedBias(hue) {
  const rad = (((hue % 360) + 360) % 360 - 60) * (Math.PI / 180);
  return Math.sin(rad) * 7;
}

// Convert HSL to WCAG relative luminance
function hslToLuminance(h, s, l) {
  s /= 100;
  l /= 100;
  const a = s * Math.min(l, 1 - l);
  const f = n => {
    const k = (n + h / 30) % 12;
    const c = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(0) + 0.7152 * f(8) + 0.0722 * f(4);
}

function contrastRatio(l1, l2) {
  const [hi, lo] = [Math.max(l1, l2), Math.min(l1, l2)];
  return (hi + 0.05) / (lo + 0.05);
}

// Nudge foreground lightness upward until it meets a minimum contrast ratio
function ensureContrast(fgH, fgS, fgL, bgLuminance, minRatio = 7) {
  let l = fgL;
  for (let i = 0; i < 30; i++) {
    if (contrastRatio(hslToLuminance(fgH, fgS, l), bgLuminance) >= minRatio) break;
    l = Math.min(l + 2, 97);
  }
  return Math.round(l);
}

// ─── Color Harmonies ───────────────────────────────────────────────────────
// Each harmony picks accent hues at mathematically pleasing offsets from base.
const HARMONIES = [
  { type: "Complementary", offsets: [180, 210] },
  { type: "Split-complementary", offsets: [150, 210] },
  { type: "Triadic", offsets: [120, 240] },
  { type: "Analogous", offsets: [30, -30] },
  { type: "Tetradic", offsets: [90, 270] },
];

// ─── Name Generation ─────────────────────────────────────────────────────
const HUE_NAMES = [
  [0, "Crimson"],
  [20, "Ember"],
  [40, "Amber"],
  [60, "Gold"],
  [80, "Lime"],
  [100, "Jade"],
  [120, "Emerald"],
  [140, "Sage"],
  [160, "Seafoam"],
  [180, "Teal"],
  [200, "Arctic"],
  [220, "Azure"],
  [240, "Cobalt"],
  [260, "Indigo"],
  [280, "Violet"],
  [300, "Fuchsia"],
  [320, "Rose"],
  [340, "Garnet"],
];

const HARMONY_WORDS = {
  Complementary: ["Forge", "Signal", "Protocol", "Contrast", "Edge"],
  "Split-complementary": ["Fracture", "Rift", "Diverge", "Prism", "Split"],
  Triadic: ["Bloom", "Trinity", "Cascade", "Spectrum", "Triad"],
  Analogous: ["Drift", "Flow", "Gradient", "Wave", "Shift"],
  Tetradic: ["Matrix", "Quad", "Circuit", "Grid", "Nexus"],
};

function hueName(hue) {
  const h = ((hue % 360) + 360) % 360;
  let name = HUE_NAMES[0][1];
  for (const [angle, n] of HUE_NAMES) if (h >= angle) name = n;
  return name;
}

// ─── Core Theme Generator ────────────────────────────────────────────────
export function generateTheme(seed) {
  const rng = mulberry32(seed);
  const r = () => rng();

  // 1. Base hue — full 0–360 range
  const baseHue = r() * 360;

  // 2. Color harmony — determines accent hue(s)
  const harmony = HARMONIES[Math.floor(r() * HARMONIES.length)];
  const accentHue = (baseHue + harmony.offsets[0] + 360) % 360;
  const accent2Hue = (baseHue + harmony.offsets[1] + 360) % 360;

  // 3. Background — very dark, low saturation
  const bgSat = Math.round(8 + r() * 10);
  const bgLight = Math.round(4 + r() * 4);

  // 4. Surface — slightly lighter card/panel background
  const surfSat = bgSat + Math.round(2 + r() * 4);
  const surfLight = bgLight + Math.round(5 + r() * 4);

  // 5. Card — slightly lighter still (3-tier depth)
  const cardSat = surfSat;
  const cardLight = surfLight + Math.round(3 + r() * 3);

  // 6. Primary accent — high saturation with perceptual correction.
  const accentSat = Math.round(65 + r() * 20);
  const rawAccentL = 50 + r() * 15;
  const accentLight = Math.round(
    Math.max(40, Math.min(75, rawAccentL - perceivedBias(accentHue)))
  );

  // 7. Secondary accent (for thumbnails, second pills, etc.)
  const accent2Sat = Math.round(55 + r() * 20);
  const rawAccent2L = 48 + r() * 15;
  const accent2Light = Math.round(
    Math.max(38, Math.min(72, rawAccent2L - perceivedBias(accent2Hue)))
  );

  // 8. Primary text — ensure WCAG AAA (7:1) contrast on background
  const textSat = Math.round(5 + r() * 8);
  const bgLum = hslToLuminance(baseHue, bgSat, bgLight);
  const textLight = ensureContrast(
    baseHue,
    textSat,
    Math.round(88 + r() * 7),
    bgLum,
    7.0
  );

  // 9. Muted text — intentionally dim (no contrast enforcement)
  const mutedLight = Math.round(38 + r() * 15);
  const mutedSat = Math.round(textSat + 3);

  // 10. Border — subtle separator between surfaces
  const borderLight = cardLight + Math.round(5 + r() * 5);

  // Deterministic theme name from seed
  const nameRng = mulberry32(seed + 0xdead);
  const words = HARMONY_WORDS[harmony.type];
  const name = `${hueName(baseHue)} ${words[Math.floor(nameRng() * words.length)]}`;

  const hsl = (h, s, l) => `hsl(${Math.round(h)},${s}%,${l}%)`;

  return {
    seed,
    name,
    harmony: harmony.type,
    vars: {
      "--theme-bg": hsl(baseHue, bgSat, bgLight),
      "--theme-surface": hsl(baseHue, surfSat, surfLight),
      "--theme-card": hsl(baseHue, cardSat, cardLight),
      "--theme-accent": hsl(accentHue, accentSat, accentLight),
      "--theme-accent2": hsl(accent2Hue, accent2Sat, accent2Light),
      "--theme-text": hsl(baseHue, textSat, textLight),
      "--theme-muted": hsl(baseHue, mutedSat, mutedLight),
      "--theme-border": hsl(baseHue, surfSat + 5, borderLight),
    },
  };
}

// ─── Apply Theme to DOM ────────────────────────────────────────────────────
export function applyTheme(theme) {
  requestAnimationFrame(() => {
    for (const [prop, val] of Object.entries(theme.vars)) {
      document.documentElement.style.setProperty(prop, val);
    }
  });
}

// ─── localStorage persistence ─────────────────────────────────────────────
const STORAGE_KEY = "themeState";

// { unlocked: number[], equipped: number | null }
export function loadThemeState() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) ?? {
      unlocked: [],
      equipped: null,
    };
  } catch {
    return { unlocked: [], equipped: null };
  }
}

function saveThemeState(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.warn("themeEngine: could not save state", e);
  }
}

// Add a seed to the unlocked pool.
export function unlockTheme(seed) {
  const state = loadThemeState();
  if (!state.unlocked.includes(seed)) {
    state.unlocked.push(seed);
    saveThemeState(state);
  }
  return state;
}

// Equip a theme by seed. Applies it immediately and persists.
export function equipTheme(seed) {
  const state = loadThemeState();
  state.equipped = seed;
  saveThemeState(state);

  if (seed === -1) {
    // Default theme: write the vars directly.
    applyTheme(DEFAULT_THEME);
    return;
  }

  applyTheme(generateTheme(seed));
}

// Load and apply the equipped theme on app start.
export function initTheme() {
  const { equipped } = loadThemeState();
  // Default is handled by CSS fallback variables.
  if (equipped == null || equipped === -1) return;
  applyTheme(generateTheme(equipped));
}

// Get all unlocked themes as full theme objects (for wardrobe UI)
export function getAllThemes() {
  const { unlocked, equipped } = loadThemeState();
  const isDefaultEquipped = equipped == null || equipped === -1;

  const defaultCard = { ...DEFAULT_THEME, equipped: isDefaultEquipped };
  const rest = unlocked.map(seed => ({
    ...generateTheme(seed),
    equipped: seed === equipped,
  }));
  return [defaultCard, ...rest];
}

// Roll a new random seed for a loot box drop
export function rollThemeSeed() {
  return Math.floor(Math.random() * 1_000_000);
}

// Loot Box Integration
export function openThemeDrop() {
  const seed = rollThemeSeed();
  unlockTheme(seed);
  return generateTheme(seed);
}

