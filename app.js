'use strict';
/**
 * SIGAP — Sistem Gasifikasi Biomassa Pintar (v3.2 Production Industrial)
 * Arsitektur: Offline-First SPA
 * Komponen: IndexedDB Local Storage, Engine Simulasi Termokimia,
 *            AI Anomaly Detector, 3-Layer Fallback (Internet -> SMS -> LoRa),
 *            Chart.js Telemetri Sensor, PWA Service Worker.
 */

/* ════════════════════════════════════════════════════════════════
   1. UTILITAS SISTEM
   ════════════════════════════════════════════════════════════════ */
const $  = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const rnd   = spread => (Math.random() - 0.5) * 2 * spread;
const fmt   = (val, decimals = 1) => Number(val).toFixed(decimals);
const clamp = (val, min, max) => Math.min(max, Math.max(min, val));
const uid   = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const todayIso = () => new Date().toISOString().slice(0, 10);

const fmtTime = (dateObj = new Date()) =>
  dateObj.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' }).replace(/\./g, ':');

const fmtDate = isoStr => {
  if (!isoStr) return '-';
  const parts = isoStr.split('-');
  if (parts.length === 3) {
    const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
  }
  return isoStr;
};

const fmtDateTime = timestamp => {
  const d = new Date(timestamp);
  return `${d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })} ${fmtTime(d)}`;
};

/* ════════════════════════════════════════════════════════════════
   2. DATA KONSTANTA & SAMPEL
   ════════════════════════════════════════════════════════════════ */
const CHIP_FILTERS = [
  { label: 'Semua',  value: '' },
  { label: 'Sekam',  value: 'Sekam Padi' },
  { label: 'Jerami', value: 'Jerami' },
  { label: 'Tongkol',value: 'Tongkol Jagung' },
  { label: 'Kayu',   value: 'Kayu Chip' }
];

const BIOMASS_BADGES = {
  'Sekam Padi'    : { cls: 'badge-sekam',   abbr: 'SEKAM' },
  'Jerami'        : { cls: 'badge-jerami',  abbr: 'JERAMI' },
  'Tongkol Jagung': { cls: 'badge-tongkol', abbr: 'TGKL' },
  'Kayu Chip'     : { cls: 'badge-kayu',    abbr: 'KAYU' }
};

// Skenario simulasi operasional reaktor
const SIM_MODES = {
  normal: {
    label: 'Simulasi Normal',
    hint: 'Suhu 785°C · Tekanan 102.3 kPa · Syngas Optimal',
    cls: '',
    t: 785, p: 102.3, a: 45.2
  },
  overheat: {
    label: 'Simulasi Overheat',
    hint: 'Suhu > 900°C · Risiko Slagging Abu',
    cls: 'sim-crit',
    t: 948, p: 104.2, a: 54.0
  },
  leak: {
    label: 'Simulasi Kebocoran',
    hint: 'Tekanan drop < 90 kPa · Periksa Flensa',
    cls: 'sim-warn',
    t: 765, p: 83.5, a: 42.0
  },
  tar: {
    label: 'Simulasi Tar',
    hint: 'Laju udara rendah < 32 L/min · Tar Meningkat',
    cls: 'sim-warn',
    t: 730, p: 101.8, a: 25.5
  },
  cold: {
    label: 'Simulasi Suhu Rendah',
    hint: 'Suhu < 700°C · Oksidasi Kurang Optimal',
    cls: 'sim-warn',
    t: 635, p: 100.5, a: 36.0
  }
};

// Jalur sinkronisasi data
const SYNC_METHODS = {
  auto: {
    name: '3-Layer Fallback (Otomatis)',
    desc: 'Prioritas: Internet Cloud → SMS GSM → Radio LoRa',
    speed: 'Multi-layer',
    iconSvg: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>`
  },
  internet: {
    name: 'Internet Gateway',
    desc: 'Koneksi data seluler / WiFi langsung ke Cloud Database',
    speed: '~1 detik',
    iconSvg: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 0 20M12 2a15.3 15.3 0 0 0 0 20"/></svg>`
  },
  sms: {
    name: 'SMS GSM Modem (SIM800L)',
    desc: 'Paket telemetri terkompresi Base64 via jaringan 2G/GSM',
    speed: '~6 detik',
    iconSvg: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`
  },
  lora: {
    name: 'LoRa Mesh (915 MHz SX1276)',
    desc: 'Transceiver nirkabel jarak jauh ke Gateway Kantor Desa',
    speed: '~15 detik',
    iconSvg: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.55a11 11 0 0 1 14.08 0"/><path d="M1.42 9a16 16 0 0 1 21.16 0"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><line x1="12" y1="20" x2="12.01" y2="20"/></svg>`
  }
};

// Data biomassa awal (Pre-populated sample)
const INITIAL_BIOMASS = [
  { id: uid(), type: 'Sekam Padi',     weight: 150, moisture: 12, date: '2026-10-10' },
  { id: uid(), type: 'Jerami',         weight: 80,  moisture: 15, date: '2026-10-11' },
  { id: uid(), type: 'Tongkol Jagung', weight: 120, moisture: 10, date: '2026-10-12' },
  { id: uid(), type: 'Kayu Chip',      weight: 200, moisture: 8,  date: '2026-10-13' }
];

/* ════════════════════════════════════════════════════════════════
   3. STATE APLIKASI
   ════════════════════════════════════════════════════════════════ */
const S = {
  // Penyimpanan data lokal
  biomass:  [],
  logs:     [],
  queue:    [],
  syncLogs: [],
  readings: [],
  meta: {
    kwh: 12.4,
    lastSync: null
  },

  // Telemetri sensor aktif
  mode: 'normal',
  cur: {
    t: 785.0,  // Suhu reaktor (°C)
    p: 102.3,  // Tekanan (kPa)
    a: 45.2    // Aliran udara (L/min)
  },
  gas: {
    CO: 22.5,
    H2: 15.8,
    CH4: 4.2,
    CO2: 12.1
  },
  kw: 2.30,

  // Diagnosa anomali AI
  anomaly: {
    level: 0, // 0: Normal, 1: Waspada, 2: Kritis
    items: []
  },
  prevLevel: 0,
  tickCount: 0,

  // Data grafik real-time
  monData: {
    labels: [],
    temp: [],
    press: []
  },

  // Prediksi AI
  predictions: [],
  isOptimized: false,

  // Status koneksi & filter
  isOnline: false, // Default offline sesuai kondisi desa terpencil
  filterType: '',
  searchQuery: '',
  selectedMethod: 'auto',
  isSyncing: false,

  // Referensi Modal
  activeEditId: null,
  pendingDeleteId: null,

  // Instance Chart.js
  charts: {
    mon: null,
    pred: null
  },
  activeScreen: 'dashboard'
};

/* ════════════════════════════════════════════════════════════════
   4. PENYIMPANAN OFFLINE (INDEXEDDB + LOCALSTORAGE FALLBACK)
   ════════════════════════════════════════════════════════════════ */
const LocalDB = {
  db: null,
  async init() {
    try {
      this.db = await new Promise((resolve, reject) => {
        const req = indexedDB.open('sigap_village_iot_v3', 1);
        req.onupgradeneeded = e => {
          const db = e.target.result;
          if (!db.objectStoreNames.contains('store')) {
            db.createObjectStore('store');
          }
        };
        req.onsuccess = e => resolve(e.target.result);
        req.onerror = e => reject(e.target.error);
      });
    } catch {
      this.db = null;
    }
  },
  get(key) {
    if (!this.db) {
      try { return Promise.resolve(JSON.parse(localStorage.getItem('sigap_' + key) || 'null')); }
      catch { return Promise.resolve(null); }
    }
    return new Promise(resolve => {
      const tx = this.db.transaction('store', 'readonly');
      const req = tx.objectStore('store').get(key);
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => resolve(null);
    });
  },
  set(key, val) {
    try { localStorage.setItem('sigap_' + key, JSON.stringify(val)); } catch {}
    if (!this.db) return Promise.resolve();
    return new Promise(resolve => {
      const tx = this.db.transaction('store', 'readwrite');
      tx.objectStore('store').put(JSON.parse(JSON.stringify(val)), key);
      tx.oncomplete = resolve;
      tx.onerror = resolve;
    });
  }
};

