import { Asset } from 'expo-asset';
import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';

// Aset PMTiles Banjarnegara dibundel LANGSUNG ke dalam APK (bukan diunduh
// setelah instalasi) agar peta offline vector selalu tersedia tanpa koneksi
// internet, konsisten dengan keputusan produk saat ini (ukuran APK naik
// ~32MB, dianggap dapat diterima demi ketersediaan offline penuh). Metro
// memperlakukan file ini sebagai aset biner berkat `assetExts` di
// `metro.config.js`.
 
const PMTILES_MODULE = require('../../assets/map-data/banjarnegara.pmtiles');

const PMTILES_FILE_NAME = 'banjarnegara.pmtiles';

let cachedLocalUriPromise: Promise<string> | null = null;

/**
 * Menyalin file PMTiles bawaan APK ke direktori dokumen aplikasi (sekali
 * saja, hasilnya di-cache) supaya bisa dibaca lewat `file://` di dalam
 * WebView (MapLibre GL + pmtiles-js perlu melakukan *range request* HTTP
 * pada file lokal, yang hanya bisa dilakukan lewat `fetch()`/XHR terhadap
 * path `file://` yang stabil — bukan URI aset Metro/Expo yang bersifat
 * sementara/di-hash). Mengembalikan URI lokal (`file://...`) yang siap
 * dipakai sebagai `pmtiles://<uri>` di style MapLibre GL.
 *
 * Di web (`Platform.OS === 'web'`), PMTiles lokal tidak relevan (tidak ada
 * konsep APK); fungsi ini akan menolak (reject) agar pemanggil bisa jatuh
 * ke mode online biasa.
 */
export async function getOfflinePmtilesLocalUri(): Promise<string> {
  if (Platform.OS === 'web') {
    throw new Error('PMTiles offline tidak didukung di web');
  }
  if (!cachedLocalUriPromise) {
    cachedLocalUriPromise = (async () => {
      const targetUri = `${FileSystem.documentDirectory}${PMTILES_FILE_NAME}`;
      const info = await FileSystem.getInfoAsync(targetUri);
      if (info.exists && info.size && info.size > 0) {
        return targetUri;
      }
      const asset = Asset.fromModule(PMTILES_MODULE);
      await asset.downloadAsync();
      const sourceUri = asset.localUri || asset.uri;
      if (!sourceUri) {
        throw new Error('Gagal me-resolve aset PMTiles bawaan aplikasi');
      }
      await FileSystem.copyAsync({ from: sourceUri, to: targetUri });
      return targetUri;
    })().catch((err) => {
      // Reset cache agar percobaan berikutnya (mis. setelah pengguna
      // membuka ulang layar) tidak terjebak dengan promise yang gagal.
      cachedLocalUriPromise = null;
      throw err;
    });
  }
  return cachedLocalUriPromise;
}
