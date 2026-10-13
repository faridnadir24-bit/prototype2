'use strict';
/**
 * SIGAP v3 — app.js
 * Semua interaksi pakai event delegation (tidak ada inline onclick)
 * sehingga tombol dijamin berfungsi pada konten dinamis.
 */

/* ══════════════════════════════════════════
   UTILS
══════════════════════════════════════════ */
const $  = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const rnd    = x => (Math.random() - .5) * 2 * x;
const fmt    = (n, d = 1) => (+n).toFixed(d);
const clamp  = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const uid    = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const today  = () => new Date().toISOString().slice(0, 10);

const hms = (d = new Date()) =>
  d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

const dtShort = s =>
  new Date(s + 'T00:00:00').toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });

const tsShort = ts => {
  const d = new Date(ts);
  return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' }) + ' ' + hms(d);
};

/* ══════════════════════════════════════════
   CONSTANTS
══════════════════════════════════════════ */
const TYPES = ['Sekam Padi', 'Jerami', 'Tongkol Jagung', 'Kayu Chip'];

const TYPE_MARK = {
  'Sekam Padi'    : { abbr: 'SP', cls: 'bm-sekam'  },
  'Jerami'        : { abbr: 'JR', cls: 'bm-jerami'  },
  'Tongkol Jagung': { abbr: 'TJ', cls: 'bm-tongkol' },
  'Kayu Chip'     : { abbr: 'KC', cls: 'bm-kayu'    },
};

const CHIPS = [
  { label: 'Semua',         value: '' },
  { label: 'Sekam Padi',    value: 'Sekam Padi' },
  { label: 'Jerami',        value: 'Jerami' },
  { label: 'Tongkol Jagung',value: 'Tongkol Jagung' },
  { label: 'Kayu Chip',     value: 'Kayu Chip' },
];

const MODES = {
  normal  : { label: 'Normal',     cls: '',        t: 785,  p: 102.3, a: 45.2 },
  overheat: { label: 'Overheat',   cls: 'sim-crit', t: 945, p: 104.5, a: 52.0 },
  leak    : { label: 'Kebocoran',  cls: 'sim-warn', t: 765, p: 83.0,  a: 40.0 },
  tar     : { label: 'Tar',        cls: 'sim-warn', t: 735, p: 101.5, a: 26.0 },
  cold    : { label: 'Suhu Rendah',cls: 'sim-warn', t: 640, p: 101.0, a: 38.0 },
};

const METHODS = {
  internet: { name: 'Internet',  desc: 'Via sinyal data — kecepatan tinggi',     speed: '~1 detik',  ms: 900,  icon: netIcon()    },
  sms     : { name: 'SMS',       desc: 'Paket data kecil melalui jaringan GSM',  speed: '~8 detik',  ms: 3200, icon: smsIcon()    },
  lora    : { name: 'LoRa',      desc: 'Radio jarak jauh ke gateway desa',       speed: '~25 detik', ms: 8000, icon: radioIcon()  },
};

const SAMPLE = [
  { id: uid(), type: 'Sekam Padi',     weight: 150, moisture: 12, date: '2026-10-10' },
  { id: uid(), type: 'Jerami',         weight: 80,  moisture: 15, date: '2026-10-11' },
  { id: uid(), type: 'Tongkol Jagung', weight: 120, moisture: 10, date: '2026-10-12' },
  { id: uid(), type: 'Kayu Chip',      weight: 200, moisture: 8,  date: '2026-10-13' },
];

/* SVG icon helpers for methods (no CDN, no emoji) */
function netIcon() {
  return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 010 20M12 2a15.3 15.3 0 000 20"/></svg>`;
}
function smsIcon() {
  return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>`;
}
function radioIcon() {
  return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.55a11 11 0 0114.08 0"/><path d="M1.42 9a16 16 0 0121.16 0"/><path d="M8.53 16.11a6 6 0 016.95 0"/><line x1="12" y1="20" x2="12.01" y2="20"/></svg>`;
}

/* ══════════════════════════════════════════
   APP STATE
══════════════════════════════════════════ */
const S = {
  biomass  : [],
  logs     : [],
  queue    : [],
  syncLogs : [],
  readings : [],
  meta     : { kwh: 12.4, lastSync: null },
  mode     : 'normal',
  cur      : { t: 785, p: 102.3, a: 45.2 },
  gas      : { CO: 22.5, H2: 15.8, CH4: 4.2, CO2: 12.1 },
  kw       : 2.3,
  an       : { level: 0, items: [] },
  prevLevel: 0,
  ticks    : 0,
  mon      : { labels: [], t: [], p: [] },
  pred     : [],
  opt      : false,
  online   : navigator.onLine,
  filter   : '',
  q        : '',
  method   : 'internet',
  syncing  : false,
  editId   : null,
  deleteId : null,
  charts   : {},
  screen   : 'dashboard',
};

