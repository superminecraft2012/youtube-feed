// ─── Finance Tab ───────────────────────────────────────────────────────────────
// Tracks stock/crypto tickers with live prices from Yahoo Finance.
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

  // Basic validation — allow letters, digits, dots, dashes (covers BTC-USD, ^GSPC, etc.)
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
  finRenderGrid();
  finFetchPrices([raw]);
}

function finRemoveTicker(symbol) {
  finTickers = finTickers.filter(t => t !== symbol);
  delete finPriceData[symbol];
  finSaveTickers();
  finRenderGrid();
}

// ─── Price fetching ────────────────────────────────────────────────────────────
// Uses Yahoo Finance v7 quote endpoint (no API key needed, publicly accessible)
async function finFetchPrices(symbols) {
  if (!symbols || symbols.length === 0) return;

  // Yahoo Finance v7 quote — batch up to ~50 symbols at once
  const joined = symbols.join(',');
  const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(joined)}&fields=regularMarketPrice,regularMarketChange,regularMarketChangePercent,shortName,longName,currency,regularMarketPreviousClose`;

  let quotes = [];
  try {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    quotes = json?.quoteResponse?.result || [];
  } catch (err) {
    // Fallback: try v8 chart endpoint per symbol
    for (const sym of symbols) {
      await finFetchSingleChart(sym);
    }
    finRenderGrid();
    return;
  }

  for (const q of quotes) {
    const sym = q.symbol;
    const price = q.regularMarketPrice;
    const change = q.regularMarketChange;
    const changePct = q.regularMarketChangePercent;
    const name = q.shortName || q.longName || sym;
    const currency = q.currency || 'USD';

    finPriceData[sym] = {
      price,
      change,
      changePct,
      name,
      currency,
      up: change >= 0,
      sparkline: finPriceData[sym]?.sparkline || [],   // preserve existing sparkline
      loading: false,
      error: false,
    };
  }

  // Mark any requested symbols not returned as errored
  for (const sym of symbols) {
    if (!finPriceData[sym] || finPriceData[sym].loading) {
      finPriceData[sym] = { ...(finPriceData[sym] || {}), error: true, loading: false };
    }
  }

  // Now fetch sparklines (5-day 1d chart) for each symbol
  await Promise.allSettled(symbols.map(sym => finFetchSparkline(sym)));
  finRenderGrid();
}

async function finFetchSparkline(symbol) {
  // 5d 30m interval gives ~48 data points — good for a compact sparkline
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=30m&range=5d`;
  try {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) return;
    const json = await res.json();
    const closes = json?.chart?.result?.[0]?.indicators?.quote?.[0]?.close;
    if (!closes) return;
    // Filter out nulls
    const valid = closes.filter(v => v != null);
    if (finPriceData[symbol]) {
      finPriceData[symbol].sparkline = valid;
    }
  } catch {
    // non-fatal
  }
}

async function finFetchSingleChart(symbol) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`;
  try {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    const result = json?.chart?.result?.[0];
    if (!result) throw new Error('No result');
    const meta = result.meta;
    const price = meta.regularMarketPrice;
    const prev = meta.chartPreviousClose || meta.previousClose;
    const change = price - prev;
    const changePct = (change / prev) * 100;
    finPriceData[symbol] = {
      price,
      change,
      changePct,
      name: meta.instrumentType === 'CRYPTOCURRENCY' ? symbol.replace('-USD','') : symbol,
      currency: meta.currency || 'USD',
      up: change >= 0,
      sparkline: [],
      loading: false,
      error: false,
    };
  } catch {
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

  await finFetchPrices(finTickers);

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
  // Fill path (close to bottom)
  const fillD = `M ${pts[0]} L ${pts.join(' L ')} L ${W},${H} L 0,${H} Z`;

  const color = up ? '#22c55e' : '#ef4444';
  const fillColor = up ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)';

  return `
    <svg class="fin-sparkline" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">
      <path d="${fillD}" fill="${fillColor}" stroke="none"/>
      <path d="${pathD}" fill="none" stroke="${color}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`;
}

// ─── Render ────────────────────────────────────────────────────────────────────
function finRenderGrid() {
  const grid = document.getElementById('fin-grid');
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
            <span class="fin-symbol fin-skeleton-line" style="width:52px;height:18px;"></span>
            <span class="fin-name fin-skeleton-line" style="width:90px;height:13px;margin-top:4px;"></span>
          </div>
          <div class="fin-sparkline-wrap fin-skeleton-block" style="width:120px;height:40px;"></div>
          <div class="fin-card-right">
            <span class="fin-skeleton-line" style="width:60px;height:18px;"></span>
            <span class="fin-skeleton-line" style="width:50px;height:14px;margin-top:4px;"></span>
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
          <button class="fin-remove-btn" onclick="finRemoveTicker('${escapeHtml(sym)}')" aria-label="Remove ${escapeHtml(sym)}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>`;
    }

    // Normal data card
    const priceStr = finFormatPrice(d.price, d.currency);
    const changeStr = (d.change >= 0 ? '+' : '') + d.change.toFixed(2);
    const pctStr   = (d.changePct >= 0 ? '+' : '') + d.changePct.toFixed(2) + '%';
    const colorClass = d.up ? 'fin-up' : 'fin-down';
    const sparkSVG = finSparklineSVG(d.sparkline, d.up);

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
  // Crypto can have many decimals, stocks typically 2
  const isCrypto = price < 1;
  const decimals = isCrypto ? 4 : 2;
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
  if (!isError) {
    setTimeout(() => { el.hidden = true; }, 3000);
  }
}

// ─── Init ──────────────────────────────────────────────────────────────────────
function finInit() {
  finLoadTickers();
  finRenderGrid();   // render empty/skeleton state immediately

  if (finTickers.length > 0) {
    // Mark all as loading and fetch
    finTickers.forEach(sym => {
      finPriceData[sym] = { loading: true };
    });
    finRenderGrid();
    finFetchPrices(finTickers);
  } else {
    const empty = document.getElementById('fin-empty');
    if (empty) empty.hidden = false;
  }
}

// Called when Finance tab becomes visible
function finOnTabActivate() {
  // Refresh if no data yet, or if last fetch was > 5 minutes ago
  const hasData = finTickers.every(sym => finPriceData[sym] && !finPriceData[sym].loading && finPriceData[sym].price != null);
  if (!hasData && finTickers.length > 0) {
    finRefresh();
  }
}

// Run init immediately (data loads in background)
finInit();
