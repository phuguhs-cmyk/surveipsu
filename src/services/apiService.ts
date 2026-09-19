import { CONFIG } from '../config';
import { getSessionToken } from './authService';
import { ApiResponse, QueuedSurvey, ManagedUser, UserPermissions, WilayahItem, ProposalDocument } from '../types';

import { RETRYABLE_HTTP_STATUSES, sleep, isRetryableNetworkError, isTimeoutOrCancelError } from './commonUtils';


const readCache = new Map<string, { expiresAt: number; value: any }>();
const MAX_READ_CACHE_ENTRIES = 32;

function trimReadCache(): void {
  if (readCache.size <= MAX_READ_CACHE_ENTRIES) return;
  const entries = Array.from(readCache.entries()).sort((a, b) => a[1].expiresAt - b[1].expiresAt);
  while (readCache.size > MAX_READ_CACHE_ENTRIES) {
    const oldestKey = entries.shift()?.[0];
    if (!oldestKey) break;
    readCache.delete(oldestKey);
  }
}

// Batas waktu (ms) sebelum sebuah request dibatalkan paksa. Tanpa batas ini,
// request yang macet karena sinyal lemah di lapangan bisa menggantung tanpa
// batas waktu, membuat UI tampak "loading" selamanya. AbortController dipakai
// karena fetch() bawaan React Native/Expo tidak punya opsi timeout sendiri.
// Dinaikkan dari 20 ke 35 detik: Google Apps Script Web App sering mengalami
// "cold start" (khususnya setelah idle beberapa menit) yang bisa memakan
// waktu 20-30 detik sebelum server sempat merespons sama sekali. Timeout yang
// terlalu ketat membuat AbortController membatalkan request-nya SENDIRI
// sebelum server sempat menjawab, yang di Android muncul sebagai pesan
// mentah "request has been canceled"/"Aborted" alih-alih pesan yang jelas.
const REQUEST_TIMEOUT_MS = 35000;

// Berapa kali percobaan ULANG (di luar percobaan pertama) yang dilakukan
// ketika request gagal karena masalah JARINGAN (timeout/koneksi terputus),
// BUKAN karena error bisnis dari server (mis. validasi gagal, sesi
// kedaluwarsa). Ini membuat aplikasi lebih tahan terhadap kegagalan
// jaringan sesaat (umum terjadi di lapangan) tanpa mengorbankan akurasi:
// error bisnis dari server tetap langsung dilempar ke pemanggil, tidak
// pernah di-retry, supaya pesan/hasil yang ditampilkan tetap sesuai kondisi
// data yang sebenarnya.
// OPTIMASI: Kurangi retry count dari 3 ke 2 & delay dari 800ms ke 300ms.
// Satu kali retry sudah cukup untuk transient errors; delay lebih lama
// hanya bikin user menunggu lama tanpa manfaat signifikan.
const NETWORK_RETRY_COUNT = 2;
const NETWORK_RETRY_DELAY_MS = 300;

async function fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs = REQUEST_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Wrapper fetch dengan timeout + retry otomatis untuk kegagalan jaringan.
 * Error bisnis (dilempar oleh caller setelah membaca response, mis. saat
 * `!response.ok` atau `!json.success`) TIDAK melalui retry ini karena
 * dilempar dari luar callback fetch yang sebenarnya — hanya kegagalan pada
 * fetch() itu sendiri (timeout/putus koneksi) yang di-retry.
 */
async function fetchWithRetry(url: string, options: RequestInit = {}): Promise<Response> {
  let lastErr: any;
  for (let attempt = 0; attempt <= NETWORK_RETRY_COUNT; attempt++) {
    try {
      const response = await fetchWithTimeout(url, options);
      if (!response.ok && RETRYABLE_HTTP_STATUSES.has(response.status) && attempt < NETWORK_RETRY_COUNT) {
        await sleep(NETWORK_RETRY_DELAY_MS * (attempt + 1));
        continue;
      }
      return response;
    } catch (err: any) {
      lastErr = err;
      if (!isRetryableNetworkError(err) || attempt === NETWORK_RETRY_COUNT) {
        throw new Error(
          isTimeoutOrCancelError(err)
            ? 'Koneksi ke server terlalu lama merespons. Periksa jaringan internet Anda dan coba lagi.'
            : (err?.message || 'Gagal terhubung ke server.')
        );
      }
      await sleep(NETWORK_RETRY_DELAY_MS * (attempt + 1));
    }
  }
  // Tidak akan tercapai (loop di atas selalu return atau throw), tapi
  // diperlukan agar TypeScript tahu fungsi ini selalu mengembalikan nilai.
  throw lastErr;
}

