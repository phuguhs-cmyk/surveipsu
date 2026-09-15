import AsyncStorage from '@react-native-async-storage/async-storage';
import { CONFIG } from '../config';
import { safeJsonParse, parseCoordinate } from './commonUtils';
import { isOnline } from './queueService';
import { saveAnnotationToServer, deleteAnnotationFromServer, listAnnotationsFromServer } from './apiService';

/** Satu titik koordinat (lat/lng) penyusun sebuah garis atau polygon. */
export interface AnnotationPoint {
  lat: number;
  lng: number;
}

/** Satu anotasi (garis atau polygon) yang digambar surveyor di atas peta. */
export interface MapAnnotation {
  id: string;
  type: 'polyline' | 'polygon';
  points: AnnotationPoint[];
  color: string;
  label?: string;
  createdAt: string;
}

const STORAGE_KEY = CONFIG.STORAGE_KEYS.MAP_ANNOTATIONS;

function normalizeAnnotationPoint(point: any): AnnotationPoint | null {
  if (!point || typeof point !== 'object') return null;
  const lat = parseCoordinate(point.lat);
  const lng = parseCoordinate(point.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat: lat as number, lng: lng as number };
}

function normalizeAnnotationPoints(points: unknown): AnnotationPoint[] {
  if (!Array.isArray(points)) return [];
  const normalized = points
    .map((point) => normalizeAnnotationPoint(point))
    .filter((point): point is AnnotationPoint => point !== null);
  return normalized;
}

function normalizeAnnotation(annotation: any): MapAnnotation | null {
  if (!annotation || typeof annotation !== 'object') return null;
  const normalizedPoints = normalizeAnnotationPoints(annotation.points);
  if (normalizedPoints.length === 0) return null;
  return {
    id: String(annotation.id || `annotation-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`),
    type: annotation.type === 'polygon' ? 'polygon' : 'polyline',
    points: normalizedPoints,
    color: String(annotation.color || '#ef4444'),
    label: annotation.label ? String(annotation.label) : undefined,
    createdAt: annotation.createdAt || new Date().toISOString(),
  };
}

/**
 * OPTIMASI: Anotasi dulunya disimpan sebagai SATU objek besar berisi anotasi
 * SEMUA paket dalam satu key AsyncStorage (`STORAGE_KEY`). Ini berarti setiap
 * kali menambah/menghapus/mengubah SATU anotasi di SATU paket, seluruh data
 * anotasi semua paket lain ikut di-parse & ditulis ulang — sama seperti
 * masalah "Row too big to fit into CursorWindow" yang sudah pernah diperbaiki
 * di queueService.ts. Semakin banyak paket & anotasi tersimpan di perangkat,
 * semakin lambat & semakin berisiko setiap operasi anotasi menjadi.
 *
 * Sekarang setiap paket memiliki KEY TERPISAH (`${STORAGE_KEY}/pkg/{packageId}`),
 * sehingga operasi baca/tulis anotasi satu paket tidak lagi menyentuh data
 * paket lain sama sekali. Data lama (format objek besar) dimigrasikan secara
 * otomatis & transparan saat pertama kali diakses.
 */
function packageAnnotationsKey(packageId: string): string {
  return `${STORAGE_KEY}/pkg/${packageId}`;
}

let migrationPromise: Promise<void> | null = null;

/** Memindahkan data lama (jika ada) dari format satu-key-besar ke format
 * per-paket. Idempotent & aman dipanggil berkali-kali (hanya migrasi sekali
 * per siklus hidup proses berkat `migrationPromise`). */
function migrateLegacyStoreIfNeeded(): Promise<void> {
  if (migrationPromise) return migrationPromise;
  migrationPromise = (async () => {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = safeJsonParse<Record<string, MapAnnotation[]> | null>(raw, null);
    if (parsed && typeof parsed === 'object') {
      const entries = Object.entries(parsed);
      await Promise.all(
        entries.map(([pkgId, annotations]) =>
          AsyncStorage.setItem(packageAnnotationsKey(pkgId), JSON.stringify(annotations || []))
        )
      );
    }
    // Hapus key lama supaya tidak dimigrasikan berulang & tidak menyimpan
    // data ganda (data yang sama kini hidup di key per-paket).
    await AsyncStorage.removeItem(STORAGE_KEY);
  })();
  return migrationPromise;
}

