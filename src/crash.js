// ═══════════════════════════════════════════════════════════════════════════════
// ARCADE – Coin Economy & Rocket Crash Game
// ═══════════════════════════════════════════════════════════════════════════════

const SACRIFICE_VALUE = 50;
const ROLL_COST = 150;
const GROWTH_RATE = 0.00006;
const COOLDOWN_MS = 2000;

// ── Coin state ──────────────────────────────────────────────────────────────

function loadCoinState() {
  try {
    return JSON.parse(localStorage.getItem("coinState")) || defaultCoinState();
  } catch { return defaultCoinState(); }
}

function defaultCoinState() {
  return { balance: 0, totalEarned: 0, totalWagered: 0, totalWon: 0, themesSacrificed: 0 };
}

function saveCoinState(s) {
  localStorage.setItem("coinState", JSON.stringify(s));
}

function getCoinBalance() {
  return loadCoinState().balance;
}

function addCoins(n) {
  const s = loadCoinState();
  s.balance += n;
  s.totalEarned += n;
  saveCoinState(s);
}

function subtractCoins(n) {
  const s = loadCoinState();
  s.balance = Math.max(0, s.balance - n);
  saveCoinState(s);
}

// ── Crash game state ────────────────────────────────────────────────────────

let crashState = "IDLE"; // IDLE | FLYING | CRASHED | CASHED_OUT
let crashPoint = 1;
let currentMultiplier = 1;
let currentBet = 0;
let flightStartTime = 0;
let animFrameId = null;
let graphPoints = [];
let crashHistory = [];
let cooldownTimer = null;

function generateCrashPoint() {
  const e = 1 - Math.random();
  if (e < 0.035) return 1.00;
  return Math.max(1.00, 1 / (1 - e));
}

// ── Canvas rendering ────────────────────────────────────────────────────────

function getCanvas() { return document.getElementById("crash-canvas"); }

function setupCanvas() {
  const canvas = getCanvas();
  if (!canvas) return;
  const wrap = canvas.parentElement;
  const dpr = window.devicePixelRatio || 1;
  const w = wrap.clientWidth;
  const h = wrap.clientHeight || 240;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  canvas.style.width = w + "px";
  canvas.style.height = h + "px";
  const ctx = canvas.getContext("2d");
  ctx.scale(dpr, dpr);
  return { ctx, w, h };
}

function drawGraph(elapsed) {
  const canvas = getCanvas();
  if (!canvas) return;
  const wrap = canvas.parentElement;
  const dpr = window.devicePixelRatio || 1;
  const w = wrap.clientWidth;
  const h = wrap.clientHeight || 240;

  // Ensure canvas sized correctly
  if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = w + "px";
    canvas.style.height = h + "px";
  }

  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);

  if (graphPoints.length < 2) return;

  // Compute axis ranges
  const maxTime = elapsed;
  const maxMult = Math.max(currentMultiplier, 1.5);
  const padX = 10;
  const padY = 20;
  const plotW = w - padX * 2;
  const plotH = h - padY * 2;

  function toX(t) { return padX + (t / maxTime) * plotW; }
  function toY(m) { return h - padY - ((m - 1) / (maxMult - 1)) * plotH; }

  // Accent color
  const accentColor = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || "#6366f1";
  const crashed = crashState === "CRASHED";

  // Gradient fill
  const grad = ctx.createLinearGradient(0, toY(maxMult), 0, h - padY);
  const lineColor = crashed ? "#ef4444" : accentColor;
  grad.addColorStop(0, lineColor + "44");
  grad.addColorStop(1, lineColor + "08");

  // Fill path
  ctx.beginPath();
  ctx.moveTo(toX(graphPoints[0][0]), h - padY);
  for (const [t, m] of graphPoints) ctx.lineTo(toX(t), toY(m));
  ctx.lineTo(toX(graphPoints[graphPoints.length - 1][0]), h - padY);
  ctx.closePath();
  ctx.fillStyle = grad;
  ctx.fill();

  // Line
  ctx.beginPath();
  for (let i = 0; i < graphPoints.length; i++) {
    const [t, m] = graphPoints[i];
    if (i === 0) ctx.moveTo(toX(t), toY(m));
    else ctx.lineTo(toX(t), toY(m));
  }
  ctx.strokeStyle = lineColor;
  ctx.lineWidth = 2.5;
  ctx.lineJoin = "round";
  ctx.stroke();

  // Crash explosion
  if (crashed) {
    const last = graphPoints[graphPoints.length - 1];
    const cx = toX(last[0]);
    const cy = toY(last[1]);
    ctx.beginPath();
    ctx.arc(cx, cy, 8, 0, Math.PI * 2);
    ctx.fillStyle = "#ef4444";
    ctx.fill();
  }
}

