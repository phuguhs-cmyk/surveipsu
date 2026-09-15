import AsyncStorage from '@react-native-async-storage/async-storage';
import { CONFIG } from '../config';
import { createPackage as createPackageOnServer, listPackages as listPackagesFromServer, renamePackage as renamePackageOnServer, deletePackageOnServer } from './apiService';
import { safeJsonParse, parseCoordinate } from './commonUtils';

/**
 * Layanan untuk mengelola daftar Paket Pekerjaan. Sejak sheet `Packages`
 * ditambahkan di server (Google Sheets), server menjadi sumber kebenaran
 * (single source of truth) untuk daftar paket. Penyimpanan lokal
 * (AsyncStorage) tetap dipakai sebagai cache/antrian offline: jika
 * pembuatan paket gagal terkirim ke server (mis. sedang offline), paket
 * tetap tersimpan secara lokal dan bisa langsung dipakai; ID paket yang
 * sama akan otomatis terdaftar ke server saat item pekerjaan pertama
 * berhasil dikirim (lihat `ensurePackageRegistered` di Code.gs).
 *
 * Satu paket bisa berisi banyak item pekerjaan dengan jenis infrastruktur
 * berbeda-beda (Jalan, Drainase, TPT, Gorong-gorong, Jembatan, dsb), yang
 * masing-masing disurvei terpisah lewat WorkItemFormScreen dan dikirim ke
 * server sebagai baris tersendiri.
 */

export type PackageStatus = 'draft' | 'in_progress' | 'posted';

export function derivePackageStatus(params: { itemCount: number; isPosted: boolean }): PackageStatus {
  if (params.isPosted) return 'posted';
  if ((params.itemCount || 0) > 0) return 'in_progress';
  return 'draft';
}

export interface WorkPackage {
  id: string;
  name: string;
  createdAt: string;
  surveyorName: string;
  kecamatan?: string;
  desaKelurahan?: string;
  latitude?: number;
  longitude?: number;
  status?: PackageStatus;
  /** Wilayah kerja offline yang dipakai untuk peta paket ini. */
  offlineMapArea?: {
    minLat: number;
    minLng: number;
    maxLat: number;
    maxLng: number;
  };
  /** Nama area/map cache yang sedang dipakai untuk map offline. */
  offlineMapAreaName?: string;
  /** Status peta offline terkini. */
  offlineMapStatus?: 'not_started' | 'downloading' | 'ready' | 'failed';
  /** Lokasi file lokal map offline jika sudah diunduh. */
  offlineMapFilePath?: string;
  /** Jumlah item pekerjaan yang sudah ditambahkan (untuk ditampilkan di daftar). */
  itemCount: number;
  /**
   * Jenis-jenis pekerjaan/infrastruktur yang relevan untuk paket ini,
   * dipilih surveyor saat membuat paket. Jika kosong/undefined (paket
   * lama sebelum fitur ini ada), semua jenis bawaan tetap ditampilkan
   * sebagai fallback di PackageDetailScreen.
   */
  allowedInfraTypes?: string[];
  /**
   * true jika SEMUA data survei di paket ini sudah berstatus "Diposting".
   * Paket yang sudah diposting tidak boleh diubah nama/dihapus lagi
   * (lihat handleRenamePackage/handleDeletePackage di Code.gs).
   */
  posted?: boolean;
}


let packagesCache: WorkPackage[] | null = null;
let packagesSortedCache: WorkPackage[] | null = null;
let packagesSortedCacheTime = 0;
let packagesReadPromise: Promise<WorkPackage[]> | null = null;

// Cache in-memory sorted packages untuk 500ms supaya multiple calls dalam
// interval pendek (mis. PackageListScreen buka → trigger multiple getPackages)
// tidak perlu re-sort. TTL pendek (500ms) supaya perubahan di async operation
// tetap reflect cepat.
const SORTED_CACHE_TTL_MS = 500;

