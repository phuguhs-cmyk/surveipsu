/**
 * Utilitas untuk mengonversi hasil ukur TINGGI MIRING (mis. diukur dengan pita
 * ukur/meteran menyusuri permukaan dinding yang miring) dan SUDUT KEMIRINGAN
 * (mis. dari klinometer/aplikasi sudut di HP) menjadi TINGGI VERTIKAL,
 * dipakai untuk mengisi field "Tinggi di STA Awal/Akhir" pada Dinding
 * Penahan Tanah (DPT) secara otomatis tanpa surveyor perlu menghitung manual
 * di kalkulator terpisah.
 *
 * Rumus (trigonometri dasar, segitiga siku-siku):
 *   Tinggi Vertikal = Tinggi Miring × sin(sudut)
 * dengan `sudut` diukur dari bidang HORIZONTAL (0° = rebah/datar,
 * 90° = tegak lurus/vertikal sempurna). Ini adalah konvensi paling umum
 * dipakai klinometer/aplikasi pengukur sudut di lapangan.
 */

/**
 * Menghitung tinggi vertikal dari tinggi miring & sudut kemiringan (derajat).
 * Mengembalikan NaN jika input tidak valid (bukan angka, tinggi miring <= 0,
 * atau sudut di luar rentang 0-90 derajat).
 */
export function computeVerticalHeightFromSlope(slopeLength: number, angleDegrees: number): number {
  if (!Number.isFinite(slopeLength) || !Number.isFinite(angleDegrees)) return NaN;
  if (slopeLength <= 0) return NaN;
  if (angleDegrees < 0 || angleDegrees > 90) return NaN;
  const radians = (angleDegrees * Math.PI) / 180;
  return slopeLength * Math.sin(radians);
}

/**
 * Versi string untuk dipakai langsung di input form: menerima teks (boleh
 * pakai koma sebagai desimal) dan mengembalikan tinggi vertikal berformat
 * 2 desimal, atau string kosong jika input tidak valid.
 */
export function computeVerticalHeightFromSlopeText(slopeLengthText: string, angleDegreesText: string): string {
  const slopeLength = parseFloat((slopeLengthText || '').trim().replace(',', '.'));
  const angleDegrees = parseFloat((angleDegreesText || '').trim().replace(',', '.'));
  const result = computeVerticalHeightFromSlope(slopeLength, angleDegrees);
  return Number.isFinite(result) ? result.toFixed(2) : '';
}