/* ══════════════════════════════════════════
   INDEXEDDB / LOCALSTORAGE
══════════════════════════════════════════ */
const DB = {
  db: null,
  async init() {
    try {
      this.db = await new Promise((ok, no) => {
        const r = indexedDB.open('sigap-v3', 1);
        r.onupgradeneeded = () => r.result.createObjectStore('kv');
        r.onsuccess = () => ok(r.result);
        r.onerror   = () => no(r.error);
      });
    } catch { this.db = null; }
  },
  _lsGet(k) { return JSON.parse(localStorage.getItem('sigap3.' + k) || 'null'); },
  _lsSet(k, v) { try { localStorage.setItem('sigap3.' + k, JSON.stringify(v)); } catch {} },
  get(k) {
    if (!this.db) return Promise.resolve(this._lsGet(k));
    return new Promise(ok => {
      const r = this.db.transaction('kv').objectStore('kv').get(k);
      r.onsuccess = () => ok(r.result ?? null);
      r.onerror   = () => ok(null);
    });
  },
  set(k, v) {
    if (!this.db) { this._lsSet(k, v); return Promise.resolve(); }
    return new Promise(ok => {
      const t = this.db.transaction('kv', 'readwrite');
      t.objectStore('kv').put(JSON.parse(JSON.stringify(v)), k);
      t.oncomplete = ok; t.onerror = ok;
    });
  },
};

const save = () => DB.set('state', {
  biomass : S.biomass,
  logs    : S.logs,
  queue   : S.queue,
  syncLogs: S.syncLogs,
  meta    : S.meta,
});

/* ══════════════════════════════════════════
   LOG & QUEUE
══════════════════════════════════════════ */
function addLog(text, lvl = 'ok') {
  S.logs.unshift({ ts: Date.now(), text, lvl });
  if (S.logs.length > 50) S.logs.length = 50;
  if (S.screen === 'dashboard') renderLog();
  save();
}

function enqueue(type, desc) {
  S.queue.push({ id: uid(), type, desc, ts: Date.now() });
  renderNavBadge();
  if (S.screen === 'sinkronisasi') renderSync();
  save();
}

