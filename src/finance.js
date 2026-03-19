// ─── Finance Tab ───────────────────────────────────────────────────────────────
// Tracks stock/crypto tickers with live prices via a Netlify proxy function.
// Tickers saved in localStorage so they persist across sessions.

const FIN_STORAGE_KEY = 'finTickers';

// State
let finTickers = [];        // array of uppercase symbols e.g. ['AAPL', 'BTC-USD']
let finPriceData = {};      // { symbol: { price, change, changePct, name, currency, up, sparkline[] } }
let finLoading = false;

// ─── localStorage helpers ──────────────────────────────────────────────────────
function finLoadTickers() {
  try {
    const raw = localStorage.getItem(FIN_STORAGE_KEY);
    finTickers = raw ? JSON.parse(raw) : [];
  } catch {
    finTickers = [];
  }
}

function finSaveTickers() {
  localStorage.setItem(FIN_STORAGE_KEY, JSON.stringify(finTickers));
}

// ─── Ticker management ─────────────────────────────────────────────────────────
function finAddTicker() {
  const input = document.getElementById('fin-ticker-input');
  if (!input) return;

  const raw = input.value.trim().toUpperCase().replace(/\s+/g, '');
  if (!raw) return;

  // Basic validation — allow letters, digits, dots, dashes, carets (covers BTC-USD, ^GSPC, etc.)
  if (!/^[A-Z0-9.\-\^]+$/.test(raw)) {
    finShowStatus('Invalid ticker symbol.', true);
    return;
  }

  if (finTickers.includes(raw)) {
    finShowStatus(`${raw} is already in your list.`, true);
    input.value = '';
    return;
  }

  finTickers.push(raw);
  finSaveTickers();
  input.value = '';
  finShowStatus('');

  // Mark as loading and immediately render the skeleton card
  finPriceData[raw] = { loading: true };
  finRenderGrid();

  // Fetch price in background
  finFetchOne(raw).then(() => finRenderGrid());
}

function finRemoveTicker(symbol) {
  finTickers = finTickers.filter(t => t !== symbol);
  delete finPriceData[symbol];
  finSaveTickers();
  finRenderGrid();
}

// ─── Price fetching ────────────────────────────────────────────────────────────
// All fetches go through /.netlify/functions/quote (server-side proxy, no CORS issues)

async function finFetchOne(symbol) {
  const url = `/.netlify/functions/quote?symbol=${encodeURIComponent(symbol)}`;
  try {
    const res = await fetch(url);
    const json = await res.json();
    if (!res.ok || json.error) throw new Error(json.error || `HTTP ${res.status}`);

    finPriceData[symbol] = {
      price:     json.price,
      change:    json.change,
      changePct: json.changePct,
      name:      json.name || symbol,
      currency:  json.currency || 'USD',
      up:        json.change >= 0,
      sparkline: json.sparkline || [],
      loading:   false,
      error:     false,
    };
  } catch (err) {
    console.warn(`finFetchOne(${symbol}) failed:`, err.message);
    finPriceData[symbol] = { ...(finPriceData[symbol] || {}), error: true, loading: false };
  }
}

// ─── Refresh ───────────────────────────────────────────────────────────────────
async function finRefresh() {
  if (finLoading || finTickers.length === 0) return;
  finLoading = true;

  const btn = document.getElementById('fin-refresh-btn');
  if (btn) btn.classList.add('spinning');

  // Mark all as loading
  finTickers.forEach(sym => {
    finPriceData[sym] = { ...(finPriceData[sym] || {}), loading: true, error: false };
  });
  finRenderGrid();

  // Fetch all in parallel
  await Promise.allSettled(finTickers.map(sym => finFetchOne(sym)));

  finLoading = false;
  if (btn) btn.classList.remove('spinning');
  finRenderGrid();
}

