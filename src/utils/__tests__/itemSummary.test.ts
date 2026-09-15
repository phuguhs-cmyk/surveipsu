import { summarizeItemsByType, summarizeItemRows, formatDimensionSummary, ItemSummary } from '../itemSummary';

describe('formatNum (via formatDimensionSummary)', () => {
  it('formats whole numbers without trailing zeros and rounds to 2 decimals', () => {
    const summary: ItemSummary = {
      itemId: 'x', label: 'x', totalLength: 100, avgWidth: 3, avgHeight: null,
      freeformDimension: '', notes: '', rows: [],
    };
    expect(formatDimensionSummary(summary)).toBe('P: 100 m, L: 3 m');
  });
});

describe('summarizeItemRows - Jalan (length-weighted average)', () => {
  it('computes weighted average width using segment length as weight', () => {
    const rows = [
      { 'Panjang Segmen (m)': '2', 'Lebar STA Awal (m)': '1', 'Lebar STA Akhir (m)': '1' },
      { 'Panjang Segmen (m)': '20', 'Lebar STA Awal (m)': '3', 'Lebar STA Akhir (m)': '3' },
    ];
    const summary = summarizeItemRows('IT1', 'Jalan', rows);
    expect(summary.totalLength).toBe(22);
    // (2*1 + 20*3) / 22 = 62/22 = 2.818...
    expect(summary.avgWidth).toBeCloseTo(62 / 22, 5);
  });

  it('averages start/end width (trapezoid) per row before weighting', () => {
    const rows = [
      { 'Panjang Segmen (m)': '10', 'Lebar STA Awal (m)': '2', 'Lebar STA Akhir (m)': '4' },
    ];
    const summary = summarizeItemRows('IT1', 'Jalan', rows);
    expect(summary.avgWidth).toBe(3); // (2+4)/2
  });

  it('falls back to simple average when no row has valid length', () => {
    const rows = [
      { 'Lebar STA Awal (m)': '2', 'Lebar STA Akhir (m)': '4' },
      { 'Lebar STA Awal (m)': '6', 'Lebar STA Akhir (m)': '6' },
    ];
    const summary = summarizeItemRows('IT1', 'Jalan', rows);
    expect(summary.totalLength).toBeNull();
    // simple avg of row averages: (3 + 6) / 2 = 4.5
    expect(summary.avgWidth).toBe(4.5);
  });
});

describe('summarizeItemRows - Gorong-gorong (freeform dimension)', () => {
  it('merges distinct dimension text values', () => {
    const rows = [
      { 'Dimensi': '30 cm' },
      { 'Dimensi': '30 cm' },
      { 'Dimensi': '40x60 cm' },
    ];
    const summary = summarizeItemRows('IT1', 'Gorong-gorong', rows);
    expect(summary.freeformDimension).toBe('30 cm | 40x60 cm');
  });
});

describe('summarizeItemRows - unknown/dynamic type', () => {
  it('uses Dimensi/Ukuran and Catatan Teknis columns', () => {
    const rows = [
      { 'Dimensi/Ukuran': '5000 L', 'Catatan Teknis': 'Baik' },
    ];
    const summary = summarizeItemRows('IT1', 'SPAM', rows);
    expect(summary.totalLength).toBeNull();
    expect(summary.freeformDimension).toBe('5000 L');
    expect(summary.notes).toBe('Baik');
  });
});

describe('summarizeItemsByType', () => {
  it('groups rows by ID Item Pekerjaan', () => {
    const typeRows = [
      { 'ID Item Pekerjaan': 'A', 'Panjang Segmen (m)': '10', 'Lebar STA Awal (m)': '2', 'Lebar STA Akhir (m)': '2' },
      { 'ID Item Pekerjaan': 'A', 'Panjang Segmen (m)': '5', 'Lebar STA Awal (m)': '2', 'Lebar STA Akhir (m)': '2' },
      { 'ID Item Pekerjaan': 'B', 'Panjang Segmen (m)': '8', 'Lebar STA Awal (m)': '3', 'Lebar STA Akhir (m)': '3' },
    ];
    const summaries = summarizeItemsByType('Jalan', typeRows);
    expect(summaries.length).toBe(2);
    expect(summaries[0].itemId).toBe('A');
    expect(summaries[0].totalLength).toBe(15);
    expect(summaries[1].itemId).toBe('B');
    expect(summaries[1].totalLength).toBe(8);
  });

  it('falls back to location or row index when ID Item Pekerjaan is missing', () => {
    const typeRows = [
      { 'Alamat/Keterangan Lokasi': 'Jl. A', 'Panjang Segmen (m)': '10' },
    ];
    const summaries = summarizeItemsByType('Jalan', typeRows);
    expect(summaries.length).toBe(1);
    expect(summaries[0].itemId).toBe('Jl. A');
  });
});