function getCachedValue<T>(key: string): T | undefined {
  const entry = readCache.get(key);
  if (!entry) return undefined;
  if (entry.expiresAt <= Date.now()) {
    readCache.delete(key);
    return undefined;
  }
  return entry.value as T;
}

function setCachedValue<T>(key: string, value: T, ttlMs: number): void {
  readCache.set(key, { expiresAt: Date.now() + ttlMs, value });
  trimReadCache();
}

function invalidatePackageAndSurveyReadCache(): void {
  for (const key of Array.from(readCache.keys())) {
    if (
      key.startsWith('fetchSurveyList:') ||
      key.startsWith('publicFetchSurveyList:') ||
      key.startsWith('listPackages:') ||
      key.startsWith('publicListPackages')
    ) {
      readCache.delete(key);
    }
  }
}

// Promise request BACA (GET) yang sedang berjalan, dikunci per cacheKey.
// Tanpa ini, membuka beberapa layar/menu hampir bersamaan (mis. saat login
// lalu langsung berpindah menu) bisa memicu beberapa permintaan IDENTIK ke
// GAS Web App secara paralel sebelum cache terisi. Google Apps Script punya
// batas eksekusi bersamaan yang cukup ketat, sehingga permintaan duplikat ini
// saling berebut kuota & memperbesar peluang salah satunya timeout/dibatalkan
// ("request has been canceled"). Dengan de-duplikasi ini, panggilan
// berikutnya dengan cacheKey yang sama cukup MENUNGGU hasil dari permintaan
// pertama yang sedang berjalan, bukan mengirim permintaan baru.
const pendingReads = new Map<string, Promise<any>>();

async function fetchWithCache<T>(cacheKey: string, ttlMs: number, callback: () => Promise<T>): Promise<T> {
  const cached = getCachedValue<T>(cacheKey);
  if (cached !== undefined) return cached;
  const pending = pendingReads.get(cacheKey);
  if (pending) return pending as Promise<T>;
  const promise = (async () => {
    try {
      const value = await callback();
      setCachedValue(cacheKey, value, ttlMs);
      return value;
    } finally {
      pendingReads.delete(cacheKey);
    }
  })();
  pendingReads.set(cacheKey, promise);
  return promise;
}

async function authBody(extra: Record<string, any> = {}): Promise<Record<string, any>> {
  const sessionToken = await getSessionToken();
  return { sessionToken, ...extra };
}

async function post(body: Record<string, any>): Promise<ApiResponse> {
  const response = await fetchWithRetry(CONFIG.GAS_WEB_APP_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`Server merespons dengan status ${response.status}`);
  const json: ApiResponse = await response.json();
  if (!json.success) throw new Error(json.message || 'Request gagal.');
  // Setiap aksi tulis (create/update/delete/post/unpost/dst.) membuat cache
  // baca (fetchSurveyList/listPackages/listWilayah) berpotensi basi. TTL
  // cache read dinaikkan untuk mempercepat navigasi berulang, sehingga
  // untuk menjaga keakuratan data, seluruh cache baca dikosongkan setiap
  // kali ada aksi tulis yang berhasil (kecuali login/logout yang tidak
  // mengubah data survei/paket).
  if (body.action && body.action !== 'login' && body.action !== 'logout') {
    invalidatePackageAndSurveyReadCache();
  }
  return json;
}

export async function submitSurvey(payload: QueuedSurvey['data']): Promise<ApiResponse> {
  // payload sudah berisi semua field; ganti apiKey dengan sessionToken
  const { apiKey: _removed, ...rest } = payload as any;
  return post(await authBody(rest));
}

