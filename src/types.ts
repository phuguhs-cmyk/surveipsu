/**
 * Tipe-tipe data yang digunakan di seluruh aplikasi survei.
 */

export interface SurveyPhoto {
  uri: string;
  base64: string;
  mimeType: string;
  fileName: string;
}

/**
 * Daftar jenis infrastruktur yang bisa menjadi item pekerjaan
 * di dalam sebuah paket. Lihat juga INFRASTRUCTURE_TYPES di config.ts.
 */

/**
 * Satu segmen STA untuk infrastruktur linear (Jalan). Satu item pekerjaan
 * Jalan bisa punya banyak segmen, ditambahkan secara dinamis oleh surveyor.
 * Masing-masing segmen dikirim sebagai satu baris data ke server.
 */
export interface RoadSegment {
  id: string;
  staStart: string; // contoh: "0+000"
  staEnd: string; // contoh: "0+025"
  length: string; // panjang segmen = STA Akhir - STA Awal (m)
  roadElevationStart: string; // elevasi permukaan jalan di STA awal (m)
  roadElevationEnd: string; // elevasi permukaan jalan di STA akhir (m)
  // Lebar jalan diukur di dua titik (STA awal & STA akhir segmen) karena
  // lebar jalan bisa berubah di sepanjang segmen, sama seperti tinggi TPT.
  // Lebar STA Awal segmen berikutnya otomatis mengikuti Lebar STA Akhir
  // segmen sebelumnya (lihat WorkItemFormScreen).
  widthStart: string; // lebar jalan di STA awal (m)
  widthEnd: string; // lebar jalan di STA akhir (m)
  pavementType: string; // Aspal, Beton, dsb.
  condition: string; // Baik/Rusak Ringan/dst.
  damageLength: string; // panjang kerusakan (m)
  damageWidth: string; // lebar kerusakan (m)
  damageDepth: string; // kedalaman kerusakan (cm)
  notes: string;
}

/** Satu segmen STA untuk Drainase/Saluran Air (linear, sama seperti Jalan). */
export interface DrainageSegment {
  id: string;
  staStart: string;
  staEnd: string;
  length: string; // panjang segmen = STA Akhir - STA Awal (m)
  invertElevationStart: string; // elevasi dasar/invert saluran di STA awal (m)
  invertElevationEnd: string; // elevasi dasar/invert saluran di STA akhir (m)
  channelType: string; // Terbuka/Tertutup
  width: string; // lebar saluran (m)
  depth: string; // kedalaman/tinggi saluran (m)
  material: string; // Pasangan Batu/Beton/Tanah, dsb.
  sedimentCondition: string; // kondisi sedimentasi/penyumbatan
  condition: string;
  notes: string;
}

/**
 * Satu segmen STA untuk Dinding Penahan Tanah (DPT) - linear, sama seperti
 * Jalan/Drainase, karena tinggi & jenis konstruksi TPT bisa berubah di
 * sepanjang STA (mis. tinggi 1.5m di STA 0+000-0+010, lalu 2.2m di
 * 0+010-0+025). Satu item pekerjaan TPT bisa punya banyak segmen.
 *
 * Tinggi diukur di dua titik (STA awal & STA akhir segmen) karena tinggi
 * TPT umumnya berubah mengikuti kemiringan tanah di sepanjang segmen,
 * contoh: STA 0+000 - 0+020, tinggi di STA 0+000 = 1,2 m dan tinggi di
 * STA 0+020 = 1,8 m. Lebar atas & lebar bawah hanya relevan untuk mode
 * Perbaikan/Pengembangan (data eksisting), tidak untuk Pembangunan Baru.
 */
export interface RetainingWallSegment {
  id: string;
  staStart: string;
  staEnd: string;
  length: string; // panjang segmen (m)
  baseElevationStart: string; // elevasi dasar/fondasi dinding di STA awal (m)
  baseElevationEnd: string; // elevasi dasar/fondasi dinding di STA akhir (m)
  heightStart: string; // tinggi di STA awal (m)
  heightEnd: string; // tinggi di STA akhir (m)
  topWidth: string; // lebar atas (m) - khusus Perbaikan/Pengembangan
  bottomWidth: string; // lebar bawah (m) - khusus Perbaikan/Pengembangan
  constructionType: string; // Pasangan Batu/Beton/Bronjong
  tiltCondition: string; // kondisi kemiringan/pergeseran
  condition: string;
  notes: string;
}

/** Detail untuk Gorong-gorong - infrastruktur titik/diskrit. */
export interface CulvertDetail {
  culvertType: string; // Pipa/Box Culvert
  dimension: string; // diameter atau lebar x tinggi (cm/m)
  length: string; // panjang (m)
  inletCondition: string; // kondisi saluran masuk
  outletCondition: string; // kondisi saluran keluar
  condition: string;
  notes: string;
}

