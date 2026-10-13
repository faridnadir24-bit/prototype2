# SIGAP – Sistem Gasifikasi Biomassa Pintar 🔥

[![Offline-First](https://img.shields.io/badge/Offline--First-IndexedDB-2D6A4F?style=flat-square)](.)
[![PWA](https://img.shields.io/badge/PWA-Ready-1B4332?style=flat-square)](.)
[![Bahasa](https://img.shields.io/badge/Bahasa-Indonesia-D8F3DC?style=flat-square)](.)

> Sistem monitoring gasifikasi biomassa pintar berbasis AI untuk desa terpencil Indonesia. **Bekerja penuh tanpa internet.**

## 🎯 Fitur Utama

| Fitur | Deskripsi |
|-------|-----------|
| **Offline-First** | Semua data disimpan lokal via IndexedDB + localStorage |
| **Monitoring Real-Time** | Suhu, tekanan, aliran udara, komposisi syngas |
| **Deteksi Anomali AI** | Rule-based AI dengan confidence score |
| **Prediksi Listrik** | Estimasi output 6 jam ke depan |
| **Manajemen Biomassa** | CRUD sekam padi, jerami, tongkol jagung, kayu chip |
| **3-Layer Sync** | Internet → SMS → LoRa fallback |
| **Export CSV** | Download data biomassa |
| **PWA** | Dapat diinstal di HP seperti aplikasi native |

## 🚀 Demo Flow

1. Buka `index.html` di browser (langsung, tidak perlu server)
2. **Dashboard** → lihat ringkasan reaktor + aktivitas terbaru
3. **Biomassa** → kelola data, filter, tambah/edit/hapus
4. **Monitoring** → grafik real-time, komposisi syngas, AI anomaly
5. **Prediksi** → chart estimasi listrik 6 jam
6. **Sinkronisasi** → pilih metode (Internet/SMS/LoRa), sinkron data

## 🎮 Panel Simulasi (di tab Monitoring)

| Mode | Kondisi |
|------|---------|
| ✅ Normal | Suhu 785°C, tekanan stabil |
| 🔥 Overheat | Suhu > 940°C → trigger alert KRITIS |
| 💧 Kebocoran | Tekanan < 83 kPa → trigger alert WASPADA |
| ⚫ Tar | Aliran udara rendah → tar terdeteksi |
| ❄️ Suhu Rendah | Suhu < 640°C → trigger alert WASPADA |

## 🛠️ Tech Stack

- **Vanilla JS** (tanpa framework)
- **Chart.js 4** via CDN (fallback canvas manual)
- **IndexedDB** + localStorage untuk storage offline
- **Service Worker** untuk PWA caching
- **Inter** font dari Google Fonts

## 📁 Struktur File

```
sigap/
├── index.html      # Struktur HTML 5 layar
├── style.css       # Desain premium (mobile-first)
├── app.js          # Logic + simulasi + IndexedDB
├── sw.js           # Service Worker (offline cache)
└── manifest.json   # PWA manifest
```

## 📊 Spesifikasi Teknis

- Target reaktor: **700–900°C**
- Simulasi sensor: setiap **3 detik**
- Deteksi anomali: **real-time** dengan AI rule-based
- Penyimpanan: **IndexedDB** (fallback localStorage)
- Kompatibel: Chrome, Firefox, Safari, Edge

---

*SIGAP © 2026 – Solusi energi terbarukan offline-first untuk Indonesia*