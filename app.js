'use strict';
/**
 * SIGAP – Sistem Gasifikasi Biomassa Pintar
 * Versi 2.0 – Offline-first SPA
 * © 2026 SIGAP Team
 */

/* ══════════════════════════════════════════════════
   UTILS
══════════════════════════════════════════════════ */
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const rnd = x => (Math.random() - .5) * 2 * x;
const fmt = (n, d = 1) => Number(n).toFixed(d);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const today = () => new Date().toISOString().slice(0, 10);
const hm = (d = new Date()) => d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' }).replace(/\./g, ':');
const dtFmt = s => new Date(s).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
const timeFmt = ts => {
  const d = new Date(ts);
  return `${d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })} ${hm(d)}`;
};

/* ══════════════════════════════════════════════════
   CONSTANTS
══════════════════════════════════════════════════ */
const TYPES = ['Sekam Padi', 'Jerami', 'Tongkol Jagung', 'Kayu Chip'];
const ICONS = { 'Sekam Padi': '🌾', 'Jerami': '🌿', 'Tongkol Jagung': '🌽', 'Kayu Chip': '🪵' };

const CHIPS = [
  { label: 'Semua', value: '' },
  { label: '🌾 Sekam', value: 'Sekam Padi' },
  { label: '🌿 Jerami', value: 'Jerami' },
  { label: '🌽 Tongkol', value: 'Tongkol Jagung' },
  { label: '🪵 Kayu', value: 'Kayu Chip' },
];

const MODES = {
  normal:   { label: '✅ Normal',    icon: '✅', t: 785, p: 102.3, a: 45.2,  cls: '' },
  overheat: { label: '🔥 Overheat',  icon: '🔥', t: 945, p: 104.5, a: 52.0,  cls: 'crit' },
  leak:     { label: '💧 Kebocoran', icon: '💧', t: 765, p: 83.0,  a: 40.0,  cls: 'warn' },
  tar:      { label: '⚫ Tar',       icon: '⚫', t: 735, p: 101.5, a: 26.0,  cls: 'warn' },
  cold:     { label: '❄️ Suhu Rendah',icon: '❄️', t: 640, p: 101.0, a: 38.0,  cls: 'warn' },
};

const METHODS = {
  internet: { name: 'Internet',  icon: '🌐', desc: 'Kecepatan tinggi, butuh sinyal data',     speed: '~1s',  ms: 900  },
  sms:      { name: 'SMS',       icon: '💬', desc: 'Paket kecil via sinyal seluler GSM/4G',   speed: '~8s',  ms: 3200 },
  lora:     { name: 'LoRa',      icon: '📻', desc: 'Radio jarak jauh ke gateway desa',        speed: '~25s', ms: 8000 },
};

const SAMPLE_BIOMASS = [
  { id: uid(), type: 'Sekam Padi',     weight: 150, moisture: 12, date: '2026-10-10' },
  { id: uid(), type: 'Jerami',         weight: 80,  moisture: 15, date: '2026-10-11' },
  { id: uid(), type: 'Tongkol Jagung', weight: 120, moisture: 10, date: '2026-10-12' },
  { id: uid(), type: 'Kayu Chip',      weight: 200, moisture: 8,  date: '2026-10-13' },
];

/* ══════════════════════════════════════════════════
   STATE
══════════════════════════════════════════════════ */
const S = {
  biomass:   [],
  logs:      [],
  queue:     [],
  syncLogs:  [],
  readings:  [],
  meta:      { kwh: 12.4, lastSync: null },
  mode:      'normal',
  cur:       { t: 785, p: 102.3, a: 45.2 },
  gas:       { CO: 22.5, H2: 15.8, CH4: 4.2, CO2: 12.1 },
  kw:        2.3,
  an:        { level: 0, items: [] },
  prevLevel: 0,
  ticks:     0,
  mon:       { labels: [], t: [], p: [] },
  pred:      [],
  opt:       false,
  online:    navigator.onLine,
  filter:    '',
  q:         '',
  method:    'internet',
  syncing:   false,
  editingId: null,
  deleteId:  null,
  charts:    {},
  screen:    'dashboard',
};

/* ══════════════════════════════════════════════════
   INDEXEDDB / LOCALSTORAGE WRAPPER
══════════════════════════════════════════════════ */
const DB = {
  db: null,
  async init() {
    try {
      this.db = await new Promise((ok, no) => {
        const r = indexedDB.open('sigap-v2', 1);
        r.onupgradeneeded = () => r.result.createObjectStore('kv');
        r.onsuccess = () => ok(r.result);
        r.onerror = () => no(r.error);
      });
    } catch (e) { this.db = null; }
  },
  _ls(k) { return JSON.parse(localStorage.getItem('sigap2_' + k) || 'null'); },
  get(k) {
    if (!this.db) return Promise.resolve(this._ls(k));
    return new Promise(ok => {
      const r = this.db.transaction('kv').objectStore('kv').get(k);
      r.onsuccess = () => ok(r.result ?? null);
      r.onerror = () => ok(null);
    });
  },
  set(k, v) {
    if (!this.db) {
      try { localStorage.setItem('sigap2_' + k, JSON.stringify(v)); } catch {}
      return Promise.resolve();
    }
    return new Promise(ok => {
      const t = this.db.transaction('kv', 'readwrite');
      t.objectStore('kv').put(JSON.parse(JSON.stringify(v)), k);
      t.oncomplete = ok; t.onerror = ok;
    });
  },
};