async function readPackages(): Promise<WorkPackage[]> {
  if (packagesReadPromise) {
    return packagesReadPromise;
  }

  packagesReadPromise = (async () => {
    // Selalu bersihkan cache in-memory secara eksplisit sebelum memuat data
    // terkini dari AsyncStorage agar paket yang sudah dihapus/di-refresh tidak
    // tetap tampil dari cache lama di proses yang sama.
    packagesCache = null;
    packagesSortedCache = null;
    packagesSortedCacheTime = 0;

    const raw = await AsyncStorage.getItem(CONFIG.STORAGE_KEYS.PACKAGES);
    if (raw === null) {
      packagesCache = [];
      packagesSortedCache = [];
      packagesSortedCacheTime = 0;
      return [];
    }
    const parsed = safeJsonParse<WorkPackage[] | null>(raw, null);
    const normalized = Array.isArray(parsed) ? parsed : [];
    packagesCache = normalized;
    return normalized; // Jangan copy: langsung return normalized (cache akan dikopy di caller jika perlu)
  })().finally(() => {
    packagesReadPromise = null;
  });

  return packagesReadPromise;
}

async function writePackages(packages: WorkPackage[]): Promise<void> {
  packagesCache = packages;
  packagesSortedCache = null; // Invalidate sorted cache saat write
  packagesSortedCacheTime = 0;
  await AsyncStorage.setItem(CONFIG.STORAGE_KEYS.PACKAGES, JSON.stringify(packages));
}

export async function getPackages(): Promise<WorkPackage[]> {
  const packages = await readPackages();

  // Cek sorted cache: jika masih fresh, gunakan cache daripada re-sort
  const now = Date.now();
  if (packagesSortedCache && (now - packagesSortedCacheTime) < SORTED_CACHE_TTL_MS) {
    return packagesSortedCache;
  }
  
  // Sort dan cache hasilnya untuk 500ms
  const sorted = packages.length > 0 
    ? [...packages].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    : [];
  
  packagesSortedCache = sorted;
  packagesSortedCacheTime = now;
  
  return sorted;
}

export async function getPackageById(id: string): Promise<WorkPackage | undefined> {
  // Jangan gunakan getPackages() di sini (karena it will re-sort).
  // Langsung readPackages() untuk find by ID (sorting tidak diperlukan).
  const packages = await readPackages();
  return packages.find((p) => p.id === id);
}

/**
 * Membuat paket baru. Mengutamakan pembuatan di server (agar ID paket
 * konsisten dan terdaftar untuk semua perangkat), dengan fallback membuat
 * ID secara lokal jika server tidak terjangkau (mode offline). Paket tetap
 * disimpan secara lokal di kedua kasus supaya UI langsung responsif.
 */
export async function createPackage(
  name: string,
  surveyorName: string,
  allowedInfraTypes?: string[],
  kecamatan?: string,
  desaKelurahan?: string,
  latitude?: number,
  longitude?: number,
): Promise<WorkPackage> {
  const trimmedName = name.trim();
  const normalizedKecamatan = kecamatan?.trim().toLowerCase() || '';
  const normalizedDesa = desaKelurahan?.trim().toLowerCase() || '';
  const packages = await readPackages();

  const existingIndex = packages.findIndex((pkg) => {
    const sameName = (pkg.name || '').trim().toLowerCase() === trimmedName.toLowerCase();
    const sameSurveyor = (pkg.surveyorName || '').trim().toLowerCase() === (surveyorName || '').trim().toLowerCase();
    const sameKecamatan = !normalizedKecamatan || (pkg.kecamatan || '').trim().toLowerCase() === normalizedKecamatan;
    const sameDesa = !normalizedDesa || (pkg.desaKelurahan || '').trim().toLowerCase() === normalizedDesa;
    return sameName && sameSurveyor && sameKecamatan && sameDesa;
  });

  if (existingIndex !== -1) {
    const existing = packages[existingIndex];
    const nextPackage = {
      ...existing,
      latitude: Number.isFinite(latitude) ? latitude : existing.latitude,
      longitude: Number.isFinite(longitude) ? longitude : existing.longitude,
      allowedInfraTypes: allowedInfraTypes && allowedInfraTypes.length > 0 ? allowedInfraTypes : existing.allowedInfraTypes,
      kecamatan: kecamatan?.trim() || existing.kecamatan,
      desaKelurahan: desaKelurahan?.trim() || existing.desaKelurahan,
      surveyorName: existing.surveyorName || surveyorName,
    };
    packages[existingIndex] = nextPackage;
    await writePackages(packages);
    return nextPackage;
  }

  const packageId = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const defaultMapArea = {
    minLat: -7.45,
    minLng: 109.2,
    maxLat: -7.18,
    maxLng: 109.9,
  };

  const newPackage: WorkPackage = {
    id: packageId,
    name: trimmedName,
    createdAt: new Date().toISOString(),
    surveyorName,
    kecamatan: kecamatan?.trim() || undefined,
    desaKelurahan: desaKelurahan?.trim() || undefined,
    latitude: Number.isFinite(latitude) ? latitude : undefined,
    longitude: Number.isFinite(longitude) ? longitude : undefined,
    offlineMapArea: defaultMapArea,
    offlineMapAreaName: kecamatan?.trim() || desaKelurahan?.trim() || 'Area Survei',
    offlineMapStatus: 'not_started',
    itemCount: 0,
    allowedInfraTypes: allowedInfraTypes && allowedInfraTypes.length > 0 ? allowedInfraTypes : undefined,
  };
  packages.push(newPackage);
  await writePackages(packages);

  // Jangan menunggu round-trip server untuk menutup UI. Proses registrasi ke
  // server dijalankan di background agar pengecekan lokal bisa selesai secepat
  // mungkin, sementara server tetap diberi ID paket yang sama agar tidak
  // tercipta duplikasi paket di sheet master `Packages`.
  void createPackageOnServer(trimmedName, packageId, kecamatan, desaKelurahan, latitude, longitude).catch(() => undefined);

  return newPackage;
}


