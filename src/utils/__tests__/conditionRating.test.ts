import { deriveOverallCondition, classifyRoadSegmentCondition, classifyDrainageCondition } from '../conditionRating';

describe('deriveOverallCondition', () => {
  it('returns the worst condition among multiple segments', () => {
    expect(deriveOverallCondition(['Baik', 'Rusak Ringan', 'Rusak Berat'])).toBe('Rusak Berat');
    expect(deriveOverallCondition(['Baik', 'Baik'])).toBe('Baik');
    expect(deriveOverallCondition(['Rusak Sedang', 'Rusak Ringan'])).toBe('Rusak Sedang');
  });

  it('ignores empty/invalid values', () => {
    expect(deriveOverallCondition(['', undefined, 'Rusak Ringan'])).toBe('Rusak Ringan');
  });

  it('returns empty string when no valid condition present', () => {
    expect(deriveOverallCondition(['', undefined])).toBe('');
    expect(deriveOverallCondition([])).toBe('');
  });
});

describe('classifyRoadSegmentCondition', () => {
  it('classifies as Baik when damage percentage and depth are small', () => {
    const result = classifyRoadSegmentCondition({
      length: '100', widthStart: '4', widthEnd: '4', damageLength: '2', damageWidth: '1', damageDepth: '0.5',
    });
    expect(result).toBe('Baik');
  });

  it('classifies as Rusak Berat when damage percentage is large', () => {
    const result = classifyRoadSegmentCondition({
      length: '100', widthStart: '4', widthEnd: '4', damageLength: '50', damageWidth: '3', damageDepth: '0.5',
    });
    expect(result).toBe('Rusak Berat');
  });

  it('classifies as Rusak Berat when damage depth is deep even if area is small', () => {
    const result = classifyRoadSegmentCondition({
      length: '100', widthStart: '4', widthEnd: '4', damageLength: '2', damageWidth: '1', damageDepth: '6',
    });
    expect(result).toBe('Rusak Berat');
  });

  it('returns null when no valid data present', () => {
    expect(classifyRoadSegmentCondition({})).toBeNull();
  });
});

describe('classifyDrainageCondition', () => {
  it('maps sediment condition to overall condition', () => {
    expect(classifyDrainageCondition('Tidak Ada')).toBe('Baik');
    expect(classifyDrainageCondition('Ringan')).toBe('Rusak Ringan');
    expect(classifyDrainageCondition('Sedang')).toBe('Rusak Sedang');
    expect(classifyDrainageCondition('Berat (Tersumbat)')).toBe('Rusak Berat');
  });

  it('returns null for unknown/empty value', () => {
    expect(classifyDrainageCondition('')).toBeNull();
    expect(classifyDrainageCondition(undefined)).toBeNull();
  });
});