/** Mengambil seluruh anotasi (garis/polygon) yang tersimpan untuk sebuah paket. */
export async function getPackageAnnotations(packageId: string): Promise<MapAnnotation[]> {
  await migrateLegacyStoreIfNeeded();
  const raw = await AsyncStorage.getItem(packageAnnotationsKey(packageId));
  const parsed = safeJsonParse<any[]>(raw, []);
  const normalized = (Array.isArray(parsed) ? parsed : [])
    .map((annotation) => normalizeAnnotation(annotation))
    .filter((annotation): annotation is MapAnnotation => annotation !== null);
  return normalized;
}

/** Menyimpan (menimpa) seluruh daftar anotasi milik sebuah paket. */
export async function savePackageAnnotations(packageId: string, annotations: MapAnnotation[]): Promise<void> {
  await migrateLegacyStoreIfNeeded();
  const normalized = (annotations || [])
    .map((annotation) => normalizeAnnotation(annotation))
    .filter((annotation): annotation is MapAnnotation => annotation !== null);
  await AsyncStorage.setItem(packageAnnotationsKey(packageId), JSON.stringify(normalized));
}

/** Menambahkan satu anotasi baru ke paket, mengembalikan daftar lengkap terbaru.
 * Anotasi selalu disimpan lokal dulu (offline-first) agar UI langsung
 * responsif dan tetap berfungsi tanpa koneksi internet; jika perangkat
 * sedang online, anotasi JUGA dikirim ke server (best-effort) supaya tidak
 * hilang jika aplikasi di-uninstall/berganti perangkat. Kegagalan kirim ke
 * server (mis. sedang offline) diabaikan — data lokal tetap menjadi sumber
 * kebenaran utama di perangkat ini. */
export async function addPackageAnnotation(
  packageId: string,
  annotation: MapAnnotation
): Promise<MapAnnotation[]> {
  const current = await getPackageAnnotations(packageId);
  const updated = [...current, annotation];
  await savePackageAnnotations(packageId, updated);
  syncAnnotationToServer(packageId, annotation);
  return updated;
}

export function pickPreferredSegmentLocationLabel(
  candidateLabels: Array<string | undefined>,
  fallbackLabel?: string
): string | undefined {
  const normalized = candidateLabels
    .map((value) => String(value ?? '').trim())
    .filter((text) => text.length > 0 && text !== 'undefined');

  if (normalized.length === 0) {
    const fallback = String(fallbackLabel ?? '').trim();
    return fallback.length > 0 && fallback !== 'undefined' ? fallback : undefined;
  }

  const counts = new Map<string, number>();
  normalized.forEach((label) => {
    counts.set(label, (counts.get(label) ?? 0) + 1);
  });

  const [winner] = Array.from(counts.entries()).sort((a, b) => {
    if (b[1] !== a[1]) return b[1] - a[1];
    return a[0].localeCompare(b[0]);
  })[0] ?? [];

  return winner || undefined;
}

export function getLocationLabelChoices(
  surveyLocations: Array<{ locationNote?: string }>,
  fallbackLabel?: string
): string[] {
  const counts = new Map<string, number>();
  const firstSeenOrder: string[] = [];

  surveyLocations.forEach((location) => {
    const label = String(location.locationNote ?? '').trim();
    if (!label || label === 'undefined') return;
    if (!counts.has(label)) {
      firstSeenOrder.push(label);
    }
    counts.set(label, (counts.get(label) ?? 0) + 1);
  });

  const fallback = String(fallbackLabel ?? '').trim();
  if (fallback && fallback !== 'undefined' && !counts.has(fallback)) {
    firstSeenOrder.push(fallback);
    counts.set(fallback, 1);
  }

  return Array.from(counts.entries())
    .sort((a, b) => {
      if (b[1] !== a[1]) return b[1] - a[1];
      const aOrder = firstSeenOrder.indexOf(a[0]);
      const bOrder = firstSeenOrder.indexOf(b[0]);
      if (aOrder !== bOrder) return aOrder - bOrder;
      return a[0].localeCompare(b[0]);
    })
    .map(([label]) => label);
}