export async function updatePackageOfflineMapFields(
  packageId: string,
  fields: Partial<Pick<WorkPackage, 'offlineMapArea' | 'offlineMapAreaName' | 'offlineMapStatus' | 'offlineMapFilePath'>>
): Promise<void> {
  const packages = await readPackages();
  const idx = packages.findIndex((p) => p.id === packageId);
  if (idx === -1) return;
  packages[idx] = {
    ...packages[idx],
    ...fields,
  };
  await writePackages(packages);
}

export async function incrementPackageItemCount(packageId: string): Promise<void> {
  const packages = await readPackages();
  const idx = packages.findIndex((p) => p.id === packageId);
  if (idx === -1) return;
  packages[idx] = { ...packages[idx], itemCount: packages[idx].itemCount + 1 };
  await writePackages(packages);
}

export async function updatePackageCenterLocation(packageId: string, latitude: number, longitude: number): Promise<void> {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return;

  const packages = await readPackages();
  const idx = packages.findIndex((p) => p.id === packageId);
  if (idx === -1) return;

  packages[idx] = {
    ...packages[idx],
    latitude,
    longitude,
  };

  await writePackages(packages);
  try {
    await renamePackageOnServer(packageId, packages[idx].name, undefined, packages[idx].kecamatan, packages[idx].desaKelurahan, latitude, longitude);
  } catch {
    // Sinkronisasi server adalah best-effort; penyimpanan lokal tetap jadi
    // sumber data utama saat offline, dan fungsi ini tidak boleh gagal karena
    // server sementara tidak tersedia.
  }
}

export interface PackageMapMarker {
  lat: number;
  lng: number;
  infrastructureType: string;
  locationNote: string;
  packageId: string;
  packageName: string;
  status?: PackageStatus;
}

export function buildPackageMapMarkers({
  packages,
}: {
  packages: WorkPackage[];
}): PackageMapMarker[] {
  return packages
    .filter((pkg) => Number.isFinite(parseCoordinate(pkg.latitude)) && Number.isFinite(parseCoordinate(pkg.longitude)))
    .map((pkg) => ({
      lat: parseCoordinate(pkg.latitude)!,
      lng: parseCoordinate(pkg.longitude)!,
      infrastructureType: 'Paket Pekerjaan',
      locationNote: pkg.name || 'Paket Pekerjaan',
      packageId: pkg.id,
      packageName: pkg.name || 'Paket Pekerjaan',
      status: derivePackageStatus({
        itemCount: pkg.itemCount || 0,
        isPosted: !!pkg.posted,
      }),
    }));
}

export async function deletePackage(packageId: string): Promise<void> {
  const packages = await readPackages();
  await writePackages(packages.filter((p) => p.id !== packageId));
}

