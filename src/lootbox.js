// lootbox.js
// Loot box animation + passive-drop toast.

import { equipTheme } from "./themeEngine.js";

let pendingPassiveTheme = null;
let toastTimer = null;

let canBackdropSave = false;
let activeLootbox = false;

function el(id) {
  return document.getElementById(id);
}

function hide(elm) {
  if (!elm) return;
  elm.classList.remove("visible");
  elm.hidden = true;
}

function show(elm) {
  if (!elm) return;
  elm.hidden = false;
  // Allow both "hidden" + class transitions; CSS controls visibility.
  elm.classList.add("visible");
}

function closeLootbox() {
  const backdrop = el("lootbox-backdrop");
  const modal = el("lootbox-modal");
  canBackdropSave = false;
  activeLootbox = false;
  if (backdrop) backdrop.classList.remove("visible");
  if (modal) modal.classList.remove("visible");
  // Use hidden to prevent stray clicks.
  if (backdrop) backdrop.hidden = true;
  if (modal) modal.hidden = true;
}

export function showPassiveToast(theme) {
  pendingPassiveTheme = theme;

  const toast = el("passive-toast");
  if (!toast) return;

  toast.querySelector("#passive-toast-text").textContent = `🎁 New theme unlocked: ${theme.name}`;

  toast.hidden = false;
  toast.classList.add("visible");

  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.remove("visible");
    toast.hidden = true;
    // Keep pendingPassiveTheme per spec (store it even if user didn't tap).
  }, 3000);
}

function ensureToastClickBound() {
  const toast = el("passive-toast");
  if (!toast || toast.dataset.bound === "1") return;
  toast.dataset.bound = "1";

  toast.addEventListener("click", () => {
    if (!pendingPassiveTheme) return;
    const t = pendingPassiveTheme;
    pendingPassiveTheme = null;
    hide(el("passive-toast"));
    showLootBox(t);
  });
}

export function showLootBox(theme) {
  if (!theme || activeLootbox) return;
  activeLootbox = true;

  ensureLootboxEls();

  const backdrop = el("lootbox-backdrop");
  const modal = el("lootbox-modal");

  const chest = el("lb-chest");
  const particles = el("lb-particles");
  const particlesCount = parseInt(el("lb-particles-count")?.textContent || "10", 10);

  const nameEl = el("lb-theme-name");
  const harmonyEl = el("lb-harmony");

  const swBg = el("lb-swatch-bg");
  const swSurface = el("lb-swatch-surface");
  const swAccent = el("lb-swatch-accent");
  const swAccent2 = el("lb-swatch-accent2");
  const swatchRow = modal ? modal.querySelector(".lb-swatch-row") : null;

  const equipBtn = el("lb-equip-btn");
  const saveBtn = el("lb-save-btn");

  const themeVars = theme.vars || {};

  // Set incoming theme colors for particle accent.
  if (modal) {
    modal.style.setProperty("--lb-accent", themeVars["--theme-accent"]);
    modal.style.setProperty("--lb-accent2", themeVars["--theme-accent2"]);
  }

  if (swBg) swBg.style.background = themeVars["--theme-bg"];
  if (swSurface) swSurface.style.background = themeVars["--theme-surface"];
  if (swAccent) swAccent.style.background = themeVars["--theme-accent"];
  if (swAccent2) swAccent2.style.background = themeVars["--theme-accent2"];

  if (nameEl) nameEl.textContent = theme.name;
  if (harmonyEl) harmonyEl.textContent = theme.harmony;

  // Reset modal state
  if (particles) particles.innerHTML = "";
  canBackdropSave = false;

  // Reset UI visibility
  if (nameEl) nameEl.classList.remove("visible");
  if (harmonyEl) harmonyEl.classList.remove("visible");
  if (swatchRow) swatchRow.classList.remove("visible");
  if (equipBtn) equipBtn.classList.remove("visible");
  if (saveBtn) saveBtn.classList.remove("visible");

  // Show modal + backdrop immediately
  if (backdrop) {
    backdrop.hidden = false;
    backdrop.classList.add("visible");
  }
  if (modal) {
    modal.hidden = false;
    modal.classList.add("visible");
  }

  // Chest reset
  if (chest) {
    chest.textContent = "📦";
    chest.classList.remove("open");
    chest.classList.remove("pop");
  }

  // Buttons wiring
  if (equipBtn) {
    equipBtn.onclick = () => {
      equipTheme(theme.seed);
      closeLootbox();
    };
  }
  if (saveBtn) {
    saveBtn.onclick = () => closeLootbox();
  }

  // Start sequence
  setTimeout(() => {
    if (chest) chest.classList.add("pop");
  }, 200);

  setTimeout(() => {
    // Open chest + particles
    if (chest) chest.classList.add("open");

    if (particles) {
      const count = Number.isFinite(particlesCount) ? particlesCount : 10;
      for (let i = 0; i < count; i++) {
        const p = document.createElement("div");
        p.className = "lb-particle";

        // Randomized burst direction; CSS reads --dx/--dy for animation.
        const angle = (i / count) * Math.PI * 2 + Math.random() * 0.55;
        const dist = 35 + Math.random() * 40;
        const dx = Math.cos(angle) * dist;
        const dy = Math.sin(angle) * dist * 0.9;

        const accent = themeVars["--theme-accent"] || "var(--lb-accent)";
        p.style.background = accent;
        p.style.setProperty("--dx", `${dx.toFixed(1)}px`);
        p.style.setProperty("--dy", `${dy.toFixed(1)}px`);

        particles.appendChild(p);
      }
    }
  }, 600);

  setTimeout(() => {
    if (nameEl) nameEl.classList.add("visible");
    if (harmonyEl) harmonyEl.classList.add("visible");
    if (swatchRow) swatchRow.classList.add("visible");
  }, 900);

  setTimeout(() => {
    if (equipBtn) equipBtn.classList.add("visible");
    if (saveBtn) saveBtn.classList.add("visible");
    canBackdropSave = true;
  }, 1400);
}

function ensureLootboxEls() {
  const backdrop = el("lootbox-backdrop");
  const modal = el("lootbox-modal");
  if (!backdrop || !modal) return;

  if (backdrop.dataset.bound === "1") return;
  backdrop.dataset.bound = "1";
  backdrop.hidden = true;
  modal.hidden = true;

  backdrop.addEventListener("click", () => {
    if (!canBackdropSave) return;
    closeLootbox();
  });
}

export function initLootboxUi() {
  ensureToastClickBound();
  ensureLootboxEls();
}