export function buildAnnotationLabelFromSegment(
  annotationLabel?: string,
  fallbackLabel?: string,
  detailLabel?: string
): string | undefined {
  const candidates = [annotationLabel, detailLabel, fallbackLabel].map((value) => String(value ?? '').trim());
  return pickPreferredSegmentLocationLabel(candidates, fallbackLabel);
}

/** Menghapus satu anotasi berdasarkan id, mengembalikan daftar lengkap terbaru.
 * Sama seperti penambahan, penghapusan di server dilakukan best-effort saat
 * online; jika gagal/offline, anotasi tetap terhapus secara lokal. */
export async function removePackageAnnotation(packageId: string, annotationId: string): Promise<MapAnnotation[]> {
  const current = await getPackageAnnotations(packageId);
  const updated = current.filter((a) => a.id !== annotationId);
  await savePackageAnnotations(packageId, updated);
  if (await isOnline()) {
    deleteAnnotationFromServer(packageId, annotationId).catch(() => {
      // Gagal mengirim ke server (mis. offline/tidak terjangkau): abaikan,
      // penghapusan lokal tetap berlaku di perangkat ini.
    });
  }
  return updated;
}

/** Memperbarui label/keterangan sebuah anotasi yang sudah ada, mengembalikan
 * daftar lengkap terbaru. Sama seperti operasi lain, perubahan disimpan
 * lokal dulu (offline-first) lalu disinkronkan ke server secara
 * best-effort saat online (mengirim ulang seluruh data anotasi dengan id
 * yang sama sehingga server menimpa baris yang sudah ada). */
export async function updatePackageAnnotationLabel(
  packageId: string,
  annotationId: string,
  label: string
): Promise<MapAnnotation[]> {
  const current = await getPackageAnnotations(packageId);
  const updated = current.map((a) => (a.id === annotationId ? { ...a, label } : a));
  await savePackageAnnotations(packageId, updated);
  const target = updated.find((a) => a.id === annotationId);
  if (target) {
    syncAnnotationToServer(packageId, target);
  }
  return updated;
}

/** Mengirim satu anotasi ke server jika perangkat sedang online. Dipanggil
 * secara "fire-and-forget" (tidak menunggu/tidak menggagalkan alur simpan
 * lokal) agar UI tetap responsif. */
async function syncAnnotationToServer(packageId: string, annotation: MapAnnotation): Promise<void> {
  try {
    if (!(await isOnline())) return;
    await saveAnnotationToServer({
      packageId,
      annotationId: annotation.id,
      type: annotation.type,
      color: annotation.color,
      label: annotation.label,
      points: annotation.points,
      createdAt: annotation.createdAt,
    });
  } catch {
    // Gagal mengirim ke server: abaikan, data tetap tersimpan lokal dan
    // bisa disinkronkan lagi nanti lewat syncPackageAnnotationsFromServer.
  }
}

/** Mengambil anotasi dari server dan menggabungkannya (merge) dengan daftar
 * lokal, supaya anotasi yang dibuat dari perangkat lain (atau sebelum
 * fitur sinkronisasi ini ada) ikut muncul. Dipanggil saat OfflineMapScreen
 * dibuka. Anotasi lokal yang belum ada di server (mis. baru dibuat saat
 * offline) tetap dipertahankan, bukan ditimpa. */
export async function syncPackageAnnotationsFromServer(packageId: string): Promise<MapAnnotation[]> {
  try {
    const serverAnnotations = await listAnnotationsFromServer(packageId);
    const current = await getPackageAnnotations(packageId);
    const byId = new Map(current.map((a) => [a.id, a]));
    serverAnnotations.forEach((sa) => {
      const normalized = normalizeAnnotation(sa);
      if (!normalized) return;
      if (!byId.has(normalized.id)) {
        byId.set(normalized.id, normalized);
      }
    });
    const merged = Array.from(byId.values());
    await savePackageAnnotations(packageId, merged);
    return merged;
  } catch {
    // Gagal sync (mis. offline): abaikan, daftar lokal tetap dipakai.
    return getPackageAnnotations(packageId);
  }
}