const persistState = () => LocalDB.set('state', {
  biomass:  S.biomass,
  logs:     S.logs,
  queue:    S.queue,
  syncLogs: S.syncLogs,
  meta:     S.meta
});

/* ════════════════════════════════════════════════════════════════
   5. LOGGING & ANTREAN SINKRONISASI OFFLINE
   ════════════════════════════════════════════════════════════════ */
function addLog(text, level = 'ok') {
  S.logs.unshift({ ts: Date.now(), text, lvl: level });
  if (S.logs.length > 50) S.logs.length = 50;
  if (S.activeScreen === 'dashboard') renderLogStream();
  persistState();
}

function enqueueSyncItem(type, desc) {
  S.queue.push({ id: uid(), type, desc, ts: Date.now() });
  updateQueueBadges();
  if (S.activeScreen === 'sinkronisasi') renderSyncScreen();
  persistState();
}

function showToast(message, durationMs = 2800) {
  const toastEl = $('#toast');
  if (!toastEl) return;
  toastEl.textContent = message;
  toastEl.classList.remove('hidden');
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => toastEl.classList.add('hidden'), durationMs);
}

/* ════════════════════════════════════════════════════════════════
   6. MESIN SIMULASI GASIFIKASI (3-DETIK LOOP)
   ════════════════════════════════════════════════════════════════ */
function runSimulationTick() {
  const targetMode = SIM_MODES[S.mode] || SIM_MODES.normal;
  const cur = S.cur;

  // Konvergensi realistis terhadap nilai target skenario + fluktuasi termal
  cur.t += (targetMode.t - cur.t) * 0.20 + rnd(6.5);
  cur.p += (targetMode.p - cur.p) * 0.20 + rnd(0.5);
  cur.a = clamp(cur.a + (targetMode.a - cur.a) * 0.20 + rnd(1.0), 8, 80);

  // Komposisi gas syngas (korelasi termokimia gasifikasi downdraft)
  const deltaT = cur.t - 785;
  const gas = S.gas;
  gas.CO  = clamp(22.5 + deltaT * 0.035 + rnd(0.4), 6, 36);
  gas.H2  = clamp(15.8 + deltaT * 0.026 + rnd(0.35), 4, 30);
  gas.CH4 = clamp(4.2  - deltaT * 0.012 + rnd(0.18), 0.5, 9.5);
  gas.CO2 = clamp(12.1 + (cur.a - 45) * 0.055 + rnd(0.25), 4, 24);

  // Perhitungan LHV (Lower Heating Value) syngas dalam MJ/Nm³
  // Formula: LHV = 0.1263*CO + 0.1078*H2 + 0.3589*CH4
  const lhv = 0.1263 * gas.CO + 0.1078 * gas.H2 + 0.3589 * gas.CH4;

  // Efisiensi gasifier optimal pada 700°C - 900°C
  const tempEfficiency = (cur.t >= 700 && cur.t <= 900) ? 0.84 : 0.62;

  // Daya listrik generator kWe
  S.kw = Math.max(0.2, lhv * cur.a * 0.06 * 2 / 3.6 * 0.25 * (tempEfficiency / 0.84));
  S.meta.kwh += S.kw * (3 / 3600) * 40; // Percepatan akumulasi daya untuk demo

  // Evaluasi anomali sistem AI
  const currentAnomaly = evaluateSystemAnomalies();
  if (currentAnomaly.level !== S.prevLevel) {
    const levelTags = ['kembali NORMAL', 'WASPADA', 'KRITIS'];
    const cssLevels = ['ok', 'warn', 'crit'];
    addLog(`Kondisi reaktor ${levelTags[currentAnomaly.level]}: ${currentAnomaly.items[0]}`, cssLevels[currentAnomaly.level]);

    if (currentAnomaly.level > 0) {
      enqueueSyncItem('peringatan', `${levelTags[currentAnomaly.level]}: ${currentAnomaly.items[0]}`);
    }
    S.prevLevel = currentAnomaly.level;
  }
  S.anomaly = currentAnomaly;

  // Catat telemetri ke buffer memori
  const readingSnap = {
    waktu: new Date().toISOString(),
    suhu: +fmt(cur.t),
    tekanan: +fmt(cur.p),
    aliranUdara: +fmt(cur.a),
    CO: +fmt(gas.CO),
    H2: +fmt(gas.H2),
    CH4: +fmt(gas.CH4),
    CO2: +fmt(gas.CO2),
    lhv: +fmt(lhv, 2),
    dayaKw: +fmt(S.kw, 2),
    status: ['NORMAL', 'WARNING', 'CRITICAL'][currentAnomaly.level]
  };
  S.readings.push(readingSnap);
  if (S.readings.length > 200) S.readings.shift();

  // Update buffer grafik 24-titik
  S.monData.labels.push(fmtTime());
  S.monData.temp.push(readingSnap.suhu);
  S.monData.press.push(readingSnap.tekanan);
  if (S.monData.temp.length > 24) {
    S.monData.labels.shift();
    S.monData.temp.shift();
    S.monData.press.shift();
  }

  S.tickCount++;
  // Antrekan batch sensor berkala
  if (S.tickCount % 20 === 0) {
    enqueueSyncItem('sensor', `Batch telemetri reaktor (${fmt(cur.t, 0)}°C, ${fmt(cur.p, 1)} kPa)`);
  }
  if (S.tickCount % 6 === 0) persistState();
  if (S.tickCount % 10 === 0) recalculatePredictions();

  // Render perubahan nilai telemetri ke DOM
  renderLiveTelemetry();
}

/* ════════════════════════════════════════════════════════════════
   7. AI DETEKSI ANOMALI & REKOMENDASI (BAHASA INDONESIA)
   ════════════════════════════════════════════════════════════════ */
function evaluateSystemAnomalies() {
  const { t, p, a } = S.cur;
  const items = [];
  let level = 0; // 0: Normal, 1: Waspada, 2: Kritis

  const calcConf = base => Math.round(clamp(base + rnd(2.5), 70, 99));

  // Syarat Anomali 1: Suhu Tinggi (>900°C)
  if (t > 900) {
    items.push('Suhu tinggi, kurangi udara');
    level = Math.max(level, t > 950 ? 2 : 1);
  }

  // Syarat Anomali 2: Suhu Rendah (<700°C)
  if (t < 700) {
    items.push('Suhu rendah, tambah oksigen');
    level = Math.max(level, t < 620 ? 2 : 1);
  }

  // Syarat Anomali 3: Tar terdeteksi (aliran udara defisit pada suhu pirolisis)
  if (a < 32 && t < 780) {
    items.push('Rasio udara terlalu rendah');
    level = Math.max(level, 1);
  }

  // Syarat Anomali 4: Penurunan tekanan (kebocoran)
  if (p < 95) {
    items.push('Kemungkinan kebocoran');
    level = Math.max(level, p < 88 ? 2 : 1);
  }

  if (items.length === 0) {
    items.push('Kondisi operasional normal dan reaksi stabil pada target 700–900°C.');
  }

  const confidence = calcConf(level === 2 ? 96 : (level === 1 ? 92 : 98));
  return { level, items, confidence };
}