function toast(msg, ms = 2800) {
  const el = $('#toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.remove('hidden');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.add('hidden'), ms);
}

/* ══════════════════════════════════════════
   SIMULATION ENGINE
══════════════════════════════════════════ */
function tick() {
  const m = MODES[S.mode], c = S.cur;

  c.t += (m.t - c.t) * .18 + rnd(7);
  c.p += (m.p - c.p) * .18 + rnd(.6);
  c.a  = clamp(c.a + (m.a - c.a) * .18 + rnd(1.2), 5, 80);

  const dT = c.t - 785, g = S.gas;
  g.CO  = clamp(22.5 + dT * .038 + rnd(.5), 5, 35);
  g.H2  = clamp(15.8 + dT * .028 + rnd(.4), 4, 28);
  g.CH4 = clamp(4.2  - dT * .014 + rnd(.2), .5, 9);
  g.CO2 = clamp(12.1 + (c.a - 45) * .06 + rnd(.3), 4, 22);

  const lhv = .1263 * g.CO + .1078 * g.H2 + .3589 * g.CH4;
  const eff  = (c.t >= 700 && c.t <= 900) ? 1 : .65;
  S.kw = Math.max(0, lhv * c.a * .06 * 2 / 3.6 * .25 * eff);
  S.meta.kwh += S.kw * 3 / 3600 * 60;

  const newAn = analyze();
  if (newAn.level !== S.prevLevel) {
    const lbl = ['kembali NORMAL', 'WASPADA', 'KRITIS'][newAn.level];
    addLog(`Status reaktor ${lbl}: ${newAn.items[0].text}`, ['ok','warn','crit'][newAn.level]);
    if (newAn.level > 0) enqueue('peringatan', `${['','WASPADA','KRITIS'][newAn.level]}: ${newAn.items[0].text}`);
    S.prevLevel = newAn.level;
  }
  S.an = newAn;

  const reading = {
    waktu  : new Date().toISOString(),
    suhu   : +fmt(c.t), tekanan: +fmt(c.p), udara: +fmt(c.a),
    CO: +fmt(g.CO), H2: +fmt(g.H2), CH4: +fmt(g.CH4), CO2: +fmt(g.CO2),
    kw: +fmt(S.kw, 2),
    status : ['NORMAL','WARNING','CRITICAL'][newAn.level],
  };
  S.readings.push(reading);
  if (S.readings.length > 300) S.readings.shift();

  S.mon.labels.push(hms());
  S.mon.t.push(reading.suhu);
  S.mon.p.push(reading.tekanan);
  if (S.mon.t.length > 24) { S.mon.labels.shift(); S.mon.t.shift(); S.mon.p.shift(); }

  S.ticks++;
  if (S.ticks % 20 === 0) enqueue('sensor', 'Batch data sensor reaktor');
  if (S.ticks % 5  === 0) save();
  if (S.ticks % 8  === 0) computePred();

  renderLive();
}

/* ══════════════════════════════════════════
   ANOMALY DETECTION
══════════════════════════════════════════ */
function analyze() {
  const { t, p, a } = S.cur;
  const items = [];
  let level = 0;
  const cf = base => Math.round(clamp(base + rnd(2.5), 60, 99));

  if (t > 900) {
    items.push({ text: 'Suhu tinggi — kurangi pasokan udara masuk', conf: cf(82 + (t - 900) / 5) });
    level = Math.max(level, t > 950 ? 2 : 1);
  }
  if (t < 700) {
    items.push({ text: 'Suhu rendah — tambah oksigen atau udara primer', conf: cf(83 + (700 - t) / 5) });
    level = Math.max(level, t < 600 ? 2 : 1);
  }
  if (a < 32 && t < 790) {
    items.push({ text: 'Tar terdeteksi — rasio udara terhadap biomassa terlalu rendah', conf: cf(88) });
    level = Math.max(level, 1);
  }
  if (p < 95) {
    items.push({ text: 'Tekanan turun — periksa kemungkinan kebocoran pada sistem', conf: cf(84 + (95 - p)) });
    level = Math.max(level, p < 88 ? 2 : 1);
  }
  if (!items.length) {
    items.push({ text: 'Semua parameter dalam batas operasi normal', conf: cf(96) });
  }
  return { level, items };
}

/* ══════════════════════════════════════════
   AI PREDICTION
══════════════════════════════════════════ */
function computePred() {
  const factors = S.opt
    ? [1.06, 1.13, 1.19, 1.17, 1.11, 1.07]
    : [1.00, 1.04, 1.09, 1.05, 0.97, 0.91];
  const base = Math.max(S.kw, .1);
  S.pred = factors.map((f, i) => +fmt(base * f * (1 + Math.sin(i * .6) * .015), 2));
  if (S.screen === 'prediksi') renderPred();
}

/* ══════════════════════════════════════════
   CHARTS (Chart.js + canvas fallback)
══════════════════════════════════════════ */
function makeMonitorChart() {
  const ctx = $('#monChart');
  if (!ctx) return;
  if (S.charts.mon) { S.charts.mon.destroy(); S.charts.mon = null; }
  if (typeof Chart === 'undefined') { fbChart(ctx, S.mon.labels, S.mon.t, '#EF4444'); return; }

  S.charts.mon = new Chart(ctx, {
    type: 'line',
    data: {
      labels: S.mon.labels,
      datasets: [
        {
          label: 'Suhu (°C)',
          data: S.mon.t,
          borderColor: '#EF4444',
          backgroundColor: 'rgba(239,68,68,.07)',
          fill: true, tension: .4, pointRadius: 0, borderWidth: 2,
          yAxisID: 'y',
        },
        {
          label: 'Tekanan (kPa)',
          data: S.mon.p,
          borderColor: '#3B82F6',
          backgroundColor: 'rgba(59,130,246,.05)',
          fill: true, tension: .4, pointRadius: 0, borderWidth: 2,
          yAxisID: 'y1',
        },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { position: 'top', labels: { font: { size: 11, family: 'Inter' }, boxWidth: 10, padding: 10 } },
      },
      scales: {
        x:  { ticks: { font: { size: 9 }, maxTicksLimit: 5, color: '#7A9A8A' }, grid: { color: '#E0EAE4' } },
        y:  { position: 'left',  ticks: { font: { size: 9 }, color: '#EF4444' }, grid: { color: '#E0EAE4' } },
        y1: { position: 'right', ticks: { font: { size: 9 }, color: '#3B82F6' }, grid: { drawOnChartArea: false } },
      },
      animation: { duration: 300 },
    },
  });
}

function updateMonitorChart() {
  const ch = S.charts.mon;
  if (!ch) return;
  ch.data.labels          = [...S.mon.labels];
  ch.data.datasets[0].data = [...S.mon.t];
  ch.data.datasets[1].data = [...S.mon.p];
  ch.update('none');
}

function makePredChart() {
  const ctx = $('#predChart');
  if (!ctx) return;
  if (S.charts.pred) { S.charts.pred.destroy(); S.charts.pred = null; }

  const now    = new Date();
  const labels = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getTime() + (i + 1) * 3600_000);
    return d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
  });
  const data = S.pred.length === 6 ? S.pred : [2.3, 2.4, 2.6, 2.5, 2.2, 2.0];

  if (typeof Chart === 'undefined') { fbChart(ctx, labels, data, '#16A34A'); return; }

  S.charts.pred = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Prediksi Daya (kW)',
          data,
          borderColor: '#16A34A',
          backgroundColor: 'rgba(22,163,74,.08)',
          fill: true, tension: .4,
          pointRadius: 4, pointBackgroundColor: '#16A34A',
          pointBorderColor: '#fff', pointBorderWidth: 2,
          borderWidth: 2.5,
        },
        {
          label: 'Daya saat ini',
          data: Array(6).fill(+fmt(S.kw, 2)),
          borderColor: '#CA8A04', borderDash: [5, 4],
          borderWidth: 1.5, pointRadius: 0, fill: false, tension: 0,
        },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { position: 'top', labels: { font: { size: 11, family: 'Inter' }, boxWidth: 10, padding: 10 } },
      },
      scales: {
        x: { ticks: { font: { size: 9 }, color: '#7A9A8A' }, grid: { color: '#E0EAE4' } },
        y: { ticks: { font: { size: 9 }, color: '#16A34A', callback: v => v + ' kW' }, grid: { color: '#E0EAE4' }, beginAtZero: false },
      },
      animation: { duration: 500 },
    },
  });
}