export async function fetchSurveyList(infrastructureType?: string, packageId?: string): Promise<any[]> {
  const token = await getSessionToken();
  const cacheKey = `fetchSurveyList:${infrastructureType ?? 'all'}:${packageId ?? 'all'}:${token ?? 'guest'}`;
  // TTL diperpanjang dari 30s → 5 menit (300s) untuk mengurangi redundant fetch.
  // Pengguna navigasi bolak-balik antar screen dalam beberapa menit tetap pakai
  // cache lama; jika perlu refresh keadaan terbaru, user bisa swipe/tekan tombol
  // refresh manual. Cache dibersihkan eksplisit setiap kali aksi tulis berhasil
  // via post() di atas, jadi data tetap akurat saat ada perubahan.
  //
  // PENGECUALIAN: readCache ini bersifat in-memory PER PERANGKAT/instance app,
  // sehingga invalidatePackageAndSurveyReadCache() yang dipanggil saat admin
  // melakukan post/unpost HANYA membersihkan cache di perangkat admin —
  // perangkat surveyor lain tetap menyimpan cache lama hingga 5 menit,
  // sehingga status kunci "Survei Selesai" tidak langsung terbuka kembali di
  // sisi surveyor walau admin sudah membatalkan posting paket. Query yang
  // menyertakan packageId dipakai untuk pemeriksaan status kunci paket
  // (mis. PackageDetailScreen/PackageDataScreen) yang harus selalu akurat,
  // jadi TTL-nya dipersingkat jauh (10 detik) supaya perubahan status oleh
  // admin cepat terlihat oleh surveyor lain tanpa harus menunggu cache lama
  // kedaluwarsa, sambil tetap mengurangi request berulang dalam waktu sangat
  // singkat (navigasi cepat bolak-balik dalam 1 layar yang sama).
  const ttlMs = packageId ? 10000 : 300000;
  return fetchWithCache(cacheKey, ttlMs, async () => {
    const params = new URLSearchParams({ action: 'list', sessionToken: token ?? '' });
    if (infrastructureType) params.set('infrastructureType', infrastructureType);
    if (packageId) params.set('packageId', packageId);
    const response = await fetchWithRetry(`${CONFIG.GAS_WEB_APP_URL}?${params.toString()}`);
    if (!response.ok) throw new Error(`Server merespons dengan status ${response.status}`);
    const json: ApiResponse = await response.json();
    if (!json.success) throw new Error(json.message || 'Gagal mengambil data survei.');
    return json.data || [];
  });
}

export async function updateSurvey(params: {
  infrastructureType: string;
  surveyId: string;
  username?: string;
  packageName?: string;
  surveyorName?: string;
  locationNote?: string;
  kecamatan?: string;
  desaKelurahan?: string;
  kodeDesaKelurahan?: string;
  latitude?: number | null;
  longitude?: number | null;
  accuracy?: number | null;
  surveyMode?: string;
  modeData?: Record<string, any>;
  existingPhotos?: string[];
  newPhotos?: { base64: string; mimeType: string; fileName: string }[];
  detailKey: string;
  detail: Record<string, any>;
}): Promise<ApiResponse> {
  const body = await authBody({
    action: 'update',
    infrastructureType: params.infrastructureType,
    surveyId: params.surveyId,
    username: params.username,
    packageName: params.packageName,
    surveyorName: params.surveyorName,
    locationNote: params.locationNote,
    kecamatan: params.kecamatan,
    desaKelurahan: params.desaKelurahan,
    kodeDesaKelurahan: params.kodeDesaKelurahan,
    latitude: params.latitude,
    longitude: params.longitude,
    accuracy: params.accuracy,
    surveyMode: params.surveyMode,
    modeData: params.modeData,
    existingPhotos: params.existingPhotos,
    newPhotos: params.newPhotos,
    [params.detailKey]: params.detail,
  });
  return post(body);
}


export interface UpdateSegmentsParams {
  infrastructureType: string;
  itemId?: string;
  username?: string;
  packageName?: string;
  surveyorName?: string;
  locationNote?: string;
  kecamatan?: string;
  desaKelurahan?: string;
  kodeDesaKelurahan?: string;
  latitude?: number | null;
  longitude?: number | null;
  accuracy?: number | null;
  surveyMode?: string;
  modeData?: Record<string, any>;
  existingPhotos?: string[];
  newPhotos?: { base64: string; mimeType: string; fileName: string }[];
  segments: { surveyId?: string; detail: Record<string, any>; modeData?: Record<string, any> }[];
}

