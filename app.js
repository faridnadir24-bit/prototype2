'use strict';
/* SIGAP – prototipe offline-first monitoring gasifikasi biomassa */

/* ---------- Util ---------- */
const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const rnd = x => (Math.random() - .5) * 2 * x;
const fmt = (n, d = 1) => Number(n).toFixed(d);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const today = () => new Date().toISOString().slice(0, 10);
const hm = (d = new Date()) => d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' }).replace(/\./g, ':');
const dt = s => new Date(s).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });

/* ---------- Konstanta ---------- */
const TYPES = ['Sekam Padi', 'Jerami', 'Tongkol Jagung', 'Kayu Chip'];
const ICONS = { 'Sekam Padi': '🌾', 'Jerami': '🌿', 'Tongkol Jagung': '🌽', 'Kayu Chip': '🪵' };
const CHIPS = [['Semua', ''], ['Sekam', 'Sekam Padi'], ['Jerami', 'Jerami'], ['Tongkol', 'Tongkol Jagung'], ['Kayu', 'Kayu Chip']];
const MODES = {
  normal: { n: 'Simulasi Normal', t: 785, p: 102.3, a: 45.2 },
  overheat: { n: 'Simulasi Overheat', t: 940, p: 104, a: 52 },
  leak: { n: 'Simulasi Kebocoran', t: 765, p: 84, a: 40 },
  tar: { n: 'Simulasi Tar', t: 735, p: 102, a: 26 },
  cold: { n: 'Simulasi Suhu Rendah', t: 640, p: 101, a: 38 }
};
const METHODS = {
  internet: { n: 'Internet', ic: '🌐', d: 'Kecepatan tinggi, butuh sinyal data', ms: 70 },
  sms: { n: 'SMS', ic: '💬', d: 'Paket kecil via sinyal seluler', ms: 190 },
  lora: { n: 'LoRa', ic: '📻', d: 'Radio jarak jauh ke gateway desa', ms: 280 }
};
const SAMPLE = [
  { type: 'Sekam Padi', weight: 150, moisture: 12, date: '2026-10-10' },
  { type: 'Jerami', weight: 80, moisture: 15, date: '2026-10-11' },
  { type: 'Tongkol Jagung', weight: 120, moisture: 10, date: '2026-10-12' },
  { type: 'Kayu Chip', weight: 200, moisture: 8, date: '2026-10-13' }
];

/* ---------- State ---------- */
const S = {
  biomass: [], logs: [], queue: [], readings: [],
  meta: { kwh: 12.4, lastSync: null },
  mode: 'normal', cur: { t: 785, p: 102.3, a: 45.2 }, gas: { CO: 22.5, H2: 15.8, CH4: 4.2, CO2: 12.1 },
  kw: 2.3, an: { level: 0, items: [] }, prevLevel: 0, ticks: 0,
  mon: { labels: [], t: [], p: [] }, pred: [], opt: false,
  online: navigator.onLine, filter: '', q: '', method: 'auto', syncing: false, editing: null,
  charts: {}, screen: 'dashboard'
};

/* ---------- Penyimpanan lokal (IndexedDB, cadangan localStorage) ---------- */
const DB = {
  db: null,
  async init() {
    try {
      this.db = await new Promise((ok, no) => {
        const r = indexedDB.open('sigap-db', 1);
        r.onupgradeneeded = () => r.result.createObjectStore('kv');
        r.onsuccess = () => ok(r.result);
        r.onerror = () => no(r.error);
      });
    } catch (e) { this.db = null; }
  },
  get(k) {
    if (!this.db) return Promise.resolve(JSON.parse(localStorage.getItem('sigap-' + k) || 'null'));
    return new Promise(ok => {
      const r = this.db.transaction('kv').objectStore('kv').get(k);
      r.onsuccess = () => ok(r.result ?? null); r.onerror = () => ok(null);
    });
  },
  set(k, v) {
    if (!this.db) { try { localStorage.setItem('sigap-' + k, JSON.stringify(v)); } catch (e) {} return Promise.resolve(); }
    return new Promise(ok => {
      const t = this.db.transaction('kv', 'readwrite');
      t.objectStore('kv').put(JSON.parse(JSON.stringify(v)), k);
      t.oncomplete = ok; t.onerror = ok;
    });
  }
};
const save = () => DB.set('state', { biomass: S.biomass, logs: S.logs, queue: S.queue, meta: S.meta });
const saveReadings = () => DB.set('readings', S.readings);