/** Detail untuk Jembatan - infrastruktur titik/diskrit. */
export interface BridgeDetail {
  spanLength: string; // panjang bentang (m)
  width: string; // lebar jembatan (m)
  constructionType: string; // Beton/Baja/Gantung/Kayu
  upperStructureCondition: string; // kondisi struktur atas
  lowerStructureCondition: string; // kondisi struktur bawah/pondasi
  condition: string;
  notes: string;
}

/**
 * Satu item pekerjaan di dalam sebuah Paket Pekerjaan. Field detail
 * spesifik (roadSegments, drainageSegments, retainingWallSegments, dst.) hanya
 * diisi salah satu, sesuai infrastructureType item ini.
 */
export interface WorkItemData {
  packageId: string;
  packageName: string;
  surveyorName: string;
  infrastructureType: string;
  latitude: number | null;
  longitude: number | null;
  accuracy: number | null;
  locationNote: string;
  photos: SurveyPhoto[];

  roadSegments?: RoadSegment[];
  drainageSegments?: DrainageSegment[];
  retainingWallSegments?: RetainingWallSegment[];
  culvert?: CulvertDetail;
  bridge?: BridgeDetail;
}

/**
 * Item yang disimpan dalam antrian lokal (AsyncStorage) untuk survei
 * yang belum berhasil dikirim ke server (misalnya karena offline).
 * Satu QueuedSurvey merepresentasikan satu baris yang akan ditulis ke
 * sheet server (untuk Jalan/Drainase, satu segmen = satu QueuedSurvey;
 * untuk TPT/Gorong-gorong/Jembatan, satu item = satu QueuedSurvey).
 */
export interface QueuedSurvey {
  localId: string;
  createdAt: string;
  status: 'pending' | 'sending' | 'failed';
  errorMessage?: string;
  data: {
    // ID unik untuk SATU baris/segmen yang akan dikirim (idempotency key).
    localId: string;
    packageId: string;
    packageName: string;
    itemId: string; // ID unik per item pekerjaan; sama untuk semua segmen dalam 1 item
    surveyorName: string;
    username?: string; // username akun yang login, dipakai server untuk validasi izin
    infrastructureType: string;
    latitude: number | null;
    longitude: number | null;
    accuracy: number | null;
    locationNote: string;
    kecamatan: string;
    desaKelurahan: string;
    kodeDesaKelurahan?: string;
    photos: {
      base64: string;
      mimeType: string;
      fileName: string;
    }[];

    // Nomor urut segmen (mulai dari 1) & total segmen dalam item ini.
    // Hanya relevan untuk infrastruktur linear (Jalan/Drainase/TPT).
    segmentIndex?: number;
    segmentTotal?: number;

    roadSegment?: Omit<RoadSegment, 'id'>;
    drainageSegment?: Omit<DrainageSegment, 'id'>;
    retainingWall?: Omit<RetainingWallSegment, 'id'>;
    culvert?: CulvertDetail;
    bridge?: BridgeDetail;
    dynamicDetail?: DynamicDetail;
    surveyMode?: string;
    modeData?: SurveyModeData;
  };
}

export interface ApiResponse {
  success: boolean;
  message: string;
  surveyId?: string;
  photoUrls?: string[];
  data?: any[];
  user?: AuthUser;
  users?: ManagedUser[];
  sessionToken?: string;
  infraTypes?: string[];
  staticTypes?: string[];
  dynamicTypes?: { name: string; sheetName: string }[];
  wilayah?: WilayahItem[];
}

/** Satu baris data master Kecamatan/Desa/Kelurahan (sheet KODE_DES_KEL). */
export interface WilayahItem {
  kecamatan: string;
  desa: string;
  kode: string;
}


/** Izin granular yang bisa diatur admin untuk masing-masing user biasa. */
export interface UserPermissions {
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canPost: boolean;
}

/** Data pengguna yang login (surveyor/user biasa, admin, atau viewer publik). */
export interface AuthUser {
  username: string;
  name: string;
  role: 'admin' | 'user' | 'viewer';
  permissions?: UserPermissions;
  sessionToken?: string;
  allowedTypes?: string[] | null; // null = semua jenis diizinkan
}

/** Data ringkas satu akun pengguna, dipakai di layar manajemen user admin. */
export interface ManagedUser {
  username: string;
  name: string;
  role: 'admin' | 'user' | 'viewer';
  permissions: UserPermissions;
  allowedTypes?: string[] | null;
}


/** Detail untuk jenis infrastruktur dinamis (SPAM, IPAL, dll). */
export interface DynamicDetail {
  dimension: string;
  material: string;
  technicalNotes: string;
  condition: string;
}

export interface SurveyModeData {
  existingCondition: string;
  problem: string;
  proposedAction: string;
  treatmentVolume: string;
  treatmentUnit: string;
  priority: string;
  plannedLength: string;
  plannedWidth: string;
  plannedHeight: string;
  currentCapacity: string;
  targetCapacity: string;
  additionalLength: string;
  additionalWidth: string;
}

/** Mode survei: apakah ini pembangunan baru, perbaikan, atau pengembangan. */
export type SurveyMode = 'Pembangunan Baru' | 'Perbaikan' | 'Pengembangan';

