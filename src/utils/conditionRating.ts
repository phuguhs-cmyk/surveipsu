import { CONDITION_OPTIONS } from '../config';

/**
 * Urutan tingkat keparahan kondisi, dari yang paling ringan ke paling berat.
 * Dipakai untuk menentukan kondisi "terburuk" (worst-case) di antara
 * beberapa nilai kondisi (mis. kondisi tiap segmen dalam satu item
 * pekerjaan), karena satu bagian yang rusak berat cukup untuk membuat
 * keseluruhan item butuh perhatian meskipun bagian lain masih baik.
 */
const CONDITION_RANK: string[] = CONDITION_OPTIONS; // ['Baik', 'Rusak Ringan', 'Rusak Sedang', 'Rusak Berat']

/**
 * Menentukan "Kondisi Eksisting" (ringkasan satu item pekerjaan) secara
 * OTOMATIS dari kondisi-kondisi individual (per segmen/per komponen),
 * memakai pendekatan WORST-CASE: kondisi keseluruhan = kondisi paling
 * parah di antara semua bagian yang dinilai. Pendekatan ini yang paling
 * umum dipakai untuk prioritas penanganan infrastruktur (1 segmen rusak
 * berat = seluruh ruas perlu ditindaklanjuti), dan konsisten dengan
 * logika "computeRoadSegmentPlanned dkk" yang sudah dipakai di aplikasi
 * ini (satu sumber logika, dihitung otomatis, tidak diinput manual lagi).
 *
 * Mengembalikan string kosong bila tidak ada nilai kondisi valid sama
 * sekali (mis. semua segmen belum diisi kondisinya).
 */
export function deriveOverallCondition(conditions: (string | undefined)[]): string {
  let worstIndex = -1;
  for (const condition of conditions) {
    const idx = CONDITION_RANK.indexOf((condition || '').trim());
    if (idx > worstIndex) worstIndex = idx;
  }
  return worstIndex >= 0 ? CONDITION_RANK[worstIndex] : '';
}

/**
 * Rumus sederhana (SDI-lite / disederhanakan dari metode Surface Distress
 * Index Bina Marga) untuk MENYARANKAN kategori kondisi kerusakan Jalan
 * per segmen, berdasarkan data yang SUDAH diisi surveyor di lapangan
 * (damageLength/damageWidth/damageDepth dibandingkan panjang & lebar
 * segmen) — tanpa perlu alat ukur tambahan.
 *
 * Dua indikator dihitung terpisah lalu diambil yang PALING PARAH:
 * 1) Persentase luas kerusakan terhadap luas segmen (damageLength x
 *    damageWidth) / (segmentLength x segmentWidth) x 100%.
 *    Ambang (indikatif, mengikuti pola SDI Bina Marga yang disederhanakan
 *    jadi 4 kategori): <=5% Baik, <=15% Rusak Ringan, <=30% Rusak Sedang,
 *    >30% Rusak Berat.
 * 2) Kedalaman kerusakan (lubang/alur) dalam cm: <1 cm Baik, <3 cm Rusak
 *    Ringan, <5 cm Rusak Sedang, >=5 cm Rusak Berat.
 *
 * CATATAN: ini adalah pendekatan indikatif/penyederhanaan untuk survei
 * cepat tanpa alat khusus (roughometer/profilometer), BUKAN pengganti
 * survei SDI/PCI/IRI formal yang mensyaratkan alat ukur terkalibrasi.
 * Hasilnya hanya SARAN yang bisa diterapkan atau diabaikan oleh surveyor
 * (tetap bisa menilai manual berdasarkan kondisi visual di lapangan).
 */
export function classifyRoadSegmentCondition(segment: {
  length?: string; widthStart?: string; widthEnd?: string;
  damageLength?: string; damageWidth?: string; damageDepth?: string;
}): string | null {
  const length = parseFloat((segment.length || '').replace(',', '.'));
  const wStart = parseFloat((segment.widthStart || '').replace(',', '.'));
  const wEnd = parseFloat((segment.widthEnd || '').replace(',', '.'));
  const validWidths = [wStart, wEnd].filter((v) => !isNaN(v) && v > 0);
  const width = validWidths.length > 0 ? validWidths.reduce((a, b) => a + b, 0) / validWidths.length : NaN;

  const damageLength = parseFloat((segment.damageLength || '').replace(',', '.'));
  const damageWidth = parseFloat((segment.damageWidth || '').replace(',', '.'));
  const damageDepthCm = parseFloat((segment.damageDepth || '').replace(',', '.'));

  let percentCategory = -1;
  if (!isNaN(length) && length > 0 && !isNaN(width) && width > 0 && !isNaN(damageLength) && !isNaN(damageWidth)) {
    const percent = ((damageLength * damageWidth) / (length * width)) * 100;
    percentCategory = percent <= 5 ? 0 : percent <= 15 ? 1 : percent <= 30 ? 2 : 3;
  }

  let depthCategory = -1;
  if (!isNaN(damageDepthCm)) {
    depthCategory = damageDepthCm < 1 ? 0 : damageDepthCm < 3 ? 1 : damageDepthCm < 5 ? 2 : 3;
  }

  const worstCategory = Math.max(percentCategory, depthCategory);
  return worstCategory >= 0 ? CONDITION_RANK[worstCategory] : null;
}

/**
 * Pemetaan otomatis Kondisi Sedimentasi (SEDIMENT_CONDITIONS) ke kategori
 * Kondisi umum (CONDITION_OPTIONS) untuk Drainase/Saluran Air. Tidak
 * memerlukan alat ukur tambahan karena persentase penyumbatan sudah
 * dinilai visual oleh surveyor lewat pilihan "Kondisi Sedimentasi";
 * pemetaan ini mengikuti pola pedoman O&P drainase (semakin tinggi %
 * penyumbatan terhadap kedalaman saluran, semakin berat kondisinya).
 */
export function classifyDrainageCondition(sedimentCondition?: string): string | null {
  switch ((sedimentCondition || '').trim()) {
    case 'Tidak Ada':
      return 'Baik';
    case 'Ringan':
      return 'Rusak Ringan';
    case 'Sedang':
      return 'Rusak Sedang';
    case 'Berat (Tersumbat)':
      return 'Rusak Berat';
    default:
      return null;
  }
}
