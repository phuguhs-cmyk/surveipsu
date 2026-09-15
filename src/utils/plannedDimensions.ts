import { parseStaToMeters } from './sta';

/**
 * Utilitas bersama untuk menghitung Panjang/Lebar/Tinggi Rencana OTOMATIS
 * PER SEGMEN pada mode "Pembangunan Baru" (Jalan & Dinding Penahan Tanah).
 * Dipakai baik oleh WorkItemFormScreen.tsx (input data baru) maupun
 * EditItemScreen.tsx (edit data lama), sehingga logikanya SATU SUMBER dan
 * tidak bisa saling berbeda (sebelumnya sempat terpisah & EditItemScreen
 * lupa dihitung ulang, menyebabkan bug nilai gabungan seluruh item alih-alih
 * per segmen). Panjang Rencana = panjang segmen itu sendiri (|STA Akhir -
 * STA Awal|, fallback ke `length` yang tersimpan bila STA tak valid),
 * sedangkan Lebar/Tinggi Rencana = rata-rata trapesium dari widthStart/
 * widthEnd (Jalan) atau heightStart/heightEnd (DPT) MILIK segmen itu
 * sendiri saja.
 */
export function computeRoadSegmentPlanned(segment: {
  staStart?: string; staEnd?: string; length?: string; widthStart?: string; widthEnd?: string;
}): { plannedLength: string; plannedWidth: string } {
  const segStart = parseStaToMeters(segment.staStart || '');
  const segEnd = parseStaToMeters(segment.staEnd || '');
  const segLength = !isNaN(segStart) && !isNaN(segEnd)
    ? Math.abs(segEnd - segStart)
    : parseFloat((segment.length || '').replace(',', '.'));

  const wStart = parseFloat((segment.widthStart || '').replace(',', '.'));
  const wEnd = parseFloat((segment.widthEnd || '').replace(',', '.'));
  const validWidths = [wStart, wEnd].filter((v) => !isNaN(v) && v > 0);
  const avgWidth = validWidths.length > 0 ? validWidths.reduce((a, b) => a + b, 0) / validWidths.length : NaN;

  return {
    plannedLength: !isNaN(segLength) && segLength >= 0 ? segLength.toFixed(2) : '',
    plannedWidth: !isNaN(avgWidth) ? avgWidth.toFixed(2) : '',
  };
}

export function computeRetainingWallSegmentPlanned(segment: {
  staStart?: string; staEnd?: string; length?: string; heightStart?: string; heightEnd?: string;
}): { plannedLength: string; plannedHeight: string } {
  const segStart = parseStaToMeters(segment.staStart || '');
  const segEnd = parseStaToMeters(segment.staEnd || '');
  const segLength = !isNaN(segStart) && !isNaN(segEnd)
    ? Math.abs(segEnd - segStart)
    : parseFloat((segment.length || '').replace(',', '.'));

  const hStart = parseFloat((segment.heightStart || '').replace(',', '.'));
  const hEnd = parseFloat((segment.heightEnd || '').replace(',', '.'));
  const validHeights = [hStart, hEnd].filter((v) => !isNaN(v) && v > 0);
  const avgHeight = validHeights.length > 0 ? validHeights.reduce((a, b) => a + b, 0) / validHeights.length : NaN;

  return {
    plannedLength: !isNaN(segLength) && segLength >= 0 ? segLength.toFixed(2) : '',
    plannedHeight: !isNaN(avgHeight) ? avgHeight.toFixed(2) : '',
  };
}