function drawIdleCanvas() {
  const canvas = getCanvas();
  if (!canvas) return;
  const setup = setupCanvas();
  if (!setup) return;
  const { ctx, w, h } = setup;
  ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue("--text-muted").trim() || "#666";
  ctx.font = "bold 14px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("Place a bet to launch the rocket", w / 2, h / 2);
}

// ── Game loop ───────────────────────────────────────────────────────────────

function gameLoop(timestamp) {
  if (crashState !== "FLYING") return;

  const elapsed = timestamp - flightStartTime;
  currentMultiplier = Math.exp(GROWTH_RATE * elapsed);

  if (currentMultiplier >= crashPoint) {
    currentMultiplier = crashPoint;
    crashState = "CRASHED";
    onCrash();
    return;
  }

  graphPoints.push([elapsed, currentMultiplier]);
  updateMultiplierDisplay();
  drawGraph(elapsed);
  updateCashoutBtn();
  animFrameId = requestAnimationFrame(gameLoop);
}

function updateMultiplierDisplay() {
  const el = document.getElementById("crash-multiplier");
  if (el) {
    el.textContent = currentMultiplier.toFixed(2) + "x";
    el.className = "crash-multiplier-overlay";
    if (crashState === "CRASHED") el.classList.add("crashed");
    else if (crashState === "CASHED_OUT") el.classList.add("cashed");
  }
}

function updateCashoutBtn() {
  const amt = document.getElementById("crash-cashout-amount");
  if (amt) amt.textContent = "(" + Math.floor(currentBet * currentMultiplier) + " coins)";
}

// ── Game actions ────────────────────────────────────────────────────────────

function crashPlace() {
  if (crashState !== "IDLE") return;
  const input = document.getElementById("crash-bet-input");
  if (!input) return;
  const balance = getCoinBalance();
  let bet = parseInt(input.value) || 0;
  bet = Math.max(1, Math.min(bet, balance));
  if (bet <= 0 || balance <= 0) {
    flashElement(document.getElementById("crash-balance"), "crash-flash-red");
    return;
  }

  currentBet = bet;
  subtractCoins(bet);
  const cs = loadCoinState();
  cs.totalWagered += bet;
  saveCoinState(cs);

  updateBalanceDisplay();

  crashPoint = generateCrashPoint();
  currentMultiplier = 1.00;
  graphPoints = [[0, 1]];
  crashState = "FLYING";

  // UI: hide controls, show cashout
  document.getElementById("crash-controls").hidden = true;
  document.getElementById("crash-cashout-btn").hidden = false;
  updateCashoutBtn();

  const status = document.getElementById("crash-status");
  if (status) { status.textContent = ""; status.className = "crash-status-overlay"; }

  flightStartTime = performance.now();
  animFrameId = requestAnimationFrame(gameLoop);
}

function crashCashout() {
  if (crashState !== "FLYING") return;
  crashState = "CASHED_OUT";
  if (animFrameId) cancelAnimationFrame(animFrameId);

  const winnings = Math.floor(currentBet * currentMultiplier);
  addCoins(winnings);
  const cs = loadCoinState();
  cs.totalWon += winnings;
  saveCoinState(cs);

  updateBalanceDisplay();
  updateMultiplierDisplay();

  const status = document.getElementById("crash-status");
  if (status) {
    status.textContent = "Cashed out! +" + winnings + " coins";
    status.className = "crash-status-overlay cashed";
  }

  document.getElementById("crash-cashout-btn").hidden = true;
  addCrashHistory(currentMultiplier, true);
  drawGraph(graphPoints.length ? graphPoints[graphPoints.length - 1][0] : 0);
  startCooldown();
}

