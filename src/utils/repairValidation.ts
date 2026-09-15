import { parseStaToMeters } from './sta';

export function parseNumericValue(value?: string | number | null): number | null {
  if (value === null || value === undefined || value === '') return null;
  const numeric = typeof value === 'number' ? value : parseFloat(String(value).replace(',', '.'));
  return Number.isFinite(numeric) ? numeric : null;
}

export function validateRepairDamageDimensions(segment: {
  length?: string | number | null;
  staStart?: string | null;
  staEnd?: string | null;
  widthStart?: string | number | null;
  widthEnd?: string | number | null;
  damageLength?: string | number | null;
  damageWidth?: string | number | null;
  damageDepth?: string | number | null;
}): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  let segmentLength = parseNumericValue(segment.length);
  if (segmentLength === null && segment.staStart && segment.staEnd) {
    const start = parseStaToMeters(segment.staStart);
    const end = parseStaToMeters(segment.staEnd);
    if (Number.isFinite(start) && Number.isFinite(end)) {
      segmentLength = Math.abs(end - start);
    }
  }

  const widthValues = [parseNumericValue(segment.widthStart), parseNumericValue(segment.widthEnd)]
    .filter((v): v is number => v !== null && v > 0);
  const segmentWidth = widthValues.length > 0 ? Math.max(...widthValues) : null;

  const damageLength = parseNumericValue(segment.damageLength);
  if (damageLength !== null && segmentLength !== null && damageLength > segmentLength) {
    errors.push('Panjang kerusakan tidak boleh melebihi panjang segmen yang disurvei.');
  }

  const damageWidth = parseNumericValue(segment.damageWidth);
  if (damageWidth !== null && segmentWidth !== null && damageWidth > segmentWidth) {
    errors.push('Lebar kerusakan tidak boleh melebihi lebar segmen yang disurvei.');
  }

  const damageDepth = parseNumericValue(segment.damageDepth);
  const segmentHeight = Math.max(segmentLength ?? 0, segmentWidth ?? 0);
  if (damageDepth !== null && segmentHeight > 0 && damageDepth > segmentHeight) {
    errors.push('Tinggi/kedalaman kerusakan tidak boleh melebihi dimensi segmen yang disurvei.');
  }

  return { valid: errors.length === 0, errors };
}