// ─── Sparkline SVG renderer ────────────────────────────────────────────────────
function finSparklineSVG(data, up) {
  if (!data || data.length < 2) return '';

  const W = 120, H = 40;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;

  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * W;
    const y = H - ((v - min) / range) * (H - 4) - 2;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  const pathD = `M ${pts.join(' L ')}`;
  const fillD = `M ${pts[0]} L ${pts.join(' L ')} L ${W},${H} L 0,${H} Z`;

  const color     = up ? '#22c55e' : '#ef4444';
  const fillColor = up ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)';

  return `<svg class="fin-sparkline" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true"><path d="${fillD}" fill="${fillColor}" stroke="none"/><path d="${pathD}" fill="none" stroke="${color}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

// ─── Render ────────────────────────────────────────────────────────────────────
function finRenderGrid() {
  const grid  = document.getElementById('fin-grid');
  const empty = document.getElementById('fin-empty');
  if (!grid) return;

  if (finTickers.length === 0) {
    grid.innerHTML = '';
    if (empty) empty.hidden = false;
    return;
  }
  if (empty) empty.hidden = true;

  grid.innerHTML = finTickers.map(sym => {
    const d = finPriceData[sym];

    // Loading skeleton
    if (!d || d.loading) {
      return `
        <div class="fin-card fin-card--loading" data-symbol="${escapeHtml(sym)}">
          <div class="fin-card-left">
            <span class="fin-symbol">${escapeHtml(sym)}</span>
            <span class="fin-name fin-skeleton-line" style="width:80px;height:12px;margin-top:4px;border-radius:4px;display:block;"></span>
          </div>
          <div class="fin-sparkline-wrap fin-skeleton-block" style="height:40px;border-radius:6px;"></div>
          <div class="fin-card-right">
            <span class="fin-skeleton-line" style="width:64px;height:16px;border-radius:4px;display:block;"></span>
            <span class="fin-skeleton-line" style="width:48px;height:12px;margin-top:5px;border-radius:4px;display:block;"></span>
          </div>
          <button class="fin-remove-btn" onclick="finRemoveTicker('${escapeHtml(sym)}')" aria-label="Remove ${escapeHtml(sym)}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>`;
    }

    // Error state
    if (d.error) {
      return `
        <div class="fin-card fin-card--error" data-symbol="${escapeHtml(sym)}">
          <div class="fin-card-left">
            <span class="fin-symbol">${escapeHtml(sym)}</span>
            <span class="fin-name fin-error-hint">Not found</span>
          </div>
          <div class="fin-sparkline-wrap"></div>
          <div class="fin-card-right"></div>
          <button class="fin-remove-btn" onclick="finRemoveTicker('${escapeHtml(sym)}')" aria-label="Remove ${escapeHtml(sym)}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>`;
    }

    // Normal data card
    const priceStr  = finFormatPrice(d.price, d.currency);
    const changeStr = (d.change >= 0 ? '+' : '') + d.change.toFixed(2);
    const pctStr    = (d.changePct >= 0 ? '+' : '') + d.changePct.toFixed(2) + '%';
    const colorClass = d.up ? 'fin-up' : 'fin-down';
    const sparkSVG  = finSparklineSVG(d.sparkline, d.up);

    return `
      <div class="fin-card ${colorClass}" data-symbol="${escapeHtml(sym)}">
        <div class="fin-card-left">
          <span class="fin-symbol">${escapeHtml(sym)}</span>
          <span class="fin-name">${escapeHtml(d.name)}</span>
        </div>
        <div class="fin-sparkline-wrap">${sparkSVG}</div>
        <div class="fin-card-right">
          <span class="fin-price">${escapeHtml(priceStr)}</span>
          <span class="fin-change ${colorClass}">
            <span class="fin-change-val">${escapeHtml(changeStr)}</span>
            <span class="fin-change-pct">${escapeHtml(pctStr)}</span>
          </span>
        </div>
        <button class="fin-remove-btn" onclick="finRemoveTicker('${escapeHtml(sym)}')" aria-label="Remove ${escapeHtml(sym)}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>`;
  }).join('');
}

// ─── Format helpers ────────────────────────────────────────────────────────────
function finFormatPrice(price, currency) {
  if (price == null) return '—';
  // High-value assets (BTC): 2 decimals; low-value crypto: 4+ decimals
  const decimals = price >= 1 ? 2 : price >= 0.01 ? 4 : 6;
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency || 'USD',
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(price);
  } catch {
    return '$' + price.toFixed(decimals);
  }
}

function finShowStatus(msg, isError = false) {
  const el = document.getElementById('fin-status');
  if (!el) return;
  if (!msg) { el.hidden = true; el.textContent = ''; return; }
  el.textContent = msg;
  el.className = 'fin-status' + (isError ? ' fin-status--error' : '');
  el.hidden = false;
  if (!isError) setTimeout(() => { el.hidden = true; }, 3000);
}

// ─── Init ──────────────────────────────────────────────────────────────────────
function finInit() {
  finLoadTickers();

  if (finTickers.length > 0) {
    // Show skeletons immediately, then fetch
    finTickers.forEach(sym => { finPriceData[sym] = { loading: true }; });
    finRenderGrid();
    Promise.allSettled(finTickers.map(sym => finFetchOne(sym))).then(() => finRenderGrid());
  } else {
    finRenderGrid(); // shows empty state
  }
}

// Called when Finance tab becomes visible (from switchTab in audiobook.js)
function finOnTabActivate() {
  // Refresh if any ticker has no data or errored
  const needsRefresh = finTickers.some(sym => !finPriceData[sym] || finPriceData[sym].error);
  if (needsRefresh && !finLoading) finRefresh();
}

finInit();
