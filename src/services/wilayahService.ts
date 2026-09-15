import AsyncStorage from '@react-native-async-storage/async-storage';
import { listWilayah as listWilayahFromServer } from './apiService';
import { WilayahItem } from '../types';
import { safeJsonParse } from './commonUtils';

/**
 * Layanan untuk mengelola daftar master Kecamatan/Desa/Kelurahan (sheet
 * `KODE_DES_KEL` di server), dipakai untuk dropdown wajib Kecamatan &
 * Desa/Kelurahan di WorkItemFormScreen & EditItemScreen. Data di-cache
 * secara lokal (AsyncStorage) supaya tidak perlu memanggil server setiap
 * kali form dibuka, tetapi tetap bisa disegarkan manual (mis. saat offline
 * pertama kali/data master berubah).
 */

const CACHE_KEY = '@survei/wilayah';

let wilayahCache: WilayahItem[] | null = null;
let wilayahReadPromise: Promise<WilayahItem[]> | null = null;

async function readCache(): Promise<WilayahItem[]> {
  if (wilayahReadPromise) {
    return wilayahReadPromise;
  }

  wilayahReadPromise = (async () => {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    if (raw === null) {
      wilayahCache = [];
      return [];
    }
    const parsed = safeJsonParse<WilayahItem[] | null>(raw, null);
    const normalized = Array.isArray(parsed) ? parsed : [];
    wilayahCache = normalized;
    return [...normalized];
  })().finally(() => {
    wilayahReadPromise = null;
  });

  return wilayahReadPromise;
}

async function writeCache(items: WilayahItem[]): Promise<void> {
  wilayahCache = [...items];
  await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(items));
}

/**
 * Mengambil daftar wilayah, mengutamakan data dari server (dan menyimpannya
 * ke cache lokal). Jika server tidak terjangkau (offline), gunakan cache
 * lokal terakhir yang tersimpan supaya surveyor tetap bisa mengisi form.
 */
export async function getWilayahList(forceRefresh = false): Promise<WilayahItem[]> {
  if (!forceRefresh) {
    const cached = await readCache();
    if (cached.length > 0) {
      // Segarkan cache di latar belakang tanpa memblokir tampilan.
      listWilayahFromServer().then(writeCache).catch(() => {});
      return cached;
    }
  }
  try {
    const items = await listWilayahFromServer();
    await writeCache(items);
    return items;
  } catch (err) {
    const cached = await readCache();
    if (cached.length > 0) return cached;
    throw err;
  }
}

/** Daftar nama Kecamatan unik (diurutkan alfabetis), tanpa duplikat. */
export function getKecamatanNames(items: WilayahItem[]): string[] {
  const set = new Set(items.map((i) => i.kecamatan));
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}

/** Daftar Desa/Kelurahan yang termasuk dalam satu Kecamatan tertentu. */
export function getDesaByKecamatan(items: WilayahItem[], kecamatan: string): WilayahItem[] {
  return items
    .filter((i) => i.kecamatan === kecamatan)
    .sort((a, b) => a.desa.localeCompare(b.desa));
}

/** Mencari kode desa/kelurahan berdasarkan pasangan Kecamatan + Desa. */
export function findKodeDesa(items: WilayahItem[], kecamatan: string, desa: string): string {
  const found = items.find((i) => i.kecamatan === kecamatan && i.desa === desa);
  return found?.kode || '';
}