/* ---------- Log & antrean ---------- */
function addLog(text, lvl = 'ok') {
  S.logs.unshift({ ts: Date.now(), text, lvl });
  S.logs.length = Math.min(S.logs.length, 50);
  renderLog(); save();
}
function enqueue(type, desc) {
  S.queue.push({ id: uid(), type, desc, ts: Date.now() });
  renderSync(); save();
}
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.remove('hidden');
  clearTimeout(toast.h); toast.h = setTimeout(() => t.classList.add('hidden'), 2600);
}

/* ---------- Simulasi sensor ---------- */
function tick() {
  const m = MODES[S.mode], c = S.cur;
  c.t += (m.t - c.t) * .25 + rnd(6);
  c.p += (m.p - c.p) * .25 + rnd(.5);
  c.a = clamp(c.a + (m.a - c.a) * .25 + rnd(1), 5, 80);
  const d = c.t - 785, g = S.gas;
  g.CO = clamp(22.5 + d * .035 + rnd(.4), 5, 35);
  g.H2 = clamp(15.8 + d * .025 + rnd(.3), 4, 28);
  g.CH4 = clamp(4.2 - d * .012 + rnd(.15), .5, 9);
  g.CO2 = clamp(12.1 + (c.a - 45) * .05 + rnd(.3), 4, 22);
  const lhv = .1263 * g.CO + .1078 * g.H2 + .3589 * g.CH4;      // MJ/Nm³
  const eff = (c.t >= 700 && c.t <= 900) ? 1 : .65;
  S.kw = Math.max(0, lhv * c.a * .06 * 2 / 3.6 * .25 * eff);      // kWe
  S.meta.kwh += S.kw * 3 / 3600 * 60;                             // waktu dipercepat 60×
  S.an = analyze();
  if (S.an.level !== S.prevLevel) {
    const L = ['kembali NORMAL', 'WASPADA', 'KRITIS'][S.an.level];
    addLog(`Status reaktor ${L}: ${S.an.items[0].text}`, ['ok', 'warn', 'crit'][S.an.level]);
    if (S.an.level) enqueue('peringatan', `Peringatan ${L} (${fmt(c.t, 0)}°C)`);
    S.prevLevel = S.an.level;
  }
  const r = { waktu: new Date().toISOString(), suhu: +fmt(c.t), tekanan: +fmt(c.p), udara: +fmt(c.a), CO: +fmt(g.CO), H2: +fmt(g.H2), CH4: +fmt(g.CH4), CO2: +fmt(g.CO2), status: ['NORMAL', 'WARNING', 'CRITICAL'][S.an.level] };
  S.readings.push(r); if (S.readings.length > 200) S.readings.shift();
  S.mon.labels.push(hm()); S.mon.t.push(r.suhu); S.mon.p.push(r.tekanan);
  if (S.mon.t.length > 24) { S.mon.labels.shift(); S.mon.t.shift(); S.mon.p.shift(); }
  S.ticks++;
  if (S.ticks % 20 === 0) enqueue('monitoring', 'Batch data sensor reaktor');
  if (S.ticks % 5 === 0) { save(); saveReadings(); }
  if (S.ticks % 10 === 0) computePred();
  renderLive();
}