/* ════════════════════════════════════════════════════════════════
   8. AI PREDIKSI PRODUKSI LISTRIK (6 JAM KE DEPAN)
   ════════════════════════════════════════════════════════════════ */
function recalculatePredictions() {
  const basePower = Math.max(S.kw, 0.4);
  // Multiplier kurva output gasifier
  const curve = S.isOptimized
    ? [1.06, 1.15, 1.20, 1.18, 1.12, 1.08]
    : [1.00, 1.05, 1.11, 1.06, 0.98, 0.92];

  S.predictions = curve.map((multiplier, idx) => {
    const val = basePower * multiplier * (1 + Math.sin(idx * 0.7) * 0.015);
    return +fmt(val, 2);
  });

  if (S.activeScreen === 'prediksi') {
    renderPredictionScreen();
  }
}

/* ════════════════════════════════════════════════════════════════
   9. GRAFIK (CHART.JS DENGAN FALLBACK CANVAS MANDIRI)
   ════════════════════════════════════════════════════════════════ */
function buildMonitorChart() {
  const canvas = $('#monChart');
  if (!canvas) return;

  if (S.charts.mon) {
    S.charts.mon.destroy();
    S.charts.mon = null;
  }

  // Fallback kanvas jika Chart.js CDN tidak tersedia
  if (typeof Chart === 'undefined') {
    renderCanvasChartFallback(canvas, S.monData.labels, S.monData.temp, '#E74C3C', 'Suhu (°C)');
    return;
  }

  S.charts.mon = new Chart(canvas, {
    type: 'line',
    data: {
      labels: S.monData.labels,
      datasets: [
        {
          label: 'Suhu Reaktor (°C)',
          data: S.monData.temp,
          borderColor: '#E74C3C',
          backgroundColor: 'rgba(231, 76, 60, 0.08)',
          borderWidth: 2.2,
          fill: true,
          tension: 0.35,
          pointRadius: 0,
          yAxisID: 'yTemp'
        },
        {
          label: 'Tekanan (kPa)',
          data: S.monData.press,
          borderColor: '#2980B9',
          backgroundColor: 'rgba(41, 128, 185, 0.05)',
          borderWidth: 1.8,
          borderDash: [4, 3],
          fill: false,
          tension: 0.35,
          pointRadius: 0,
          yAxisID: 'yPress'
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: {
          position: 'top',
          labels: { font: { size: 10.5, family: 'Inter' }, boxWidth: 12, padding: 8 }
        }
      },
      scales: {
        x: {
          ticks: { font: { size: 9 }, maxTicksLimit: 6, color: '#859B8F' },
          grid: { color: '#EAEFEA' }
        },
        yTemp: {
          position: 'left',
          ticks: { font: { size: 9 }, color: '#E74C3C' },
          grid: { color: '#EAEFEA' },
          title: { display: true, text: '°C', color: '#E74C3C', font: { size: 9.5 } }
        },
        yPress: {
          position: 'right',
          ticks: { font: { size: 9 }, color: '#2980B9' },
          grid: { drawOnChartArea: false },
          title: { display: true, text: 'kPa', color: '#2980B9', font: { size: 9.5 } }
        }
      },
      animation: { duration: 300 }
    }
  });
}

function updateMonitorChart() {
  const chart = S.charts.mon;
  if (!chart) return;
  chart.data.labels = [...S.monData.labels];
  chart.data.datasets[0].data = [...S.monData.temp];
  chart.data.datasets[1].data = [...S.monData.press];
  chart.update('none');
}

function buildPredictionChart() {
  const canvas = $('#predChart');
  if (!canvas) return;

  if (S.charts.pred) {
    S.charts.pred.destroy();
    S.charts.pred = null;
  }

  const now = new Date();
  const timeLabels = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getTime() + (i + 1) * 3600 * 1000);
    return `+${i + 1}j (${d.getHours().toString().padStart(2, '0')}:00)`;
  });

  const predValues = S.predictions.length === 6 ? S.predictions : [2.3, 2.45, 2.62, 2.50, 2.30, 2.15];

  if (typeof Chart === 'undefined') {
    renderCanvasChartFallback(canvas, timeLabels, predValues, '#27AE60', 'Prediksi (kW)');
    return;
  }

  S.charts.pred = new Chart(canvas, {
    type: 'line',
    data: {
      labels: timeLabels,
      datasets: [
        {
          label: 'Estimasi Daya (kW)',
          data: predValues,
          borderColor: '#27AE60',
          backgroundColor: 'rgba(39, 174, 96, 0.12)',
          borderWidth: 2.5,
          fill: true,
          tension: 0.4,
          pointRadius: 4.5,
          pointBackgroundColor: '#27AE60',
          pointBorderColor: '#FFFFFF',
          pointBorderWidth: 2
        },
        {
          label: 'Daya Saat Ini (Baseline)',
          data: Array(6).fill(+fmt(S.kw, 2)),
          borderColor: '#F39C12',
          borderDash: [5, 4],
          borderWidth: 1.5,
          pointRadius: 0,
          fill: false
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'top',
          labels: { font: { size: 10.5, family: 'Inter' }, boxWidth: 12, padding: 8 }
        }
      },
      scales: {
        x: {
          ticks: { font: { size: 9.5 }, color: '#859B8F' },
          grid: { color: '#EAEFEA' }
        },
        y: {
          ticks: {
            font: { size: 9.5 },
            color: '#27AE60',
            callback: val => val + ' kW'
          },
          grid: { color: '#EAEFEA' },
          beginAtZero: false
        }
      },
      animation: { duration: 450 }
    }
  });
}

function updatePredictionChart() {
  const chart = S.charts.pred;
  if (!chart || S.predictions.length !== 6) return;
  chart.data.datasets[0].data = [...S.predictions];
  chart.data.datasets[1].data = Array(6).fill(+fmt(S.kw, 2));
  chart.update();
}

// Fallback Canvas jika tanpa internet / CDN gagal
function renderCanvasChartFallback(canvas, labels, values, strokeColor, labelText) {
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth || 320;
  const h = canvas.clientHeight || 180;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, w, h);

  const pad = { t: 20, b: 24, l: 36, r: 12 };
  const innerW = w - pad.l - pad.r;
  const innerH = h - pad.t - pad.b;
  const count = values.length;
  if (count === 0) return;

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = (max - min) || 1;

  const getX = i => pad.l + (i / Math.max(count - 1, 1)) * innerW;
  const getY = v => pad.t + innerH - ((v - min) / range) * innerH;

  // Grid garis horizontal
  ctx.strokeStyle = '#DCE8E1';
  ctx.lineWidth = 1;
  for (let g = 0; g <= 4; g++) {
    const y = pad.t + (g / 4) * innerH;
    ctx.beginPath();
    ctx.moveTo(pad.l, y);
    ctx.lineTo(w - pad.r, y);
    ctx.stroke();
  }

  // Area garis kurva
  ctx.beginPath();
  values.forEach((v, i) => i === 0 ? ctx.moveTo(getX(i), getY(v)) : ctx.lineTo(getX(i), getY(v)));
  ctx.strokeStyle = strokeColor;
  ctx.lineWidth = 2.4;
  ctx.lineJoin = 'round';
  ctx.stroke();

  // Titik data
  ctx.fillStyle = strokeColor;
  values.forEach((v, i) => {
    ctx.beginPath();
    ctx.arc(getX(i), getY(v), 3, 0, Math.PI * 2);
    ctx.fill();
  });

  // Teks legenda
  ctx.fillStyle = '#51685C';
  ctx.font = '10px Inter, sans-serif';
  ctx.fillText(labelText, pad.l, 14);
}

/* ════════════════════════════════════════════════════════════════
   10. RENDER FUNGSI VIEW
   ════════════════════════════════════════════════════════════════ */