function updatePredChart() {
  const ch = S.charts.pred;
  if (!ch || !S.pred.length) return;
  ch.data.datasets[0].data = [...S.pred];
  ch.data.datasets[1].data = Array(6).fill(+fmt(S.kw, 2));
  ch.update();
}

/** Simple canvas fallback if Chart.js CDN unavailable */
function fbChart(cv, labels, data, color) {
  const dpr = window.devicePixelRatio || 1;
  const w = cv.clientWidth || 300, h = cv.clientHeight || 180;
  cv.width = w * dpr; cv.height = h * dpr;
  const ctx = cv.getContext('2d');
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, w, h);
  const pad = { t: 20, b: 20, l: 36, r: 10 };
  const iw = w - pad.l - pad.r, ih = h - pad.t - pad.b;
  const n = data.length;
  if (!n) return;
  const mn = Math.min(...data), mx = Math.max(...data), rng = (mx - mn) || 1;
  const px = i => pad.l + (i / Math.max(n - 1, 1)) * iw;
  const py = v => pad.t + ih - ((v - mn) / rng) * ih;

  // Grid
  ctx.strokeStyle = '#E0EAE4'; ctx.lineWidth = 1;
  for (let g = 0; g <= 4; g++) {
    const y = pad.t + g * ih / 4;
    ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(w - pad.r, y); ctx.stroke();
  }

  // Fill
  ctx.beginPath();
  data.forEach((v, i) => i ? ctx.lineTo(px(i), py(v)) : ctx.moveTo(px(i), py(v)));
  ctx.lineTo(px(n - 1), pad.t + ih); ctx.lineTo(px(0), pad.t + ih); ctx.closePath();
  ctx.fillStyle = color + '14'; ctx.fill();

  // Line
  ctx.beginPath();
  data.forEach((v, i) => i ? ctx.lineTo(px(i), py(v)) : ctx.moveTo(px(i), py(v)));
  ctx.strokeStyle = color; ctx.lineWidth = 2.5; ctx.lineJoin = 'round';
  ctx.stroke();

  // Dots
  ctx.fillStyle = color;
  data.forEach((v, i) => { ctx.beginPath(); ctx.arc(px(i), py(v), 3.5, 0, Math.PI * 2); ctx.fill(); });

  // Y-axis labels
  ctx.fillStyle = '#7A9A8A'; ctx.font = '10px Inter,sans-serif'; ctx.textAlign = 'right';
  ctx.fillText(fmt(mx, 1), pad.l - 4, py(mx) + 4);
  ctx.fillText(fmt(mn, 1), pad.l - 4, py(mn) + 4);

  // X-axis labels
  ctx.textAlign = 'center';
  [0, Math.floor(n / 2), n - 1].forEach(i => {
    if (labels[i]) ctx.fillText(labels[i], px(i), h - 4);
  });
}

/* ══════════════════════════════════════════
   RENDER — LIVE SENSOR VALUES (every 3s)
══════════════════════════════════════════ */
function renderLive() {
  const c = S.cur, g = S.gas, an = S.an;
  const lv  = an.level; // 0=ok, 1=warn, 2=crit
  const cls = ['ok', 'warn', 'crit'][lv];
  const txt = ['NORMAL', 'WASPADA', 'KRITIS'][lv];
  const badge = ['Optimal', 'Waspada', 'Kritis'][lv];

  /* ── Dashboard ── */
  setText('cTemp',  fmt(c.t, 0));
  setText('cKwh',   fmt(S.meta.kwh, 1));
  setText('qsPressure', fmt(c.p, 1));
  setText('qsAirflow',  fmt(c.a, 1));
  setText('qsPower',    fmt(S.kw, 2));

  const sc = $('#statusCard');
  if (sc) { sc.className = `status-card ${cls}`; }
  setText('dashStatusTxt',   txt);
  setText('dashStatusBadge', badge);

  const dot = $('#statusDot');
  if (dot) { dot.style.background = ['var(--ok)','var(--warn)','var(--crit)'][lv]; }

  // Dashboard anomaly
  const da = $('#dashAnomaly');
  if (da) {
    if (lv > 0) {
      da.classList.remove('hidden');
      da.className = `alert-card${lv === 2 ? ' crit' : ''}`;
      setText('dashAnomalyMsg',  an.items[0].text);
      setText('dashAnomalyConf', an.items[0].conf + '% yakin');
    } else {
      da.classList.add('hidden');
    }
  }

  /* ── Monitoring ── */
  const tempNum = Math.round(c.t);
  setText('mTemp',    String(tempNum));
  setText('mPressure', fmt(c.p, 1));
  setText('mAirflow',  fmt(c.a, 1));
  setText('mPower',    fmt(S.kw, 2));

  // Temperature number color
  const tn = $('#mTemp');
  if (tn) {
    tn.className = 'temp-num mono' + (c.t < 700 ? ' cold' : c.t > 900 ? ' hot' : '');
  }

  // Gauge cursor (500–1000 → 0–100%)
  const pct = clamp((c.t - 500) / 500 * 100, 0, 100);
  const cur = $('#tempCursor');
  if (cur) cur.style.left = pct + '%';

  // Status badge
  const mb = $('#monBadge');
  if (mb) { mb.textContent = txt; mb.className = `tp-badge ${cls}`; }

  // Temp panel background
  const tp = $('#tempPanel');
  if (tp) {
    if (lv === 2)      tp.style.background = '#1c0a0a';
    else if (lv === 1) tp.style.background = '#1a1308';
    else               tp.style.background = '#0f1f17';
  }

  // Syngas
  setText('gCO',  fmt(g.CO, 1)  + '%');
  setText('gH2',  fmt(g.H2, 1)  + '%');
  setText('gCH4', fmt(g.CH4, 1) + '%');
  setText('gCO2', fmt(g.CO2, 1) + '%');
  setBar('barCO',  g.CO,  35);
  setBar('barH2',  g.H2,  28);
  setBar('barCH4', g.CH4, 9);
  setBar('barCO2', g.CO2, 22);

  // AI alert panel
  const ab = $('#anomalyBox');
  if (ab) {
    ab.classList.remove('hidden', 'ok', 'warn', 'crit');
    ab.classList.add(cls);
    setText('aiConf', an.items[0].conf + '%');
    const ai = $('#anomalyItems');
    if (ai) {
      ai.innerHTML = an.items.map(it =>
        `<div class="ai-item">${it.text}</div>`
      ).join('');
    }
  }

  // Monitor tick counter
  setText('monTick', `${S.mon.t.length} titik`);

  // Update charts if visible
  if (S.screen === 'monitoring') updateMonitorChart();
}