/**
 * Mengedit SEMUA segmen STA (Jalan/Drainase/TPT) milik satu item pekerjaan
 * sekaligus, agar layar edit bisa menampilkan & mengurutkan seluruh segmen
 * seperti saat input data baru (WorkItemFormScreen), termasuk menambah &
 * menghapus segmen. Lihat handleUpdateSegments di Code.gs.
 */
export async function updateSurveySegments(params: UpdateSegmentsParams): Promise<ApiResponse> {
  const body = await authBody({
    action: 'updateSegments',
    infrastructureType: params.infrastructureType,
    itemId: params.itemId,
    username: params.username,
    packageName: params.packageName,
    surveyorName: params.surveyorName,
    locationNote: params.locationNote,
    kecamatan: params.kecamatan,
    desaKelurahan: params.desaKelurahan,
    kodeDesaKelurahan: params.kodeDesaKelurahan,
    latitude: params.latitude,
    longitude: params.longitude,
    accuracy: params.accuracy,
    surveyMode: params.surveyMode,
    modeData: params.modeData,
    existingPhotos: params.existingPhotos,
    newPhotos: params.newPhotos,
    segments: params.segments,
  });
  return post(body);
}


export async function deleteSurvey(infrastructureType: string, surveyId: string, username?: string): Promise<ApiResponse> {
  return post(await authBody({ action: 'delete', infrastructureType, surveyId, username }));
}

export async function postSurvey(infrastructureType: string, surveyId: string, username?: string): Promise<ApiResponse> {
  return post(await authBody({ action: 'post', infrastructureType, surveyId, username }));
}

export async function unpostSurvey(infrastructureType: string, surveyId: string, username?: string): Promise<ApiResponse> {
  return post(await authBody({ action: 'unpost', infrastructureType, surveyId, username }));
}

export async function postPackage(packageId: string, username?: string): Promise<ApiResponse> {
  return post(await authBody({ action: 'postPackage', packageId, username }));
}

export async function unpostPackage(packageId: string, username?: string): Promise<ApiResponse> {
  return post(await authBody({ action: 'unpostPackage', packageId, username }));
}

export async function renamePackage(
  packageId: string,
  packageName: string,
  username?: string,
  kecamatan?: string,
  desaKelurahan?: string,
  packageLatitude?: number,
  packageLongitude?: number,
): Promise<ApiResponse> {
  return post(await authBody({ action: 'renamePackage', packageId, packageName, username, kecamatan, desaKelurahan, packageLatitude, packageLongitude }));
}

/**
 * Menandai (atau membatalkan tanda) sebuah paket pekerjaan sebagai "Sudah
 * Dilaksanakan" di lapangan. Hanya admin yang diizinkan (lihat
 * handleSetPackageExecuted di Code.gs). Status ini terpisah dari status
 * "Diposting"/"Survei Selesai" yang sudah ada.
 */
export async function setPackageExecuted(packageId: string, executed: boolean, username?: string): Promise<ApiResponse> {
  return post(await authBody({ action: 'setPackageExecuted', packageId, executed, username }));
}

export async function deletePackageOnServer(packageId: string, username?: string): Promise<ApiResponse> {
  return post(await authBody({ action: 'deletePackage', packageId, username }));
}

export async function listUsers(adminUsername: string): Promise<ManagedUser[]> {
  const json = await post(await authBody({ action: 'listUsers', username: adminUsername }));
  return json.users || [];
}

export async function createUser(params: {
  adminUsername: string;
  newUsername: string;
  newPassword: string;
  newName: string;
  newRole: 'admin' | 'user' | 'viewer';

  newPermissions?: Partial<UserPermissions>;
  newAllowedTypes?: string[] | null;
}): Promise<ApiResponse> {
  return post(await authBody({
    action: 'createUser',
    username: params.adminUsername,
    newUsername: params.newUsername,
    newPassword: params.newPassword,
    newName: params.newName,
    newRole: params.newRole,
    newPermissions: params.newPermissions,
    newAllowedTypes: params.newAllowedTypes,
  }));
}