// Render telemetri real-time (setiap 3 detik)
function renderLiveTelemetry() {
  const { t, p, a } = S.cur;
  const gas = S.gas;
  const an = S.anomaly;
  const lv = an.level;

  const statusTags = ['NORMAL', 'WASPADA', 'KRITIS'];
  const statusBadges = ['Optimal', 'Perhatian', 'Bahaya'];
  const statusClasses = ['status-ok', 'status-warn', 'status-crit'];

  // ── 1. DASHBOARD TELEMETRI ──
  setDomText('cTemp', fmt(t, 0));
  setDomText('cKwh', fmt(S.meta.kwh, 1));
  setDomText('dashCurPower', fmt(S.kw, 2) + ' kW');
  setDomText('qsPressure', fmt(p, 1));
  setDomText('qsAirflow', fmt(a, 1));
  setDomText('qsPower', fmt(S.kw, 2));

  // Temp status badge
  const tempTag = $('#cTempTag');
  if (tempTag) {
    if (t < 700) {
      tempTag.textContent = 'Rendah (<700°C)';
      tempTag.style.color = '#2980B9';
      tempTag.style.background = '#EBF5FB';
    } else if (t > 900) {
      tempTag.textContent = 'Tinggi (>900°C)';
      tempTag.style.color = '#E74C3C';
      tempTag.style.background = '#FDF2F1';
    } else {
      tempTag.textContent = 'Normal (700-900)';
      tempTag.style.color = '#27AE60';
      tempTag.style.background = '#EAFAF1';
    }
  }

  // Dashboard Status Banner
  const statusBanner = $('#dashStatusBanner');
  if (statusBanner) {
    statusBanner.className = `status-banner ${statusClasses[lv]}`;
    setDomText('dashStatusBadge', statusTags[lv]);

    const descTexts = [
      'Reaksi termokimia stabil pada rentang target 700°C – 900°C. Aliran syngas optimal.',
      'Penyimpangan parameter terdeteksi. Sistem menyarankan penyesuaian operasional katup.',
      'Kondisi kritis! Segera tindak lanjuti rekomendasi AI untuk mencegah kegagalan reaktor.'
    ];
    setDomText('dashStatusDesc', descTexts[lv]);
  }

  // Dashboard Anomaly Alert Box
  const dashAnomaly = $('#dashAnomalyBox');
  if (dashAnomaly) {
    if (lv > 0) {
      dashAnomaly.classList.remove('hidden');
      dashAnomaly.className = `anomaly-card ${lv === 2 ? 'anomaly-crit' : ''}`;
      setDomText('dashAnomalyText', an.items[0]);
      setDomText('dashAnomalyConf', an.confidence + '% Akurasi');
    } else {
      dashAnomaly.classList.add('hidden');
    }
  }

  // ── 2. MONITORING TAB ──
  setDomText('mTemp', fmt(t, 0));
  setDomText('gdThroatTemp', fmt(t, 0) + ' °C');
  setDomText('mPressure', fmt(p, 1));
  setDomText('mAirflow', fmt(a, 1));
  setDomText('mPower', fmt(S.kw, 2));

  // Temperature color class
  const tempDigits = $('#mTemp');
  if (tempDigits) {
    tempDigits.className = 'ic-digits mono ' + (t < 700 ? 'state-cold' : (t > 900 ? 'state-hot' : ''));
  }

  // Status badge on dark instrument dial
  const monBadge = $('#monStatusBadge');
  if (monBadge) {
    monBadge.textContent = statusTags[lv];
    monBadge.className = `ic-status-badge ${lv === 2 ? 'badge-critical' : (lv === 1 ? 'badge-warning' : 'badge-normal')}`;
  }

  // Temperature gauge marker position: 500°C - 1000°C (range 500)
  const marker = $('#tempGaugeMarker');
  if (marker) {
    const pct = clamp((t - 500) / 500 * 100, 0, 100);
    marker.style.left = pct + '%';
  }

  // Sensor notes
  setDomText('mPressureNote', p < 95 ? 'Tekanan Rendah!' : 'Stabil (100–105)');
  setDomText('mAirflowNote', a < 32 ? 'Rasio Udara Rendah!' : (a > 50 ? 'Aliran Tinggi' : 'Rasio Normal'));

  // Gas Chromatography readings
  setDomText('gCO',  fmt(gas.CO, 1)  + '%');
  setDomText('gH2',  fmt(gas.H2, 1)  + '%');
  setDomText('gCH4', fmt(gas.CH4, 1) + '%');
  setDomText('gCO2', fmt(gas.CO2, 1) + '%');

  setDomWidth('barCO',  (gas.CO / 36) * 100);
  setDomWidth('barH2',  (gas.H2 / 30) * 100);
  setDomWidth('barCH4', (gas.CH4 / 10) * 100);
  setDomWidth('barCO2', (gas.CO2 / 25) * 100);

  const lhv = 0.1263 * gas.CO + 0.1078 * gas.H2 + 0.3589 * gas.CH4;
  setDomText('lhvBadge', `LHV: ${fmt(lhv, 2)} MJ/Nm³`);

  // Anomaly Diagnostics Box
  const monAnomaly = $('#monAnomalyBox');
  if (monAnomaly) {
    const diagClasses = ['state-normal', 'state-warning', 'state-critical'];
    monAnomaly.className = `anomaly-diag-box ${diagClasses[lv]}`;
    setDomText('monConfVal', `Keyakinan AI ${an.confidence}%`);

    const itemsContainer = $('#monAnomalyItems');
    if (itemsContainer) {
      itemsContainer.innerHTML = an.items.map(itemText =>
        `<div class="adb-item">• ${itemText}</div>`
      ).join('');
    }
  }

  // Update chart jika di tab monitoring
  if (S.activeScreen === 'monitoring') {
    updateMonitorChart();
  }
}

// Render daftar log aktivitas terbaru
function renderLogStream() {
  const list = $('#logList');
  if (!list) return;

  const logsToShow = S.logs.slice(0, 5);
  if (logsToShow.length === 0) {
    list.innerHTML = `<li class="log-entry"><span class="log-text" style="color:var(--tx-faint)">Belum ada log aktivitas tercatat.</span></li>`;
    return;
  }

  list.innerHTML = logsToShow.map(l => `
    <li class="log-entry ${l.lvl}">
      <span class="log-text">${l.text}</span>
      <span class="log-time mono">${fmtDateTime(l.ts)}</span>
    </li>
  `).join('');

  setDomText('logCountPill', `${S.logs.length} Catatan`);
}