function setBar(id, val, max) {
  const el = document.getElementById(id);
  if (el) el.style.width = clamp(val / max * 100, 0, 100) + '%';
}

/* ══════════════════════════════════════════
   RENDER — LOGS
══════════════════════════════════════════ */
function renderLog() {
  const list = $('#logList');
  if (!list) return;
  const shown = S.logs.slice(0, 5);
  if (!shown.length) {
    list.innerHTML = '<li class="log-item"><span class="log-text" style="color:var(--tx-3)">Belum ada aktivitas</span></li>';
    return;
  }
  list.innerHTML = shown.map(l => `
    <li class="log-item ${l.lvl}">
      <span class="log-text">${l.text}</span>
      <span class="log-time">${tsShort(l.ts)}</span>
    </li>
  `).join('');
  setText('logCount', String(S.logs.length));
}

/* ══════════════════════════════════════════
   RENDER — BIOMASS
══════════════════════════════════════════ */
function renderBiomass() {
  const q = S.q.toLowerCase();
  const f = S.filter;
  const items = S.biomass.filter(b => {
    if (f && b.type !== f) return false;
    if (q && !b.type.toLowerCase().includes(q) && !b.date.includes(q)) return false;
    return true;
  });

  const total = items.reduce((a, b) => a + b.weight, 0);
  setText('bTotal', total.toLocaleString('id-ID') + ' kg');
  setText('cBiomass', S.biomass.reduce((a, b) => a + b.weight, 0).toLocaleString('id-ID'));

  const list  = $('#bList');
  const empty = $('#bEmpty');
  if (!list) return;

  if (!items.length) {
    list.innerHTML = '';
    empty?.classList.remove('hidden');
    return;
  }
  empty?.classList.add('hidden');

  list.innerHTML = items.map(b => {
    const m = TYPE_MARK[b.type] || { abbr: b.type.slice(0, 2).toUpperCase(), cls: 'bm-default' };
    return `
      <div class="biomass-card">
        <div class="bc-type-mark ${m.cls}">${m.abbr}</div>
        <div class="bc-body">
          <div class="bc-type">${b.type}</div>
          <div class="bc-tags">
            <span class="bc-tag">${b.weight} kg</span>
            <span class="bc-tag">Air: ${b.moisture}%</span>
          </div>
          <div class="bc-date">${dtShort(b.date)}</div>
        </div>
        <div class="bc-actions">
          <button class="bc-btn" data-action="edit" data-id="${b.id}" title="Edit" aria-label="Edit ${b.type}">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          </button>
          <button class="bc-btn bc-del" data-action="delete" data-id="${b.id}" title="Hapus" aria-label="Hapus ${b.type}">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>
          </button>
        </div>
      </div>
    `;
  }).join('');
}

function renderChips() {
  const wrap = $('#chips');
  if (!wrap) return;
  wrap.innerHTML = CHIPS.map(c => `
    <button class="chip${S.filter === c.value ? ' active' : ''}" data-action="filter" data-value="${c.value}">
      ${c.label}
    </button>
  `).join('');
}

