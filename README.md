# Laporan Harian ETD – E.T.D Hospital Kuala Lipis

PWA mobile-first untuk mengisi, melihat dan menganalisis laporan syif Pagi, Petang dan Malam. Rekod rasmi dikongsi melalui Google Apps Script dan Google Sheets; `localStorage` digunakan untuk draf automatik dan cache sementara sahaja.

## Ciri

- Dashboard status tiga syif dan ringkasan harian
- Satu laporan unik bagi gabungan tarikh + syif
- Borang bertahap dengan input nombor mesra sentuhan
- Kakitangan mengikut kategori dengan cadangan nama daripada rekod terdahulu
- Statistik kes, carry forward, BID/DID, ambulans dan panggilan kecemasan
- Simpan, edit, padam dan cari terus daripada Google Sheets
- Statistik dan graf mingguan, bulanan serta tahunan
- Pratonton A4 sebelum cetak
- Manifest PWA dan service worker untuk luar talian asas
- Responsif untuk Android, iPhone, tablet dan desktop

## Jalankan

Keperluan: Node.js 22 atau lebih baharu.

```bash
npm install
npm run dev
```

## Bina untuk produksi

```bash
npm run build
```

## Penyimpanan dan backend

- `app/lib/reportRepository.ts` – sambungan aplikasi kepada Google Apps Script
- `app/lib/localReportRepository.ts` – draf automatik dan cache peranti
- `backend/google-apps-script/Code.gs` – API dan pengiraan Google Sheets
- `app/lib/types.ts` – model data utama

Satu laporan kekal unik bagi gabungan `Tarikh + Syif`. Rekod ujian automatik dibersihkan selepas pengesahan.
