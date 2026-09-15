import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { CONFIG } from '../config';
import { AuthUser, ApiResponse } from '../types';
import { RETRYABLE_HTTP_STATUSES, safeJsonParse, sleep, isTimeoutOrCancelError } from './commonUtils';

// ─── Penyimpanan sesi ────────────────────────────────────────────────────────
// Data sesi (AUTH_USER & SESSION_TOKEN) disimpan lewat AsyncStorage biasa di
// semua platform (termasuk Android/iOS). Sebelumnya sempat dipindah ke
// expo-secure-store (Android Keystore/iOS Keychain), namun operasi Keystore
// tersebut terbukti bisa MACET/HANG tanpa batas waktu di sebagian perangkat
// (mis. beberapa perangkat LG), membuat login()/getCurrentUser() menggantung
// selamanya. Karena itu enkripsi lokal ini dikembalikan ke AsyncStorage biasa
// seperti semula.
async function secureSetItem(key: string, value: string): Promise<void> {
  await AsyncStorage.setItem(key, value);
}

async function secureGetItem(key: string): Promise<string | null> {
  return AsyncStorage.getItem(key);
}

async function secureRemoveItem(key: string): Promise<void> {
  await AsyncStorage.removeItem(key);
}

// ─── Cache in-memory untuk data sesi ────────────────────────────────────────
// getCurrentUser()/getSessionToken() dipanggil BERKALI-KALI di banyak layar
// (mis. PackageListScreen memanggil getCurrentUser() lalu fetchSurveyList()
// yang di dalamnya memanggil getSessionToken() lagi) setiap kali layar
// dibuka/di-focus. Cache in-memory ini menghindari pembacaan berulang ke
// AsyncStorage yang tidak perlu.
//
// Cache ini HANYA menyimpan nilai di memori proses (variabel JS biasa, bukan
// storage tambahan), jadi tidak menambah permukaan risiko keamanan: begitu
// aplikasi ditutup (proses berakhir), cache ini hilang dan akan dibaca ulang
// dari AsyncStorage saat aplikasi dibuka kembali. `undefined` berarti "belum
// pernah dibaca dari storage pada sesi proses ini" (berbeda dari `null` yang
// berarti "sudah dibaca dan memang tidak ada data tersimpan").
let cachedAuthUserRaw: string | null | undefined;
let cachedSessionToken: string | null | undefined;

/** Dipakai oleh unit test untuk mengosongkan cache in-memory ini antar test,
 * supaya setiap test dimulai dari kondisi "belum pernah membaca storage"
 * (meniru kondisi nyata setiap kali aplikasi baru dibuka). */
export function __resetAuthCacheForTests(): void {
  cachedAuthUserRaw = undefined;
  cachedSessionToken = undefined;
}

// Batas waktu request login/logout dibuat lebih agresif daripada sebelumnya
// karena Google Apps Script sering "cold start" selama beberapa detik, namun
// UI tidak boleh menunggu lama jika server benar-benar tidak merespons.
// Timeout 12 detik sudah cukup untuk menilai koneksi, tanpa membuat tombol
// masuk/logout terjebak dalam spinner yang terasa "hang".
const AUTH_REQUEST_TIMEOUT_MS = 12000;

// Retry configuration untuk login/logout
const AUTH_RETRY_COUNT = 1;
const AUTH_RETRY_DELAY_MS = 300;

async function fetchWithTimeout(url: string, options: RequestInit, timeoutMs = AUTH_REQUEST_TIMEOUT_MS): Promise<Response> {
  let lastResponse: Response | undefined;
  for (let attempt = 0; attempt <= AUTH_RETRY_COUNT; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, { ...options, signal: controller.signal });
      if (!response.ok && RETRYABLE_HTTP_STATUSES.has(response.status) && attempt < AUTH_RETRY_COUNT) {
        lastResponse = response;
        await sleep(AUTH_RETRY_DELAY_MS * (attempt + 1));
        continue;
      }
      return response;
    } catch (err: any) {
      if (attempt === AUTH_RETRY_COUNT) {
        if (isTimeoutOrCancelError(err)) {
          throw new Error('Koneksi ke server terlalu lama merespons. Periksa jaringan internet Anda dan coba lagi.');
        }
        throw err;
      }
      await sleep(AUTH_RETRY_DELAY_MS * (attempt + 1));
    } finally {
      clearTimeout(timer);
    }
  }
  // Tidak akan tercapai (loop di atas selalu return atau throw pada percobaan
  // terakhir), tapi diperlukan agar TypeScript tahu fungsi ini selalu
  // mengembalikan nilai.
  return lastResponse as Response;
}