/* ══════════════════════════════════════════
   RENDER — SYNC SCREEN
══════════════════════════════════════════ */
function renderSync() {
  // Status card
  const sc = $('#syncStatusCard');
  if (sc) sc.className = `sync-status-card${S.online ? ' is-online' : ''}`;
  setText('syncStatusTitle', S.online ? 'Terhubung ke Internet' : 'Tidak Terhubung');
  setText('syncStatusSub',   S.online ? 'Siap melakukan sinkronisasi' : 'Mode offline — data tersimpan lokal');

  const orb = $('#syncOrb');
  if (orb) orb.className = `ssc-orb${S.online ? ' ssc-online' : ''}`;

  // Last sync
  setText('lastSyncTime', S.meta.lastSync ? tsShort(S.meta.lastSync) : 'Belum pernah');

  // Queue
  const ql = $('#queueList');
  const qe = $('#queueEmpty');
  if (ql) {
    if (S.queue.length) {
      qe?.classList.add('hidden');
      ql.innerHTML = S.queue.slice(-8).reverse().map(q => `
        <div class="queue-item">
          <span class="qi-type">${q.type}</span>
          <span class="qi-desc">${q.desc}</span>
          <span class="qi-time mono">${tsShort(q.ts)}</span>
        </div>
      `).join('');
    } else {
      ql.innerHTML = '';
      qe?.classList.remove('hidden');
    }
  }

  // Methods
  const ml = $('#methodList');
  if (ml) {
    ml.innerHTML = Object.entries(METHODS).map(([key, m]) => `
      <div class="method-card${S.method === key ? ' is-selected' : ''}" data-action="method" data-value="${key}">
        <div class="mc-icon">${m.icon}</div>
        <div class="mc-body">
          <div class="mc-name">${m.name}</div>
          <div class="mc-desc">${m.desc}</div>
        </div>
        <div class="mc-speed mono">${m.speed}</div>
        <div class="mc-radio"></div>
      </div>
    `).join('');
  }

  renderNavBadge();
  renderSyncLog();
}

function renderSyncLog() {
  const sl = $('#syncLog');
  if (!sl) return;
  if (!S.syncLogs.length) {
    sl.innerHTML = '<div class="slog-item" style="color:var(--tx-3)">Belum ada riwayat sinkronisasi</div>';
    return;
  }
  sl.innerHTML = S.syncLogs.slice(-8).reverse().map(l => `
    <div class="slog-item">
      <span class="slog-dot ${l.ok ? 'ok' : 'fail'}"></span>
      <span>${l.msg}</span>
      <span class="slog-time mono">${tsShort(l.ts)}</span>
    </div>
  `).join('');
}

function renderNavBadge() {
  const nb = $('#navBadge');
  const qc = $('#queueCount');
  if (nb) {
    if (S.queue.length) { nb.textContent = S.queue.length > 99 ? '99+' : S.queue.length; nb.classList.remove('hidden'); }
    else                { nb.classList.add('hidden'); }
  }
  if (qc) qc.textContent = String(S.queue.length);
}

function renderNetBadge() {
  const badge = $('#netBadge');
  const label = $('#netLabel');
  const dot   = $('#netDot');
  if (badge) badge.className = `net-badge ${S.online ? 'net-online' : 'net-offline'}`;
  if (label) label.textContent = S.online ? 'Online' : 'Offline';
}

/* ══════════════════════════════════════════
   RENDER — PREDIKSI
══════════════════════════════════════════ */
function renderPred() {
  if (S.charts.pred) updatePredChart();
  else makePredChart();

  const r2 = (S.opt ? 0.94 + Math.random() * .03 : 0.88 + Math.random() * .04).toFixed(2);
  setText('r2Val', r2);

  const tbody = $('#predBody');
  if (!tbody || !S.pred.length) return;

  const peakIdx = S.pred.indexOf(Math.max(...S.pred));
  tbody.innerHTML = S.pred.map((v, i) => `
    <tr>
      <td>+${i + 1} jam</td>
      <td class="mono"><strong>${v} kW</strong></td>
      <td><span class="pred-tag ${i === peakIdx ? 'peak' : 'normal'}">${i === peakIdx ? 'Puncak' : 'Normal'}</span></td>
    </tr>
  `).join('');

  const peakH = peakIdx + 1;
  setText('predMsg', `Produksi optimal dalam ${peakH} jam ke depan — estimasi puncak ${S.pred[peakIdx]} kW`);
}

/* ══════════════════════════════════════════
   RENDER — SIMULATION GRID
══════════════════════════════════════════ */
function renderSimGrid() {
  const grid = $('#simGrid');
  if (!grid) return;
  grid.innerHTML = Object.entries(MODES).map(([key, m]) => `
    <button class="sim-btn ${m.cls}${S.mode === key ? ' sim-active' : ''}"
      data-action="mode" data-value="${key}">${m.label}</button>
  `).join('');
}

/* ══════════════════════════════════════════
   NAVIGATION
══════════════════════════════════════════ */
function navigate(screen) {
  S.screen = screen;
  $$('.screen').forEach(s => s.classList.remove('active'));
  $$('.nav-btn').forEach(b => b.classList.remove('active'));
  $(`#s-${screen}`)?.classList.add('active');
  $(`[data-screen="${screen}"]`)?.classList.add('active');
  $('#main')?.scrollTo(0, 0);

  switch (screen) {
    case 'dashboard':
      renderLog();
      break;
    case 'biomassa':
      renderChips();
      renderBiomass();
      break;
    case 'monitoring':
      setTimeout(() => S.charts.mon ? updateMonitorChart() : makeMonitorChart(), 60);
      renderSimGrid();
      break;
    case 'prediksi':
      computePred();
      setTimeout(() => makePredChart(), 60);
      break;
    case 'sinkronisasi':
      renderSync();
      break;
  }
}

