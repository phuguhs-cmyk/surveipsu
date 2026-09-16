import Constants from 'expo-constants';

const extra = Constants.expoConfig?.extra ?? {};

// Saat EAS Build: nilai di-inject dari Secrets ke app.json extra.
// Saat dev lokal (expo start): dibaca langsung dari .env via process.env.
const GAS_URL =
  (extra.gasUrl as string) ||
  process.env.GAS_WEB_APP_URL ||
  '';

const MAPTILER_API_KEY = (
  (extra.maptilerKey as string) ||
  process.env.MAPTILER_API_KEY ||
  ''
).trim();

const CARTO_API_KEY = (
  (extra.cartoKey as string) ||
  process.env.CARTO_API_KEY ||
  ''
).trim();

export function buildCartoTileUrlTemplate(cartoApiKey?: string): string {
  const key = (cartoApiKey ?? CARTO_API_KEY ?? '').trim();
  const query = key ? `?api_key=${encodeURIComponent(key)}` : '';
  // PENTING: tile.openstreetmap.org MELARANG pengunduhan otomatis/bulk
  // aplikasi (lihat https://operations.osmfoundation.org/policies/tiles/)
  // dan akan memblokir aplikasi ini ("Access blocked..."), membuat mode
  // "Peta" (street) gagal menampilkan tile (kotak abu-abu). Jika belum
  // ada CARTO_API_KEY, pakai Esri World Street Map (tanpa key, tidak
  // memblokir pemakaian aplikasi) sebagai fallback, BUKAN OSM langsung.
  if (!key) {
    return buildEsriTileUrlTemplate();
  }
  return `https://a.basemaps.cartocdn.com/rastertiles/voyager_labels_under/{z}/{x}/{y}.png${query}`;
}


export function buildCartoLabelTileUrlTemplate(cartoApiKey?: string): string {
  const key = (cartoApiKey ?? CARTO_API_KEY ?? '').trim();
  const query = key ? `?api_key=${encodeURIComponent(key)}` : '';
  if (!key) {
    return 'https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}';
  }
  return `https://a.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}.png${query}`;
}

export function buildEsriImageryTileUrlTemplate(): string {
  return 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
}

export function buildEsriTileUrlTemplate(): string {
  // CATATAN: sebelumnya fungsi ini (meski bernama "Esri") mengembalikan
  // tile.openstreetmap.org langsung, padahal server tsb MELARANG
  // pengunduhan otomatis/bulk aplikasi (lihat kebijakan
  // https://operations.osmfoundation.org/policies/tiles/) dan akan
  // memblokir aplikasi ("Access blocked..."), membuat peta online gagal
  // menampilkan tile (kotak abu-abu) di semua layar peta. Esri World
  // Street Map TIDAK memerlukan API key dan tidak memblokir pemakaian
  // aplikasi seperti ini, jadi dipakai sebagai fallback yang benar.
  return 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}';
}


export function buildOfflineMapTileUrlTemplate(maptilerKey?: string): string {
  // Key hanya dipakai bila diberikan eksplisit. Environment lama dapat berisi
  // key MapTiler kedaluwarsa yang membuat fallback online gagal dengan pesan
  // "Invalid key"; Esri World Street Map adalah fallback raster tanpa key.
  const key = (maptilerKey ?? '').trim();
  if (key) {
    return `https://api.maptiler.com/maps/streets-v2/{z}/{x}/{y}.png?key=${key}`;
  }
  return buildEsriTileUrlTemplate();
}

export function buildOnlineVectorStyleUrl(maptilerKey?: string): string {
  // MapTiler "Streets v2" berbasis data OpenStreetMap PENUH (jalan, footprint
  // bangunan/rumah per-unit, sungai/saluran air kecil sekalipun) dan
  // ditampilkan sebagai vector (MapLibre GL) sehingga tetap tajam di zoom
  // berapa pun serta lebih ringan (payload vector lebih kecil dari tile
  // raster). Dipakai HANYA untuk mode "Peta" (street) di layar peta;
  // penggunaan bulk/aplikasi diizinkan oleh MapTiler (berbeda dari
  // tile.openstreetmap.org yang melarang pemakaian ini). Fallback ke Carto
  // Voyager GL Style (juga vector, tanpa key) jika MAPTILER_API_KEY kosong,
  // dan fallback raster (Esri/Carto) tetap ada di leafletHtml.ts jika
  // MapLibre GL gagal dimuat (mis. tidak ada internet).
  const key = (maptilerKey ?? MAPTILER_API_KEY ?? '').trim();
  if (key) {
    return `https://api.maptiler.com/maps/streets-v2/style.json?key=${encodeURIComponent(key)}`;
  }
  return 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json';
}

