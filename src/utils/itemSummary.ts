/**
 * Utilitas untuk merangkum ukuran (Panjang/Lebar/Tinggi-Dalam) & Catatan
 * satu Item Pekerjaan (yang bisa terdiri dari beberapa baris segmen STA)
 * menjadi satu ringkasan: Total Panjang (dijumlahkan), Lebar & Tinggi/Dalam
 * rata-rata BERBOBOT PANJANG SEGMEN (lihat weightedAvg di bawah — bukan
 * rata-rata sederhana dari seluruh angka pengukuran, karena itu akan bias
 * jika panjang tiap segmen berbeda-beda), dan Catatan gabungan (jika semua
 * baris punya catatan yang sama hanya ditampilkan satu kali; jika berbeda,
 * digabung dipisah " | "). Dipakai bersama oleh PackageReportScreen (Admin)
 * & PublicPackageDataScreen (Viewer). Harus selaras dengan EDIT_FIELDS di
 * config.ts.
 */

// Kolom sheet yang mewakili Panjang/Lebar/Tinggi-Dalam untuk tiap jenis
// infrastruktur yang bersegmen/punya ukuran tetap.
const DIMENSION_HEADERS: Record<string, { panjang: string[]; lebar: string[]; tinggi: string[] }> = {
  'Jalan': {
    panjang: ['Panjang Segmen (m)'],
    lebar: ['Lebar STA Awal (m)', 'Lebar STA Akhir (m)'],
    tinggi: [],
  },
  'Drainase/Saluran Air': {
    panjang: ['Panjang Segmen (m)'],
    lebar: ['Lebar (m)'],
    tinggi: ['Kedalaman (m)'],
  },
  'Dinding Penahan Tanah (DPT)': {
    panjang: ['Panjang (m)'],
    lebar: ['Lebar Atas (m)', 'Lebar Bawah (m)'],
    tinggi: ['Tinggi STA Awal (m)', 'Tinggi STA Akhir (m)'],
  },
  'Gorong-gorong': {
    panjang: ['Panjang (m)'],
    lebar: [],
    tinggi: [],
  },
  'Jembatan': {
    panjang: ['Panjang Bentang (m)'],
    lebar: ['Lebar (m)'],
    tinggi: [],
  },
};

// Kolom sheet yang mewakili "Jenis Konstruksi" untuk tiap jenis infrastruktur
// (nama field berbeda-beda: Jenis Perkerasan/Saluran/Konstruksi/Gorong-gorong).
const CONSTRUCTION_HEADERS: Record<string, string> = {
  'Jalan': 'Jenis Perkerasan',
  'Drainase/Saluran Air': 'Jenis Saluran',
  'Dinding Penahan Tanah (DPT)': 'Jenis Konstruksi',
  'Gorong-gorong': 'Jenis Gorong-gorong',
  'Jembatan': 'Jenis Konstruksi',
};

// Kolom "Kondisi" umum (sama nama kolomnya untuk semua jenis, termasuk yang
// dinamis) — selalu diisi field terakhir "condition" pada EDIT_FIELDS.
const CONDITION_HEADER = 'Kondisi';

// Kolom sheet numerik ukuran kerusakan, khusus Jalan (lihat EDIT_FIELDS di
// config.ts: damageLength/damageWidth/damageDepth).
const JALAN_DAMAGE_HEADERS = {
  length: 'Panjang Kerusakan (m)',
  width: 'Lebar Kerusakan (m)',
  depth: 'Kedalaman Kerusakan (cm)',
};

// Untuk jenis infrastruktur selain Jalan, "kerusakan" direpresentasikan
// sebagai kondisi teknis spesifik (bukan ukuran numerik terpisah), mis.
// Kondisi Sedimentasi (Drainase), Kondisi Kemiringan/Pergeseran (DPT), dst.
const DAMAGE_TEXT_FIELDS: Record<string, { label: string; header: string }[]> = {
  'Drainase/Saluran Air': [{ label: 'Sedimentasi', header: 'Kondisi Sedimentasi' }],
  'Dinding Penahan Tanah (DPT)': [{ label: 'Kemiringan', header: 'Kondisi Kemiringan/Pergeseran' }],
  'Gorong-gorong': [
    { label: 'Masuk', header: 'Kondisi Saluran Masuk' },
    { label: 'Keluar', header: 'Kondisi Saluran Keluar' },
  ],
  'Jembatan': [
    { label: 'Struktur Atas', header: 'Kondisi Struktur Atas' },
    { label: 'Struktur Bawah', header: 'Kondisi Struktur Bawah/Pondasi' },
  ],
};