/* ---------- Deteksi anomali (aturan + skor kepercayaan simulasi) ---------- */
function analyze() {
  const { t, p, a } = S.cur, items = []; let lv = 0;
  const cf = b => Math.round(clamp(b + rnd(2), 60, 99));
  if (t > 900) { items.push({ text: 'Suhu tinggi, kurangi udara', conf: cf(82 + (t - 900) / 4) }); lv = Math.max(lv, t > 950 ? 2 : 1); }
  if (t < 700) { items.push({ text: 'Suhu rendah, tambah oksigen', conf: cf(82 + (700 - t) / 4) }); lv = Math.max(lv, t < 600 ? 2 : 1); }
  if (a < 32 && t < 790) { items.push({ text: 'Tar terdeteksi: rasio udara terlalu rendah', conf: cf(88) }); lv = Math.max(lv, 1); }
  if (p < 95) { items.push({ text: 'Tekanan turun, kemungkinan kebocoran', conf: cf(84 + (95 - p)) }); lv = Math.max(lv, p < 90 ? 2 : 1); }
  if (!items.length) items.push({ text: 'Semua parameter dalam batas normal', conf: cf(96) });
  return { level: lv, items };
}

/* ---------- Prediksi listrik (simulasi AI) ---------- */
function computePred() {
  const f = S.opt ? [1.08, 1.14, 1.19, 1.17, 1.12, 1.08] : [1, 1.05, 1.1, 1.06, .99, .93];
  const base = Math.max(S.kw, .1);
  S.pred = f.map((x, i) => +fmt(base * x * (1 + Math.sin(i) * .01), 2));
  if (S.screen === 'prediksi') renderPred();
}

/* ---------- Grafik (Chart.js, cadangan kanvas bila CDN tidak termuat) ---------- */
function fbDraw(cv, d) {
  const dpr = devicePixelRatio || 1, w = cv.clientWidth || 300, h = cv.clientHeight || 200, x = cv.getContext('2d');
  cv.width = w * dpr; cv.height = h * dpr; x.scale(dpr, dpr); x.clearRect(0, 0, w, h);
  const top = 24, bot = h - 20, n = d.labels.length, px = i => 30 + i * (w - 40) / Math.max(1, n - 1);
  x.font = '10px sans-serif'; x.strokeStyle = '#e3ece6';
  for (let g = 0; g <= 4; g++) { const y = top + g * (bot - top) / 4; x.beginPath(); x.moveTo(30, y); x.lineTo(w - 8, y); x.stroke(); }
  x.fillStyle = '#667a6e'; [0, n >> 1, n - 1].forEach(i => d.labels[i] && x.fillText(d.labels[i], clamp(px(i) - 18, 0, w - 50), h - 5));
  d.datasets.forEach((s, k) => {
    const mn = Math.min(...s.data), mx = Math.max(...s.data), r = (mx - mn) || 1;
    x.strokeStyle = s.color; x.lineWidth = 2; x.beginPath();
    s.data.forEach((v, i) => { const y = bot - (v - mn) / r * (bot - top); i ? x.lineTo(px(i), y) : x.moveTo(px(i), y); });
    x.stroke(); x.fillStyle = s.color; x.fillText(`${s.label} ${fmt(mn, 0)}–${fmt(mx, 0)}`, 30 + k * 130, 12);
  });
}
function mkChart(id, labels, sets, dual) {
  const cv = $('#' + id);
  if (window.Chart) {
    return new Chart(cv, {
      type: 'line',
      data: { labels, datasets: sets.map(d => ({ label: d.label, data: d.data, borderColor: d.color, backgroundColor: d.color + '33', fill: !!d.fill, tension: .35, pointRadius: d.pts || 0, borderWidth: 2, yAxisID: d.axis || 'y' })) },
      options: {
        responsive: true, maintainAspectRatio: false, animation: false, interaction: { mode: 'index', intersect: false },
        plugins: { legend: { labels: { boxWidth: 10, font: { size: 11 } } } },
        scales: { x: { ticks: { maxTicksLimit: 5, font: { size: 10 } }, grid: { display: false } }, y: { ticks: { font: { size: 10 } } },
          ...(dual ? { y1: { position: 'right', grid: { drawOnChartArea: false }, ticks: { font: { size: 10 } } } } : {}) }
      }
    });
  }
  const ch = { data: { labels, datasets: sets.map(d => ({ ...d })) }, update() { fbDraw(cv, ch.data); } };
  ch.update(); return ch;
}
function ensureCharts() {
  if (S.screen === 'monitoring' && !S.charts.mon)
    S.charts.mon = mkChart('chMon', S.mon.labels, [{ label: 'Suhu °C', data: S.mon.t, color: '#E74C3C' }, { label: 'Tekanan kPa', data: S.mon.p, color: '#2D6A4F', axis: 'y1' }], true);
  if (S.screen === 'prediksi' && !S.charts.pred)
    S.charts.pred = mkChart('chPred', [], [{ label: 'Prediksi kWh', data: [], color: '#27AE60', fill: true, pts: 3 }], false);
}

