// Konfigurasi Metro bawaan Expo TIDAK mengenali ekstensi `.pmtiles` sebagai
// aset biner (binary asset), sehingga `require('../../assets/map-data/....
// pmtiles')` akan gagal di-resolve / dicoba di-parse sebagai modul JS oleh
// Metro. Menambahkannya ke `assetExts` membuat Metro memperlakukan file
// tersebut sama seperti gambar/font: disalin apa adanya ke build APK dan
// `require(...)` mengembalikan module id yang bisa diresolusi lewat
// `expo-asset` (`Asset.fromModule(...).downloadAsync()`), lalu file lokalnya
// dibaca melalui `expo-file-system` untuk disalin ke direktori yang bisa
// diakses WebView (lihat `src/services/pmtilesAsset.ts`).
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

config.resolver.assetExts = [...config.resolver.assetExts, 'pmtiles'];

module.exports = config;