function toNum(v: any): number | null {
  if (v === undefined || v === null || v === '') return null;
  const n = parseFloat(String(v).replace(',', '.'));
  return isNaN(n) ? null : n;
}

/**
 * Rata-rata sederhana (Σnilai / jumlah), TIDAK memperhitungkan panjang
 * masing-masing segmen. Hanya dipakai untuk kasus yang memang tidak
 * punya info panjang per baris (lihat catatan di summarizeItemRows).
 */
function avg(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/**
 * Rata-rata Lebar/Tinggi-Dalam berbobot panjang segmen (length-weighted
 * average), BUKAN rata-rata sederhana dari seluruh angka pengukuran.
 *
 * Kenapa perlu dibobot panjang: jika satu item pekerjaan terdiri dari
 * beberapa segmen dengan panjang berbeda-beda (mis. segmen A 2 m lebar
 * 1 m, segmen B 20 m lebar 3 m), rata-rata sederhana ((1+3)/2 = 2 m)
 * akan bias karena menganggap kedua segmen berkontribusi sama besar,
 * padahal segmen B jauh lebih dominan secara volume/luas. Rumus yang
 * benar adalah membagi "luas total" (panjang × lebar tiap segmen,
 * dijumlahkan) dengan total panjang:
 *
 *   rata2 = Σ(panjang_i × nilai_i) / Σ(panjang_i)
 *
 * Pada contoh di atas: (2×1 + 20×3) / (2+20) = 62/22 ≈ 2.82 m — jauh
 * lebih mencerminkan kondisi lapangan dibanding 2 m dari rata-rata biasa.
 *
 * Jika sebuah segmen punya nilai di dua titik (STA awal & akhir, mis.
 * Lebar Jalan atau Tinggi TPT yang berubah sepanjang segmen), nilai
 * representatif segmen tsb dihitung dulu dengan rata-rata trapesium
 * (awal+akhir)/2 sebelum dibobot dengan panjangnya.
 */
function weightedAvg(pairs: { length: number; value: number }[]): number | null {
  const valid = pairs.filter((p) => p.length > 0 && !isNaN(p.value));
  if (valid.length === 0) return null;
  const totalLength = valid.reduce((sum, p) => sum + p.length, 0);
  if (totalLength <= 0) return null;
  const weightedSum = valid.reduce((sum, p) => sum + p.length * p.value, 0);
  return weightedSum / totalLength;
}


/** Format angka ringkas (hilangkan .00 jika bulat, maks 2 desimal). */
export function formatNum(n: number): string {
  return Number(n.toFixed(2)).toString();
}

export interface ItemSummary {
  itemId: string;
  label: string;
  totalLength: number | null;
  avgWidth: number | null;
  avgHeight: number | null;
  /** Ukuran bebas (khusus Gorong-gorong: kolom "Dimensi" mis. "30 cm"), atau untuk
   * jenis infrastruktur dinamis (di luar 5 jenis tetap) yang tidak punya
   * kolom Panjang/Lebar/Tinggi baku. */
  freeformDimension: string;
  /** Jenis konstruksi (mis. Jenis Perkerasan/Saluran/Konstruksi/Gorong-gorong), digabung jika berbeda antar segmen. */
  constructionType: string;
  /** Kondisi umum (field "condition"), digabung jika berbeda antar segmen. */
  condition: string;
  /** Ringkasan kerusakan: khusus Jalan berupa ukuran (P/L/D), jenis lain berupa kondisi teknis spesifik (mis. Sedimentasi/Kemiringan). */
  damageSummary: string;
  notes: string;
  rows: any[];
}

/** Menggabungkan nilai teks unik dari beberapa baris menjadi satu string. */
function mergeDistinctText(values: (string | undefined)[]): string {
  const distinct = Array.from(
    new Set(values.map((v) => (v ?? '').trim()).filter((v) => v !== ''))
  );
  return distinct.length > 0 ? distinct.join(' | ') : '-';
}

/**
 * Merangkum satu Item Pekerjaan (kumpulan baris segmen milik ID Item
 * Pekerjaan yang sama) menjadi satu ringkasan ukuran + catatan.
 */
export function summarizeItemRows(itemId: string, type: string, rows: any[]): ItemSummary {
  const label = rows[0]?.['Alamat/Keterangan Lokasi'] || itemId;
  const map = DIMENSION_HEADERS[type];

  if (!map) {
    // Jenis infrastruktur dinamis (SPAM, IPAL, dll.): ukurannya tersimpan
    // sebagai satu teks bebas di kolom "Dimensi/Ukuran" (lihat
    // DYNAMIC_EDIT_FIELDS di EditItemScreen.tsx), bukan panjang/lebar/tinggi
    // terpisah.
    return {
      itemId,
      label,
      totalLength: null,
      avgWidth: null,
      avgHeight: null,
      freeformDimension: mergeDistinctText(rows.map((r) => r['Dimensi/Ukuran'])),
      constructionType: mergeDistinctText(rows.map((r) => r['Material/Konstruksi'])),
      condition: mergeDistinctText(rows.map((r) => r[CONDITION_HEADER])),
      damageSummary: '-',
      notes: mergeDistinctText(rows.map((r) => r['Catatan Teknis'])),
      rows,
    };
  }

  let lengthSum = 0;
  let hasLength = false;
  const widthPairs: { length: number; value: number }[] = [];
  const heightPairs: { length: number; value: number }[] = [];
  rows.forEach((row) => {
    // Panjang segmen baris ini dipakai sebagai bobot untuk rata-rata
    // Lebar/Tinggi-Dalam (lihat weightedAvg di atas), bukan cuma untuk
    // dijumlahkan jadi Total Panjang.
    let rowLength = 0;
    map.panjang.forEach((h) => {
      const n = toNum(row[h]);
      if (n !== null) { lengthSum += n; rowLength += n; hasLength = true; }
    });
    // Jika satu baris punya beberapa nilai lebar (mis. Lebar STA Awal &
    // Lebar STA Akhir), dirata-rata dulu (trapesium) jadi satu nilai
    // representatif segmen sebelum dibobot dengan panjang baris tsb.
    const rowWidths = map.lebar
      .map((h) => toNum(row[h]))
      .filter((n): n is number => n !== null);
    if (rowWidths.length > 0) {
      const rowWidth = rowWidths.reduce((a, b) => a + b, 0) / rowWidths.length;
      widthPairs.push({ length: rowLength, value: rowWidth });
    }
    const rowHeights = map.tinggi
      .map((h) => toNum(row[h]))
      .filter((n): n is number => n !== null);
    if (rowHeights.length > 0) {
      const rowHeight = rowHeights.reduce((a, b) => a + b, 0) / rowHeights.length;
      heightPairs.push({ length: rowLength, value: rowHeight });
    }
  });

  // Gorong-gorong menyimpan ukurannya sebagai satu teks bebas di kolom
  // "Dimensi" (mis. "30 cm" atau "40x60 cm"), bukan lebar/tinggi terpisah.
  const freeformDimension = type === 'Gorong-gorong'
    ? mergeDistinctText(rows.map((r) => r['Dimensi']))
    : '';

  // Jenis Konstruksi & Kondisi: diambil dari kolom sheet yang sesuai (lihat
  // CONSTRUCTION_HEADERS/CONDITION_HEADER di atas), digabung antar segmen.
  const constructionHeader = CONSTRUCTION_HEADERS[type];
  const constructionType = constructionHeader
    ? mergeDistinctText(rows.map((r) => r[constructionHeader]))
    : '-';
  const condition = mergeDistinctText(rows.map((r) => r[CONDITION_HEADER]));

  // Kerusakan: khusus Jalan berupa ukuran numerik (Panjang/Lebar/Kedalaman
  // Kerusakan) dirangkum length-weighted sama seperti ukuran keseluruhan,
  // supaya bisa disandingkan langsung. Jenis lain memakai kondisi teknis
  // spesifik (mis. Kondisi Sedimentasi) sebagai teks.
  let damageSummary = '-';
  if (type === 'Jalan') {
    let damageLengthSum = 0;
    let hasDamageLength = false;
    const damageWidthPairs: { length: number; value: number }[] = [];
    const damageDepthPairs: { length: number; value: number }[] = [];
    rows.forEach((row) => {
      const dLen = toNum(row[JALAN_DAMAGE_HEADERS.length]);
      if (dLen !== null) { damageLengthSum += dLen; hasDamageLength = true; }
      const dWidth = toNum(row[JALAN_DAMAGE_HEADERS.width]);
      if (dWidth !== null) damageWidthPairs.push({ length: dLen ?? 0, value: dWidth });
      const dDepth = toNum(row[JALAN_DAMAGE_HEADERS.depth]);
      if (dDepth !== null) damageDepthPairs.push({ length: dLen ?? 0, value: dDepth });
    });
    const avgDamageWidth = weightedAvg(damageWidthPairs) ?? avg(damageWidthPairs.map((p) => p.value));
    const avgDamageDepth = weightedAvg(damageDepthPairs) ?? avg(damageDepthPairs.map((p) => p.value));
    const parts: string[] = [];
    if (hasDamageLength) parts.push(`P: ${formatNum(damageLengthSum)} m`);
    if (avgDamageWidth !== null) parts.push(`L: ${formatNum(avgDamageWidth)} m`);
    if (avgDamageDepth !== null) parts.push(`D: ${formatNum(avgDamageDepth)} cm`);
    damageSummary = parts.length > 0 ? parts.join(', ') : '-';
  } else {
    const textFields = DAMAGE_TEXT_FIELDS[type];
    if (textFields) {
      const parts = textFields
        .map((f) => {
          const value = mergeDistinctText(rows.map((r) => r[f.header]));
          return value !== '-' ? `${f.label}: ${value}` : '';
        })
        .filter((s) => s !== '');
      damageSummary = parts.length > 0 ? parts.join(', ') : '-';
    }
  }

  // Fallback: jika tidak ada satu pun baris yang punya panjang segmen
  // valid (rowLength = 0 di semuanya, mis. data lama/format tak lengkap),
  // weightedAvg akan mengembalikan null — pakai rata-rata sederhana agar
  // tetap ada angka ditampilkan daripada kosong.
  const widthValues = widthPairs.map((p) => p.value);
  const heightValues = heightPairs.map((p) => p.value);

  return {
    itemId,
    label,
    totalLength: hasLength ? lengthSum : null,
    avgWidth: weightedAvg(widthPairs) ?? avg(widthValues),
    avgHeight: weightedAvg(heightPairs) ?? avg(heightValues),
    freeformDimension,
    constructionType,
    condition,
    damageSummary,
    notes: mergeDistinctText(rows.map((r) => r['Catatan'])),
    rows,
  };
}



/**
 * Mengelompokkan baris satu jenis infrastruktur berdasarkan "ID Item
 * Pekerjaan" (fallback ke lokasi/index jika tidak ada), lalu merangkum
 * masing-masing kelompok jadi satu ItemSummary.
 */
export function summarizeItemsByType(type: string, typeRows: any[]): ItemSummary[] {
  const byItem = new Map<string, any[]>();
  const order: string[] = [];
  typeRows.forEach((row, index) => {
    const itemId = String(row['ID Item Pekerjaan'] || row['Alamat/Keterangan Lokasi'] || `__row_${index}`);
    if (!byItem.has(itemId)) { byItem.set(itemId, []); order.push(itemId); }
    byItem.get(itemId)!.push(row);
  });
  return order.map((itemId) => summarizeItemRows(itemId, type, byItem.get(itemId)!));
}

/** Menyusun teks ringkas ukuran (Panjang/Lebar/Tinggi-Dalam) untuk ditampilkan. */
export function formatDimensionSummary(summary: ItemSummary): string {
  const parts: string[] = [];
  if (summary.totalLength !== null) parts.push(`P: ${formatNum(summary.totalLength)} m`);
  if (summary.avgWidth !== null) parts.push(`L: ${formatNum(summary.avgWidth)} m`);
  if (summary.freeformDimension) parts.push(`Dimensi: ${summary.freeformDimension}`);
  if (summary.avgHeight !== null) parts.push(`T/D: ${formatNum(summary.avgHeight)} m`);
  return parts.length > 0 ? parts.join(', ') : '-';
}