/* ---------- Render ---------- */
const LV = ['ok', 'warn', 'crit'], DASH = ['NORMAL', 'WASPADA', 'KRITIS'], MONB = ['NORMAL', 'WARNING', 'CRITICAL'];

function renderLive() {
  const { t, p, a } = S.cur, lv = S.an.level;
  $('#cTemp').textContent = fmt(t, 0);
  $('#cKwh').textContent = fmt(S.meta.kwh, 1);
  $('#dashStatus').className = 'statusbox ' + LV[lv];
  $('#dashStatusTxt').textContent = DASH[lv];
  $('#dashStatusMsg').textContent = S.an.items[0].text;
  $('#mTemp').textContent = fmt(t, 0);
  $('#tempCard').className = 'card tempcard ' + LV[lv];
  $('#monBadge').className = 'badge ' + LV[lv]; $('#monBadge').textContent = MONB[lv];
  $('#gaugeMark').style.left = clamp((t - 600) / 4, 0, 100) + '%';
  $('#mPress').textContent = fmt(p); $('#mAir').textContent = fmt(a);
  $('#syngas').innerHTML = Object.entries(S.gas).map(([k, v]) =>
    `<div class="gas"><span>${k.replace(/(\d)/, '<sub>$1</sub>')}</span><div class="bar"><i style="width:${v / 40 * 100}%"></i></div><b>${fmt(v)}%</b></div>`).join('');
  $('#alertBox').className = 'alert ' + LV[lv];
  $('#alertBox').innerHTML = `<b>${lv ? '⚠️ Anomali terdeteksi' : '✅ Sistem stabil'}</b>` +
    S.an.items.map(i => `<p>${i.text} <em>· keyakinan ${i.conf}%</em></p>`).join('');
  if (S.charts.mon) S.charts.mon.update('none');
}
function renderLog() {
  $('#logList').innerHTML = S.logs.slice(0, 5).map(l => `<li class="${l.lvl}"><span>${l.text}</span><time>${hm(new Date(l.ts))}</time></li>`).join('') || '<li>Belum ada aktivitas</li>';
}
function renderBiomass() {
  const q = S.q.toLowerCase();
  const list = S.biomass.filter(b => (!S.filter || b.type === S.filter) && (!q || `${b.type} ${b.date} ${dt(b.date)}`.toLowerCase().includes(q))).sort((a, b) => b.date.localeCompare(a.date));
  const total = S.biomass.reduce((s, b) => s + b.weight, 0);
  $('#bTotal').textContent = fmt(total, 0) + ' kg'; $('#cBiomass').textContent = fmt(total, 0);
  $('#chips').innerHTML = CHIPS.map(([l, v]) => `<button class="chip ${S.filter === v ? 'on' : ''}" data-f="${v}">${l}</button>`).join('');
  $('#bList').innerHTML = list.map(b => `
    <div class="bcard"><div class="ic">${ICONS[b.type]}</div>
      <div><b>${b.type}</b><small>${dt(b.date)}</small><br><span class="tag ${b.moisture > 15 ? 'wet' : ''}">Kadar air ${b.moisture}%${b.moisture > 15 ? ' · agak lembap' : ''}</span></div>
      <div class="w">${b.weight} kg</div>
      <div class="acts"><button class="btn sm" data-act="edit" data-id="${b.id}">✏️ Ubah</button><button class="btn sm danger" data-act="del" data-id="${b.id}">🗑 Hapus</button></div>
    </div>`).join('') || '<div class="empty">Tidak ada data yang cocok.<br>Ketuk + untuk menambah biomassa.</div>';
}
function renderPred() {
  ensureCharts();
  const base = new Date(), pr = S.pred; if (!pr.length) return;
  const labels = pr.map((_, i) => hm(new Date(base.getTime() + (i + 1) * 3600e3)).slice(0, 5));
  const ch = S.charts.pred;
  if (window.Chart) { ch.data.labels = labels; ch.data.datasets[0].data = pr; } else { ch.data.labels = labels; ch.data.datasets[0].data = pr; }
  ch.update('none');
  const best = pr.indexOf(Math.max(...pr)), avg = pr.reduce((a, b) => a + b, 0) / pr.length;
  $('#r2').textContent = 'R² ' + (S.opt ? '0.96' : '0.93');
  $('#predMsg').textContent = `Produksi listrik optimal dalam ${best + 1} jam (≈ ${fmt(pr[best], 2)} kWh/jam).`;
  $('#predRows').innerHTML = pr.map((v, i) => `<tr class="${i === best ? 'best' : ''}"><td>${labels[i]}</td><td>${fmt(v, 2)}</td><td>${i === best ? '⭐ Puncak produksi' : v < avg * .97 ? 'Tambah umpan biomassa' : 'Pertahankan'}</td></tr>`).join('');
}
function renderSync() {
  const n = S.queue.length, on = S.online;
  $('#netBadge').className = 'net ' + (on ? 'on' : 'off'); $('#netBadge').textContent = on ? '● Online' : '● Offline';
  $('#syncStatus').className = 'statusbox ' + (on ? 'on' : 'off');
  $('#syncStatusTxt').textContent = on ? 'ONLINE' : 'OFFLINE';
  $('#syncStatusMsg').textContent = on ? 'Internet tersedia, data siap dikirim.' : 'Tanpa internet. Semua data aman tersimpan di perangkat.';
  $('#pendCount').textContent = n; $('#navBadge').textContent = n; $('#navBadge').classList.toggle('hidden', !n);
  $('#pendList').innerHTML = S.queue.slice(-6).reverse().map(q => `<li><span>${q.desc}</span><time>${hm(new Date(q.ts))}</time></li>`).join('') + (n > 6 ? `<li><span>+ ${n - 6} data lainnya</span></li>` : '') || '<li class="ok"><span>Semua data sudah tersinkron ✓</span></li>';
  const opts = [['auto', '🔀', 'Otomatis', 'Internet → SMS → LoRa (cadangan berlapis)']].concat(Object.entries(METHODS).map(([k, m]) => [k, m.ic, m.n, m.d]));
  $('#methods').innerHTML = opts.map(([k, ic, nm, d]) => `<div class="method ${S.method === k ? 'on' : ''}" data-m="${k}"><span class="ic">${ic}</span><div><b>${nm}</b><small>${d}</small></div>${k === 'internet' ? `<span class="st ${on ? 'up' : 'down'}">${on ? 'Tersedia' : 'Tidak ada'}</span>` : ''}</div>`).join('');
  const ls = S.meta.lastSync;
  $('#lastSync').textContent = ls ? `Terakhir sinkron: ${new Date(ls.ts).toLocaleString('id-ID')} via ${METHODS[ls.method].n} (${ls.count} data)` : 'Belum pernah sinkronisasi.';
  $('#btnSync').disabled = S.syncing;
}
function renderSim() {
  $('#simBtns').innerHTML = Object.entries(MODES).map(([k, m]) => `<button class="btn ${S.mode === k ? 'on' : ''}" data-mode="${k}">${m.n}</button>`).join('');
}