export async function login(username: string, password: string): Promise<AuthUser> {
  if (!CONFIG.GAS_WEB_APP_URL) {
    throw new Error('URL server belum dikonfigurasi. Pastikan file .env sudah ada dan berisi GAS_WEB_APP_URL.');
  }
  const response = await fetchWithTimeout(CONFIG.GAS_WEB_APP_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify({
      action: 'login',
      username: username.trim(),
      password,
    }),
  });


  if (!response.ok) {
    throw new Error(`Server merespons dengan status ${response.status}`);
  }

  const json: ApiResponse = await response.json();
  if (!json.success || !json.user || !json.sessionToken) {
    throw new Error(json.message || 'Username atau password salah.');
  }

  const user: AuthUser = { ...json.user, sessionToken: json.sessionToken };
  const userRaw = JSON.stringify(user);

  // PENTING: Parallelize semua AsyncStorage writes, jangan sequential!
  // Sequential await bisa membuat login terasa hang jika AsyncStorage lambat.
  // Dengan Promise.all(), ketiga operasi berjalan bersamaan di layer storage.
  await Promise.all([
    secureSetItem(CONFIG.STORAGE_KEYS.AUTH_USER, userRaw),
    secureSetItem(CONFIG.STORAGE_KEYS.SESSION_TOKEN, json.sessionToken),
    AsyncStorage.setItem(CONFIG.STORAGE_KEYS.SURVEYOR_NAME, json.user.name),
  ]);

  // Isi cache in-memory langsung dari hasil login, supaya pemanggilan
  // getCurrentUser()/getSessionToken() berikutnya (mis. saat layar berikutnya
  // langsung membaca ulang user/token) tidak perlu baca SecureStore lagi.
  cachedAuthUserRaw = userRaw;
  cachedSessionToken = json.sessionToken;

  return user;
}

/** Timeout untuk pembacaan AsyncStorage saat app startup (LoginScreen).
 * Jika AsyncStorage lambat, kita set timeout 3 detik supaya LoginScreen
 * tidak tergantung selamanya. Setelah itu, form login tetap bisa digunakan. */
function withAsyncStorageTimeout<T>(promise: Promise<T>, timeoutMs = 3000): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error('AsyncStorage timeout')), timeoutMs)
    ),
  ]);
}

export async function getCurrentUser(): Promise<AuthUser | null> {
  if (cachedAuthUserRaw === undefined) {
    try {
      cachedAuthUserRaw = await withAsyncStorageTimeout(
        secureGetItem(CONFIG.STORAGE_KEYS.AUTH_USER),
        3000
      );
    } catch {
      // Jika AsyncStorage gagal dibaca atau timeout, anggap saja belum ada
      // sesi tersimpan alih-alih membuat pemanggil (LoginScreen dkk.)
      // menunggu selamanya karena promise reject tak tertangani.
      cachedAuthUserRaw = null;
    }
  }
  return safeJsonParse<AuthUser | null>(cachedAuthUserRaw, null);
}

export async function getSessionToken(): Promise<string | null> {
  if (cachedSessionToken === undefined) {
    try {
      cachedSessionToken = await withAsyncStorageTimeout(
        secureGetItem(CONFIG.STORAGE_KEYS.SESSION_TOKEN),
        3000
      );
    } catch {
      cachedSessionToken = null;
    }
  }
  return cachedSessionToken;
}

export async function logout(): Promise<void> {
  const token = await getSessionToken();

  // Hapus sesi lokal segera agar UI tidak menunggu network. Panggilan ke
  // server hanya dilakukan sebagai best-effort di background; jika server lama
  // atau offline, logout tetap terasa instan dan tidak meng-block navigasi.
  // PENTING: Parallelize penghapusan, jangan sequential!
  await Promise.all([
    secureRemoveItem(CONFIG.STORAGE_KEYS.AUTH_USER),
    secureRemoveItem(CONFIG.STORAGE_KEYS.SESSION_TOKEN),
  ]);
  cachedAuthUserRaw = null;
  cachedSessionToken = null;

  if (token) {
    void fetchWithTimeout(CONFIG.GAS_WEB_APP_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({ action: 'logout', sessionToken: token }),
    }, 5000).catch(() => undefined);
  }

  // Di web, navigation.reset() saja tidak cukup: state React (variabel,
  // cache, hook) yang sudah pernah dibuat untuk layar-layar sebelumnya
  // (mis. AdminDashboard/PackageList) tetap ada di memori JS, dan tombol
  // Back browser bisa membawa pengguna kembali ke riwayat entri tersebut.
  // Reload penuh halaman memastikan seluruh state benar-benar bersih dan
  // pengguna benar-benar kembali ke layar Login dari awal (bukan sekadar
  // berpindah rute di dalam SPA yang sama).
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.location.replace('/');
  }
}