/* ══════════════════════════════════════════
   BIOMASS CRUD
══════════════════════════════════════════ */
function openAdd() {
  S.editId = null;
  setText('modalTitle', 'Tambah Biomassa');
  $('#editId').value    = '';
  $('#fType').value     = '';
  $('#fWeight').value   = '';
  $('#fMoisture').value = '';
  $('#fDate').value     = today();
  openModal();
}

function openEdit(id) {
  const b = S.biomass.find(x => x.id === id);
  if (!b) return;
  S.editId = id;
  setText('modalTitle', 'Edit Biomassa');
  $('#editId').value    = id;
  $('#fType').value     = b.type;
  $('#fWeight').value   = b.weight;
  $('#fMoisture').value = b.moisture;
  $('#fDate').value     = b.date;
  openModal();
}

function openModal() {
  $('#modalOverlay')?.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
  setTimeout(() => $('#fType')?.focus(), 120);
}

function closeModal() {
  $('#modalOverlay')?.classList.add('hidden');
  document.body.style.overflow = '';
}

function saveBiomass(e) {
  e.preventDefault();
  const type     = $('#fType').value.trim();
  const weight   = parseFloat($('#fWeight').value);
  const moisture = parseFloat($('#fMoisture').value);
  const date     = $('#fDate').value;

  if (!type || isNaN(weight) || weight <= 0 || isNaN(moisture) || moisture < 0 || !date) {
    toast('Isi semua kolom dengan benar');
    return;
  }

  if (S.editId) {
    const idx = S.biomass.findIndex(b => b.id === S.editId);
    if (idx !== -1) {
      S.biomass[idx] = { ...S.biomass[idx], type, weight, moisture, date };
      addLog(`Data diperbarui: ${type} ${weight} kg`, 'ok');
      enqueue('update', `Update: ${type} ${weight} kg`);
      toast('Data biomassa berhasil diperbarui');
    }
  } else {
    S.biomass.unshift({ id: uid(), type, weight, moisture, date });
    addLog(`Biomassa ditambah: ${type} ${weight} kg (air ${moisture}%)`, 'ok');
    enqueue('tambah', `Tambah: ${type} ${weight} kg`);
    toast('Biomassa berhasil ditambahkan');
  }

  closeModal();
  renderBiomass();
  save();
}

function askDelete(id) {
  S.deleteId = id;
  $('#confirmOverlay')?.classList.remove('hidden');
}

function closeConfirm() {
  S.deleteId = null;
  $('#confirmOverlay')?.classList.add('hidden');
}

function confirmDelete() {
  if (!S.deleteId) return;
  const b = S.biomass.find(x => x.id === S.deleteId);
  S.biomass = S.biomass.filter(x => x.id !== S.deleteId);
  if (b) {
    addLog(`Biomassa dihapus: ${b.type} ${b.weight} kg`, 'ok');
    enqueue('hapus', `Hapus: ${b.type}`);
    toast('Data berhasil dihapus');
  }
  closeConfirm();
  renderBiomass();
  save();
}

/* ══════════════════════════════════════════
   SYNC
══════════════════════════════════════════ */
async function doSync() {
  if (S.syncing) return;
  if (!S.queue.length) { toast('Tidak ada data yang perlu disinkronkan'); return; }

  S.syncing = true;
  const btn = $('#syncBtn');
  btn?.classList.add('is-syncing');
  btn?.setAttribute('disabled', '');
  setText('syncBtnLabel', 'Menyinkronkan…');

  const m     = METHODS[S.method];
  const count = S.queue.length;
  toast(`Mengirim ${count} data via ${m.name}…`);

  await new Promise(r => setTimeout(r, m.ms));

  const ok = Math.random() > .07;

  if (ok) {
    S.syncLogs.push({ ts: Date.now(), ok: true, msg: `${count} data tersinkron via ${m.name}` });
    S.meta.lastSync = Date.now();
    S.queue = [];
    addLog(`Sinkronisasi berhasil — ${count} data via ${m.name}`, 'ok');
    toast(`${count} data berhasil dikirim via ${m.name}`);
  } else {
    S.syncLogs.push({ ts: Date.now(), ok: false, msg: `Gagal sinkron via ${m.name}: koneksi timeout` });
    addLog('Sinkronisasi gagal — coba lagi', 'warn');
    toast('Sinkronisasi gagal. Coba lagi.');
  }

  if (S.syncLogs.length > 20) S.syncLogs = S.syncLogs.slice(-20);

  S.syncing = false;
  btn?.classList.remove('is-syncing');
  btn?.removeAttribute('disabled');
  setText('syncBtnLabel', 'Sinkronisasi Sekarang');

  save();
  renderSync();
}

/* ══════════════════════════════════════════
   EXPORT CSV
══════════════════════════════════════════ */
function exportCSV() {
  if (!S.biomass.length) { toast('Tidak ada data untuk diekspor'); return; }
  const header = 'ID,Jenis,Berat (kg),Kadar Air (%),Tanggal\n';
  const rows   = S.biomass.map(b => `${b.id},${b.type},${b.weight},${b.moisture},${b.date}`).join('\n');
  const blob   = new Blob([header + rows], { type: 'text/csv;charset=utf-8;' });
  const url    = URL.createObjectURL(blob);
  const a      = Object.assign(document.createElement('a'), { href: url, download: `sigap-biomassa-${today()}.csv` });
  document.body.appendChild(a); a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  addLog('Export CSV biomassa berhasil', 'ok');
  toast('Data diekspor ke CSV');
}

