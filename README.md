# SIGAP — Sistem Pemantauan Gasifikasi Biomassa Pintar

**Prototipe IoT Berbasis Web Offline-First untuk Elektrifikasi Desa Terpencil di Indonesia**

[![Offline First](https://img.shields.io/badge/Arsitektur-Offline--First-1B4332?style=for-the-badge)](.)
[![Protokol](https://img.shields.io/badge/Fallback-Internet_%E2%86%92_SMS_%E2%86%92_LoRa-2D6A4F?style=for-the-badge)](.)
[![Standar UI](https://img.shields.io/badge/Desain-Clean--Tech_SCADA-27AE60?style=for-the-badge)](.)

---

## 📌 Latar Belakang & Masalah Utama
Desa-desa agraris di Indonesia menghasilkan limbah biomassa melimpah (sekam padi, jerami, tongkol jagung, serbuk kayu), namun belum memiliki sistem cerdas untuk mengonversinya menjadi energi listrik mandiri. 

Gasifier biomassa konvensional sering mengalami:
1. **Fluktuasi Temperatur**: Suhu keluar dari zona optimal 700°C–900°C menyebabkan pembentukan tar atau pelelehan abu (*slagging*).
2. **Kualitas Syngas Tidak Konsisten**: Rasio CO, H₂, dan CH₄ bervariasi tanpa pemantauan *real-time*.
3. **Ketergantungan Internet**: Solusi digital konvensional bergantung pada koneksi internet cloud yang tidak tersedia di daerah pelosok/3T.

---

## 💡 Solusi & Keunggulan SIGAP

SIGAP (*Sistem Gasifikasi Biomassa Pintar*) dirancang dengan arsitektur **Offline-First**, mengintegrasikan pemantauan SCADA reaktor, deteksi anomali berbasis kecerdasan buatan, serta protokol komunikasi bertingkat:

### 1. Arsitektur Offline-First
- **Penyimpanan Lokal**: Seluruh telemetri dan pencatatan disimpan secara persisten di peramban pengguna menggunakan **IndexedDB** (dengan cadangan otomatis ke `localStorage`).
- **Antrean Sinkronisasi**: Data disimpan dalam antrean offline dan otomatis dikirim saat transmisi diaktifkan.
- **3-Layer Fallback Communication**:
  - **Lapisan 1 (Internet)**: Koneksi data seluler / WiFi langsung ke Cloud Database.
  - **Lapisan 2 (SMS Modem GSM)**: Paket telemetri terkompresi Base64 via jaringan 2G jika internet seluler padam.
  - **Lapisan 3 (LoRa Mesh 915 MHz)**: Transceiver radio jarak jauh ke Gateway Kantor Desa untuk daerah tanpa sinyal seluler sama sekali.

### 2. Fitur Inti
- **Manajemen Input Biomassa**: Pencatatan jenis bahan baku, berat (kg), kadar air (% MCwb), tanggal, pencarian instan, filter chip, dan ekspor CSV.
- **Monitoring Reaktor Real-Time**:
  - Skematik alur reaktor *downdraft gasifier* (Hopper → Pirolisis → Pembakaran → Reduksi).
  - Pembacaan temperatur inti (target: 700°C–900°C) dengan skala dial indikator zona aman.
  - Pembacaan tekanan ruang reaktor (kPa) dan laju alir udara primer (L/min).
  - Analisis kromatografi komposisi gas syngas: Karbon Monoksida (CO), Hidrogen (H₂), Metana (CH₄), Karbon Dioksida (CO₂), serta LHV (*Lower Heating Value*).
- **Deteksi Anomali AI**:
  - Suhu > 900°C → *"Suhu tinggi, kurangi udara"*
  - Suhu < 700°C → *"Suhu rendah, tambah oksigen"*
  - Udara rendah & suhu pirolisis → *"Tar terdeteksi: rasio udara terlalu rendah"*
  - Penurunan tekanan mendadak → *"Kemungkinan kebocoran"*
  - Rekomendasi tindakan berbahasa Indonesia dengan tingkat keyakinan (*confidence level* %).
- **Prediksi Output Listrik AI (Machine Learning)**: Proyeksi daya listrik generator (kW) dan energi kumulatif (kWh) selama 6 jam ke depan, indikator akurasi $R^2 = 0.94$, serta tombol optimasi rasio udara-biomassa.

---

## 📱 Panduan Demo Prototipe

1. **Buka Aplikasi**: Buka berkas `index.html` langsung di peramban (atau melalui web server lokal / GitHub Pages).
2. **Dashboard**:
   - Tinjau 3 kartu KPI utama: Total Biomassa (kg), Suhu Reaktor (°C), dan Listrik Dihasilkan (kWh).
   - Perhatikan status reaktor (*NORMAL / WASPADA / KRITIS*) dan log aktivitas terkini.
3. **Tab Biomassa**:
   - Gunakan filter chip (*Semua, Sekam, Jerami, Tongkol, Kayu*) atau kotak pencarian.
   - Klik tombol **`+`** (FAB) untuk menambah input biomassa baru.
   - Klik ikon **Edit** atau **Hapus** pada kartu biomassa.
   - Klik **Export CSV** untuk mengunduh laporan biomassa.
4. **Tab Monitoring**:
   - Tinjau diagram skematik reaktor downdraft dan pembacaan temperatur 785°C.
   - Amati grafik garis *real-time* (suhu & tekanan) yang berfluktuasi tiap 3 detik.
   - Buka **Panel Simulasi Skenario**:
     - Klik **"Simulasi Overheat"** → Amati perubahan suhu > 900°C dan peringatan AI aktif.
     - Klik **"Simulasi Kebocoran"** → Amati penurunan tekanan < 90 kPa.
     - Klik **"Simulasi Normal"** → Reaktor kembali stabil.
5. **Tab Prediksi**:
   - Amati grafik proyeksi daya listrik 6 jam ke depan dan tabel estimasi per jam.
   - Klik **"Optimalkan Gasifikasi Otomatis"** untuk melihat penyesuaian kurva proyeksi.
6. **Tab Sinkronisasi**:
   - Klik tombol **"Ubah Mode"** atau pill di header untuk beralih antara *Mode Online* dan *Mode Offline*.
   - Pilih metode **"3-Layer Fallback (Otomatis)"**.
   - Klik **"Sinkronisasi Sekarang"** → Amati visualisasi pengujian bertingkat:
     - *Layer 1 (Internet)* menguji koneksi (gagal jika offline).
     - *Layer 2 (SMS GSM)* menguji sinyal seluler.
     - *Layer 3 (LoRa Mesh)* berhasil mentransmisikan data ke gateway desa!

---

## 🛠️ Arsitektur Teknis
- **UI / UX**: Mobile-first (max-width 430px, responsif desktop), CSS kustom terstandarisasi tanpa pustaka eksternal yang membebani memori.
- **Visual & Ikon**: 100% SVG inline bersih tanpa emoji, tipografi teknis Inter & JetBrains Mono.
- **Penyimpanan**: IndexedDB + localStorage fallback.
- **Grafik**: Chart.js 4 (dengan fallback kanvas rendering HTML5 2D kontekstual jika offline tanpa cache CDN).
- **PWA**: Didukung `manifest.json` dan `sw.js` untuk instalasi *standalone app* di perangkat Android/iOS.

---
*SIGAP — Memberdayakan Potensi Limbah Biomassa Menjadi Kemandirian Energi Desa.*