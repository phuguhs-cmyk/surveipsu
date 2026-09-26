# Aplikasi Survei Infrastruktur (React Native Expo)

Aplikasi mobile & web untuk surveyor lapangan, admin, dan viewer publik untuk
mengelola **Paket Pekerjaan** survei infrastruktur (jalan, drainase, dinding
penahan tanah, gorong-gorong, jembatan, serta jenis dinamis tambahan seperti
SPAM/IPAL). Data (koordinat GPS, foto, dimensi/kondisi per jenis infrastruktur,
anotasi peta, proposal/RAB) dikirim ke backend Google Apps Script
(`../google-apps-script/Code.gs`) yang menyimpan data di Google Sheets +
Google Drive.

## Fitur Utama

- **Login berbasis akun & role** (admin / user-surveyor / viewer) dengan
  session token (bukan API key statis) dan hashing password bertahap
  (plaintext/hash v1 lama otomatis di-migrasi ke hash v2 ber-salt saat login).
- **Paket Pekerjaan**: satu paket berisi banyak "item pekerjaan" lintas jenis
  infrastruktur, dengan status draft/dalam pengerjaan/sudah diposting, dan
  bisa ditandai "Sudah Dilaksanakan" (tahun anggaran, kontraktor, output).
- **Form survei per jenis infrastruktur** (Jalan, Drainase, DPT, Gorong-gorong,
  Jembatan, + jenis dinamis) dengan field detail spesifik (STA, dimensi,
  kondisi, elevasi, dll.), termasuk mode "Pembangunan Baru / Perbaikan /
  Pengembangan" dengan kolom detail yang berbeda per mode.
- **Peta offline & online** (MapLibre GL + PMTiles untuk data offline,
  fallback raster Esri/Carto/MapTiler untuk online) untuk memilih koordinat,
  menggambar anotasi (garis/polygon), dan melihat sebaran lokasi survei.
- **Sketsa & profil memanjang**: kanvas sketsa tangan (signature-canvas/
  canvas) dan modal profil memanjang (longitudinal profile) untuk elemen
  seperti saluran/jalan.
- **Offline-first**: setiap survei disimpan dulu ke antrian lokal
  (AsyncStorage). Jika perangkat online, langsung dikirim ke server; jika
  offline/gagal, data tetap tersimpan dan bisa dikirim ulang dari layar
  "Antrian Survei" (retry manual, pull-to-refresh).
- **Dashboard Admin**: statistik ringkas per jenis infrastruktur, manajemen
  pengguna (tambah/ubah role/permission/allowed types), manajemen jenis
  infrastruktur dinamis, laporan tabel per paket maupun gabungan seluruh
  paket, ekspor PDF, upload/lihat/hapus proposal pekerjaan.
- **Data Publik (Viewer)**: akses baca-saja ke seluruh paket & lokasi survei
  tanpa bisa mengubah data apa pun, dengan pencarian paket.
- Konfirmasi ganda saat menghapus paket/item (baik dari sisi admin maupun
  surveyor) untuk mencegah penghapusan tidak sengaja.

## Struktur Folder (ringkas)

```
mobile-app/
├── App.tsx                      # Root navigator (lihat src/navigation/types.ts)
├── src/
│   ├── config.ts                # URL Web App GAS, API key peta, daftar opsi form
│   ├── types.ts                 # Tipe data survei, paket, user, dll.
│   ├── navigation/types.ts      # Tipe parameter React Navigation
│   ├── theme.ts                 # Warna & style bersama
│   ├── screens/                 # Semua layar (Login, PackageList, MapScreen,
│   │                             #  AdminDashboard, UserManagement, dll.)
│   ├── components/               # Komponen bersama (modal koordinat, sketsa,
│   │                             #  schema preview, searchable select, dll.)
│   │   └── schemas/              # Diagram skema per jenis infrastruktur
│   ├── services/                 # Lapisan API/logic (apiService, authService,
│   │                             #  packageService, queueService, reportService,
│   │                             #  annotationService, photoService, dll.)
│   ├── utils/                    # Util murni (validasi, rating kondisi, STA,
│   │                             #  kemiringan, dimensi rencana, dll.)
│   └── assets/                   # Aset ter-bundle (Leaflet/MapLibre GL JS/CSS,
│                                  #  glyph offline) dalam bentuk modul TS
├── test/                         # Mock modul native & setup Jest
└── map-data/                     # Data peta offline contoh (mbtiles/pmtiles)
```

## Setup

1. Pastikan backend Google Apps Script sudah di-deploy (lihat
   `../google-apps-script/Code.gs`) dan Anda punya URL Web App-nya. Isi juga
   akun admin awal di sheet `Users` (lihat komentar `resetAdminPasswordSekarang`
   di `Code.gs` jika perlu reset password admin manual).
2. Buat file `.env` di root `mobile-app/` (lihat `.env` sebagai contoh, TIDAK
   pernah di-commit ke git):
   ```
   GAS_WEB_APP_URL=https://script.google.com/macros/s/xxx/exec
   MAPTILER_API_KEY=   # opsional, fallback ke Esri/Carto jika kosong
   CARTO_API_KEY=      # opsional
   ```
3. Install dependencies:
   ```
   npm install
   ```
4. Jalankan aplikasi:
   ```
   npx expo start
   ```
   Scan QR code dengan aplikasi Expo Go di HP surveyor, atau jalankan di
   emulator Android/iOS, atau `npm run web` untuk versi web (dipakai juga
   oleh deployment Vercel/Netlify — lihat `vercel.json`/`netlify.toml`).

## Menjalankan Test, Lint, dan Type Check

```
npm test         # Jest (unit test + component test screen)
npm run lint     # ESLint (eslint-config-expo)
npm run typecheck  # tsc --noEmit
```

CI (GitHub Actions, `.github/workflows/ci.yml`) menjalankan ketiganya secara
otomatis pada setiap push/PR ke branch `main`.

## Catatan Produksi

- Kompresi foto sebelum dikirim sudah diterapkan (`expo-image-manipulator`,
  resize ke 1200px + kualitas 0.6 di native; resize ke 1080px + kualitas 0.7
  via Canvas di web) agar payload JSON ke Apps Script tidak melebihi batas
  ukuran request.
- Autentikasi memakai session token (bukan API key statis) dengan password
  di-hash (bukan plaintext) di sheet `Users`; API key global di masa lalu
  sudah digantikan pola ini.
- Pertimbangkan menambah OAuth/SSO per-surveyor jika kebutuhan keamanan
  meningkat (mis. integrasi dengan akun instansi).