export async function updateUser(params: {
  adminUsername: string;
  targetUsername: string;
  newName?: string;
  newRole?: 'admin' | 'user' | 'viewer';

  newPassword?: string;
  newPermissions?: Partial<UserPermissions>;
  newAllowedTypes?: string[] | null;
}): Promise<ApiResponse> {
  return post(await authBody({
    action: 'updateUser',
    username: params.adminUsername,
    targetUsername: params.targetUsername,
    newName: params.newName,
    newRole: params.newRole,
    newPassword: params.newPassword,
    newPermissions: params.newPermissions,
    newAllowedTypes: params.newAllowedTypes,
  }));
}

export async function deleteUser(adminUsername: string, targetUsername: string): Promise<ApiResponse> {
  return post(await authBody({ action: 'deleteUser', username: adminUsername, targetUsername }));
}

export async function deleteAllData(adminUsername: string): Promise<ApiResponse> {
  return post(await authBody({ action: 'deleteAllData', username: adminUsername }));
}

export async function listInfraTypes(): Promise<{ staticTypes: string[]; dynamicTypes: { name: string; sheetName: string }[] }> {
  const token = await getSessionToken();
  const params = new URLSearchParams({ action: 'listInfraTypes', sessionToken: token ?? '' });
  const response = await fetchWithRetry(`${CONFIG.GAS_WEB_APP_URL}?${params.toString()}`);
  if (!response.ok) throw new Error(`Server merespons dengan status ${response.status}`);
  const json: ApiResponse = await response.json();
  if (!json.success) throw new Error(json.message || 'Gagal mengambil daftar infrastruktur.');
  return {
    staticTypes: json.staticTypes || [],
    dynamicTypes: json.dynamicTypes || (json.infraTypes || []).map((name: string) => ({ name, sheetName: name })),
  };
}

export async function addInfraType(typeName: string): Promise<ApiResponse> {
  return post(await authBody({ action: 'addInfraType', typeName }));
}

export async function deleteInfraType(typeName: string): Promise<ApiResponse> {
  return post(await authBody({ action: 'deleteInfraType', typeName }));
}

export async function updateAllowedTypes(targetUsername: string, allowedTypes: string[] | null): Promise<ApiResponse> {
  return post(await authBody({ action: 'updateAllowedTypes', targetUsername, allowedTypes }));
}

export interface ServerPackage {
  packageId: string;
  packageName: string;
  createdBy: string;
  createdAt: string;
  packageLatitude?: number;
  packageLongitude?: number;
  /** true jika paket ini sudah ditandai admin sebagai "Sudah Dilaksanakan" di lapangan. */
  executed?: boolean;
  executedAt?: string;
}

export async function createPackage(
  packageName: string,
  packageId?: string,
  kecamatan?: string,
  desaKelurahan?: string,
  packageLatitude?: number,
  packageLongitude?: number,
): Promise<ApiResponse & { packageId?: string }> {
  return post(await authBody({ action: 'createPackage', packageName, packageId, kecamatan, desaKelurahan, packageLatitude, packageLongitude }));
}

export async function listPackages(): Promise<ServerPackage[]> {
  const token = await getSessionToken();
  const cacheKey = `listPackages:${token ?? 'guest'}`;
  // TTL diperpanjang ke 300s (samakan dengan fetchSurveyList) karena cache ini
  // sudah otomatis dihapus (invalidatePackageAndSurveyReadCache) setiap ada
  // aksi tulis (create/rename/delete/post/unpost paket atau survei), sehingga
  // memperpanjang TTL murni mempercepat navigasi berulang tanpa membuat data
  // basi ditampilkan.
  return fetchWithCache(cacheKey, 300000, async () => {
    const params = new URLSearchParams({ action: 'listPackages', sessionToken: token ?? '' });
    const response = await fetchWithRetry(`${CONFIG.GAS_WEB_APP_URL}?${params.toString()}`);
    if (!response.ok) throw new Error(`Server merespons dengan status ${response.status}`);
    const json: ApiResponse = await response.json();
    if (!json.success) throw new Error(json.message || 'Gagal mengambil daftar paket pekerjaan.');
    return (json as any).packages || [];
  });
}