// Render data biomassa di Screen 2
function renderBiomassScreen() {
  const q = S.searchQuery.toLowerCase().trim();
  const filter = S.filterType;

  // Filter berdasarkan jenis dan teks pencarian (jenis atau tanggal)
  const filtered = S.biomass.filter(item => {
    if (filter && item.type !== filter) return false;
    if (q) {
      const matchType = item.type.toLowerCase().includes(q);
      const matchDate = item.date.includes(q);
      const matchWeight = String(item.weight).includes(q);
      if (!matchType && !matchDate && !matchWeight) return false;
    }
    return true;
  });

  const totalFilteredWeight = filtered.reduce((acc, cur) => acc + Number(cur.weight), 0);
  const totalAllWeight = S.biomass.reduce((acc, cur) => acc + Number(cur.weight), 0);

  setDomText('biomassTotalVal', `${totalFilteredWeight.toLocaleString('id-ID')} kg`);
  setDomText('cBiomass', totalAllWeight.toLocaleString('id-ID'));

  const listEl = $('#biomassList');
  const emptyEl = $('#biomassEmptyState');
  if (!listEl) return;

  if (filtered.length === 0) {
    listEl.innerHTML = '';
    emptyEl?.classList.remove('hidden');
    return;
  }
  emptyEl?.classList.add('hidden');

  listEl.innerHTML = filtered.map(item => {
    const badgeInfo = BIOMASS_BADGES[item.type] || { cls: 'badge-kayu', abbr: 'BIO' };
    const isHighMoisture = Number(item.moisture) > 15;

    return `
      <div class="biomass-card-item">
        <div class="bci-badge ${badgeInfo.cls}">${badgeInfo.abbr}</div>
        <div class="bci-content">
          <div class="bci-title">${item.type}</div>
          <div class="bci-meta-tags">
            <span class="bci-tag mono">${item.weight} kg</span>
            <span class="bci-tag mono ${isHighMoisture ? 'tag-moisture-warn' : ''}">
              Air: ${item.moisture}%${isHighMoisture ? ' (Tinggi)' : ''}
            </span>
          </div>
          <div class="bci-date">Pencatatan: ${fmtDate(item.date)}</div>
        </div>
        <div class="bci-actions">
          <button class="bci-btn" data-action="edit-biomass" data-id="${item.id}" title="Edit Catatan" aria-label="Edit ${item.type}">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          </button>
          <button class="bci-btn bci-btn-del" data-action="delete-biomass" data-id="${item.id}" title="Hapus Catatan" aria-label="Hapus ${item.type}">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
          </button>
        </div>
      </div>
    `;
  }).join('');
}

// Render chip filter biomassa (Semua, Sekam, Jerami, Tongkol, Kayu)
function renderFilterChips() {
  const container = $('#filterChipsContainer');
  if (!container) return;

  container.innerHTML = CHIP_FILTERS.map(c => `
    <button class="filter-chip-btn ${S.filterType === c.value ? 'active' : ''}"
      data-action="filter-chip" data-value="${c.value}">
      ${c.label}
    </button>
  `).join('');
}

// Render panel simulasi skenario (Monitoring tab)
function renderSimulationGrid() {
  const container = $('#simPillGrid');
  if (!container) return;

  container.innerHTML = Object.entries(SIM_MODES).map(([key, item]) => `
    <button class="sim-btn-pill ${item.cls} ${S.mode === key ? 'active' : ''}"
      data-action="set-sim-mode" data-mode="${key}">
      ${item.label}
    </button>
  `).join('');
}

// Render layar prediksi output listrik AI
function renderPredictionScreen() {
  if (S.charts.pred) {
    updatePredictionChart();
  } else {
    buildPredictionChart();
  }

  // Indikator akurasi R²
  const r2Val = (S.isOptimized ? 0.96 : 0.94);
  setDomText('r2AccuracyVal', r2Val.toFixed(2));

  // Tabel rincian per jam
  const tbody = $('#predTableBody');
  if (!tbody || S.predictions.length !== 6) return;

  const maxVal = Math.max(...S.predictions);
  const peakIdx = S.predictions.indexOf(maxVal);

  let cumulativeKwh = 0;
  tbody.innerHTML = S.predictions.map((pKw, i) => {
    cumulativeKwh += pKw;
    const isPeak = (i === peakIdx);
    return `
      <tr>
        <td class="mono">+${i + 1} Jam</td>
        <td class="mono"><b>${pKw} kW</b></td>
        <td class="mono">${fmt(cumulativeKwh, 2)} kWh</td>
        <td>
          <span class="${isPeak ? 'status-pill-peak' : 'status-pill-normal'}">
            ${isPeak ? 'Puncak Maksimal' : 'Stabil Optimal'}
          </span>
        </td>
      </tr>
    `;
  }).join('');

  // Rekomendasi AI dinamis
  const recText = $('#predRecommendationText');
  if (recText) {
    recText.textContent = `Produksi listrik optimal dalam ${peakIdx + 1} jam (${maxVal} kW). Disarankan menjaga laju pengumpanan biomassa tetap konstan 25 kg/jam pada zona pembakaran.`;
  }
}

// Render layar sinkronisasi data & antrean offline
function renderSyncScreen() {
  // 1. Status kartu konektivitas
  const heroCard = $('#syncHeroCard');
  if (heroCard) {
    heroCard.className = `sync-hero-card ${S.isOnline ? 'online-state' : ''}`;
  }

  setDomText('shcStatusTitle', S.isOnline ? 'Terhubung ke Internet' : 'Mode Offline Aktif');
  setDomText('shcStatusDesc', S.isOnline
    ? 'Koneksi data aktif. Transmisi telemetri akan menggunakan jalur langsung Internet Cloud Gateway.'
    : 'Tidak ada sinyal internet. Data tersimpan lokal di IndexedDB dan siap dikirim via fallback SMS atau LoRa.');

  // Update icon connectivity
  const iconWrap = $('#shcIconWrap');
  if (iconWrap) {
    iconWrap.innerHTML = S.isOnline
      ? `<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 0 20M12 2a15.3 15.3 0 0 0 0 20"/></svg>`
      : `<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>`;
  }

  // Waktu sinkron terakhir
  setDomText('lastSyncTimeText', S.meta.lastSync ? fmtDateTime(S.meta.lastSync) : 'Belum Pernah');

  // 2. Daftar antrean data
  const queueContainer = $('#queueItemsList');
  const queueEmpty = $('#queueEmptyState');
  if (queueContainer) {
    if (S.queue.length > 0) {
      queueEmpty?.classList.add('hidden');
      queueContainer.innerHTML = S.queue.slice(-8).reverse().map(q => `
        <div class="queue-entry">
          <span class="qe-badge">${q.type}</span>
          <span class="qe-desc">${q.desc}</span>
          <span class="qe-time mono">${fmtDateTime(q.ts)}</span>
        </div>
      `).join('');
    } else {
      queueContainer.innerHTML = '';
      queueEmpty?.classList.remove('hidden');
    }
  }

  // 3. Pilihan metode sinkronisasi
  const methodsContainer = $('#syncMethodsContainer');
  if (methodsContainer) {
    methodsContainer.innerHTML = Object.entries(SYNC_METHODS).map(([key, method]) => `
      <div class="smo-card ${S.selectedMethod === key ? 'is-selected' : ''}"
        data-action="select-sync-method" data-method="${key}">
        <div class="smo-icon">${method.iconSvg}</div>
        <div class="smo-body">
          <div class="smo-title">${method.name}</div>
          <div class="smo-desc">${method.desc}</div>
        </div>
        <div class="smo-speed mono">${method.speed}</div>
        <div class="smo-radio"></div>
      </div>
    `).join('');
  }

  updateQueueBadges();
  renderSyncLogStream();
}

// Update log transmisi sinkronisasi
function renderSyncLogStream() {
  const container = $('#syncLogContainer');
  if (!container) return;

  if (S.syncLogs.length === 0) {
    container.innerHTML = `<div class="slog-row" style="color:var(--tx-faint)">Belum ada riwayat transmisi data.</div>`;
    return;
  }

  container.innerHTML = S.syncLogs.slice(-6).reverse().map(l => `
    <div class="slog-row">
      <span class="slog-dot ${l.ok ? 'ok' : 'fail'}"></span>
      <span class="slog-text">${l.msg}</span>
      <span class="slog-time mono">${fmtDateTime(l.ts)}</span>
    </div>
  `).join('');
}

// Update lencana antrean di navbar dan header
function updateQueueBadges() {
  const count = S.queue.length;
  const navBadge = $('#navQueueBadge');
  const queueCountBadge = $('#queueCountBadge');

  if (navBadge) {
    if (count > 0) {
      navBadge.textContent = count > 99 ? '99+' : count;
      navBadge.classList.remove('hidden');
    } else {
      navBadge.classList.add('hidden');
    }
  }

  if (queueCountBadge) {
    queueCountBadge.textContent = `${count} Data Tertunda`;
  }
}