/* ---------- Sinkronisasi (simulasi) ---------- */
async function doSync() {
  if (S.syncing) return;
  if (!S.queue.length) return toast('Tidak ada data tertunda');
  S.syncing = true; renderSync();
  const prog = $('#prog'), bar = $('#progBar'), txt = $('#progTxt'); prog.classList.remove('hidden'); bar.style.width = '0';
  const order = S.method === 'auto' ? ['internet', 'sms', 'lora'] : [S.method];
  let used = null;
  for (const m of order) {
    txt.textContent = `Mencoba ${METHODS[m].n}…`; await sleep(800);
    const ok = m === 'internet' ? S.online : m === 'sms' ? Math.random() < (S.method === 'auto' ? .45 : .8) : true;
    if (!ok) { txt.textContent = `${METHODS[m].n} gagal${order.length > 1 ? ', beralih ke cadangan…' : ''}`; await sleep(900); continue; }
    const steps = Math.min(S.queue.length, 12);
    for (let i = 1; i <= steps; i++) { txt.textContent = `Mengirim via ${METHODS[m].n} (${i}/${steps})`; bar.style.width = i / steps * 100 + '%'; await sleep(METHODS[m].ms); }
    used = m; break;
  }
  if (used) {
    const count = S.queue.length; S.queue = []; S.meta.lastSync = { ts: Date.now(), method: used, count };
    txt.textContent = `✓ ${count} data terkirim via ${METHODS[used].n}`; addLog(`Sinkronisasi ${count} data via ${METHODS[used].n}`, 'ok'); toast('Sinkronisasi berhasil');
  } else { txt.textContent = '✗ Sinkronisasi gagal. Data tetap aman di perangkat.'; toast('Gagal. Coba metode lain'); }
  S.syncing = false; renderSync(); save();
  setTimeout(() => !S.syncing && prog.classList.add('hidden'), 3500);
}