// ===================== AKSES PUBLIK (TANPA LOGIN, HANYA BACA) =====================
// Fungsi-fungsi berikut TIDAK mengirim sessionToken sama sekali dan hanya
// memanggil action publik di server (publicListPackages/publicList) yang
// murni membaca data. Dipakai oleh alur "Lihat sebagai Publik" agar
// masyarakat umum bisa melihat data survei tanpa perlu login, dan tanpa
// kemungkinan mengubah data apa pun (tidak ada fungsi tulis yang dipanggil).

export async function publicListPackages(): Promise<ServerPackage[]> {
  const cacheKey = 'publicListPackages';
  return fetchWithCache(cacheKey, 30000, async () => {
    const params = new URLSearchParams({ action: 'publicListPackages' });
    const response = await fetchWithRetry(`${CONFIG.GAS_WEB_APP_URL}?${params.toString()}`);
    if (!response.ok) throw new Error(`Server merespons dengan status ${response.status}`);
    const json: ApiResponse = await response.json();
    if (!json.success) throw new Error(json.message || 'Gagal mengambil daftar paket pekerjaan.');
    return (json as any).packages || [];
  });
}

export async function publicFetchSurveyList(infrastructureType?: string, packageId?: string): Promise<any[]> {
  const cacheKey = `publicFetchSurveyList:${infrastructureType ?? 'all'}:${packageId ?? 'all'}`;
  return fetchWithCache(cacheKey, 30000, async () => {
    const params = new URLSearchParams({ action: 'publicList' });
    if (infrastructureType) params.set('infrastructureType', infrastructureType);
    if (packageId) params.set('packageId', packageId);
    const response = await fetchWithRetry(`${CONFIG.GAS_WEB_APP_URL}?${params.toString()}`);
    if (!response.ok) throw new Error(`Server merespons dengan status ${response.status}`);
    const json: ApiResponse = await response.json();
    if (!json.success) throw new Error(json.message || 'Gagal mengambil data survei.');
    return json.data || [];
  });
}

export async function listWilayah(): Promise<WilayahItem[]> {
  const token = await getSessionToken();
  const cacheKey = `listWilayah:${token ?? 'guest'}`;
  return fetchWithCache(cacheKey, 60000, async () => {
    const params = new URLSearchParams({ action: 'listWilayah', sessionToken: token ?? '' });
    const response = await fetchWithRetry(`${CONFIG.GAS_WEB_APP_URL}?${params.toString()}`);
    if (!response.ok) throw new Error(`Server merespons dengan status ${response.status}`);
    const json: ApiResponse = await response.json();
    if (!json.success) throw new Error(json.message || 'Gagal mengambil daftar Kecamatan/Desa.');
    return json.wilayah || [];
  });
}

// ===================== ANOTASI PETA OFFLINE (GARIS/POLYGON) =====================
// Anotasi disimpan lokal dulu (offline-first, lihat annotationService.ts) dan
// disinkronkan ke server HANYA saat perangkat terkoneksi internet, sehingga
// tetap aman/tersimpan meskipun aplikasi di-uninstall atau berganti perangkat.

export interface ServerAnnotation {
  id: string;
  type: string;
  color: string;
  label: string;
  points: { lat: number; lng: number }[];
  createdAt: string;
}

export async function saveAnnotationToServer(params: {
  packageId: string;
  annotationId: string;
  type: string;
  color?: string;
  label?: string;
  points: { lat: number; lng: number }[];
  createdAt?: string;
}): Promise<ApiResponse> {
  return post(await authBody({
    action: 'saveAnnotation',
    packageId: params.packageId,
    annotationId: params.annotationId,
    type: params.type,
    color: params.color,
    label: params.label,
    points: params.points,
    createdAt: params.createdAt,
  }));
}

export async function deleteAnnotationFromServer(packageId: string, annotationId: string): Promise<ApiResponse> {
  return post(await authBody({ action: 'deleteAnnotation', packageId, annotationId }));
}