// Update pill koneksi jaringan di topbar
function updateNetworkBadge() {
  const pillBtn = $('#netPillBtn');
  const pillText = $('#netPillText');
  if (!pillBtn || !pillText) return;

  if (S.isOnline) {
    pillBtn.className = 'net-pill net-online';
    pillText.textContent = 'Online';
  } else {
    pillBtn.className = 'net-pill net-offline';
    pillText.textContent = 'Offline';
  }
}

/* ════════════════════════════════════════════════════════════════
   11. SISTEM SINKRONISASI 3-LAYER FALLBACK (DEMO SIMULASI)
   ════════════════════════════════════════════════════════════════ */
async function triggerSyncProcess() {
  if (S.isSyncing) return;
  if (S.queue.length === 0) {
    showToast('Semua data sudah tersinkronisasi. Antrean kosong.');
    return;
  }

  S.isSyncing = true;
  const btn = $('#btnTriggerSync');
  const btnLabel = $('#btnSyncLabel');
  btn?.classList.add('is-spinning');
  btn?.setAttribute('disabled', '');
  if (btnLabel) btnLabel.textContent = 'Menjalankan Protokol Transmisi...';

  const count = S.queue.length;

  // Elemen indikator 3-layer stepper
  const step1 = $('#stepInternet');
  const badge1 = $('#badgeInternet');
  const step2 = $('#stepSms');
  const badge2 = $('#badgeSms');
  const step3 = $('#stepLora');
  const badge3 = $('#badgeLora');

  const resetStepper = () => {
    [step1, step2, step3].forEach(el => el?.classList.remove('is-active-step', 'is-success-step', 'is-fail-step'));
    if (badge1) badge1.textContent = 'Siaga';
    if (badge2) badge2.textContent = 'Siaga';
    if (badge3) badge3.textContent = 'Siaga';
  };

  resetStepper();

  let finalMethodName = '';
  let syncSuccess = false;

  // JALUR 1: Jika memilih Internet Langsung
  if (S.selectedMethod === 'internet') {
    step1?.classList.add('is-active-step');
    if (badge1) badge1.textContent = 'Mengirim...';
    await sleep(1000);

    if (S.isOnline) {
      step1?.classList.remove('is-active-step');
      step1?.classList.add('is-success-step');
      if (badge1) badge1.textContent = 'Sukses';
      finalMethodName = 'Internet Cloud Gateway';
      syncSuccess = true;
    } else {
      step1?.classList.remove('is-active-step');
      step1?.classList.add('is-fail-step');
      if (badge1) badge1.textContent = 'Gagal (Offline)';
      finalMethodName = 'Internet Gateway (Gagal - Offline)';
      syncSuccess = false;
    }
  }
  // JALUR 2: Jika memilih SMS Langsung
  else if (S.selectedMethod === 'sms') {
    step2?.classList.add('is-active-step');
    if (badge2) badge2.textContent = 'Mengirim SMS...';
    await sleep(2200);
    step2?.classList.remove('is-active-step');
    step2?.classList.add('is-success-step');
    if (badge2) badge2.textContent = 'Terkirim';
    finalMethodName = 'SMS Modem GSM (SIM800L)';
    syncSuccess = true;
  }
  // JALUR 3: Jika memilih LoRa Langsung
  else if (S.selectedMethod === 'lora') {
    step3?.classList.add('is-active-step');
    if (badge3) badge3.textContent = 'Transmisi Radio...';
    await sleep(2500);
    step3?.classList.remove('is-active-step');
    step3?.classList.add('is-success-step');
    if (badge3) badge3.textContent = 'Terkirim';
    finalMethodName = 'LoRa Radio 915 MHz (SX1276)';
    syncSuccess = true;
  }
  // JALUR 4: PROTOKOL 3-LAYER FALLBACK OTOMATIS
  else {
    // ── LAPISAN 1: COBA INTERNET ──
    step1?.classList.add('is-active-step');
    if (badge1) badge1.textContent = 'Menguji Internet...';
    await sleep(900);

    if (S.isOnline) {
      step1?.classList.remove('is-active-step');
      step1?.classList.add('is-success-step');
      if (badge1) badge1.textContent = 'Sukses';
      finalMethodName = 'Layer 1: Internet Gateway';
      syncSuccess = true;
    } else {
      // Internet Gagal -> Fallback ke Lapisan 2
      step1?.classList.remove('is-active-step');
      step1?.classList.add('is-fail-step');
      if (badge1) badge1.textContent = 'Gagal (No Data)';
      showToast('Layer 1 (Internet) Gagal. Beralih ke Layer 2 (SMS GSM)...', 1800);

      // ── LAPISAN 2: COBA SMS GSM ──
      step2?.classList.add('is-active-step');
      if (badge2) badge2.textContent = 'Menguji Sinyal GSM...';
      await sleep(1400);

      // Simulasi kondisi desa terpencil (sinyal GSM lemah/nihil)
      const gsmAvailable = false;

      if (gsmAvailable) {
        step2?.classList.remove('is-active-step');
        step2?.classList.add('is-success-step');
        if (badge2) badge2.textContent = 'Terkirim';
        finalMethodName = 'Layer 2: SMS Gateway GSM';
        syncSuccess = true;
      } else {
        // SMS Gagal -> Fallback ke Lapisan 3 (LoRa)
        step2?.classList.remove('is-active-step');
        step2?.classList.add('is-fail-step');
        if (badge2) badge2.textContent = 'Gagal (No Sinyal)';
        showToast('Layer 2 (SMS) Gagal. Beralih ke Layer 3: LoRa Mesh 915 MHz...', 2000);

        // ── LAPISAN 3: TRANSMISI LORA RADIO KE GATEWAY DESA ──
        step3?.classList.add('is-active-step');
        if (badge3) badge3.textContent = 'Transceiver Aktif...';
        await sleep(2200);

        step3?.classList.remove('is-active-step');
        step3?.classList.add('is-success-step');
        if (badge3) badge3.textContent = 'Sukses Terkirim';
        finalMethodName = 'Layer 3: LoRa Radio Transceiver (915 MHz)';
        syncSuccess = true;
      }
    }
  }

  // Proses hasil sinkronisasi
  if (syncSuccess) {
    S.syncLogs.push({
      ts: Date.now(),
      ok: true,
      msg: `${count} paket data berhasil dikirim via ${finalMethodName}`
    });
    S.meta.lastSync = Date.now();
    S.queue = [];
    addLog(`Sinkronisasi sukses: ${count} data terkirim via ${finalMethodName}`, 'ok');
    showToast(`Sukses! ${count} data terkirim via ${finalMethodName}`);
  } else {
    S.syncLogs.push({
      ts: Date.now(),
      ok: false,
      msg: `Gagal mengirim data via ${finalMethodName}`
    });
    addLog(`Sinkronisasi gagal via ${finalMethodName}`, 'warn');
    showToast('Sinkronisasi gagal. Pastikan modul transceiver terhubung.');
  }

  if (S.syncLogs.length > 25) S.syncLogs = S.syncLogs.slice(-25);

  S.isSyncing = false;
  btn?.classList.remove('is-spinning');
  btn?.removeAttribute('disabled');
  if (btnLabel) btnLabel.textContent = 'Sinkronisasi Sekarang';

  persistState();
  renderSyncScreen();
}

/* ════════════════════════════════════════════════════════════════
   12. CRUD DATA BIOMASSA (INPUT, EDIT, HAPUS)
   ════════════════════════════════════════════════════════════════ */
function openAddBiomassModal() {
  S.activeEditId = null;
  setDomText('modalFormTitle', 'Tambah Input Biomassa');
  $('#formEditId').value = '';
  $('#fBiomassType').value = '';
  $('#fWeight').value = '';
  $('#fMoisture').value = '';
  $('#fDate').value = todayIso();
  openModalBackdrop('#biomassModalOverlay');
}