/* ---------- Ekspor CSV ---------- */
function exportCSV(name, cols, rows) {
  const csv = [cols.join(',')].concat(rows.map(r => cols.map(c => JSON.stringify(r[c] ?? '')).join(','))).join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['\ufeff' + csv], { type: 'text/csv' }));
  a.download = `${name}-${today()}.csv`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/* ---------- Form biomassa ---------- */
function openForm(id) {
  S.editing = id || null;
  const b = S.biomass.find(x => x.id === id);
  $('#mTitle').textContent = b ? 'Ubah Biomassa' : 'Tambah Biomassa';
  $('#fType').innerHTML = TYPES.map(t => `<option ${b && b.type === t ? 'selected' : ''}>${t}</option>`).join('');
  $('#fWeight').value = b ? b.weight : ''; $('#fMoist').value = b ? b.moisture : ''; $('#fErr').textContent = '';
  $('#modal').classList.remove('hidden'); $('#fWeight').focus();
}
function saveForm() {
  const type = $('#fType').value, weight = parseFloat($('#fWeight').value), moisture = parseFloat($('#fMoist').value);
  if (!(weight > 0)) return $('#fErr').textContent = 'Isi berat dengan angka lebih dari 0.';
  if (!(moisture >= 0 && moisture <= 100)) return $('#fErr').textContent = 'Kadar air harus antara 0 dan 100%.';
  if (S.editing) {
    Object.assign(S.biomass.find(x => x.id === S.editing), { type, weight, moisture });
    addLog(`Biomassa diubah: ${type} ${weight} kg`); enqueue('biomassa', `Ubah ${type} ${weight} kg`);
  } else {
    S.biomass.push({ id: uid(), type, weight, moisture, date: today() });
    addLog(`Biomassa ditambah: ${type} ${weight} kg`); enqueue('biomassa', `Tambah ${type} ${weight} kg`);
  }
  $('#modal').classList.add('hidden'); renderBiomass(); save(); toast('Data tersimpan di perangkat');
}

