# Laporan Harian ETD – E.T.D Hospital Kuala Lipis

PWA mobile-first untuk mengisi, melihat dan menganalisis laporan syif Pagi, Petang dan Malam. Versi ini ialah frontend sahaja; semua data ujian disimpan dalam `localStorage` peranti.

## Ciri

- Dashboard status tiga syif dan ringkasan harian
- Satu laporan unik bagi gabungan tarikh + syif
- Borang bertahap dengan input nombor mesra sentuhan
- Kakitangan, statistik kes, carry forward, BID/DID, ambulans dan panggilan kecemasan
- Simpan, edit, padam, cari dan cetak A4
- Statistik hari dan bulan semasa
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

## Sambungan Google Apps Script kemudian

Semua operasi data berada dalam `app/lib/localReportRepository.ts`. Kekalkan kontrak `getAll`, `save` dan `remove`, kemudian gantikan implementasi `localStorage` dengan panggilan API Google Apps Script. Model data utama berada dalam `app/lib/types.ts`.

Backend belum disambungkan dalam versi ini.
