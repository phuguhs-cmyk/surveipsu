# Aplikasi Survei Infrastruktur (React Native Expo)

Aplikasi mobile untuk 10–20 surveyor lapangan, mengirim data survei
(koordinat GPS, foto, tipe infrastruktur, kondisi, catatan) ke Google
Sheets + Google Drive melalui backend Google Apps Script
(`../google-apps-script/Code.gs`).

## Fitur

- Login sederhana berbasis nama surveyor (disimpan di AsyncStorage).
- Ambil koordinat GPS (expo-location).
- Ambil foto langsung dari kamera (expo-image-picker), otomatis dikonversi ke base64.
- **Offline-first**: setiap survei disimpan dulu ke antrian lokal (AsyncStorage).
  Jika perangkat online, langsung dikirim ke server; jika offline/gagal,
  data tetap tersimpan dan bisa dikirim ulang dari layar "Antrian Survei".
- Layar Antrian: menampilkan status (menunggu/mengirim/gagal), retry manual,
  dan pull-to-refresh untuk memproses ulang seluruh antrian.

## Struktur Folder

```
mobile-app/
├── App.tsx                  # Root navigator
├── src/
│   ├── config.ts            # URL Web App GAS, API key, daftar opsi form
│   ├── types.ts              # Tipe data survei & antrian
│   ├── navigation/types.ts   # Tipe parameter React Navigation
│   ├── screens/
│   │   ├── LoginScreen.tsx
│   │   ├── SurveyFormScreen.tsx
│   │   └── QueueScreen.tsx
│   └── services/
│       ├── locationService.ts  # Ambil GPS
│       ├── photoService.ts     # Ambil foto + konversi base64
│       ├── apiService.ts       # Fetch ke Web App GAS
│       └── queueService.ts     # Antrian offline (AsyncStorage)
```

## Setup

1. Pastikan backend Google Apps Script sudah di-deploy (lihat
   `../google-apps-script/Code.gs`) dan Anda punya URL Web App-nya.
2. Buka `src/config.ts`, isi:
   - `GAS_WEB_APP_URL` dengan URL deployment Web App.
   - `API_KEY` — harus sama persis dengan `API_KEY` di `Code.gs`.
3. Install dependencies (sudah dilakukan otomatis saat setup awal):
   ```
   npm install
   ```
4. Jalankan aplikasi:
   ```
   npx expo start
   ```
   Scan QR code dengan aplikasi Expo Go di HP surveyor, atau jalankan di
   emulator Android/iOS.

## Catatan Produksi

- Untuk build produksi (APK/AAB atau IPA), gunakan `eas build` (EAS Build).
- Pertimbangkan menambah kompresi gambar lebih agresif jika ukuran foto
  besar (misalnya `expo-image-manipulator`) agar payload JSON ke Apps
  Script tidak melebihi batas ukuran request.
- `API_KEY` di sini hanya proteksi dasar; untuk keamanan lebih baik,
  pertimbangkan OAuth atau token per-surveyor di iterasi berikutnya.