/* ---------- Navigasi & event ---------- */
function go(s) {
  S.screen = s;
  $$('.screen').forEach(e => e.classList.toggle('active', e.id === 's-' + s));
  $$('#nav button').forEach(b => b.classList.toggle('active', b.dataset.s === s));
  $('#fab').classList.toggle('show', s === 'biomassa');
  ensureCharts(); if (s === 'prediksi') renderPred(); if (s === 'monitoring') renderLive();
  scrollTo(0, 0);
}
function bind() {
  $('#nav').onclick = e => { const b = e.target.closest('button'); if (b) go(b.dataset.s); };
  $('#fab').onclick = () => openForm();
  $('#search').oninput = e => { S.q = e.target.value; renderBiomass(); };
  $('#chips').onclick = e => { const c = e.target.closest('.chip'); if (c) { S.filter = c.dataset.f; renderBiomass(); } };
  $('#bList').onclick = e => {
    const b = e.target.closest('[data-act]'); if (!b) return;
    if (b.dataset.act === 'edit') return openForm(b.dataset.id);
    const it = S.biomass.find(x => x.id === b.dataset.id);
    if (it && confirm(`Hapus ${it.type} ${it.weight} kg?`)) {
      S.biomass = S.biomass.filter(x => x.id !== it.id); addLog(`Biomassa dihapus: ${it.type} ${it.weight} kg`, 'warn');
      enqueue('biomassa', `Hapus ${it.type} ${it.weight} kg`); renderBiomass(); save();
    }
  };
  $('#fCancel').onclick = () => $('#modal').classList.add('hidden');
  $('#fSave').onclick = saveForm;
  $('#modal').onclick = e => { if (e.target.id === 'modal') e.target.classList.add('hidden'); };
  $('#simBtns').onclick = e => {
    const b = e.target.closest('[data-mode]'); if (!b) return;
    S.mode = b.dataset.mode; renderSim(); toast(MODES[S.mode].n + ' dimulai'); addLog(MODES[S.mode].n + ' diaktifkan', 'warn');
  };
  $('#btnOpt').onclick = () => {
    S.opt = true; S.mode = 'normal'; renderSim(); computePred();
    addLog('Optimasi gasifikasi diterapkan (rasio udara disesuaikan)', 'ok'); enqueue('optimasi', 'Optimasi gasifikasi diterapkan');
    toast('Gasifikasi dioptimalkan: prediksi naik ±12%');
  };
  $('#methods').onclick = e => { const m = e.target.closest('[data-m]'); if (m && !S.syncing) { S.method = m.dataset.m; renderSync(); } };
  $('#btnNet').onclick = () => { S.online = !S.online; renderSync(); toast(S.online ? 'Koneksi internet aktif (simulasi)' : 'Koneksi internet terputus (simulasi)'); };
  $('#btnSync').onclick = doSync;
  $('#exBio').onclick = () => exportCSV('biomassa', ['type', 'weight', 'moisture', 'date'], S.biomass);
  $('#exMon').onclick = () => exportCSV('monitoring', ['waktu', 'suhu', 'tekanan', 'udara', 'CO', 'H2', 'CH4', 'CO2', 'status'], S.readings);
  addEventListener('online', () => { S.online = true; renderSync(); });
  addEventListener('offline', () => { S.online = false; renderSync(); });
}

/* ---------- Mulai ---------- */
async function boot() {
  await DB.init();
  const saved = await DB.get('state'), rd = await DB.get('readings');
  if (saved) Object.assign(S, saved);
  else {
    S.biomass = SAMPLE.map(x => ({ id: uid(), ...x }));
    ['Aplikasi SIGAP siap digunakan', 'Biomassa awal dimuat (4 data)', 'Mode offline-first aktif'].forEach((t, i) => S.logs.unshift({ ts: Date.now() - (3 - i) * 60000, text: t, lvl: 'ok' }));
    S.biomass.forEach(b => S.queue.push({ id: uid(), type: 'biomassa', desc: `Tambah ${b.type} ${b.weight} kg`, ts: Date.now() - 120000 }));
    S.queue.push({ id: uid(), type: 'monitoring', desc: 'Batch data sensor reaktor', ts: Date.now() - 60000 });
  }
  if (rd) S.readings = rd;
  const now = Date.now();
  for (let i = 23; i >= 0; i--) {
    S.mon.labels.push(hm(new Date(now - i * 3600e3)).slice(0, 5));
    S.mon.t.push(Math.round(780 + Math.sin(i / 3) * 18 + rnd(8)));
    S.mon.p.push(+fmt(102.3 + Math.cos(i / 4) * 1.2 + rnd(.3)));
  }
  bind(); renderSim(); tick(); computePred(); renderBiomass(); renderLog(); renderSync();
  setInterval(tick, 3000);
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => {});
}
boot();