export async function listAnnotationsFromServer(packageId: string): Promise<ServerAnnotation[]> {
  const token = await getSessionToken();
  const params = new URLSearchParams({ action: 'listAnnotations', sessionToken: token ?? '', packageId });
  const response = await fetchWithRetry(`${CONFIG.GAS_WEB_APP_URL}?${params.toString()}`);
  if (!response.ok) throw new Error(`Server merespons dengan status ${response.status}`);
  const json: ApiResponse = await response.json();
  if (!json.success) throw new Error(json.message || 'Gagal mengambil anotasi peta.');
  return (json as any).annotations || [];
}

/** Versi PUBLIK (tanpa sessionToken) dari `listAnnotationsFromServer`, dipakai
 * oleh akun Viewer/publik saat melihat peta lokasi. Diperlukan karena
 * MapScreen sebelumnya SELALU memakai action 'listAnnotations' yang
 * mewajibkan sesi login valid; jika sesi Viewer sudah kedaluwarsa (yang
 * mudah terjadi karena layar-layar publik lain tidak pernah memvalidasi
 * sesi), permintaan anotasi gagal diam-diam sehingga anotasi tidak pernah
 * muncul di peta untuk akun Viewer. Server hanya mengembalikan anotasi milik
 * paket yang SUDAH DIPOSTING seluruhnya (lihat action 'publicListAnnotations'
 * di Code.gs), konsisten dengan pembatasan akses publik lainnya. */
export async function publicListAnnotationsFromServer(packageId: string): Promise<ServerAnnotation[]> {
  const params = new URLSearchParams({ action: 'publicListAnnotations', packageId });
  const response = await fetchWithRetry(`${CONFIG.GAS_WEB_APP_URL}?${params.toString()}`);
  if (!response.ok) throw new Error(`Server merespons dengan status ${response.status}`);
  const json: ApiResponse = await response.json();
  if (!json.success) throw new Error(json.message || 'Gagal mengambil anotasi peta.');
  return (json as any).annotations || [];
}


// ===================== PROPOSAL PEKERJAAN =====================
// Fitur untuk mengunggah, menampilkan, dan menghapus dokumen proposal/RAB
// (biasanya PDF) yang terkait dengan sebuah Paket Pekerjaan. File fisik
// disimpan di Google Drive oleh server (lihat handleUploadProposal di
// Code.gs); di sini hanya mengirim base64 dan menerima metadata/URL-nya.

export async function uploadProposalToServer(params: {
  packageId: string;
  fileName: string;
  mimeType: string;
  base64: string;
}): Promise<ApiResponse & { proposal?: ProposalDocument }> {
  return post(await authBody({
    action: 'uploadProposal',
    packageId: params.packageId,
    file: {
      fileName: params.fileName,
      mimeType: params.mimeType,
      base64: params.base64,
    },
  })) as Promise<ApiResponse & { proposal?: ProposalDocument }>;
}

export async function deleteProposalFromServer(proposalId: string): Promise<ApiResponse> {
  return post(await authBody({ action: 'deleteProposal', proposalId }));
}

export async function listProposalsFromServer(packageId?: string): Promise<ProposalDocument[]> {
  const token = await getSessionToken();
  const params = new URLSearchParams({ action: 'listProposals', sessionToken: token ?? '', packageId: packageId || '' });
  const response = await fetchWithRetry(`${CONFIG.GAS_WEB_APP_URL}?${params.toString()}`);
  if (!response.ok) throw new Error(`Server merespons dengan status ${response.status}`);
  const json: ApiResponse = await response.json();
  if (!json.success) throw new Error(json.message || 'Gagal mengambil daftar proposal.');
  return (json as any).proposals || [];
}

/** Versi PUBLIK (tanpa sessionToken), dipakai oleh akun Viewer/publik untuk
 * melihat proposal paket yang sudah diposting (lihat 'publicListProposals'
 * di Code.gs). */
export async function publicListProposalsFromServer(packageId: string): Promise<ProposalDocument[]> {
  const params = new URLSearchParams({ action: 'publicListProposals', packageId });
  const response = await fetchWithRetry(`${CONFIG.GAS_WEB_APP_URL}?${params.toString()}`);
  if (!response.ok) throw new Error(`Server merespons dengan status ${response.status}`);
  const json: ApiResponse = await response.json();
  if (!json.success) throw new Error(json.message || 'Gagal mengambil daftar proposal.');
  return (json as any).proposals || [];
}




