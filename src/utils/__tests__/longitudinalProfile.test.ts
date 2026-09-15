import { buildLongitudinalProfile, PROFILE_SERIES_CONFIG, ProfileSegmentInput } from '../longitudinalProfile';

function makeSegment(values: Record<string, string>): ProfileSegmentInput {
  return {
    staStart: values.staStart,
    staEnd: values.staEnd,
    get: (key: string) => values[key],
  };
}

describe('buildLongitudinalProfile - Jalan', () => {
  const seriesDefs = PROFILE_SERIES_CONFIG['Jalan'];

  it('builds width series across segments with correct distances', () => {
    const segments: ProfileSegmentInput[] = [
      makeSegment({ staStart: '0+000', staEnd: '0+100', widthStart: '3', widthEnd: '4' }),
      makeSegment({ staStart: '0+100', staEnd: '0+250', widthStart: '4', widthEnd: '5' }),
    ];
    const result = buildLongitudinalProfile(segments, seriesDefs);
    const widthSeries = result.series.find((s) => s.label === 'Lebar Jalan');
    expect(widthSeries).toBeDefined();
    expect(widthSeries!.points.length).toBe(2);
    expect(widthSeries!.points[0]).toMatchObject({ distStart: 0, distEnd: 100, valueStart: 3, valueEnd: 4 });
    expect(widthSeries!.points[1]).toMatchObject({ distStart: 100, distEnd: 250, valueStart: 4, valueEnd: 5 });
    expect(result.totalLength).toBe(250);
  });

  it('sorts unordered segments by STA before building profile', () => {
    const segments: ProfileSegmentInput[] = [
      makeSegment({ staStart: '0+100', staEnd: '0+250', widthStart: '4', widthEnd: '5' }),
      makeSegment({ staStart: '0+000', staEnd: '0+100', widthStart: '3', widthEnd: '4' }),
    ];
    const result = buildLongitudinalProfile(segments, seriesDefs);
    const widthSeries = result.series.find((s) => s.label === 'Lebar Jalan')!;
    expect(widthSeries.points[0].distStart).toBe(0);
    expect(widthSeries.points[1].distStart).toBe(100);
  });

  it('filters out series where all values are zero', () => {
    const segments: ProfileSegmentInput[] = [
      makeSegment({ staStart: '0+000', staEnd: '0+100', widthStart: '3', widthEnd: '4' }),
    ];
    const result = buildLongitudinalProfile(segments, seriesDefs);
    // Elevasi Jalan not provided -> all zero -> filtered out
    expect(result.series.find((s) => s.label === 'Elevasi Jalan')).toBeUndefined();
  });
});

describe('buildLongitudinalProfile - Dinding Penahan Tanah (DPT) cumulativeBase', () => {
  const seriesDefs = PROFILE_SERIES_CONFIG['Dinding Penahan Tanah (DPT)'];

  it('builds staircase profile using explicit base elevation when provided', () => {
    const segments: ProfileSegmentInput[] = [
      makeSegment({
        staStart: '0+000', staEnd: '0+050',
        heightStart: '2', heightEnd: '2',
        baseElevationStart: '10', baseElevationEnd: '10',
      }),
      makeSegment({
        staStart: '0+050', staEnd: '0+100',
        heightStart: '3', heightEnd: '3',
        baseElevationStart: '12', baseElevationEnd: '12',
      }),
    ];
    const result = buildLongitudinalProfile(segments, seriesDefs);
    const series = result.series.find((s) => s.label === 'Puncak Dinding')!;
    expect(series.points[0]).toMatchObject({ baseStart: 10, baseEnd: 10, valueStart: 2, valueEnd: 2 });
    expect(series.points[1]).toMatchObject({ baseStart: 12, baseEnd: 12, valueStart: 3, valueEnd: 3 });
  });

  it('highlights segments with tilt condition other than "Tidak Ada Pergeseran"', () => {
    const segments: ProfileSegmentInput[] = [
      makeSegment({
        staStart: '0+000', staEnd: '0+050', heightStart: '2', heightEnd: '2',
        baseElevationStart: '10', baseElevationEnd: '10', tiltCondition: 'Miring Ringan',
      }),
      makeSegment({
        staStart: '0+050', staEnd: '0+100', heightStart: '2', heightEnd: '2',
        baseElevationStart: '10', baseElevationEnd: '10', tiltCondition: 'Tidak Ada Pergeseran',
      }),
    ];
    const result = buildLongitudinalProfile(segments, seriesDefs);
    const series = result.series.find((s) => s.label === 'Puncak Dinding')!;
    expect(series.points[0].highlighted).toBe(true);
    expect(series.points[1].highlighted).toBe(false);
  });
});