const save = () => DB.set('state', {
  biomass: S.biomass, logs: S.logs, queue: S.queue,
  syncLogs: S.syncLogs, meta: S.meta,
});

/* ══════════════════════════════════════════════════
   LOGGING & QUEUE
══════════════════════════════════════════════════ */
function addLog(text, lvl = 'ok') {
  S.logs.unshift({ ts: Date.now(), text, lvl });
  if (S.logs.length > 50) S.logs.length = 50;
  renderLog();
  save();
}

function enqueue(type, desc) {
  S.queue.push({ id: uid(), type, desc, ts: Date.now() });
  renderQueueBadge();
  if (S.screen === 'sinkronisasi') renderSync();
  save();
}

function toast(msg, duration = 2800) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(toast._h);
  toast._h = setTimeout(() => t.classList.add('hidden'), duration);
}

/* ══════════════════════════════════════════════════
   SIMULATION ENGINE
══════════════════════════════════════════════════ */
function tick() {
  const m = MODES[S.mode], c = S.cur;

  // Smooth convergence toward mode target with realistic noise
  c.t += (m.t - c.t) * .18 + rnd(7);
  c.p += (m.p - c.p) * .18 + rnd(.6);
  c.a  = clamp(c.a + (m.a - c.a) * .18 + rnd(1.2), 5, 80);

  // Syngas composition (physics-correlated)
  const dT = c.t - 785;
  const g = S.gas;
  g.CO  = clamp(22.5 + dT * .038 + rnd(.5),   5,  35);
  g.H2  = clamp(15.8 + dT * .028 + rnd(.4),   4,  28);
  g.CH4 = clamp(4.2  - dT * .014 + rnd(.2),  .5,   9);
  g.CO2 = clamp(12.1 + (c.a - 45) * .06 + rnd(.3), 4, 22);

  // Power output (Lower Heating Value approximation)
  const lhv = .1263 * g.CO + .1078 * g.H2 + .3589 * g.CH4; // MJ/Nm³
  const eff = (c.t >= 700 && c.t <= 900) ? 1 : .65;
  S.kw = Math.max(0, lhv * c.a * .06 * 2 / 3.6 * .25 * eff);
  S.meta.kwh += S.kw * 3 / 3600 * 60; // accelerated 60×

  // Anomaly detection
  const newAn = analyze();
  if (newAn.level !== S.prevLevel) {
    const labels = ['kembali NORMAL', 'WASPADA ⚠️', 'KRITIS 🚨'];
    const lvlKeys = ['ok', 'warn', 'crit'];
    addLog(`Status reaktor: ${labels[newAn.level]} — ${newAn.items[0].text}`, lvlKeys[newAn.level]);
    if (newAn.level > 0) enqueue('peringatan', `Status ${['', 'WASPADA', 'KRITIS'][newAn.level]}: ${newAn.items[0].text}`);
    S.prevLevel = newAn.level;
  }
  S.an = newAn;

  // Store reading
  const reading = {
    waktu: new Date().toISOString(),
    suhu: +fmt(c.t), tekanan: +fmt(c.p), udara: +fmt(c.a),
    CO: +fmt(g.CO), H2: +fmt(g.H2), CH4: +fmt(g.CH4), CO2: +fmt(g.CO2),
    kw: +fmt(S.kw, 2),
    status: ['NORMAL', 'WARNING', 'CRITICAL'][newAn.level],
  };
  S.readings.push(reading);
  if (S.readings.length > 300) S.readings.shift();

  // Monitor chart data (max 24 points)
  S.mon.labels.push(hm());
  S.mon.t.push(reading.suhu);
  S.mon.p.push(reading.tekanan);
  if (S.mon.t.length > 24) {
    S.mon.labels.shift(); S.mon.t.shift(); S.mon.p.shift();
  }

  S.ticks++;
  if (S.ticks % 20 === 0) enqueue('sensor', 'Batch pembacaan sensor reaktor');
  if (S.ticks % 5  === 0) save();
  if (S.ticks % 8  === 0) computePred();

  renderLive();
}

/* ══════════════════════════════════════════════════
   ANOMALY DETECTION (Rule-Based AI)
══════════════════════════════════════════════════ */
function analyze() {
  const { t, p, a } = S.cur;
  const items = [];
  let level = 0;
  const cf = base => Math.round(clamp(base + rnd(2.5), 60, 99));

  if (t > 900) {
    items.push({ text: 'Suhu tinggi, kurangi udara masuk', conf: cf(82 + (t - 900) / 5) });
    level = Math.max(level, t > 950 ? 2 : 1);
  }
  if (t < 700) {
    items.push({ text: 'Suhu rendah, tambah oksigen/udara', conf: cf(83 + (700 - t) / 5) });
    level = Math.max(level, t < 600 ? 2 : 1);
  }
  if (a < 32 && t < 790) {
    items.push({ text: 'Tar terdeteksi: rasio udara terlalu rendah', conf: cf(88) });
    level = Math.max(level, 1);
  }
  if (p < 95) {
    items.push({ text: 'Tekanan turun, periksa kemungkinan kebocoran', conf: cf(84 + (95 - p)) });
    level = Math.max(level, p < 88 ? 2 : 1);
  }
  if (!items.length) {
    items.push({ text: 'Semua parameter dalam batas normal ✓', conf: cf(96) });
  }
  return { level, items };
}

