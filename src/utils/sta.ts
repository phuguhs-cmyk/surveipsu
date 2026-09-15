/**
 * Utilitas untuk mem-parsing & mengurutkan STA (Stasiun) jalan/drainase.
 * Format STA yang didukung: "0+000", "1+250.5", atau angka polos "125".
 * Notasi "km+meter" diubah menjadi total meter untuk keperluan
 * pengurutan & deteksi tumpang tindih (overlap) segmen secara otomatis.
 */

/**
 * Mengonversi string STA menjadi total meter (angka).
 * Mengembalikan NaN jika format tidak dikenali.
 */
export function parseStaToMeters(sta: string): number {
  if (!sta) return NaN;
  const trimmed = sta.trim().replace(',', '.');

  const plusMatch = trimmed.match(/^(\d+(?:\.\d+)?)\s*\+\s*(\d+(?:\.\d+)?)$/);
  if (plusMatch) {
    const km = parseFloat(plusMatch[1]);
    const meter = parseFloat(plusMatch[2]);
    if (isNaN(km) || isNaN(meter)) return NaN;
    return km * 1000 + meter;
  }

  const plain = parseFloat(trimmed);
  return isNaN(plain) ? NaN : plain;
}

/** Menghasilkan STA akhir dari STA awal dan jarak segmen. */
export function addStaDistance(staStart: string, distance: string): string {
  const start = parseStaToMeters(staStart);
  const length = parseFloat((distance || '').trim().replace(',', '.'));
  if (isNaN(start) || isNaN(length) || length <= 0) return '';

  const total = start + length;
  if (String(staStart).includes('+')) {
    const km = Math.floor(total / 1000);
    const meters = (total - km * 1000).toFixed(3).replace(/\.?(0+)$/, '');
    return `${km}+${meters.padStart(3, '0')}`;
  }
  return total.toFixed(3).replace(/\.?(0+)$/, '');
}

/** Mengecek apakah string STA valid (bisa di-parse menjadi angka). */
export function isValidSta(sta: string): boolean {
  return !isNaN(parseStaToMeters(sta));
}

/**
 * Mengurutkan array segmen (yang punya field staStart) berdasarkan STA awal
 * secara ascending. Mengembalikan array baru (tidak mengubah array asli).
 * Segmen dengan STA yang tidak valid ditempatkan di akhir, urut sesuai
 * posisi aslinya.
 */
export function sortSegmentsBySta<T extends { staStart: string }>(segments: T[]): T[] {
  return segments
    .map((seg, index) => ({ seg, index, sta: parseStaToMeters(seg.staStart) }))
    .sort((a, b) => {
      const aInvalid = isNaN(a.sta);
      const bInvalid = isNaN(b.sta);
      if (aInvalid && bInvalid) return a.index - b.index;
      if (aInvalid) return 1;
      if (bInvalid) return -1;
      if (a.sta !== b.sta) return a.sta - b.sta;
      return a.index - b.index;
    })
    .map((item) => item.seg);
}


/**
 * Mendeteksi tumpang tindih (overlap) antar segmen yang SUDAH terurut
 * berdasarkan STA awal (gunakan sortSegmentsBySta sebelumnya).
 * Mengembalikan daftar pesan peringatan (kosong jika tidak ada overlap).
 */
export function detectStaOverlaps<T extends { staStart: string; staEnd: string }>(
  sortedSegments: T[]
): string[] {
  const warnings: string[] = [];
  for (let i = 0; i < sortedSegments.length - 1; i++) {
    const current = sortedSegments[i];
    const next = sortedSegments[i + 1];
    const currentEnd = parseStaToMeters(current.staEnd);
    const nextStart = parseStaToMeters(next.staStart);
    if (isNaN(currentEnd) || isNaN(nextStart)) continue;
    if (currentEnd > nextStart) {
      warnings.push(
        `Segmen "${current.staStart} - ${current.staEnd}" tumpang tindih dengan segmen "${next.staStart} - ${next.staEnd}".`
      );
    }
  }
  return warnings;
}

/** Mengembalikan error yang membuat rentang STA tidak aman untuk disimpan. */
export function validateStaRanges<T extends { staStart: string; staEnd: string }>(segments: T[]): string[] {
  const errors: string[] = [];
  segments.forEach((segment) => {
    const start = parseStaToMeters(segment.staStart);
    const end = parseStaToMeters(segment.staEnd);
    if (!isNaN(start) && !isNaN(end) && end <= start) {
      errors.push(`STA akhir (${segment.staEnd}) harus lebih besar dari STA awal (${segment.staStart}).`);
    }
  });
  return errors.concat(detectStaOverlaps(sortSegmentsBySta(segments)));
}