function onCrash() {
  if (animFrameId) cancelAnimationFrame(animFrameId);

  updateMultiplierDisplay();

  const status = document.getElementById("crash-status");
  if (status) {
    status.textContent = "CRASHED at " + crashPoint.toFixed(2) + "x";
    status.className = "crash-status-overlay crashed";
  }

  document.getElementById("crash-cashout-btn").hidden = true;
  addCrashHistory(crashPoint, false);
  drawGraph(graphPoints.length ? graphPoints[graphPoints.length - 1][0] : 0);

  // Flash canvas
  const wrap = document.querySelector(".crash-canvas-wrap");
  if (wrap) {
    wrap.classList.add("crash-explode-flash");
    setTimeout(() => wrap.classList.remove("crash-explode-flash"), 400);
  }

  startCooldown();
}

function startCooldown() {
  if (cooldownTimer) clearTimeout(cooldownTimer);
  cooldownTimer = setTimeout(() => {
    crashState = "IDLE";
    document.getElementById("crash-controls").hidden = false;
    updatePlayBtn();
    drawIdleCanvas();
    const status = document.getElementById("crash-status");
    if (status) { status.textContent = ""; status.className = "crash-status-overlay"; }
    const mult = document.getElementById("crash-multiplier");
    if (mult) { mult.textContent = "1.00x"; mult.className = "crash-multiplier-overlay"; }
  }, COOLDOWN_MS);
}

function crashAdjustBet(delta) {
  const input = document.getElementById("crash-bet-input");
  if (!input) return;
  const val = Math.max(1, (parseInt(input.value) || 0) + delta);
  input.value = Math.min(val, getCoinBalance());
  updatePlayBtn();
}

function crashBetMax() {
  const input = document.getElementById("crash-bet-input");
  if (input) input.value = Math.max(1, getCoinBalance());
  updatePlayBtn();
}

function updatePlayBtn() {
  const btn = document.getElementById("crash-play-btn");
  const input = document.getElementById("crash-bet-input");
  if (!btn || !input) return;
  const bet = parseInt(input.value) || 0;
  btn.disabled = bet <= 0 || bet > getCoinBalance() || getCoinBalance() <= 0;
}

// ── Crash history ───────────────────────────────────────────────────────────

function addCrashHistory(mult, won) {
  crashHistory.unshift({ mult, won });
  if (crashHistory.length > 20) crashHistory.pop();
  renderCrashHistory();
}

function renderCrashHistory() {
  const el = document.getElementById("crash-history");
  if (!el) return;
  el.innerHTML = crashHistory.map(h => {
    const cls = h.won ? "crash-history-pill won" : "crash-history-pill lost";
    return `<span class="${cls}">${h.mult.toFixed(2)}x</span>`;
  }).join("");
}

// ── Theme sacrifice ─────────────────────────────────────────────────────────

let confirmingSeed = null;
let confirmTimer = null;

function renderSacrificeGrid() {
  const grid = document.getElementById("crash-sacrifice-grid");
  const empty = document.getElementById("crash-sacrifice-empty");
  if (!grid || !empty) return;

  const all = typeof window.getAllThemes === "function" ? window.getAllThemes() : [];
  // Exclude default theme (seed=-1)
  const themes = all.filter(t => t.seed !== -1).reverse();

  if (themes.length === 0) {
    grid.innerHTML = "";
    empty.hidden = false;
    return;
  }
  empty.hidden = true;

  grid.innerHTML = themes.map(t => {
    const vars = t.vars || {};
    const bg = vars["--theme-bg"] || "var(--theme-bg)";
    const text = vars["--theme-text"] || "var(--theme-text)";
    const accent = vars["--theme-accent"] || "var(--theme-accent)";
    const accent2 = vars["--theme-accent2"] || "var(--theme-accent2)";
    const surface = vars["--theme-surface"] || "var(--theme-surface)";

    return `
      <div class="crash-sacrifice-card" style="background:${bg}; color:${text}; border-color:${accent}" data-seed="${t.seed}">
        <div class="wardrobe-swatches" aria-hidden="true">
          <span class="wardrobe-swatch" style="background:${bg}"></span>
          <span class="wardrobe-swatch" style="background:${surface}"></span>
          <span class="wardrobe-swatch" style="background:${accent}"></span>
          <span class="wardrobe-swatch" style="background:${accent2}"></span>
        </div>
        <p class="wardrobe-name">${escapeHtml(t.name || "Theme")}</p>
        <p class="wardrobe-harmony">${escapeHtml(t.harmony || "")}</p>
        <div class="crash-sacrifice-slot">
          <button class="crash-sacrifice-btn" onclick="onSacrificeClick(${t.seed})" style="border-color:${accent}">
            Sacrifice (${SACRIFICE_VALUE} coins)
          </button>
        </div>
      </div>
    `;
  }).join("");
}