export const ONLINE_MAP_MODES = {
  street: {
    label: 'Peta Jalan',
    tileUrlTemplate: buildCartoTileUrlTemplate(),
    vectorStyleUrl: buildOnlineVectorStyleUrl(),
  },
  satellite: {
    label: 'Satelit',
    tileUrlTemplate: buildEsriImageryTileUrlTemplate(),
    vectorStyleUrl: null,
  },
  hybrid: {
    label: 'Hybrid',
    tileUrlTemplate: buildEsriImageryTileUrlTemplate(),
    labelTileUrlTemplate: buildCartoLabelTileUrlTemplate(),
    vectorStyleUrl: null,
  },
} as const;

/**
 * Konfigurasi aplikasi survei infrastruktur.
 */
export const CONFIG = {
  GAS_WEB_APP_URL: GAS_URL,

  // Kualitas kompresi foto (0-1) sebelum dikirim sebagai base64
  IMAGE_COMPRESS_QUALITY: 0.5,

  // Maksimal jumlah foto per survei. Dinaikkan cukup tinggi karena foto kini
  // disimpan sebagai daftar (JSON array) di server, bukan kolom tetap
  // (URL Foto 1/2/3), sehingga jumlahnya praktis tidak dibatasi ketat lagi.
  MAX_PHOTOS: 50,

  // Kunci AsyncStorage
  STORAGE_KEYS: {
    SURVEYOR_NAME: '@survei/surveyorName',
    QUEUE: '@survei/queue',
    PACKAGES: '@survei/packages',
    GEOCODE_CACHE: '@survei/geocodeCache',
    MAP_ANNOTATIONS: '@survei/mapAnnotations',
    AUTH_USER: '@survei/authUser',
    SESSION_TOKEN: '@survei/sessionToken',
  },

  // ─── Peta Offline ───────────────────────────────────────────────────────
  // Template URL tile raster (skema slippy-map standar {z}/{x}/{y}.png).
  // CATATAN PENTING: sebelumnya memakai tile.openstreetmap.org langsung,
  // tapi server tsb MELARANG pengunduhan otomatis/bulk (lihat kebijakan
  // https://operations.osmfoundation.org/policies/tiles/) dan akan
  // memblokir IP/app dengan pesan "Access blocked: app is not following
  // the tile usage policy of OpenStreetMap" begitu terdeteksi. Sempat
  // dicoba CartoDB Voyager, tapi ternyata basemap CARTO JUGA mewajibkan
  // API key (lihat https://github.com/CartoDB/basemap-styles), jadi kita
  // Carto memerlukan API key pada deployment saat ini. Isi CARTO_API_KEY di
  // .env lokal atau secret build; URL akan otomatis memakai ?api_key=....
  // MapTiler tetap dipakai sebagai fallback jika CARTO_API_KEY kosong.
  OFFLINE_MAP_TILE_URL_TEMPLATE: buildOfflineMapTileUrlTemplate(),
  // Lokasi sumber online untuk mode peta satelit, jalan, dan hybrid. Digunakan
  // oleh HTML peta online sebagai basis sumber yang bisa dipindah-pindah sesuai
  // kebutuhan tampilan di lapangan.
  ONLINE_MAP_MODES: ONLINE_MAP_MODES,
  // Style vector online; OpenFreeMap dipakai tanpa API key.
  ONLINE_VECTOR_STYLE_URL: buildOnlineVectorStyleUrl(),
  // Zoom maksimum untuk peta online vector/raster. Tidak memengaruhi jumlah
  // tile yang diunduh oleh fitur peta offline. Dinaikkan dari 19 ke 20 agar
  // pengguna bisa memperbesar peta lebih dekat ke objek; provider tile
  // (Esri/Carto/MapTiler) umumnya masih menyediakan data asli sampai level
  // ini di sebagian besar area, jadi tampilan tetap tajam (bukan upscale).
  ONLINE_MAP_MIN_ZOOM: 9,
  ONLINE_MAP_MAX_ZOOM: 20,

  // Akurasi GPS (meter) di atas ambang ini dianggap "kurang akurat" dan
  // surveyor akan diberi peringatan agar mencoba lagi di area terbuka,
  // supaya koordinat yang tersimpan lebih dapat diandalkan.
  LOCATION_LOW_ACCURACY_THRESHOLD_M: 50,
};