/* ══════════════════════════════════════════════════
   PREDICTION ENGINE (Simulated AI)
══════════════════════════════════════════════════ */
function computePred() {
  const factors = S.opt
    ? [1.06, 1.13, 1.19, 1.17, 1.11, 1.07]
    : [1.00, 1.04, 1.09, 1.05, 0.97, 0.91];
  const base = Math.max(S.kw, .1);
  S.pred = factors.map((f, i) => +fmt(base * f * (1 + Math.sin(i * .6) * .015), 2));
  if (S.screen === 'prediksi') renderPred();
}

/* ══════════════════════════════════════════════════
   CHARTS
══════════════════════════════════════════════════ */
function makeMonitorChart() {
  const ctx = $('#monChart');
  if (!ctx) return;
  if (S.charts.mon) { S.charts.mon.destroy(); }

  if (typeof Chart === 'undefined') { renderFallbackChart(ctx, 'mon'); return; }

  S.charts.mon = new Chart(ctx, {
    type: 'line',
    data: {
      labels: S.mon.labels,
      datasets: [
        {
          label: 'Suhu (°C)',
          data: S.mon.t,
          borderColor: '#E74C3C',
          backgroundColor: 'rgba(231,76,60,.08)',
          fill: true,
          tension: .4,
          pointRadius: 0,
          borderWidth: 2,
          yAxisID: 'y',
        },
        {
          label: 'Tekanan (kPa)',
          data: S.mon.p,
          borderColor: '#3498db',
          backgroundColor: 'rgba(52,152,219,.06)',
          fill: true,
          tension: .4,
          pointRadius: 0,
          borderWidth: 2,
          yAxisID: 'y1',
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: {
          position: 'top',
          labels: { font: { size: 11, family: 'Inter' }, boxWidth: 12, padding: 12 },
        },
        tooltip: {
          callbacks: {
            label: ctx => `${ctx.dataset.label}: ${ctx.parsed.y.toFixed(1)}`,
          },
        },
      },
      scales: {
        x: {
          display: true,
          ticks: { font: { size: 9 }, maxTicksLimit: 6, color: '#6b8070' },
          grid: { color: '#e2ece6' },
        },
        y: {
          type: 'linear', position: 'left',
          ticks: { font: { size: 9 }, color: '#E74C3C' },
          grid: { color: '#e2ece6' },
        },
        y1: {
          type: 'linear', position: 'right',
          ticks: { font: { size: 9 }, color: '#3498db' },
          grid: { drawOnChartArea: false },
        },
      },
      animation: { duration: 400 },
    },
  });
}

function updateMonitorChart() {
  const ch = S.charts.mon;
  if (!ch) return;
  ch.data.labels = [...S.mon.labels];
  ch.data.datasets[0].data = [...S.mon.t];
  ch.data.datasets[1].data = [...S.mon.p];
  ch.update('none');
}

function makePredChart() {
  const ctx = $('#predChart');
  if (!ctx) return;
  if (S.charts.pred) { S.charts.pred.destroy(); }

  const now = new Date();
  const labels = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getTime() + (i + 1) * 3600000);
    return d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
  });

  if (typeof Chart === 'undefined') { renderFallbackChart(ctx, 'pred'); return; }

  const pred = S.pred.length === 6 ? S.pred : [2.3, 2.4, 2.6, 2.5, 2.2, 2.0];

  S.charts.pred = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Prediksi Daya (kW)',
          data: pred,
          borderColor: '#27AE60',
          backgroundColor: 'rgba(39,174,96,.1)',
          fill: true,
          tension: .45,
          pointRadius: 5,
          pointBackgroundColor: '#27AE60',
          pointBorderColor: '#fff',
          pointBorderWidth: 2,
          borderWidth: 2.5,
        },
        {
          label: 'Daya Saat Ini',
          data: Array(6).fill(+fmt(S.kw, 2)),
          borderColor: '#F39C12',
          borderDash: [6, 4],
          borderWidth: 1.5,
          pointRadius: 0,
          fill: false,
          tension: 0,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'top',
          labels: { font: { size: 11, family: 'Inter' }, boxWidth: 12, padding: 12 },
        },
        tooltip: {
          callbacks: {
            label: ctx => `${ctx.dataset.label}: ${ctx.parsed.y.toFixed(2)} kW`,
          },
        },
      },
      scales: {
        x: {
          ticks: { font: { size: 9 }, color: '#6b8070' },
          grid: { color: '#e2ece6' },
        },
        y: {
          ticks: { font: { size: 9 }, color: '#27AE60', callback: v => v + ' kW' },
          grid: { color: '#e2ece6' },
          beginAtZero: false,
        },
      },
      animation: { duration: 600, easing: 'easeInOutQuart' },
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

