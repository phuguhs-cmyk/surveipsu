import { computeVerticalHeightFromSlope, computeVerticalHeightFromSlopeText } from '../slopeHeight';

describe('computeVerticalHeightFromSlope', () => {
  it('computes vertical height using height = slope * sin(angle)', () => {
    // Tinggi miring 2 m, sudut 90° (tegak lurus) -> tinggi vertikal = 2 m
    expect(computeVerticalHeightFromSlope(2, 90)).toBeCloseTo(2, 5);
  });

  it('computes correctly for a 60 degree slope', () => {
    // 2 * sin(60°) = 2 * 0.8660254 = 1.7320508
    expect(computeVerticalHeightFromSlope(2, 60)).toBeCloseTo(1.7320508, 5);
  });

  it('returns 0 for a flat (0 degree) measurement', () => {
    expect(computeVerticalHeightFromSlope(5, 0)).toBeCloseTo(0, 5);
  });

  it('returns NaN for invalid inputs', () => {
    expect(computeVerticalHeightFromSlope(0, 45)).toBeNaN();
    expect(computeVerticalHeightFromSlope(-1, 45)).toBeNaN();
    expect(computeVerticalHeightFromSlope(2, -1)).toBeNaN();
    expect(computeVerticalHeightFromSlope(2, 91)).toBeNaN();
    expect(computeVerticalHeightFromSlope(NaN, 45)).toBeNaN();
  });
});

describe('computeVerticalHeightFromSlopeText', () => {
  it('parses text inputs (including comma decimal) and formats result to 2 decimals', () => {
    expect(computeVerticalHeightFromSlopeText('2', '90')).toBe('2.00');
    expect(computeVerticalHeightFromSlopeText('2,5', '45')).toBe((2.5 * Math.sin(Math.PI / 4)).toFixed(2));
  });

  it('returns empty string for invalid or missing input', () => {
    expect(computeVerticalHeightFromSlopeText('', '45')).toBe('');
    expect(computeVerticalHeightFromSlopeText('2', '')).toBe('');
    expect(computeVerticalHeightFromSlopeText('abc', '45')).toBe('');
    expect(computeVerticalHeightFromSlopeText('2', '120')).toBe('');
  });
});