/**
 * Jenis pekerjaan/infrastruktur yang bisa ditambahkan sebagai item
 * di dalam satu Paket Pekerjaan. Satu paket bisa berisi kombinasi
 * bebas dari jenis-jenis berikut.
 */
export const INFRASTRUCTURE_TYPES = [
  'Jalan',
  'Drainase/Saluran Air',
  'Dinding Penahan Tanah (DPT)',
  'Gorong-gorong',
  'Jembatan',
];

export const CONDITION_OPTIONS = [
  'Baik',
  'Rusak Ringan',
  'Rusak Sedang',
  'Rusak Berat',
];

// Jenis perkerasan jalan (khusus item pekerjaan "Jalan")
export const PAVEMENT_TYPES = [
  'Aspal',
  'Beton',
  'Paving Block',
  'Tanah/Kerikil',
  'Lainnya',
];

// Jenis saluran drainase
export const CHANNEL_TYPES = ['Terbuka', 'Tertutup'];

// Material saluran drainase
export const DRAINAGE_MATERIALS = ['Pasangan Batu', 'Beton', 'Tanah', 'Lainnya'];

// Kondisi sedimentasi/penyumbatan saluran
export const SEDIMENT_CONDITIONS = ['Tidak Ada', 'Ringan', 'Sedang', 'Berat (Tersumbat)'];

// Jenis konstruksi TPT (Dinding Penahan Tanah)
export const RETAINING_WALL_TYPES = ['Pasangan Batu', 'Beton', 'Bronjong', 'Lainnya'];

// Kondisi kemiringan/pergeseran TPT
export const TILT_CONDITIONS = ['Tidak Ada Pergeseran', 'Miring Ringan', 'Miring/Bergeser Signifikan'];

// Jenis gorong-gorong
export const CULVERT_TYPES = ['Pipa', 'Box Culvert', 'Lainnya'];

// Jenis konstruksi jembatan
export const BRIDGE_CONSTRUCTION_TYPES = ['Beton', 'Baja', 'Gantung', 'Kayu', 'Lainnya'];

/**
 * Kunci field detail (sesuai QueuedSurvey['data']) untuk tiap jenis
 * infrastruktur. Dipakai saat mengedit data yang sudah tersimpan di server,
 * agar tahu field mana yang harus dikirim di body request "update".
 * Harus selaras dengan INFRASTRUCTURE_CONFIG di google-apps-script/Code.gs.
 */
export const INFRASTRUCTURE_DETAIL_KEY: Record<string, string> = {
  'Jalan': 'roadSegment',
  'Drainase/Saluran Air': 'drainageSegment',
  'Dinding Penahan Tanah (DPT)': 'retainingWall',
  'Gorong-gorong': 'culvert',
  'Jembatan': 'bridge',
};

/**
 * Daftar field yang bisa diedit untuk tiap jenis infrastruktur, dengan
 * pemetaan { key: nama field di detail payload, header: nama kolom di
 * sheet (untuk membaca nilai lama), label: teks yang ditampilkan di form }.
 * Harus selaras dengan detailFields/detailHeaders di Code.gs (tanpa
 * __segmentIndex/__segmentTotal karena itu tidak diedit manual).
 */