/** Fallback canvas chart if Chart.js CDN fails */
function renderFallbackChart(cv, type) {
  const data = type === 'mon' ? S.mon.t : (S.pred.length ? S.pred : [2.3, 2.4, 2.6, 2.5, 2.2, 2.0]);
  const dpr = window.devicePixelRatio || 1;
  const w = cv.clientWidth || 320, h = cv.clientHeight || 180;
  cv.width = w * dpr; cv.height = h * dpr;
  const x = cv.getContext('2d');
  x.scale(dpr, dpr);
  x.clearRect(0, 0, w, h);
  const pad = { t: 20, b: 20, l: 30, r: 10 };
  const iw = w - pad.l - pad.r, ih = h - pad.t - pad.b;
  const n = data.length;
  const mn = Math.min(...data), mx = Math.max(...data), rng = (mx - mn) || 1;
  const px = i => pad.l + i * iw / Math.max(1, n - 1);
  const py = v => pad.t + ih - (v - mn) / rng * ih;

  // Grid
  x.strokeStyle = '#e2ece6'; x.lineWidth = 1;
  for (let g = 0; g <= 4; g++) {
    const y = pad.t + g * ih / 4;
    x.beginPath(); x.moveTo(pad.l, y); x.lineTo(w - pad.r, y); x.stroke();
  }

  // Line
  x.strokeStyle = type === 'mon' ? '#E74C3C' : '#27AE60';
  x.lineWidth = 2.5; x.lineJoin = 'round';
  x.beginPath();
  data.forEach((v, i) => i ? x.lineTo(px(i), py(v)) : x.moveTo(px(i), py(v)));
  x.stroke();

  // Dots
  x.fillStyle = x.strokeStyle;
  data.forEach((v, i) => { x.beginPath(); x.arc(px(i), py(v), 3, 0, Math.PI * 2); x.fill(); });

  // Labels
  x.fillStyle = '#6b8070'; x.font = '10px Inter,sans-serif';
  x.fillText(fmt(mn, 1), 2, py(mn) + 4);
  x.fillText(fmt(mx, 1), 2, py(mx) + 4);
}

/* ══════════════════════════════════════════════════
   RENDER FUNCTIONS
══════════════════════════════════════════════════ */

/** Live sensor values – runs every 3s */
function renderLive() {
  const c = S.cur, g = S.gas, an = S.an;
  const lvl = an.level; // 0=ok, 1=warn, 2=crit
  const lvlClass = ['ok', 'warn', 'crit'][lvl];
  const lvlText  = ['NORMAL', 'WASPADA', 'KRITIS'][lvl];
  const statusCard = ['✓ Optimal', '⚠ Waspada', '✕ Kritis'][lvl];

  // ── DASHBOARD ──
  setText('cTemp', fmt(c.t, 0));
  setText('cKwh', fmt(S.meta.kwh, 1));
  setText('qsPressure', fmt(c.p, 1));
  setText('qsAirflow', fmt(c.a, 1));
  setText('qsPower', fmt(S.kw, 2));

  const dCard = $('#dashStatusCard');
  if (dCard) {
    dCard.className = `status-card ${lvlClass}`;
    setText('dashStatusTxt', lvlText);
    setText('dashBadge', statusCard);
  }

  // Dashboard anomaly banner
  const dAnomaly = $('#dashAnomaly');
  if (dAnomaly) {
    if (lvl > 0) {
      dAnomaly.classList.remove('hidden');
      dAnomaly.className = `anomaly-banner ${lvl === 2 ? 'crit' : ''}`;
      setText('dashAnomalyMsg', an.items[0].text);
      setText('dashAnomalyConf', an.items[0].conf + '%');
    } else {
      dAnomaly.classList.add('hidden');
    }
  }

  // ── MONITORING ──
  const tempVal = +fmt(c.t, 0);
  setText('mTemp', tempVal);
  setText('mPressure', fmt(c.p, 1));
  setText('mAirflow', fmt(c.a, 1));
  setText('mPower', fmt(S.kw, 2));

  // Temperature color
  const tempEl = $('#mTemp');
  if (tempEl) {
    if (c.t < 700)      tempEl.style.color = '#3498db';
    else if (c.t > 900) tempEl.style.color = '#E74C3C';
    else                tempEl.style.color = '#fff';
  }

  // Temp gauge marker (500°C = 0%, 1000°C = 100%)
  const marker = $('#tempMarker');
  if (marker) {
    const pct = clamp((c.t - 500) / 500 * 100, 0, 100);
    marker.style.left = pct + '%';
  }

  // Temp hero card color
  const th = $('#tempHero');
  if (th) {
    if (lvl === 2) th.style.background = 'linear-gradient(135deg, #3d0f0f 0%, #8b2020 100%)';
    else if (lvl === 1) th.style.background = 'linear-gradient(135deg, #3d2a0a 0%, #7a5010 100%)';
    else th.style.background = 'linear-gradient(135deg, #1a3028 0%, #2d5a3f 100%)';
  }

  // Status badge
  const badge = $('#monBadge');
  if (badge) { badge.textContent = lvlText; badge.className = `mon-status-badge ${lvlClass}`; }

  // Syngas
  const gValues = { CO: g.CO, H2: g.H2, CH4: g.CH4, CO2: g.CO2 };
  setText('gCO',  fmt(g.CO, 1) + '%');
  setText('gH2',  fmt(g.H2, 1) + '%');
  setText('gCH4', fmt(g.CH4, 1) + '%');
  setText('gCO2', fmt(g.CO2, 1) + '%');
  setWidth('barCO',  g.CO);
  setWidth('barH2',  g.H2);
  setWidth('barCH4', g.CH4);
  setWidth('barCO2', g.CO2);

  // AI anomaly box
  const aBox = $('#anomalyBox');
  if (aBox) {
    aBox.classList.remove('hidden', 'ok', 'warn', 'crit');
    aBox.classList.add(lvlClass);
    const confBadge = $('#confBadge');
    if (confBadge) confBadge.textContent = an.items[0].conf + '%';
    const items = $('#anomalyItems');
    if (items) {
      items.innerHTML = an.items.map(it =>
        `<div class="ai-item">${it.text}</div>`
      ).join('');
    }
  }

  // Update charts
  if (S.screen === 'monitoring') updateMonitorChart();
}

