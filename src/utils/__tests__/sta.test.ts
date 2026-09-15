import {
  parseStaToMeters,
  addStaDistance,
  isValidSta,
  sortSegmentsBySta,
  detectStaOverlaps,
  computeCumulativeDistances,
  sortReportRowsBySegment,
} from '../sta';

describe('parseStaToMeters', () => {
  it('parses km+meter format', () => {
    expect(parseStaToMeters('1+250')).toBe(1250);
    expect(parseStaToMeters('0+000')).toBe(0);
    expect(parseStaToMeters('1+250.5')).toBe(1250.5);
  });

  it('parses plain numeric format', () => {
    expect(parseStaToMeters('125')).toBe(125);
    expect(parseStaToMeters('125.5')).toBe(125.5);
  });

  it('accepts comma as decimal separator', () => {
    expect(parseStaToMeters('1+250,5')).toBe(1250.5);
  });

  it('returns NaN for invalid/empty input', () => {
    expect(parseStaToMeters('')).toBeNaN();
    expect(parseStaToMeters('abc')).toBeNaN();
  });
});

describe('addStaDistance', () => {
  it('adds distance keeping km+meter format', () => {
    expect(addStaDistance('0+000', '250')).toBe('0+250');
    expect(addStaDistance('1+800', '500')).toBe('2+300');
  });

  it('adds distance keeping plain numeric format', () => {
    expect(addStaDistance('100', '50')).toBe('150');
  });

  it('returns empty string for invalid input', () => {
    expect(addStaDistance('', '50')).toBe('');
    expect(addStaDistance('0+000', '')).toBe('');
    expect(addStaDistance('0+000', '0')).toBe('');
    expect(addStaDistance('0+000', '-5')).toBe('');
  });
});

describe('isValidSta', () => {
  it('validates correctly', () => {
    expect(isValidSta('0+000')).toBe(true);
    expect(isValidSta('abc')).toBe(false);
  });
});

describe('sortSegmentsBySta', () => {
  it('sorts ascending by staStart', () => {
    const segs = [{ staStart: '1+000', id: 'b' }, { staStart: '0+000', id: 'a' }, { staStart: '2+000', id: 'c' }];
    const sorted = sortSegmentsBySta(segs);
    expect(sorted.map((s) => s.id)).toEqual(['a', 'b', 'c']);
  });

  it('pushes invalid STA segments to the end preserving original order', () => {
    const segs = [{ staStart: 'x', id: 'invalid1' }, { staStart: '0+000', id: 'valid' }, { staStart: 'y', id: 'invalid2' }];
    const sorted = sortSegmentsBySta(segs);
    expect(sorted.map((s) => s.id)).toEqual(['valid', 'invalid1', 'invalid2']);
  });
});

describe('detectStaOverlaps', () => {
  it('detects no overlap for sequential segments', () => {
    const segs = [
      { staStart: '0+000', staEnd: '0+100' },
      { staStart: '0+100', staEnd: '0+200' },
    ];
    expect(detectStaOverlaps(segs)).toEqual([]);
  });

  it('detects overlap when next start is before current end', () => {
    const segs = [
      { staStart: '0+000', staEnd: '0+150' },
      { staStart: '0+100', staEnd: '0+200' },
    ];
    const warnings = detectStaOverlaps(segs);
    expect(warnings.length).toBe(1);
    expect(warnings[0]).toContain('tumpang tindih');
  });
});

describe('computeCumulativeDistances', () => {
  it('computes distances relative to first valid STA', () => {
    const segs = [
      { staStart: '0+000', staEnd: '0+100' },
      { staStart: '0+100', staEnd: '0+250' },
    ];
    const result = computeCumulativeDistances(segs);
    expect(result[0]).toMatchObject({ distStart: 0, distEnd: 100 });
    expect(result[1]).toMatchObject({ distStart: 100, distEnd: 250 });
  });
});

describe('sortReportRowsBySegment', () => {
  it('groups by item id and orders segments by segment number', () => {
    const rows = [
      { 'ID Item Pekerjaan': 'IT1', 'No. Segmen': '2', 'STA Awal': '0+100' },
      { 'ID Item Pekerjaan': 'IT1', 'No. Segmen': '1', 'STA Awal': '0+000' },
      { 'ID Item Pekerjaan': 'IT2', 'No. Segmen': '1', 'STA Awal': '0+000' },
    ];
    const sorted = sortReportRowsBySegment(rows);
    expect(sorted.map((r) => r['No. Segmen'])).toEqual(['1', '2', '1']);
    expect(sorted[0]['ID Item Pekerjaan']).toBe('IT1');
  });

  it('returns rows unchanged if no STA columns present', () => {
    const rows = [{ foo: 'bar' }, { foo: 'baz' }];
    expect(sortReportRowsBySegment(rows)).toEqual(rows);
  });
});
