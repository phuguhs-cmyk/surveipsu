import {
  buildCartoTileUrlTemplate,
  buildCartoLabelTileUrlTemplate,
  buildEsriImageryTileUrlTemplate,
  buildEsriTileUrlTemplate,
  buildOfflineMapTileUrlTemplate,
  buildOnlineVectorStyleUrl,
} from '../config';

describe('buildCartoTileUrlTemplate', () => {
  it('jatuh ke Esri World Street Map ketika tidak ada API key', () => {
    expect(buildCartoTileUrlTemplate('')).toBe(buildEsriTileUrlTemplate());
    expect(buildCartoTileUrlTemplate(undefined)).toBe(buildEsriTileUrlTemplate());
  });

  it('menghasilkan URL Carto dengan query api_key ketika key tersedia', () => {
    const url = buildCartoTileUrlTemplate('rahasia123');
    expect(url).toBe('https://a.basemaps.cartocdn.com/rastertiles/voyager_labels_under/{z}/{x}/{y}.png?api_key=rahasia123');
  });

  it('meng-encode key yang mengandung karakter khusus', () => {
    const url = buildCartoTileUrlTemplate('a b&c');
    expect(url).toContain('api_key=a%20b%26c');
  });

  it('mengabaikan whitespace di sekitar key', () => {
    expect(buildCartoTileUrlTemplate('  ')).toBe(buildEsriTileUrlTemplate());
  });
});

describe('buildCartoLabelTileUrlTemplate', () => {
  it('jatuh ke Esri World_Transportation ketika tidak ada key', () => {
    expect(buildCartoLabelTileUrlTemplate('')).toBe(
      'https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}'
    );
  });

  it('menghasilkan URL Carto label-only dengan key', () => {
    expect(buildCartoLabelTileUrlTemplate('key1')).toBe(
      'https://a.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}.png?api_key=key1'
    );
  });
});

describe('buildEsriImageryTileUrlTemplate', () => {
  it('selalu mengembalikan URL World_Imagery tanpa key', () => {
    expect(buildEsriImageryTileUrlTemplate()).toBe(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
    );
  });
});

describe('buildEsriTileUrlTemplate', () => {
  it('selalu mengembalikan URL World_Street_Map', () => {
    expect(buildEsriTileUrlTemplate()).toBe(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}'
    );
  });
});

describe('buildOfflineMapTileUrlTemplate', () => {
  it('menghasilkan URL MapTiler ketika key tersedia', () => {
    expect(buildOfflineMapTileUrlTemplate('mt-key')).toBe(
      'https://api.maptiler.com/maps/streets-v2/{z}/{x}/{y}.png?key=mt-key'
    );
  });

  it('jatuh ke Esri World Street Map ketika key kosong/tidak diberikan', () => {
    expect(buildOfflineMapTileUrlTemplate('')).toBe(buildEsriTileUrlTemplate());
    expect(buildOfflineMapTileUrlTemplate()).toBe(buildEsriTileUrlTemplate());
    expect(buildOfflineMapTileUrlTemplate('   ')).toBe(buildEsriTileUrlTemplate());
  });
});

describe('buildOnlineVectorStyleUrl', () => {
  it('jatuh ke style OpenFreeMap (tanpa key) ketika key tidak diberikan', () => {
    const fallback = buildOnlineVectorStyleUrl();
    expect(buildOnlineVectorStyleUrl('')).toBe(fallback);
    expect(fallback).not.toContain('maptiler.com');
  });

  it('menghasilkan URL style MapTiler Streets v2 ketika key tersedia', () => {
    const url = buildOnlineVectorStyleUrl('mt-key');
    expect(url).toContain('api.maptiler.com');
    expect(url).toContain('mt-key');
  });
});