function renderLog() {
  const list = $('#logList');
  if (!list) return;
  const shown = S.logs.slice(0, 5);
  list.innerHTML = shown.map(l => `
    <li class="log-item ${l.lvl}">
      <span class="log-text">${l.text}</span>
      <time class="log-time">${timeFmt(l.ts)}</time>
    </li>
  `).join('');
  setText('logCount', String(S.logs.length));
}

function renderBiomass() {
  const q = S.q.toLowerCase();
  const f = S.filter;
  let items = S.biomass.filter(b => {
    const matchType = !f || b.type === f;
    const matchQ = !q || b.type.toLowerCase().includes(q) || b.date.includes(q);
    return matchType && matchQ;
  });

  const total = items.reduce((a, b) => a + b.weight, 0);
  setText('bTotal', total.toLocaleString('id-ID') + ' kg');
  setText('cBiomass', S.biomass.reduce((a, b) => a + b.weight, 0).toLocaleString('id-ID'));

  const list = $('#bList');
  const empty = $('#bEmpty');
  if (!list) return;

  if (!items.length) {
    list.innerHTML = '';
    empty?.classList.remove('hidden');
    return;
  }
  empty?.classList.add('hidden');

  list.innerHTML = items.map(b => `
    <div class="biomass-card" data-id="${b.id}">
      <div class="bc-icon-wrap">${ICONS[b.type] || '🌿'}</div>
      <div class="bc-body">
        <div class="bc-type">${b.type}</div>
        <div class="bc-chips">
          <span class="bc-chip">⚖️ ${b.weight} kg</span>
          <span class="bc-chip">💧 ${b.moisture}%</span>
        </div>
        <div class="bc-date">📅 ${dtFmt(b.date)}</div>
      </div>
      <div class="bc-actions">
        <button class="bc-btn" onclick="openEdit('${b.id}')" title="Edit">✏️</button>
        <button class="bc-btn del" onclick="askDelete('${b.id}')" title="Hapus">🗑️</button>
      </div>
    </div>
  `).join('');
}

function renderChips() {
  const wrap = $('#chips');
  if (!wrap) return;
  wrap.innerHTML = CHIPS.map(c => `
    <button class="chip ${S.filter === c.value ? 'active' : ''}"
      onclick="setFilter('${c.value}')">${c.label}</button>
  `).join('');
}