/**
 * Mengubah daftar jenis pekerjaan (allowedInfraTypes) yang relevan untuk
 * sebuah paket yang SUDAH dibuat sebelumnya. Dipakai agar surveyor bisa
 * menambah atau mengurangi jenis pekerjaan setelah paket dibuat, tanpa
 * perlu membuat paket baru. Disimpan secara lokal saja (sama seperti saat
 * pembuatan paket) karena sheet master `Packages` di server belum
 * menyimpan kolom ini.
 */
export async function updatePackageAllowedTypes(packageId: string, allowedInfraTypes: string[]): Promise<void> {
  const packages = await readPackages();
  const idx = packages.findIndex((p) => p.id === packageId);
  if (idx === -1) return;
  packages[idx] = {
    ...packages[idx],
    allowedInfraTypes: allowedInfraTypes.length > 0 ? allowedInfraTypes : undefined,
  };
  await writePackages(packages);
}


/**
 * Mengubah nama paket pekerjaan, baik di server (jika terjangkau) maupun
 * di penyimpanan lokal. Server akan menolak permintaan ini jika paket
 * sudah diposting (lihat isPackagePosted di Code.gs), sehingga error dari
 * server tetap dilempar ke pemanggil supaya UI bisa menampilkan pesan.
 */
export async function renamePackageEverywhere(
  packageId: string,
  newName: string,
  username?: string,
  kecamatan?: string,
  desaKelurahan?: string,
  latitude?: number,
  longitude?: number,
): Promise<void> {
  const trimmed = newName.trim();
  await renamePackageOnServer(packageId, trimmed, username, kecamatan, desaKelurahan, latitude, longitude);
  const packages = await readPackages();
  const idx = packages.findIndex((p) => p.id === packageId);
  if (idx !== -1) {
    packages[idx] = {
      ...packages[idx],
      name: trimmed,
      kecamatan: kecamatan?.trim() || undefined,
      desaKelurahan: desaKelurahan?.trim() || undefined,
      latitude: Number.isFinite(latitude) ? latitude : packages[idx].latitude,
      longitude: Number.isFinite(longitude) ? longitude : packages[idx].longitude,
    };
    await writePackages(packages);
  }
}

/**
 * Menghapus paket pekerjaan secara permanen di server (beserta seluruh
 * data survei & foto terkait) dan di penyimpanan lokal. Server akan
 * menolak jika paket sudah diposting.
 */
export async function deletePackageEverywhere(packageId: string, username?: string): Promise<void> {
  await deletePackageOnServer(packageId, username);
  await deletePackage(packageId);
}


/**
 * Mengambil daftar paket dari sheet master `Packages` di server dan
 * menggabungkannya (merge) dengan daftar lokal, supaya paket yang dibuat
 * dari perangkat lain (atau sebelum sheet Packages ada) tetap terlihat.
 * Dipanggil oleh layar daftar paket (PackageListScreen) sebagai pelengkap
 * `fetchSurveyList()` yang sudah ada, bukan pengganti.
 */
export async function syncPackagesFromServer(): Promise<void> {
  try {
    const serverPackages = await listPackagesFromServer();
    if (!Array.isArray(serverPackages) || serverPackages.length === 0) return;

    const packages = await readPackages();
    const serverIds = new Set(serverPackages.map((sp) => sp.packageId).filter(Boolean));

    const merged = new Map<string, WorkPackage>();
    packages.forEach((pkg) => {
      if (serverIds.has(pkg.id)) {
        merged.set(pkg.id, pkg);
      }
    });

    serverPackages.forEach((sp) => {
      if (!merged.has(sp.packageId)) {
        merged.set(sp.packageId, {
          id: sp.packageId,
          name: sp.packageName,
          createdAt: sp.createdAt || new Date().toISOString(),
          surveyorName: sp.createdBy || '',
          latitude: Number.isFinite(parseCoordinate(sp.packageLatitude)) ? parseCoordinate(sp.packageLatitude) : undefined,
          longitude: Number.isFinite(parseCoordinate(sp.packageLongitude)) ? parseCoordinate(sp.packageLongitude) : undefined,
          itemCount: 0,
        });
      }
    });

    await writePackages(Array.from(merged.values()));
  } catch {
    // Gagal sync (mis. offline): abaikan, daftar lokal tetap dipakai.
  }
}