export const EDIT_FIELDS: Record<string, { key: string; header: string; label: string; numeric?: boolean }[]> = {
  'Jalan': [
    { key: 'staStart', header: 'STA Awal', label: 'STA Awal' },
    { key: 'staEnd', header: 'STA Akhir', label: 'STA Akhir' },
    { key: 'length', header: 'Panjang Segmen (m)', label: 'Panjang Segmen (m)', numeric: true },
    { key: 'roadElevationStart', header: 'Elevasi Jalan STA Awal (m)', label: 'Elevasi Jalan di STA Awal (m)', numeric: true },
    { key: 'roadElevationEnd', header: 'Elevasi Jalan STA Akhir (m)', label: 'Elevasi Jalan di STA Akhir (m)', numeric: true },
    { key: 'widthStart', header: 'Lebar STA Awal (m)', label: 'Lebar di STA Awal (m)', numeric: true },
    { key: 'widthEnd', header: 'Lebar STA Akhir (m)', label: 'Lebar di STA Akhir (m)', numeric: true },
    { key: 'pavementType', header: 'Jenis Perkerasan', label: 'Jenis Perkerasan' },
    { key: 'condition', header: 'Kondisi', label: 'Kondisi' },
    { key: 'damageLength', header: 'Panjang Kerusakan (m)', label: 'Panjang Kerusakan (m)', numeric: true },
    { key: 'damageWidth', header: 'Lebar Kerusakan (m)', label: 'Lebar Kerusakan (m)', numeric: true },
    { key: 'damageDepth', header: 'Kedalaman Kerusakan (cm)', label: 'Kedalaman Kerusakan (cm)', numeric: true },
    { key: 'notes', header: 'Catatan', label: 'Catatan' },
  ],
  'Drainase/Saluran Air': [
    { key: 'staStart', header: 'STA Awal', label: 'STA Awal' },
    { key: 'staEnd', header: 'STA Akhir', label: 'STA Akhir' },
    { key: 'length', header: 'Panjang Segmen (m)', label: 'Panjang Segmen (m)', numeric: true },
    { key: 'invertElevationStart', header: 'Elevasi Dasar STA Awal (m)', label: 'Elevasi Dasar Saluran di STA Awal (m)', numeric: true },
    { key: 'invertElevationEnd', header: 'Elevasi Dasar STA Akhir (m)', label: 'Elevasi Dasar Saluran di STA Akhir (m)', numeric: true },
    { key: 'channelType', header: 'Jenis Saluran', label: 'Jenis Saluran' },
    { key: 'width', header: 'Lebar (m)', label: 'Lebar (m)', numeric: true },
    { key: 'depth', header: 'Kedalaman (m)', label: 'Kedalaman (m)', numeric: true },
    { key: 'material', header: 'Material', label: 'Material' },
    { key: 'sedimentCondition', header: 'Kondisi Sedimentasi', label: 'Kondisi Sedimentasi' },
    { key: 'condition', header: 'Kondisi', label: 'Kondisi' },
    { key: 'notes', header: 'Catatan', label: 'Catatan' },
  ],
  'Dinding Penahan Tanah (DPT)': [
    { key: 'staStart', header: 'STA Awal', label: 'STA Awal' },
    { key: 'staEnd', header: 'STA Akhir', label: 'STA Akhir' },
    { key: 'length', header: 'Panjang (m)', label: 'Panjang Segmen (m) — otomatis dari STA', numeric: true },
    { key: 'baseElevationStart', header: 'Elevasi Dasar STA Awal (m)', label: 'Elevasi Dasar Dinding di STA Awal (m)', numeric: true },
    { key: 'baseElevationEnd', header: 'Elevasi Dasar STA Akhir (m)', label: 'Elevasi Dasar Dinding di STA Akhir (m)', numeric: true },
    { key: 'heightStart', header: 'Tinggi STA Awal (m)', label: 'Tinggi di STA Awal (m)', numeric: true },
    { key: 'heightEnd', header: 'Tinggi STA Akhir (m)', label: 'Tinggi di STA Akhir (m)', numeric: true },
    { key: 'topWidth', header: 'Lebar Atas (m)', label: 'Lebar Atas (m)', numeric: true },
    { key: 'bottomWidth', header: 'Lebar Bawah (m)', label: 'Lebar Bawah (m)', numeric: true },
    { key: 'constructionType', header: 'Jenis Konstruksi', label: 'Jenis Konstruksi' },
    { key: 'tiltCondition', header: 'Kondisi Kemiringan/Pergeseran', label: 'Kondisi Kemiringan/Pergeseran' },
    { key: 'condition', header: 'Kondisi', label: 'Kondisi' },
    { key: 'notes', header: 'Catatan', label: 'Catatan' },
  ],
  'Gorong-gorong': [
    { key: 'culvertType', header: 'Jenis Gorong-gorong', label: 'Jenis Gorong-gorong' },
    { key: 'dimension', header: 'Dimensi', label: 'Dimensi' },
    { key: 'length', header: 'Panjang (m)', label: 'Panjang (m)', numeric: true },
    { key: 'inletCondition', header: 'Kondisi Saluran Masuk', label: 'Kondisi Saluran Masuk' },
    { key: 'outletCondition', header: 'Kondisi Saluran Keluar', label: 'Kondisi Saluran Keluar' },
    { key: 'condition', header: 'Kondisi', label: 'Kondisi' },
    { key: 'notes', header: 'Catatan', label: 'Catatan' },
  ],
  'Jembatan': [
    { key: 'spanLength', header: 'Panjang Bentang (m)', label: 'Panjang Bentang (m)', numeric: true },
    { key: 'width', header: 'Lebar (m)', label: 'Lebar (m)', numeric: true },
    { key: 'constructionType', header: 'Jenis Konstruksi', label: 'Jenis Konstruksi' },
    { key: 'upperStructureCondition', header: 'Kondisi Struktur Atas', label: 'Kondisi Struktur Atas' },
    { key: 'lowerStructureCondition', header: 'Kondisi Struktur Bawah/Pondasi', label: 'Kondisi Struktur Bawah/Pondasi' },
    { key: 'condition', header: 'Kondisi', label: 'Kondisi' },
    { key: 'notes', header: 'Catatan', label: 'Catatan' },
  ],
};