function renderSync() {
  // Queue list
  const ql = $('#queueList');
  const qe = $('#queueEmpty');
  if (ql) {
    if (S.queue.length) {
      qe?.classList.add('hidden');
      ql.innerHTML = S.queue.slice(-10).reverse().map(q => `
        <div class="queue-item">
          <span class="qi-type">${q.type}</span>
          <span class="qi-desc">${q.desc}</span>
          <span class="qi-time">${timeFmt(q.ts)}</span>
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
      <div class="method-card ${S.method === key ? 'active' : ''}" onclick="selectMethod('${key}')">
        <div class="method-icon">${m.icon}</div>
        <div class="method-body">
          <div class="method-name">${m.name}</div>
          <div class="method-desc">${m.desc}</div>
        </div>
        <div>
          <div class="method-speed">${m.speed}</div>
        </div>
        <div class="method-radio"></div>
      </div>
    `).join('');
  }

  // Last sync
  setText('lastSyncTime', S.meta.lastSync ? timeFmt(S.meta.lastSync) : 'Belum pernah');

  // Online status card
  const sc = $('#syncStatusCard');
  if (sc) {
    if (S.online) {
      sc.classList.add('online');
      setText('syncStatusTitle', 'Terhubung ke Internet');
      setText('syncStatusSub', 'Siap melakukan sinkronisasi data');
      setText('syncOrbIcon', '🌐');
    } else {
      sc.classList.remove('online');
      setText('syncStatusTitle', 'Tidak Terhubung');
      setText('syncStatusSub', 'Mode Offline – Data tersimpan lokal');
      setText('syncOrbIcon', '📡');
    }
  }

  renderNetBadge();
  renderQueueBadge();
  renderSyncLog();
}

function renderNetBadge() {
  const badge = $('#netBadge');
  const label = $('#netLabel');
  if (!badge) return;
  if (S.online) {
    badge.className = 'net-badge online';
    if (label) label.textContent = 'Online';
  } else {
    badge.className = 'net-badge offline';
    if (label) label.textContent = 'Offline';
  }
}

function renderQueueBadge() {
  const nb = $('#navBadge');
  const qc = $('#queueCount');
  if (nb) {
    if (S.queue.length > 0) {
      nb.classList.remove('hidden');
      nb.textContent = S.queue.length > 99 ? '99+' : String(S.queue.length);
    } else {
      nb.classList.add('hidden');
    }
  }
  if (qc) qc.textContent = String(S.queue.length);
}

function renderSyncLog() {
  const sl = $('#syncLog');
  if (!sl) return;
  if (!S.syncLogs.length) {
    sl.innerHTML = '<div class="sync-log-item" style="color:var(--mu);font-size:12px">Belum ada riwayat sinkronisasi</div>';
    return;
  }
  sl.innerHTML = S.syncLogs.slice(-8).reverse().map(l => `
    <div class="sync-log-item">
      <span class="sli-icon">${l.ok ? '✅' : '❌'}</span>
      <span>${l.msg}</span>
      <span class="sli-time">${timeFmt(l.ts)}</span>
    </div>
  `).join('');
}

function renderPred() {
  // Update chart
  if (S.charts.pred) updatePredChart();
  else makePredChart();

  // R² value (simulated)
  const r2 = S.opt ? (0.94 + Math.random() * .03).toFixed(2) : (0.88 + Math.random() * .04).toFixed(2);
  setText('r2Val', r2);

  // Table
  const tbody = $('#predBody');
  if (!tbody || !S.pred.length) return;
  const peakIdx = S.pred.indexOf(Math.max(...S.pred));
  tbody.innerHTML = S.pred.map((v, i) => `
    <tr>
      <td>+${i + 1} jam</td>
      <td><strong>${v} kW</strong></td>
      <td><span class="pred-status ${i === peakIdx ? 'good' : 'ok'}">${i === peakIdx ? '⭐ Puncak' : '✓ Normal'}</span></td>
    </tr>
  `).join('');

  // Recommendation message
  const peakHours = peakIdx + 1;
  setText('predMsg', `Produksi listrik optimal dalam ${peakHours} jam (${S.pred[peakIdx]} kW)`);
}

/* ══════════════════════════════════════════════════
   NAVIGATION
══════════════════════════════════════════════════ */
function navigate(screen) {
  S.screen = screen;
  $$('.screen').forEach(s => s.classList.remove('active'));
  $$('.nav-item').forEach(n => n.classList.remove('active'));

  $(`#s-${screen}`)?.classList.add('active');
  $(`[data-screen="${screen}"]`)?.classList.add('active');

  // Scroll to top
  $('#main')?.scrollTo(0, 0);

  // Screen-specific init
  switch (screen) {
    case 'dashboard':
      renderLog();
      break;
    case 'biomassa':
      renderChips();
      renderBiomass();
      break;
    case 'monitoring':
      // Small delay so the canvas is visible before chart renders
      setTimeout(() => {
        if (!S.charts.mon) makeMonitorChart();
        else updateMonitorChart();
      }, 50);
      break;
    case 'prediksi':
      computePred();
      setTimeout(() => makePredChart(), 50);
      break;
    case 'sinkronisasi':
      renderSync();
      break;
  }
}

/* ══════════════════════════════════════════════════
   BIOMASS CRUD
══════════════════════════════════════════════════ */
function openAdd() {
  S.editingId = null;
  setText('modalTitle', 'Tambah Biomassa');
  $('#editId').value = '';
  $('#fType').value = '';
  $('#fWeight').value = '';
  $('#fMoisture').value = '';
  $('#fDate').value = today();
  openModal();
}

function openEdit(id) {
  const b = S.biomass.find(x => x.id === id);
  if (!b) return;
  S.editingId = id;
  setText('modalTitle', 'Edit Biomassa');
  $('#editId').value = id;
  $('#fType').value = b.type;
  $('#fWeight').value = b.weight;
  $('#fMoisture').value = b.moisture;
  $('#fDate').value = b.date;
  openModal();
}

function openModal() {
  $('#modalOverlay').classList.remove('hidden');
  document.body.style.overflow = 'hidden';
  setTimeout(() => $('#fType').focus(), 100);
}

function closeModal() {
  $('#modalOverlay').classList.add('hidden');
  document.body.style.overflow = '';
}

function saveBiomass(e) {
  e.preventDefault();
  const type     = $('#fType').value;
  const weight   = parseFloat($('#fWeight').value);
  const moisture = parseFloat($('#fMoisture').value);
  const date     = $('#fDate').value;

  if (!type || isNaN(weight) || weight <= 0 || isNaN(moisture) || !date) {
    toast('⚠️ Isi semua field dengan benar');
    return;
  }

  if (S.editingId) {
    const idx = S.biomass.findIndex(b => b.id === S.editingId);
    if (idx !== -1) {
      S.biomass[idx] = { ...S.biomass[idx], type, weight, moisture, date };
      addLog(`Biomassa diupdate: ${type} ${weight}kg`, 'ok');
      enqueue('update', `Update biomassa: ${type} ${weight}kg`);
      toast('✅ Biomassa berhasil diperbarui');
    }
  } else {
    const b = { id: uid(), type, weight, moisture, date };
    S.biomass.unshift(b);
    addLog(`Biomassa ditambah: ${type} ${weight}kg (kadar air ${moisture}%)`, 'ok');
    enqueue('tambah', `Tambah biomassa: ${type} ${weight}kg`);
    toast('✅ Biomassa berhasil ditambahkan');
  }

  closeModal();
  renderBiomass();
  save();
}

function askDelete(id) {
  S.deleteId = id;
  $('#confirmOverlay').classList.remove('hidden');
}

function closeConfirm() {
  S.deleteId = null;
  $('#confirmOverlay').classList.add('hidden');
}

function confirmDelete() {
  if (!S.deleteId) return;
  const b = S.biomass.find(x => x.id === S.deleteId);
  S.biomass = S.biomass.filter(x => x.id !== S.deleteId);
  if (b) {
    addLog(`Biomassa dihapus: ${b.type} ${b.weight}kg`, 'ok');
    enqueue('hapus', `Hapus biomassa: ${b.type}`);
  }
  closeConfirm();
  renderBiomass();
  save();
  toast('🗑️ Biomassa berhasil dihapus');
}

/* ══════════════════════════════════════════════════
   FILTER & SEARCH
══════════════════════════════════════════════════ */
function setFilter(val) {
  S.filter = val;
  renderChips();
  renderBiomass();
}

/* ══════════════════════════════════════════════════
   SYNC SIMULATION
══════════════════════════════════════════════════ */
function selectMethod(key) {
  S.method = key;
  renderSync();
}

async function doSync() {
  if (S.syncing) return;
  if (!S.queue.length) { toast('✅ Tidak ada data untuk disinkronkan'); return; }

  S.syncing = true;
  const btn = $('#syncBtn');
  const btnLabel = $('#syncBtnLabel');
  if (btn) { btn.classList.add('syncing'); btn.disabled = true; }
  if (btnLabel) btnLabel.textContent = 'Menyinkronkan…';

  const method = METHODS[S.method];
  const count = S.queue.length;
  const delay = method.ms;

  toast(`🔄 Mengirim ${count} data via ${method.name}… (~${Math.round(delay/1000)}s)`);

  await new Promise(r => setTimeout(r, delay));

  // Simulate success (occasionally fail for realism)
  const success = Math.random() > .08;

  if (success) {
    S.syncLogs.push({ ts: Date.now(), ok: true, msg: `${count} data tersinkron via ${method.name}` });
    S.meta.lastSync = Date.now();
    S.queue = [];
    addLog(`Sinkronisasi berhasil: ${count} data via ${method.name}`, 'ok');
    toast(`✅ ${count} data berhasil dikirim via ${method.name}!`);
  } else {
    S.syncLogs.push({ ts: Date.now(), ok: false, msg: `Gagal sinkron via ${method.name}: timeout` });
    addLog('Sinkronisasi gagal – coba lagi', 'warn');
    toast(`❌ Sinkronisasi gagal. Coba lagi.`);
  }

  if (S.syncLogs.length > 20) S.syncLogs = S.syncLogs.slice(-20);

  S.syncing = false;
  if (btn) { btn.classList.remove('syncing'); btn.disabled = false; }
  if (btnLabel) btnLabel.textContent = 'Sinkronisasi Sekarang';

  save();
  renderSync();
}

/* ══════════════════════════════════════════════════
   EXPORT CSV
══════════════════════════════════════════════════ */
function exportCSV() {
  if (!S.biomass.length) { toast('⚠️ Tidak ada data untuk diekspor'); return; }
  const header = 'ID,Jenis,Berat (kg),Kadar Air (%),Tanggal\n';
  const rows = S.biomass.map(b =>
    `${b.id},${b.type},${b.weight},${b.moisture},${b.date}`
  ).join('\n');
  const blob = new Blob([header + rows], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `sigap-biomassa-${today()}.csv`;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  toast('📥 Data berhasil diekspor ke CSV');
  addLog('Export CSV biomassa berhasil', 'ok');
}

/* ══════════════════════════════════════════════════
   HELPERS
══════════════════════════════════════════════════ */
function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

function setWidth(id, pct) {
  const el = document.getElementById(id);
  if (el) el.style.width = clamp(+pct, 0, 100) + '%';
}

/* ══════════════════════════════════════════════════
   SIMULATION CONTROLS
══════════════════════════════════════════════════ */
function buildSimGrid() {
  const grid = $('#simGrid');
  if (!grid) return;
  grid.innerHTML = Object.entries(MODES).map(([key, m]) => `
    <button class="sim-btn ${m.cls} ${S.mode === key ? 'active' : ''}"
      onclick="setMode('${key}')">${m.icon} ${m.label.replace(/^[^\s]+\s/, '')}</button>
  `).join('');
}

function setMode(mode) {
  S.mode = mode;
  addLog(`Mode simulasi diubah: ${MODES[mode].label}`, mode === 'normal' ? 'ok' : 'warn');
  buildSimGrid();
  toast(`🎮 ${MODES[mode].label} aktif`);
}

/* ══════════════════════════════════════════════════
   OPTIMIZE
══════════════════════════════════════════════════ */
function toggleOptimize() {
  S.opt = !S.opt;
  const btn = $('#optimizeBtn');
  if (btn) btn.classList.toggle('active', S.opt);
  const label = S.opt ? '⏸ Optimasi Aktif' : '✨ Optimalkan Gasifikasi';
  if (btn) btn.innerHTML = `<span>${S.opt ? '⏸' : '✨'}</span> ${S.opt ? 'Optimasi Aktif' : 'Optimalkan Gasifikasi'}`;
  addLog(S.opt ? 'Mode optimasi gasifikasi aktif' : 'Mode optimasi dinonaktifkan', S.opt ? 'ok' : 'warn');
  computePred();
  toast(S.opt ? '✨ Optimasi gasifikasi diaktifkan!' : '⏸ Optimasi dinonaktifkan');
}

/* ══════════════════════════════════════════════════
   INIT
══════════════════════════════════════════════════ */
async function init() {
  await DB.init();

  // Load persisted state
  const saved = await DB.get('state');
  if (saved) {
    if (saved.biomass?.length)  S.biomass  = saved.biomass;
    if (saved.logs?.length)     S.logs     = saved.logs;
    if (saved.queue?.length)    S.queue    = saved.queue;
    if (saved.syncLogs?.length) S.syncLogs = saved.syncLogs;
    if (saved.meta)             S.meta     = { ...S.meta, ...saved.meta };
  }

  // Pre-populate if first run
  if (!S.biomass.length) {
    S.biomass = SAMPLE_BIOMASS;
    save();
  }

  // Set today's date in hero
  const heroDate = $('#heroDate');
  if (heroDate) {
    heroDate.textContent = new Date().toLocaleDateString('id-ID', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
    });
  }

  // Set default form date
  const fDate = $('#fDate');
  if (fDate) fDate.value = today();

  // Build sim grid
  buildSimGrid();

  // Initial renders
  renderLog();
  renderQueueBadge();
  renderNetBadge();
  renderLive();

  // Event listeners
  // Bottom nav
  $$('.nav-item').forEach(btn =>
    btn.addEventListener('click', () => navigate(btn.dataset.screen))
  );

  // FAB
  $('#fabBtn')?.addEventListener('click', openAdd);

  // Search
  $('#search')?.addEventListener('input', e => {
    S.q = e.target.value;
    renderBiomass();
  });

  // Export CSV
  $('#exportBtn')?.addEventListener('click', exportCSV);

  // Biomass form
  $('#biomassForm')?.addEventListener('submit', saveBiomass);
  $('#modalClose')?.addEventListener('click', closeModal);
  $('#cancelBtn')?.addEventListener('click', closeModal);
  $('#modalOverlay')?.addEventListener('click', e => {
    if (e.target === e.currentTarget) closeModal();
  });

  // Confirm dialog
  $('#confirmYes')?.addEventListener('click', confirmDelete);
  $('#confirmNo')?.addEventListener('click', closeConfirm);
  $('#confirmOverlay')?.addEventListener('click', e => {
    if (e.target === e.currentTarget) closeConfirm();
  });

  // Sync button
  $('#syncBtn')?.addEventListener('click', doSync);

  // Optimize button
  $('#optimizeBtn')?.addEventListener('click', toggleOptimize);

  // Online/offline
  window.addEventListener('online',  () => { S.online = true;  renderNetBadge(); if (S.screen === 'sinkronisasi') renderSync(); addLog('Koneksi internet tersambung', 'ok'); });
  window.addEventListener('offline', () => { S.online = false; renderNetBadge(); if (S.screen === 'sinkronisasi') renderSync(); addLog('Koneksi internet terputus, mode offline aktif', 'warn'); });

  // Tick every 3 seconds
  setInterval(tick, 3000);
  // Enqueue first reading after 6s
  setTimeout(() => { tick(); tick(); }, 100);

  // SW registration
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }

  console.log('🔥 SIGAP v2.0 ready – offline-first gasification monitoring');
}

// Expose globals needed by inline onclick handlers
window.openEdit    = openEdit;
window.askDelete   = askDelete;
window.setFilter   = setFilter;
window.selectMethod = selectMethod;
window.setMode     = setMode;

// Bootstrap
document.addEventListener('DOMContentLoaded', init);