/**
 * Menghitung posisi relatif terhadap STA pertama untuk setiap segmen, dipakai
 * untuk menggambar profil memanjang. Posisi absolut STA dipertahankan agar
 * jeda antarsegmen tidak hilang dari gambar. Segmen dengan STA tidak valid
 * ditempatkan di akhir dan diberi panjang 0.
 */
export function computeCumulativeDistances<T extends { staStart: string; staEnd: string }>(
  segments: T[]
): { seg: T; distStart: number; distEnd: number }[] {
  const sorted = sortSegmentsBySta(segments);
  const firstValidStart = sorted
    .map((seg) => parseStaToMeters(seg.staStart))
    .find((value) => !isNaN(value));
  const origin = firstValidStart ?? 0;
  let cursor = 0;
  return sorted.map((seg) => {
    const startMeters = parseStaToMeters(seg.staStart);
    const endMeters = parseStaToMeters(seg.staEnd);
    const hasValidRange = !isNaN(startMeters) && !isNaN(endMeters) && endMeters > startMeters;
    const distStart = hasValidRange ? startMeters - origin : cursor;
    const distEnd = hasValidRange ? endMeters - origin : distStart;
    cursor = Math.max(cursor, distEnd);
    return { seg, distStart, distEnd };
  });
}

/**
 * Mengurutkan baris laporan (hasil dari server, sudah dalam bentuk objek
 * dengan header sheet sebagai key) agar tampil secara logis per item
 * pekerjaan: segmen-segmen milik SATU item pekerjaan ("ID Item Pekerjaan")
 * dikelompokkan berurutan sesuai "No. Segmen", dan urutan antar-item
 * ditentukan oleh STA Awal segmen pertama tiap item (item dengan STA lebih
 * kecil tampil lebih dulu). Contoh hasil: "Segmen 1 STA 0+000-0+025",
 * "Segmen 2 STA 0+025-0+050", lalu item berikutnya "Segmen 1 STA 0+000-...".
 * Hanya berlaku untuk baris yang memiliki kolom "STA Awal" & "No. Segmen"
 * (Jalan/Drainase); baris lain dikembalikan apa adanya tanpa diurutkan ulang.
 */
export function sortReportRowsBySegment<T extends Record<string, any>>(rows: T[]): T[] {
  if (rows.length === 0) return rows;
  const hasStaColumns = rows.some((row) => row['STA Awal'] !== undefined || row['No. Segmen'] !== undefined);
  if (!hasStaColumns) return rows;

  const groups = new Map<string, { rows: T[]; firstIndex: number }>();
  const groupOrder: string[] = [];
  rows.forEach((row, index) => {
    const key = (row['ID Item Pekerjaan'] || `__row_${index}`).toString();
    if (!groups.has(key)) {
      groups.set(key, { rows: [], firstIndex: index });
      groupOrder.push(key);
    }
    groups.get(key)!.rows.push(row);
  });

  const groupList = groupOrder.map((key) => {
    const group = groups.get(key)!;
    const sortedRows = [...group.rows].sort((a, b) => {
      const segA = parseInt(a['No. Segmen'], 10);
      const segB = parseInt(b['No. Segmen'], 10);
      if (!isNaN(segA) && !isNaN(segB) && segA !== segB) return segA - segB;
      return 0;
    });
    const staValues = sortedRows
      .map((row) => parseStaToMeters(String(row['STA Awal'] ?? '')))
      .filter((v) => !isNaN(v));
    const minSta = staValues.length > 0 ? Math.min(...staValues) : NaN;
    return { key, rows: sortedRows, minSta, firstIndex: group.firstIndex };
  });

  groupList.sort((a, b) => {
    const aInvalid = isNaN(a.minSta);
    const bInvalid = isNaN(b.minSta);
    if (aInvalid && bInvalid) return a.firstIndex - b.firstIndex;
    if (aInvalid) return 1;
    if (bInvalid) return -1;
    if (a.minSta !== b.minSta) return a.minSta - b.minSta;
    return a.firstIndex - b.firstIndex;
  });

  return groupList.reduce<T[]>((acc, group) => acc.concat(group.rows), []);
}