function openEditBiomassModal(id) {
  const item = S.biomass.find(b => b.id === id);
  if (!item) return;

  S.activeEditId = id;
  setDomText('modalFormTitle', 'Edit Catatan Biomassa');
  $('#formEditId').value = id;
  $('#fBiomassType').value = item.type;
  $('#fWeight').value = item.weight;
  $('#fMoisture').value = item.moisture;
  $('#fDate').value = item.date;
  openModalBackdrop('#biomassModalOverlay');
}

function handleBiomassFormSubmit(e) {
  e.preventDefault();

  const type = $('#fBiomassType').value.trim();
  const weight = parseFloat($('#fWeight').value);
  const moisture = parseFloat($('#fMoisture').value);
  const date = $('#fDate').value;

  if (!type || isNaN(weight) || weight <= 0 || isNaN(moisture) || moisture <= 0 || !date) {
    showToast('Lengkapi semua kolom formulir dengan data valid.');
    return;
  }

  if (S.activeEditId) {
    // Mode Update
    const idx = S.biomass.findIndex(b => b.id === S.activeEditId);
    if (idx !== -1) {
      S.biomass[idx] = { ...S.biomass[idx], type, weight, moisture, date };
      addLog(`Biomassa diperbarui: ${type} ${weight} kg (Kadar air ${moisture}%)`, 'ok');
      enqueueSyncItem('update-biomassa', `Update biomassa: ${type} ${weight} kg`);
      showToast('Data biomassa berhasil diperbarui.');
    }
  } else {
    // Mode Tambah Baru
    const newItem = { id: uid(), type, weight, moisture, date };
    S.biomass.unshift(newItem);
    addLog(`Biomassa ditambahkan: ${type} ${weight} kg (Kadar air ${moisture}%)`, 'ok');
    enqueueSyncItem('tambah-biomassa', `Input baru: ${type} ${weight} kg`);
    showToast('Pencatatan biomassa baru berhasil disimpan.');
  }

  closeModalBackdrop('#biomassModalOverlay');
  renderBiomassScreen();
  persistState();
}

function openDeleteConfirmDialog(id) {
  S.pendingDeleteId = id;
  openModalBackdrop('#confirmDeleteOverlay');
}

function executeDeleteBiomass() {
  if (!S.pendingDeleteId) return;

  const item = S.biomass.find(b => b.id === S.pendingDeleteId);
  S.biomass = S.biomass.filter(b => b.id !== S.pendingDeleteId);

  if (item) {
    addLog(`Data biomassa dihapus: ${item.type} ${item.weight} kg`, 'ok');
    enqueueSyncItem('hapus-biomassa', `Hapus biomassa: ${item.type}`);
    showToast('Catatan biomassa berhasil dihapus.');
  }

  closeModalBackdrop('#confirmDeleteOverlay');
  S.pendingDeleteId = null;
  renderBiomassScreen();
  persistState();
}

/* ════════════════════════════════════════════════════════════════
   13. EXPORT DATA KE CSV (BIOMASSA & SENSOR)
   ════════════════════════════════════════════════════════════════ */
function exportBiomassToCsv() {
  if (S.biomass.length === 0) {
    showToast('Tidak ada data biomassa untuk diekspor.');
    return;
  }

  const headers = 'ID,Jenis Biomassa,Berat (kg),Kadar Air (%),Tanggal Pencatatan\n';
  const rows = S.biomass.map(b =>
    `"${b.id}","${b.type}",${b.weight},${b.moisture},"${b.date}"`
  ).join('\n');

  downloadCsvFile(headers + rows, `SIGAP-Biomassa-DesaSukamaju-${todayIso()}.csv`);
  addLog('Export CSV data biomassa berhasil diunduh.', 'ok');
  showToast('File CSV data biomassa berhasil diunduh.');
}

function exportSensorDataToCsv() {
  if (S.readings.length === 0) {
    showToast('Buffer rekaman sensor masih kosong.');
    return;
  }

  const headers = 'Waktu,Suhu (C),Tekanan (kPa),Udara (L/min),CO (%),H2 (%),CH4 (%),CO2 (%),LHV (MJ/Nm3),Daya (kW),Status\n';
  const rows = S.readings.map(r =>
    `"${r.waktu}",${r.suhu},${r.tekanan},${r.aliranUdara},${r.CO},${r.H2},${r.CH4},${r.CO2},${r.lhv},${r.dayaKw},"${r.status}"`
  ).join('\n');

  downloadCsvFile(headers + rows, `SIGAP-Telemetri-Reaktor-${todayIso()}.csv`);
  addLog('Export CSV rekaman sensor reaktor berhasil diunduh.', 'ok');
  showToast('File CSV log sensor berhasil diunduh.');
}