/**
 * Kunci field pada SurveyModeData yang bersifat numerik (angka), dipakai
 * untuk menampilkan keyboard numerik (bukan keyboard teks biasa) pada
 * WorkItemFormScreen & EditItemScreen agar surveyor tidak perlu berpindah
 * keyboard manual saat mengisi ukuran/volume.
 */
export const NUMERIC_MODE_DATA_KEYS: string[] = [
  'plannedLength',
  'plannedWidth',
  'plannedHeight',
  'currentCapacity',
  'targetCapacity',
  'additionalLength',
  'additionalWidth',
  'treatmentVolume',
];

/**
 * Kolom "Mode Detail JSON" (SurveyModeData) yang relevan untuk masing-masing
 * Mode Survei, dipakai di Laporan Tabel (PackageReportScreen) & PDF agar
 * hanya field yang benar-benar berkaitan dengan mode tersebut yang
 * ditampilkan — bukan seluruh kolom mode data sekaligus untuk semua baris.
 * `sheetHeader` diisi jika nilainya juga tersimpan sebagai kolom sheet
 * tersendiri (lihat MODE_REPORT_HEADERS di Code.gs); jika kosong, nilainya
 * HANYA ada di dalam kolom "Mode Detail JSON" (harus di-parse dari JSON),
 * karena field tersebut (plannedLength, currentCapacity, dst.) tidak
 * disalin ke kolom sheet terpisah.
 */
export const MODE_REPORT_COLUMNS: Record<SurveyModeType, { key: SurveyModeDataKeys; label: string; sheetHeader?: string }[]> = {
  'Pembangunan Baru': [
    { key: 'plannedLength', label: 'Panjang Rencana (m)' },
    { key: 'plannedWidth', label: 'Lebar Rencana (m)' },
    { key: 'plannedHeight', label: 'Tinggi/Kedalaman Rencana (m)' },
    { key: 'proposedAction', label: 'Rencana Tindakan', sheetHeader: 'Tindakan Diusulkan' },
  ],
  'Perbaikan': [
    { key: 'existingCondition', label: 'Kondisi Eksisting', sheetHeader: 'Kondisi Eksisting' },
    { key: 'problem', label: 'Permasalahan', sheetHeader: 'Permasalahan' },
    { key: 'proposedAction', label: 'Tindakan Diusulkan', sheetHeader: 'Tindakan Diusulkan' },
    { key: 'treatmentVolume', label: 'Volume Penanganan', sheetHeader: 'Volume Penanganan' },
    { key: 'treatmentUnit', label: 'Satuan', sheetHeader: 'Satuan' },
  ],
  'Pengembangan': [
    { key: 'existingCondition', label: 'Kondisi Eksisting', sheetHeader: 'Kondisi Eksisting' },
    { key: 'currentCapacity', label: 'Kapasitas Saat Ini' },
    { key: 'targetCapacity', label: 'Kapasitas Target' },
    { key: 'additionalLength', label: 'Penambahan Panjang (m)' },
    { key: 'additionalWidth', label: 'Penambahan Lebar (m)' },
    { key: 'proposedAction', label: 'Tindakan Pengembangan', sheetHeader: 'Tindakan Diusulkan' },
  ],
};

type SurveyModeType = 'Pembangunan Baru' | 'Perbaikan' | 'Pengembangan';
type SurveyModeDataKeys =
  | 'existingCondition' | 'problem' | 'proposedAction' | 'treatmentVolume' | 'treatmentUnit' | 'priority'
  | 'plannedLength' | 'plannedWidth' | 'plannedHeight'
  | 'currentCapacity' | 'targetCapacity' | 'additionalLength' | 'additionalWidth';