function onSacrificeClick(seed) {
  if (confirmingSeed === seed) {
    // Second click — confirm
    sacrificeTheme(seed);
    confirmingSeed = null;
    if (confirmTimer) clearTimeout(confirmTimer);
    return;
  }

  // First click — show confirmation
  confirmingSeed = seed;
  if (confirmTimer) clearTimeout(confirmTimer);

  // Update button text
  const card = document.querySelector(`.crash-sacrifice-card[data-seed="${seed}"]`);
  if (card) {
    const btn = card.querySelector(".crash-sacrifice-btn");
    if (btn) {
      btn.textContent = "Confirm?";
      btn.classList.add("confirming");
    }
  }

  confirmTimer = setTimeout(() => {
    confirmingSeed = null;
    renderSacrificeGrid();
  }, 3000);
}

function sacrificeTheme(seed) {
  // Remove from themeState
  const ts = JSON.parse(localStorage.getItem("themeState") || "{}");
  ts.unlocked = (ts.unlocked || []).filter(s => s !== seed);
  if (ts.equipped === seed) {
    ts.equipped = -1;
    if (typeof window.equipTheme === "function") window.equipTheme(-1);
  }
  localStorage.setItem("themeState", JSON.stringify(ts));

  // Add coins
  addCoins(SACRIFICE_VALUE);
  const cs = loadCoinState();
  cs.themesSacrificed++;
  saveCoinState(cs);

  // Animate card removal
  const card = document.querySelector(`.crash-sacrifice-card[data-seed="${seed}"]`);
  if (card) {
    card.classList.add("sacrificed");
    setTimeout(() => renderSacrificeGrid(), 400);
  } else {
    renderSacrificeGrid();
  }

  updateBalanceDisplay();
  updatePlayBtn();
}

// ── Buy theme roll ──────────────────────────────────────────────────────────

function crashBuyRoll() {
  if (getCoinBalance() < ROLL_COST) {
    flashElement(document.getElementById("crash-balance"), "crash-flash-red");
    return;
  }
  subtractCoins(ROLL_COST);
  updateBalanceDisplay();

  if (typeof window.openThemeDrop === "function") {
    const theme = window.openThemeDrop();
    if (theme && typeof window.showLootBox === "function") {
      window.showLootBox(theme);
    }
  }
}

// ── UI helpers ──────────────────────────────────────────────────────────────

function updateBalanceDisplay() {
  const el = document.getElementById("crash-balance");
  if (el) el.textContent = getCoinBalance();

  const buyBtn = document.getElementById("crash-buy-roll-btn");
  if (buyBtn) buyBtn.disabled = getCoinBalance() < ROLL_COST;
}

function flashElement(el, cls) {
  if (!el) return;
  el.classList.add(cls);
  setTimeout(() => el.classList.remove(cls), 400);
}

function escapeHtml(str) {
  const d = document.createElement("div");
  d.textContent = str;
  return d.innerHTML;
}

// ── Arcade modal open / close ───────────────────────────────────────────────

function openArcade() {
  const backdrop = document.getElementById("arcade-backdrop");
  const modal = document.getElementById("arcade-modal");
  if (!backdrop || !modal) return;
  modal.hidden = false;
  // Force reflow before adding .visible
  void modal.offsetHeight;
  backdrop.classList.add("visible");
  modal.classList.add("visible");
  crashOnTabActivate();
}

function closeArcade() {
  const backdrop = document.getElementById("arcade-backdrop");
  const modal = document.getElementById("arcade-modal");
  if (!backdrop || !modal) return;
  backdrop.classList.remove("visible");
  modal.classList.remove("visible");
  setTimeout(() => { modal.hidden = true; }, 300);
}

// ── Init ────────────────────────────────────────────────────────────────────

function crashOnTabActivate() {
  updateBalanceDisplay();
  renderSacrificeGrid();
  renderCrashHistory();
  updatePlayBtn();
  if (crashState === "IDLE") drawIdleCanvas();
}

function crashInit() {
  // Ensure coin state exists
  if (!localStorage.getItem("coinState")) saveCoinState(defaultCoinState());

  // Event listeners (delegated from onclick attrs are fine, but bet input needs change handler)
  const betInput = document.getElementById("crash-bet-input");
  if (betInput) betInput.addEventListener("input", updatePlayBtn);

  updateBalanceDisplay();
}

crashInit();