function downloadCsvFile(csvContent, filename) {
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/* ════════════════════════════════════════════════════════════════
   14. NAVIGASI ANTAR LAYAR (5 TABS)
   ════════════════════════════════════════════════════════════════ */
function navigateToScreen(screenId) {
  if (!screenId) return;
  S.activeScreen = screenId;

  // Toggle active screen element
  $$('.screen').forEach(el => el.classList.remove('active'));
  $(`#s-${screenId}`)?.classList.add('active');

  // Toggle bottom nav tab button active state
  $$('.nav-tab').forEach(tab => {
    tab.classList.toggle('active', tab.dataset.screen === screenId);
  });

  // Scroll to top
  $('#main')?.scrollTo({ top: 0, behavior: 'instant' });

  // Pemicu inisialisasi spesifik tiap layar
  switch (screenId) {
    case 'dashboard':
      renderLogStream();
      break;
    case 'biomassa':
      renderFilterChips();
      renderBiomassScreen();
      break;
    case 'monitoring':
      renderSimulationGrid();
      setTimeout(() => {
        if (!S.charts.mon) buildMonitorChart();
        else updateMonitorChart();
      }, 50);
      break;
    case 'prediksi':
      recalculatePredictions();
      setTimeout(() => {
        if (!S.charts.pred) buildPredictionChart();
        else updatePredictionChart();
      }, 50);
      break;
    case 'sinkronisasi':
      renderSyncScreen();
      break;
  }
}

/* ════════════════════════════════════════════════════════════════
   15. EVENT LISTENERS & INTERAKSI (EVENT DELEGATION BULLETPROOF)
   ════════════════════════════════════════════════════════════════ */
function attachEventHandlers() {
  // ── Navigasi Bottom Nav ──
  document.addEventListener('click', e => {
    const navBtn = e.target.closest('.nav-tab');
    if (navBtn) {
      e.preventDefault();
      navigateToScreen(navBtn.dataset.screen);
      return;
    }

    // Navigasi kartu KPI dashboard langsung ke tab terkait
    const kpiCard = e.target.closest('[data-screen-target]');
    if (kpiCard) {
      e.preventDefault();
      navigateToScreen(kpiCard.dataset.screenTarget);
      return;
    }

    // Tombol aksi data biomassa (Edit / Hapus)
    const actionBtn = e.target.closest('[data-action]');
    if (actionBtn) {
      e.preventDefault();
      const action = actionBtn.dataset.action;

      if (action === 'edit-biomass') {
        openEditBiomassModal(actionBtn.dataset.id);
        return;
      }
      if (action === 'delete-biomass') {
        openDeleteConfirmDialog(actionBtn.dataset.id);
        return;
      }
      if (action === 'filter-chip') {
        S.filterType = actionBtn.dataset.value;
        renderFilterChips();
        renderBiomassScreen();
        return;
      }
      if (action === 'set-sim-mode') {
        const modeKey = actionBtn.dataset.mode;
        if (SIM_MODES[modeKey]) {
          S.mode = modeKey;
          addLog(`Skenario diubah: ${SIM_MODES[modeKey].label}`, modeKey === 'normal' ? 'ok' : 'warn');
          renderSimulationGrid();
          showToast(`Skenario aktif: ${SIM_MODES[modeKey].label}`);
        }
        return;
      }
      if (action === 'select-sync-method') {
        S.selectedMethod = actionBtn.dataset.method;
        renderSyncScreen();
        return;
      }
    }

    // Floating Add Button (+)
    if (e.target.closest('#fabAddBiomass')) {
      openAddBiomassModal();
      return;
    }

    // Modal Close & Cancel
    if (e.target.closest('#modalCloseBtn') || e.target.closest('#modalCancelBtn')) {
      closeModalBackdrop('#biomassModalOverlay');
      return;
    }
    if (e.target.id === 'biomassModalOverlay') {
      closeModalBackdrop('#biomassModalOverlay');
      return;
    }

    // Confirm Delete Dialog Buttons
    if (e.target.closest('#btnConfirmDelete')) {
      executeDeleteBiomass();
      return;
    }
    if (e.target.closest('#btnCancelDelete') || e.target.id === 'confirmDeleteOverlay') {
      closeModalBackdrop('#confirmDeleteOverlay');
      return;
    }

    // Trigger Sinkronisasi
    if (e.target.closest('#btnTriggerSync')) {
      triggerSyncProcess();
      return;
    }

    // Toggle Simulasi Online / Offline
    if (e.target.closest('#netPillBtn') || e.target.closest('#toggleNetSimBtn')) {
      S.isOnline = !S.isOnline;
      updateNetworkBadge();
      if (S.activeScreen === 'sinkronisasi') renderSyncScreen();
      addLog(`Koneksi disimulasikan: ${S.isOnline ? 'ONLINE (Internet Aktif)' : 'OFFLINE (Desa Terpencil)'}`, S.isOnline ? 'ok' : 'warn');
      showToast(S.isOnline ? 'Mode simulasi diubah ke ONLINE.' : 'Mode simulasi diubah ke OFFLINE.');
      return;
    }

    // Export CSV
    if (e.target.closest('#exportBiomassCsvBtn')) {
      exportBiomassToCsv();
      return;
    }
    if (e.target.closest('#exportSensorCsvBtn')) {
      exportSensorDataToCsv();
      return;
    }

    // Optimasi Gasifikasi Otomatis (Screen 4)
    if (e.target.closest('#optimizeGasificationBtn')) {
      toggleAutoOptimization();
      return;
    }

    // Clear pencarian biomassa
    if (e.target.closest('#searchClearBtn')) {
      const searchInput = $('#biomassSearch');
      if (searchInput) searchInput.value = '';
      S.searchQuery = '';
      $('#searchClearBtn')?.classList.add('hidden');
      renderBiomassScreen();
      return;
    }
  });

  // Form submit biomassa
  $('#biomassForm')?.addEventListener('submit', handleBiomassFormSubmit);

  // Input pencarian biomassa dengan debounce halus
  $('#biomassSearch')?.addEventListener('input', e => {
    S.searchQuery = e.target.value;
    const clearBtn = $('#searchClearBtn');
    if (clearBtn) {
      clearBtn.classList.toggle('hidden', !S.searchQuery);
    }
    renderBiomassScreen();
  });

  // Tombol keyboard Escape untuk menutup semua modal
  window.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      closeModalBackdrop('#biomassModalOverlay');
      closeModalBackdrop('#confirmDeleteOverlay');
    }
  });

  // Listener koneksi fisik peramban
  window.addEventListener('online', () => {
    S.isOnline = true;
    updateNetworkBadge();
    if (S.activeScreen === 'sinkronisasi') renderSyncScreen();
    addLog('Peramban mendeteksi koneksi internet fisik tersambung.', 'ok');
  });

  window.addEventListener('offline', () => {
    S.isOnline = false;
    updateNetworkBadge();
    if (S.activeScreen === 'sinkronisasi') renderSyncScreen();
    addLog('Peramban dalam mode offline.', 'warn');
  });
}

function toggleAutoOptimization() {
  S.isOptimized = !S.isOptimized;
  const btn = $('#optimizeGasificationBtn');
  const label = $('#optBtnLabel');
  if (btn) {
    btn.classList.toggle('is-optimized', S.isOptimized);
  }
  if (label) {
    label.textContent = S.isOptimized ? 'Optimasi PID Aktif (Stabil)' : 'Optimalkan Gasifikasi Otomatis';
  }
  recalculatePredictions();
  addLog(S.isOptimized ? 'Algoritma optimasi gasifikasi PID diaktifkan.' : 'Optimasi gasifikasi dinonaktifkan.', 'ok');
  showToast(S.isOptimized ? 'Optimasi PID reaktor aktif: Rasio udara-biomassa diseimbangkan.' : 'Mode optimasi kembali normal.');
}

/* ════════════════════════════════════════════════════════════════
   16. BANTUAN DOM & MODAL
   ════════════════════════════════════════════════════════════════ */
function setDomText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

function setDomWidth(id, pct) {
  const el = document.getElementById(id);
  if (el) el.style.width = clamp(+pct, 0, 100) + '%';
}

function openModalBackdrop(selector) {
  const el = $(selector);
  if (!el) return;
  el.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

function closeModalBackdrop(selector) {
  const el = $(selector);
  if (!el) return;
  el.classList.add('hidden');
  document.body.style.overflow = '';
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/* ════════════════════════════════════════════════════════════════
   17. INISIALISASI APLIKASI
   ════════════════════════════════════════════════════════════════ */
async function initializeSigapApp() {
  // 1. Inisialisasi IndexedDB
  await LocalDB.init();

  // 2. Muat state yang tersimpan sebelumnya
  const stored = await LocalDB.get('state');
  if (stored) {
    if (Array.isArray(stored.biomass) && stored.biomass.length > 0) S.biomass = stored.biomass;
    if (Array.isArray(stored.logs) && stored.logs.length > 0)       S.logs = stored.logs;
    if (Array.isArray(stored.queue))                               S.queue = stored.queue;
    if (Array.isArray(stored.syncLogs))                            S.syncLogs = stored.syncLogs;
    if (stored.meta) S.meta = { ...S.meta, ...stored.meta };
  }

  // Jika pertama kali dibuka, muat data sampel
  if (S.biomass.length === 0) {
    S.biomass = [...INITIAL_BIOMASS];
    addLog('Sistem SIGAP pertama kali diinisialisasi dengan data sampel.', 'ok');
    persistState();
  }

  // 3. Set tanggal form default ke hari ini
  const dateField = $('#fDate');
  if (dateField) dateField.value = todayIso();

  // 4. Update jam pada header hero
  const clockEl = $('#heroClock');
  if (clockEl) {
    const now = new Date();
    clockEl.textContent = `${now.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })} · ${fmtTime(now)} WIB`;
  }

  // 5. Render awal seluruh komponen
  updateNetworkBadge();
  renderLogStream();
  renderFilterChips();
  renderBiomassScreen();
  renderSimulationGrid();
  recalculatePredictions();
  renderLiveTelemetry();
  updateQueueBadges();

  // 6. Pasang event handler global
  attachEventHandlers();

  // 7. Jalankan loop simulasi reaktor setiap 3 detik
  setInterval(runSimulationTick, 3000);

  // 8. Registrasi PWA Service Worker (Offline Cache)
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }

  console.log('[SIGAP v4.0] Sistem Gasifikasi Biomassa Pintar siap digunakan secara offline.');
}

// Jalankan saat DOM siap
document.addEventListener('DOMContentLoaded', initializeSigapApp);
