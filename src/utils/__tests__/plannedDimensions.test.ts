import { computeRoadSegmentPlanned, computeRetainingWallSegmentPlanned, computeDrainageSegmentPlanned } from '../plannedDimensions';

describe('computeRoadSegmentPlanned', () => {
  it('computes length from STA difference and average width from start/end', () => {
    const result = computeRoadSegmentPlanned({
      staStart: '0+000', staEnd: '0+100', widthStart: '3', widthEnd: '5',
    });
    expect(result.plannedLength).toBe('100.00');
    expect(result.plannedWidth).toBe('4.00');
  });

  it('falls back to `length` field when STA is invalid', () => {
    const result = computeRoadSegmentPlanned({
      staStart: '', staEnd: '', length: '50', widthStart: '3', widthEnd: '3',
    });
    expect(result.plannedLength).toBe('50.00');
    expect(result.plannedWidth).toBe('3.00');
  });

  it('ignores zero/invalid width values when averaging', () => {
    const result = computeRoadSegmentPlanned({
      staStart: '0+000', staEnd: '0+050', widthStart: '0', widthEnd: '4',
    });
    expect(result.plannedWidth).toBe('4.00');
  });

  it('returns empty strings when no valid data present', () => {
    const result = computeRoadSegmentPlanned({});
    expect(result.plannedLength).toBe('');
    expect(result.plannedWidth).toBe('');
  });

  it('computes per-segment values independently (no cross-segment averaging)', () => {
    const seg1 = computeRoadSegmentPlanned({ staStart: '0+000', staEnd: '0+010', widthStart: '2', widthEnd: '2' });
    const seg2 = computeRoadSegmentPlanned({ staStart: '0+010', staEnd: '0+200', widthStart: '6', widthEnd: '6' });
    expect(seg1.plannedWidth).toBe('2.00');
    expect(seg2.plannedWidth).toBe('6.00');
    expect(seg1.plannedLength).toBe('10.00');
    expect(seg2.plannedLength).toBe('190.00');
  });
});

describe('computeRetainingWallSegmentPlanned', () => {
  it('computes length from STA difference and average height from start/end', () => {
    const result = computeRetainingWallSegmentPlanned({
      staStart: '0+000', staEnd: '0+050', heightStart: '2', heightEnd: '4',
    });
    expect(result.plannedLength).toBe('50.00');
    expect(result.plannedHeight).toBe('3.00');
  });

  it('falls back to `length` field when STA is invalid', () => {
    const result = computeRetainingWallSegmentPlanned({
      staStart: '', staEnd: '', length: '30', heightStart: '2', heightEnd: '2',
    });
    expect(result.plannedLength).toBe('30.00');
    expect(result.plannedHeight).toBe('2.00');
  });
});

describe('computeDrainageSegmentPlanned', () => {
  it('computes length from STA difference and uses segment width/depth directly', () => {
    const result = computeDrainageSegmentPlanned({
      staStart: '0+000', staEnd: '0+025', width: '0.6', depth: '0.8',
    });
    expect(result.plannedLength).toBe('25.00');
    expect(result.plannedWidth).toBe('0.60');
    expect(result.plannedHeight).toBe('0.80');
  });

  it('falls back to `length` field when STA is invalid', () => {
    const result = computeDrainageSegmentPlanned({
      staStart: '', staEnd: '', length: '40', width: '0.5', depth: '0.5',
    });
    expect(result.plannedLength).toBe('40.00');
    expect(result.plannedWidth).toBe('0.50');
    expect(result.plannedHeight).toBe('0.50');
  });

  it('returns empty strings when no valid data present', () => {
    const result = computeDrainageSegmentPlanned({});
    expect(result.plannedLength).toBe('');
    expect(result.plannedWidth).toBe('');
    expect(result.plannedHeight).toBe('');
  });

  it('computes per-segment values independently (no cross-segment averaging)', () => {
    const seg1 = computeDrainageSegmentPlanned({ staStart: '0+000', staEnd: '0+010', width: '0.4', depth: '0.4' });
    const seg2 = computeDrainageSegmentPlanned({ staStart: '0+010', staEnd: '0+200', width: '0.9', depth: '1.2' });
    expect(seg1.plannedWidth).toBe('0.40');
    expect(seg2.plannedWidth).toBe('0.90');
    expect(seg1.plannedLength).toBe('10.00');
    expect(seg2.plannedLength).toBe('190.00');
  });
});