/* ══════════════════════════════════════════
   OPTIMIZE
══════════════════════════════════════════ */
function toggleOptimize() {
  S.opt = !S.opt;
  const btn = $('#optimizeBtn');
  if (btn) {
    btn.classList.toggle('active-state', S.opt);
    const svg = btn.querySelector('svg');
    const lbl = S.opt ? 'Optimasi Aktif — Klik untuk Nonaktifkan' : 'Optimalkan Gasifikasi';
    btn.childNodes[btn.childNodes.length - 1].textContent = ' ' + lbl;
  }
  addLog(S.opt ? 'Mode optimasi gasifikasi diaktifkan' : 'Optimasi dinonaktifkan', 'ok');
  computePred();
  toast(S.opt ? 'Optimasi gasifikasi aktif' : 'Optimasi dinonaktifkan');
}

/* ══════════════════════════════════════════
   HELPER
══════════════════════════════════════════ */
function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

/* ══════════════════════════════════════════
   EVENT DELEGATION (satu listener, semua interaksi)
══════════════════════════════════════════ */
function setupEvents() {
  // Bottom nav
  $$('.nav-btn').forEach(btn =>
    btn.addEventListener('click', () => navigate(btn.dataset.screen))
  );

  // Global click delegation for dynamic content
  document.addEventListener('click', e => {
    const t = e.target;

    // Biomass edit/delete
    const bc = t.closest('[data-action]');
    if (bc) {
      e.preventDefault();
      const { action, id, value } = bc.dataset;
      if (action === 'edit')   { openEdit(id);     return; }
      if (action === 'delete') { askDelete(id);    return; }
      if (action === 'filter') { S.filter = value; renderChips(); renderBiomass(); return; }
      if (action === 'method') { S.method = value; renderSync();  return; }
      if (action === 'mode')   { setMode(value);   return; }
    }

    // FAB
    if (t.closest('#fabBtn'))      { openAdd();        return; }

    // Biomass form
    if (t.id === 'modalClose' || t.id === 'cancelBtn') { closeModal();   return; }
    if (t.id === 'modalOverlay')                        { closeModal();   return; }

    // Confirm
    if (t.id === 'confirmYes')     { confirmDelete();  return; }
    if (t.id === 'confirmNo')      { closeConfirm();   return; }
    if (t.id === 'confirmOverlay') { closeConfirm();   return; }

    // Sync button
    if (t.closest('#syncBtn'))     { doSync();         return; }

    // Export
    if (t.closest('#exportBtn'))   { exportCSV();      return; }

    // Optimize
    if (t.closest('#optimizeBtn')) { toggleOptimize(); return; }
  });

  // Biomass form submit
  $('#biomassForm')?.addEventListener('submit', saveBiomass);

  // Search
  $('#search')?.addEventListener('input', e => {
    S.q = e.target.value;
    renderBiomass();
  });

  // Online / offline
  window.addEventListener('online',  () => { S.online = true;  renderNetBadge(); if (S.screen === 'sinkronisasi') renderSync(); addLog('Koneksi internet tersambung', 'ok'); });
  window.addEventListener('offline', () => { S.online = false; renderNetBadge(); if (S.screen === 'sinkronisasi') renderSync(); addLog('Koneksi terputus — mode offline', 'warn'); });
}

function setMode(mode) {
  if (!MODES[mode]) return;
  S.mode = mode;
  addLog(`Mode simulasi: ${MODES[mode].label}`, mode === 'normal' ? 'ok' : 'warn');
  renderSimGrid();
  toast(`Simulasi ${MODES[mode].label} aktif`);
}

/* ══════════════════════════════════════════
   INIT
══════════════════════════════════════════ */
async function init() {
  await DB.init();

  // Load saved state
  const saved = await DB.get('state');
  if (saved) {
    if (Array.isArray(saved.biomass)  && saved.biomass.length)  S.biomass  = saved.biomass;
    if (Array.isArray(saved.logs)     && saved.logs.length)     S.logs     = saved.logs;
    if (Array.isArray(saved.queue)    && saved.queue.length)    S.queue    = saved.queue;
    if (Array.isArray(saved.syncLogs) && saved.syncLogs.length) S.syncLogs = saved.syncLogs;
    if (saved.meta) S.meta = { ...S.meta, ...saved.meta };
  }

  // First-run seed
  if (!S.biomass.length) { S.biomass = SAMPLE; save(); }

  // Default form date
  const fd = $('#fDate');
  if (fd) fd.value = today();

  // Initial UI
  renderLog();
  renderNavBadge();
  renderNetBadge();
  renderSimGrid();
  renderLive();

  // Wire up events
  setupEvents();

  // Start simulation (first ticks immediate, then every 3s)
  tick(); tick();
  setInterval(tick, 3000);

  // Service Worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }

  console.log('SIGAP v3 ready — offline-first biomass gasification monitor');
}

document.addEventListener('DOMContentLoaded', init);
