import { LEAFLET_JS } from '../assets/leafletJs';
import { LEAFLET_CSS } from '../assets/leafletCss';
import { MAPLIBRE_GL_JS } from '../assets/maplibreGlJs';
import { MAPLIBRE_GL_CSS } from '../assets/maplibreGlCss';
import { PMTILES_JS } from '../assets/pmtilesJs';
import { MAPLIBRE_GL_LEAFLET_JS } from '../assets/maplibreGlLeafletJs';
import { GLYPHS_REGULAR_0_255_BASE64, GLYPHS_BOLD_0_255_BASE64 } from '../assets/offlineGlyphs';
import { CONFIG } from '../config';


export interface LeafletMarker {
  lat: number;
  lng: number;
  color: string;
  popupHtml: string;
  /**
   * Nama paket pekerjaan pemilik titik ini (opsional). Dipakai HANYA untuk
   * fitur pencarian paket di peta (`packageSearchEnabled`), agar marker bisa
   * disaring berdasarkan nama paket yang diketik pengguna.
   */
  packageName?: string;
  /**
   * Teks singkat yang ditampilkan sebagai LABEL PERMANEN (tooltip) tepat di
   * atas marker, tanpa perlu diketuk terlebih dahulu — mempermudah melihat
   * "detail infrastruktur" langsung dari tampilan peta. Opsional; jika tidak
   * diisi, marker hanya menampilkan popup saat diketuk (perilaku lama).
   */
  label?: string;
  /**
   * Kunci pengelompokan marker (mis. nama jenis infrastruktur: "Jalan",
   * "Jembatan", dst). Dipakai untuk membangun kontrol lapisan (legend
   * show/hide) per jenis saat `showLayerFilter` aktif, sehingga peta yang
   * padat titik bisa difokuskan ke satu/dua jenis infrastruktur saja.
   */
  groupKey?: string;
}

export interface LeafletAnnotation {
  id: string;
  type: 'polyline' | 'polygon';
  points: { lat: number; lng: number }[];
  color: string;
  label?: string;
}

export type OnlineMapMode = 'street' | 'satellite' | 'hybrid';

export interface BuildMapHtmlOptions {
  tileData: Record<string, string>;
  centerLat: number;
  centerLng: number;
  zoom: number;
  /** Mode tampilan peta online: street, satellite, atau hybrid. */
  mapMode?: OnlineMapMode;
  minZoom: number;
  maxZoom: number;
  /**
   * Level zoom TAMBAHAN (semu) yang diizinkan MELEBIHI `maxZoom` supaya
   * peta bisa diperbesar lebih jauh saat menggambar garis/polygon (lebih
   * nyaman disentuh jari), TANPA perlu tile asli tambahan: Leaflet akan
   * meng-upscale (memperbesar) tile PNG dari level `maxZoom` yang sudah
   * ada. Opsional, default 0 (tidak ada overshoot).
   */
  drawZoomOvershoot?: number;
  /**
   * Jika diisi, peta memuat ubin (tile) LANGSUNG dari internet lewat
   * `L.tileLayer` bawaan Leaflet memakai template URL ini (mis.
   * `OFFLINE_MAP_TILE_URL_TEMPLATE`), alih-alih memakai tile base64 yang
   * sudah diunduh (`tileData`/OfflineTileLayer). Dipakai untuk layar yang
   * SELALU membutuhkan koneksi internet (mis. peta lokasi paket per
   * pencarian), sehingga tidak perlu mengunduh/menyematkan tile terlebih
   * dahulu. Saat diisi, `tileData` diabaikan.
   */
  onlineTileUrlTemplate?: string;
  /** URL style MapLibre untuk mode vector online. */
  onlineVectorStyleUrl?: string;
  /**
   * URI lokal (`file://...`) dari file `.pmtiles` bawaan APK (lihat
   * `src/services/pmtilesAsset.ts`), berisi peta vector OpenStreetMap
   * (skema OpenMapTiles) hasil Planetiler. Jika diisi, sebuah mode peta
   * TAMBAHAN "Peta Offline" ditampilkan di tombol mode (berdampingan dengan
   * Peta/Satelit/Hybrid) yang merender data ini lewat MapLibre GL TANPA
   * memerlukan koneksi internet sama sekali (berbeda dari mode "Peta" yang
   * memakai tile online MapTiler/OpenFreeMap). Membutuhkan
   * `pmtiles-js` (dimuat via CDN) untuk mendaftarkan protokol `pmtiles://`
   * yang membaca file lokal via *range request* HTTP.
   */
  offlinePmtilesUri?: string;
  markers: LeafletMarker[];
  annotations: LeafletAnnotation[];
  /**
   * Jika `false`, toolbar gambar garis/polygon & tombol kunci peta TIDAK
   * ditampilkan sama sekali. Dipakai di layar yang hanya menampilkan peta
   * lokasi survei (mis. `PackageMapScreen`, dibuka dari menu "Lihat Peta")
   * dan tidak mendukung penyimpanan anotasi, supaya tombol yang tidak
   * berfungsi tidak muncul dan membingungkan pengguna. Default `true`
   * (perilaku lama, dipakai oleh `OfflineMapScreen`).
   */
  showDrawingTools?: boolean;
  /**
   * Jika `true`, menampilkan kotak pencarian di atas peta yang menyaring
   * marker berdasarkan `LeafletMarker.packageName` (dipakai saat menampilkan
   * peta SEMUA paket sekaligus, agar pengguna bisa langsung mencari paket
   * pekerjaan tertentu di peta). Default `false`.
   */
  packageSearchEnabled?: boolean;
  /**
   * Jika `true`, menampilkan panel legenda/filter di pojok kiri bawah peta
   * berisi checkbox per `LeafletMarker.groupKey` (mis. per jenis
   * infrastruktur), sehingga pengguna bisa menyembunyikan/menampilkan
   * kelompok marker tertentu saat peta padat titik. Default `false`.
   */
  showLayerFilter?: boolean;
}

function buildHeadHtml(opts: BuildMapHtmlOptions): string {
  const showDrawingTools = opts.showDrawingTools !== false;
  const packageSearchEnabled = !!opts.packageSearchEnabled;
  const showLayerFilter = !!opts.showLayerFilter;
  const layerFilterHtml = showLayerFilter
    ? `<div class="layerfilter" id="layerFilter"></div>`
    : '';
  const offlinePmtilesButtonHtml = opts.offlinePmtilesUri
    ? `\n  <button class="mode-btn" data-mode="offline">Peta Offline</button>`
    : '';
  const mapModeButtonsInner = `<button class="mode-btn active" data-mode="street">Peta</button>
  <button class="mode-btn" data-mode="satellite">Satelit</button>
  <button class="mode-btn" data-mode="hybrid">Hybrid</button>${offlinePmtilesButtonHtml}`;
  // Saat toolbar gambar (Garis/Polygon/Kunci Peta) DAN tombol mode peta
  // (Peta/Satelit/Hybrid) sama-sama tampil, keduanya digabung ke satu
  // container flex-wrap yang sama. Sebelumnya masing-masing punya
  // container `position: absolute` sendiri (`.toolbar` & `.mapmode`) yang
  // saling menimpa di layar sempit karena toolbar yang wrap ke baris kedua
  // tetap berada dalam area kotak `.mapmode` yang mengambang di atasnya,
  // sehingga tombol "Kunci Peta" menutupi tombol mode peta. Dengan
  // digabung dalam satu flex container, saat ruang tidak cukup semua
  // tombol otomatis wrap ke baris berikutnya tanpa saling menimpa.
  const mapModeHtml =
    opts.onlineTileUrlTemplate && !showDrawingTools
      ? `<div class="mapmode">
  ${mapModeButtonsInner}
</div>`
      : '';
  const toolbarHtml = showDrawingTools
    ? `<div class="toolbar">
  <button id="btnLine">Garis</button>
  <button id="btnPolygon">Polygon</button>
  <button id="btnLock" class="secondary" title="Kunci peta agar tidak bergeser saat menggambar">🔓 Kunci Peta</button>
  <button id="btnFinish" class="secondary" style="display:none;">Selesai &amp; Simpan</button>
  <button id="btnCancel" class="secondary" style="display:none;">Batal</button>
  ${opts.onlineTileUrlTemplate ? mapModeButtonsInner : ''}
</div>
<div class="hint" id="hint">Ketuk peta untuk menambah titik. Tekan "Selesai &amp; Simpan" jika sudah cukup.</div>`
    : '';
  // PENTING: kotak pencarian paket (`.searchbar`) dan tombol mode peta
  // (`.mapmode`) SEBELUMNYA masing-masing memakai `position: absolute`
  // dengan offset kanan tetap (`right: 60px` vs `right: 12px`), sehingga di
  // lebar layar tertentu (mis. web desktop dengan 3 tombol mode + label
  // panjang "Hybrid") kotak `.mapmode` melebar ke kiri dan MENIMPA kotak
  // pencarian meski keduanya sudah diberi z-index sama. Sekarang keduanya
  // digabung dalam SATU baris flex (`.topbar`) yang sama persis seperti pola
  // `.toolbar` di atas: search box mengambil sisa ruang (`flex: 1`) dan
  // tombol mode peta tidak pernah tumpang tindih karena posisinya statis
  // relatif terhadap flex row (bukan `position: absolute` independen lagi).
  const searchBoxHtml = packageSearchEnabled
    ? `<div class="searchbar">
  <input id="pkgSearch" type="text" placeholder="Cari nama paket pekerjaan..." autocomplete="off" />
</div>`
    : '';
  const topBarHtml =
    searchBoxHtml || mapModeHtml
      ? `<div class="topbar">
  ${searchBoxHtml}
  ${mapModeHtml}
</div>`
      : '';

  const needsMapLibre = !!(opts.onlineVectorStyleUrl || opts.offlinePmtilesUri);
  // MapLibre GL, plugin maplibre-gl-leaflet, dan pmtiles-js DISEMATKAN
  // LANGSUNG (bukan dimuat dari CDN unpkg.com) supaya mode "Peta Offline"
  // benar-benar berfungsi tanpa koneksi internet sama sekali — sebelumnya
  // ketiga skrip ini dimuat lewat <script src="https://unpkg.com/...">,
  // sehingga di perangkat tanpa internet skrip tsb GAGAL dimuat dan mode
  // "Peta Offline" tidak pernah bisa merender apa pun.
  const pmtilesScript = opts.offlinePmtilesUri
    ? `<script>${PMTILES_JS}</script>`
    : '';
  const vectorHead = needsMapLibre
    ? `<style>${MAPLIBRE_GL_CSS}</style>
<script>${MAPLIBRE_GL_JS}</script>
${pmtilesScript}
<style>${LEAFLET_CSS}</style>`
    : `<style>${LEAFLET_CSS}</style>`;
  // Plugin maplibre-gl-leaflet MEMBUTUHKAN `L` (Leaflet) sudah dimuat
  // sebelum ia dieksekusi (ia mendaftarkan `L.maplibreGL(...)`), sedangkan
  // `LEAFLET_JS` baru disematkan di <body> (bukan <head>). Karena itu
  // script plugin ini dimuat SETELAH `${'${LEAFLET_JS}'}` di bawah, bukan
  // digabung ke `vectorHead` yang berada di <head>.
  const vectorPluginScript = needsMapLibre
    ? `<script>${MAPLIBRE_GL_LEAFLET_JS}</script>`
    : '';

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
${vectorHead}
<style>
  html, body, #map { height: 100%; width: 100%; margin: 0; padding: 0; }
  .toolbar { position: absolute; top: 10px; left: 10px; right: 10px; z-index: 1000; display: flex; gap: 6px; flex-wrap: wrap; pointer-events: none; }
  .toolbar button { pointer-events: auto; background: #2563eb; color: #fff; border: none; border-radius: 8px; padding: 8px 12px; font-size: 12px; font-weight: 700; box-shadow: 0 2px 4px rgba(0,0,0,0.25); }
  .toolbar button.secondary { background: #64748b; }
  .toolbar button.active { background: #16a34a; }
  .toolbar .mode-btn { background: rgba(15,23,42,0.85); border: 1px solid rgba(255,255,255,.4); box-shadow: none; }
  .toolbar .mode-btn.active { background: #2563eb; border-color: #2563eb; }
  .hint { position: absolute; bottom: 10px; left: 10px; right: 10px; z-index: 1000; background: rgba(15,23,42,0.85); color: #fff; padding: 8px 12px; border-radius: 8px; font-size: 12px; text-align: center; display: none; }
  .topbar { position: absolute; top: 10px; left: 10px; right: 10px; z-index: 1000; display: flex; gap: 8px; align-items: flex-start; flex-wrap: wrap; }
  .searchbar { flex: 1 1 200px; min-width: 0; }
  .searchbar input { width: 100%; box-sizing: border-box; border: none; border-radius: 8px; padding: 10px 14px; font-size: 14px; box-shadow: 0 2px 6px rgba(0,0,0,0.3); }
  .mapmode { flex: 0 0 auto; display: flex; gap: 6px; background: rgba(15, 23, 42, 0.8); padding: 6px; border-radius: 10px; }
  .mode-btn { background: transparent; border: 1px solid rgba(255,255,255,.4); color: #fff; border-radius: 8px; padding: 6px 10px; font-size: 11px; font-weight: 700; white-space: nowrap; }
  .mode-btn.active { background: #2563eb; border-color: #2563eb; }
  .layerfilter { position: absolute; bottom: 10px; left: 10px; z-index: 1000; background: rgba(255,255,255,0.95); border-radius: 10px; padding: 8px 10px; box-shadow: 0 2px 6px rgba(0,0,0,0.25); font-size: 12px; max-width: 60%; max-height: 40%; overflow-y: auto; }
  .layerfilter .lf-title { font-weight: 700; color: #0f172a; margin-bottom: 4px; }
  .layerfilter label { display: flex; align-items: center; gap: 6px; color: #334155; padding: 2px 0; white-space: nowrap; }
  .layerfilter input { margin: 0; }
  .lf-swatch { display: inline-block; width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
  .marker-label { background: rgba(15,23,42,0.85); color: #fff; border: none; box-shadow: 0 1px 3px rgba(0,0,0,0.4); padding: 2px 6px; font-size: 11px; font-weight: 600; border-radius: 6px; }
  .marker-label::before { display: none; }
</style>
</head>
<body>
<div id="map"></div>
${topBarHtml}
${toolbarHtml}
${layerFilterHtml}
<script>${LEAFLET_JS}</script>
${vectorPluginScript}
<script>
`;
}

const FOOT_HTML = `
</script>
</body>
</html>`;

function buildScript(
  tileDataJson: string,
  markersJson: string,
  annotationsJson: string,
  opts: BuildMapHtmlOptions
): string {
  const mapMode = opts.mapMode || 'hybrid';
  // PENTING: JANGAN memakai tile.openstreetmap.org langsung di sini — server
  // tsb MELARANG pengunduhan otomatis/bulk (lihat kebijakan
  // https://operations.osmfoundation.org/policies/tiles/) dan akan
  // memblokir aplikasi dengan pesan "Access blocked: app is not following
  // the tile usage policy of OpenStreetMap", membuat mode "Peta" (street)
  // gagal menampilkan tile (kotak abu-abu). Pakai sumber dari CONFIG yang
  // sudah memiliki fallback aman (Esri/Carto), sama seperti yang dipakai
  // buildOfflineMapTileUrlTemplate/ONLINE_MAP_MODES di config.ts.
  const streetUrl = CONFIG.ONLINE_MAP_MODES.street.tileUrlTemplate;
  const satelliteUrl = CONFIG.ONLINE_MAP_MODES.satellite.tileUrlTemplate;
  const hybridLabelUrl = CONFIG.ONLINE_MAP_MODES.hybrid.labelTileUrlTemplate;
  const maxNativeZoom = opts.maxZoom;
  const maxZoomWithOvershoot = opts.maxZoom + (opts.drawZoomOvershoot || 0);
  const showDrawingTools = opts.showDrawingTools !== false;
  const packageSearchEnabled = !!opts.packageSearchEnabled;
  const showLayerFilter = !!opts.showLayerFilter;

  const tileLayerScript = opts.onlineTileUrlTemplate
    ? ''
    : `
  var OfflineTileLayer = L.GridLayer.extend({
    createTile: function (coords, done) {
      var container = document.createElement('div');
      container.style.width = '256px';
      container.style.height = '256px';
      container.style.overflow = 'hidden';
      var z = Math.min(coords.z, MAX_NATIVE_ZOOM);
      var scale = Math.pow(2, coords.z - z);
      var nativeX = Math.floor(coords.x / scale);
      var nativeY = Math.floor(coords.y / scale);
      var key = z + '/' + nativeX + '/' + nativeY;
      var data = TILE_DATA[key];
      if (data) {
        var img = document.createElement('img');
        var size = 256 * scale;
        var offsetX = -(coords.x % scale) * 256;
        var offsetY = -(coords.y % scale) * 256;
        img.src = data;
        img.style.width = size + 'px';
        img.style.height = size + 'px';
        img.style.position = 'relative';
        img.style.left = offsetX + 'px';
        img.style.top = offsetY + 'px';
        img.style.imageRendering = 'pixelated';
        container.appendChild(img);
      } else {
        container.style.background = '#e2e8f0';
      }
      setTimeout(function () { done(null, container); }, 0);
      return container;
    },
  });
  new OfflineTileLayer({ tileSize: 256, minZoom: MIN_ZOOM, maxZoom: MAX_ZOOM, maxNativeZoom: MAX_NATIVE_ZOOM }).addTo(map);
`;

  const vectorStyleUrl = opts.onlineVectorStyleUrl || '';
  const offlinePmtilesUri = opts.offlinePmtilesUri || '';
  // Style OpenMapTiles minimal (skema yang dipakai Planetiler) untuk
  // menampilkan jalan, air, bangunan, area hijau, dan label tempat dari
  // file PMTiles lokal, TANPA memerlukan glyph/sprite server online — label
  // (nama jalan, tempat, POI) memakai glyph SDF yang disematkan LANGSUNG di
  // JS bundle (base64, dari GLYPHS_REGULAR_0_255_BASE64/GLYPHS_BOLD_0_255_BASE64
  // di src/assets/offlineGlyphs.ts) dan dilayani lewat protocol kustom
  // 'offlineglyph://' sehingga label tetap muncul walau tidak ada internet.
  const glyphsRegularB64 = GLYPHS_REGULAR_0_255_BASE64;
  const glyphsBoldB64 = GLYPHS_BOLD_0_255_BASE64;
  const offlineStyleScript = offlinePmtilesUri
    ? `
  var offlinePmtilesUri = ${JSON.stringify(offlinePmtilesUri)};
  var offlineStreetLayer = null;
  if (window.pmtiles && window.maplibregl && window.L && typeof L.maplibreGL === 'function') {
    try {
      // Daftarkan sumber GLYPH (font SDF) offline: MapLibre GL meminta
      // glyph lewat URL berpola 'offlineglyph://{fontstack}/{range}.pbf',
      // kita layani dari base64 yang sudah disematkan di JS bundle (bukan
      // dari jaringan/file), memakai varian Bold jika nama font memuat kata
      // "Bold", selain itu varian Regular. Hanya rentang 0-255 (Latin dasar
      // + Latin-1 Supplement) yang disematkan — cukup untuk nama tempat di
      // Indonesia (huruf Latin biasa/beraksen).
      function base64ToArrayBuffer(base64) {
        var binary = atob(base64);
        var len = binary.length;
        var bytes = new Uint8Array(len);
        for (var i = 0; i < len; i++) { bytes[i] = binary.charCodeAt(i); }
        return bytes.buffer;
      }
      var glyphsRegularBuffer = base64ToArrayBuffer(${JSON.stringify(glyphsRegularB64)});
      var glyphsBoldBuffer = base64ToArrayBuffer(${JSON.stringify(glyphsBoldB64)});
      maplibregl.addProtocol('offlineglyph', function (params, callback) {
        var isBold = /bold/i.test(params.url);
        callback(null, isBold ? glyphsBoldBuffer : glyphsRegularBuffer, null, null);
        return { cancel: function () {} };
      });
      var pmtilesProtocol = new pmtiles.Protocol();
      maplibregl.addProtocol('pmtiles', pmtilesProtocol.tile);
      var pmSourceUrl = 'pmtiles://' + offlinePmtilesUri;
      // PENTING: JANGAN biarkan pmtiles-js membuat sumber datanya sendiri
      // dari string URL (FetchSource) — implementasi tsb membaca file lewat
      // *HTTP Range request* (header \"Range\") via fetch(), yang TIDAK
      // didukung oleh WebView Android/iOS untuk skema file://. Akibatnya
      // setiap pembacaan ubin gagal secara ASINKRON (tidak tertangkap oleh
      // try/catch sinkron di sini) sehingga mode \"Peta Offline\" tampak
      // aktif (tombol berubah) tapi peta tetap kosong/tidak pernah tampil,
      // tanpa error yang terlihat oleh pengguna. Untuk menghindarinya, file
      // PMTiles dibaca UTUH sekali via XMLHttpRequest SINKRON (aman karena
      // file lokal & hanya dijalankan sekali saat peta disiapkan), disimpan
      // sebagai ArrayBuffer di memori, lalu setiap permintaan byte-range
      // dilayani dengan slicing ArrayBuffer tsb di memori (tanpa request
      // jaringan/berkas sama sekali).
      var pmXhr = new XMLHttpRequest();
      pmXhr.open('GET', offlinePmtilesUri, false);
      pmXhr.responseType = 'arraybuffer';
      pmXhr.send(null);
      var pmFileBuffer = pmXhr.response;
      if (!pmFileBuffer || !pmFileBuffer.byteLength) {
        throw new Error('Gagal membaca file PMTiles offline (status ' + pmXhr.status + ')');
      }
      var pmInMemorySource = {
        getKey: function () { return offlinePmtilesUri; },
        getBytes: function (offset, length) {
          return Promise.resolve({ data: pmFileBuffer.slice(offset, offset + length) });
        },
      };
      pmtilesProtocol.add(new pmtiles.PMTiles(pmInMemorySource));
      // Style diperkaya (bukan hanya garis/isian dasar) supaya semirip mungkin
      // dengan peta pada umumnya (mis. Google Maps) walau tetap 100% offline:
      // - Jalan diberi warna & ketebalan BERBEDA per kelas (motorway/trunk s.d.
      //   jalan kecil/setapak), lengkap dengan "casing" (garis pinggir) supaya
      //   terlihat seperti jalan aspal sungguhan, bukan garis polos.
      // - Label NAMA JALAN ditampilkan mengikuti bentuk jalan (symbol-placement
      //   'line') dari layer 'transportation_name'.
      // - Titik POI (source-layer 'poi') ditampilkan sebagai bulatan kecil +
      //   label nama, mirip penanda tempat penting di Google Maps.
      // - Area taman/hutan (park) & nomor rumah (housenumber) ditambahkan.
      // - Label KOTA/DESA (place) dibedakan ukurannya per tingkat penting
      //   (class) supaya nama kota besar lebih menonjol dari dusun kecil.
      // Semua field/kelas di bawah adalah skema STANDAR OpenMapTiles yang
      // sudah tersedia di data 'banjarnegara.pmtiles' (dibuat via Planetiler),
      // sehingga tidak perlu regenerasi data, cukup memperkaya cara render.
      var roadColor = ['match', ['get', 'class'],
        ['motorway'], '#f59e0b',
        ['trunk'], '#fb923c',
        ['primary'], '#fbbf24',
        ['secondary'], '#fde68a',
        ['tertiary'], '#ffffff',
        ['minor', 'service'], '#ffffff',
        ['track', 'path'], '#c9b48c',
        '#e5e7eb'
      ];
      var roadCaseColor = ['match', ['get', 'class'],
        ['motorway'], '#c2740a',
        ['trunk'], '#c2650a',
        ['primary'], '#b8860b',
        ['secondary'], '#d1b46a',
        ['tertiary', 'minor', 'service'], '#9ca3af',
        ['track', 'path'], '#a08a63',
        '#9ca3af'
      ];
      var roadWidth = ['interpolate', ['linear'], ['zoom'],
        5, ['match', ['get', 'class'], ['motorway', 'trunk', 'primary'], 0.6, 0.2],
        11, ['match', ['get', 'class'], ['motorway', 'trunk', 'primary'], 2, ['secondary', 'tertiary'], 1, 0.5],
        14, ['match', ['get', 'class'], ['motorway', 'trunk', 'primary'], 5, ['secondary', 'tertiary'], 3, ['track', 'path'], 1, 1.5],
        18, ['match', ['get', 'class'], ['motorway', 'trunk', 'primary'], 16, ['secondary', 'tertiary'], 11, ['track', 'path'], 3, 7]
      ];
      var roadCaseWidth = ['interpolate', ['linear'], ['zoom'],
        5, 0.9,
        11, ['match', ['get', 'class'], ['motorway', 'trunk', 'primary'], 3, ['secondary', 'tertiary'], 1.6, 0.8],
        14, ['match', ['get', 'class'], ['motorway', 'trunk', 'primary'], 7, ['secondary', 'tertiary'], 4.5, 2.2],
        18, ['match', ['get', 'class'], ['motorway', 'trunk', 'primary'], 20, ['secondary', 'tertiary'], 14, 9]
      ];

      var offlineStyle = {
        version: 8,
        glyphs: 'offlineglyph://fonts/{fontstack}/{range}.pbf',
        sources: {
          openmaptiles: { type: 'vector', url: pmSourceUrl },
        },
        layers: [
          { id: 'background', type: 'background', paint: { 'background-color': '#f2efe9' } },
          { id: 'landcover', type: 'fill', source: 'openmaptiles', 'source-layer': 'landcover', paint: { 'fill-color': '#d8e8c8', 'fill-opacity': 0.5 } },
          { id: 'landuse', type: 'fill', source: 'openmaptiles', 'source-layer': 'landuse', paint: { 'fill-color': '#e6e0d4', 'fill-opacity': 0.6 } },
          { id: 'park', type: 'fill', source: 'openmaptiles', 'source-layer': 'park', paint: { 'fill-color': '#c8e6b0', 'fill-opacity': 0.55 } },
          { id: 'water', type: 'fill', source: 'openmaptiles', 'source-layer': 'water', paint: { 'fill-color': '#a0c8f0' } },
          { id: 'waterway', type: 'line', source: 'openmaptiles', 'source-layer': 'waterway', paint: { 'line-color': '#a0c8f0', 'line-width': ['interpolate', ['linear'], ['zoom'], 8, 0.5, 16, 3] } },
          { id: 'building', type: 'fill', source: 'openmaptiles', 'source-layer': 'building', minzoom: 12, paint: { 'fill-color': '#d9d0c3', 'fill-outline-color': '#c2b8a8' } },
          { id: 'road-case', type: 'line', source: 'openmaptiles', 'source-layer': 'transportation', filter: ['!=', ['get', 'class'], 'path'], paint: { 'line-color': roadCaseColor, 'line-width': roadCaseWidth }, layout: { 'line-cap': 'round', 'line-join': 'round' } },
          { id: 'road-fill', type: 'line', source: 'openmaptiles', 'source-layer': 'transportation', paint: { 'line-color': roadColor, 'line-width': roadWidth, 'line-dasharray': ['case', ['==', ['get', 'class'], 'path'], ['literal', [2, 1.5]], ['literal', [1, 0]]] }, layout: { 'line-cap': 'round', 'line-join': 'round' } },
          { id: 'boundary', type: 'line', source: 'openmaptiles', 'source-layer': 'boundary', filter: ['<=', ['get', 'admin_level'], 8], paint: { 'line-color': '#9a7a5a', 'line-width': ['interpolate', ['linear'], ['zoom'], 4, 0.5, 12, 1.5], 'line-dasharray': [3, 2] } },
          { id: 'housenumber', type: 'symbol', source: 'openmaptiles', 'source-layer': 'housenumber', minzoom: 18, layout: { 'text-field': ['get', 'housenumber'], 'text-size': 9, 'text-font': ['Klokantech Noto Sans Regular'] }, paint: { 'text-color': '#8a7a63', 'text-halo-color': '#fff', 'text-halo-width': 1 } },
          { id: 'poi', type: 'circle', source: 'openmaptiles', 'source-layer': 'poi', minzoom: 14, paint: { 'circle-radius': 3, 'circle-color': '#ef4444', 'circle-stroke-color': '#fff', 'circle-stroke-width': 1 } },
          { id: 'poi-label', type: 'symbol', source: 'openmaptiles', 'source-layer': 'poi', minzoom: 15, layout: { 'text-field': ['get', 'name'], 'text-size': 11, 'text-offset': [0, 1.1], 'text-anchor': 'top', 'text-font': ['Klokantech Noto Sans Regular'] }, paint: { 'text-color': '#7c2d12', 'text-halo-color': '#fff', 'text-halo-width': 1.2 } },
          { id: 'road-label', type: 'symbol', source: 'openmaptiles', 'source-layer': 'transportation_name', minzoom: 13, layout: { 'symbol-placement': 'line', 'text-field': ['get', 'name'], 'text-size': 11, 'text-letter-spacing': 0.05, 'text-font': ['Klokantech Noto Sans Regular'] }, paint: { 'text-color': '#555', 'text-halo-color': '#fff', 'text-halo-width': 1.4 } },
          { id: 'place', type: 'symbol', source: 'openmaptiles', 'source-layer': 'place', layout: {
              'text-field': ['get', 'name'],
              'text-size': ['match', ['get', 'class'], ['city', 'town'], 16, ['village'], 13, 11],
              'text-font': ['Klokantech Noto Sans Bold'],
            }, paint: { 'text-color': '#333', 'text-halo-color': '#fff', 'text-halo-width': 1.4 } },

        ],
      };

      offlineStreetLayer = L.maplibreGL({ style: offlineStyle, attribution: '&copy; OpenMapTiles &copy; OpenStreetMap contributors' });
    } catch (e) {
      offlineStreetLayer = null;
    }
  }
`
    : '';

  const switchModeScript = opts.onlineTileUrlTemplate || opts.mapMode
    ? `
  // PENTING: SELURUH inisialisasi mode peta (termasuk MapLibre GL untuk mode
  // "Peta"/street vector) dibungkus dalam SATU try/catch besar di bawah ini.
  // Sebelumnya, jika terjadi error SINKRON di sini (mis. WebGL/worker gagal
  // diinisialisasi MapLibre GL di dalam sandbox <iframe srcDoc> versi web —
  // berbeda perilakunya dari WebView native), exception tsb TIDAK tertangkap
  // dan menghentikan EKSEKUSI SISA SKRIP ini sepenuhnya (satu tag <script>
  // dieksekusi sekuensial atas-ke-bawah; exception tak tertangani membatalkan
  // sisanya). Akibatnya kode render marker/titik lokasi, kotak pencarian, dan
  // panel filter layer (semuanya ditulis SETELAH blok ini) tidak pernah
  // jalan — bug: mode "Peta" (street) blank DAN titik koordinat/marker sama
  // sekali tidak muncul di web, padahal mode "Satelit" (raster biasa, tanpa
  // MapLibre GL) tetap normal. Dengan try/catch ini, kegagalan apa pun di
  // sini tidak akan pernah menghalangi render marker & fitur peta lainnya.
  try {
${offlineStyleScript}
  var streetRasterLayer = L.tileLayer(${JSON.stringify(streetUrl)}, { maxZoom: MAX_NATIVE_ZOOM, attribution: '&copy; Carto' });

  var streetVectorStyleUrl = ${JSON.stringify(vectorStyleUrl)};
  var streetLayer = streetRasterLayer;
  if (streetVectorStyleUrl && window.L && typeof L.maplibreGL === 'function') {
    // Mode "Peta" (street) memakai MapLibre GL (vector) bila tersedia agar
    // jalan, footprint bangunan/rumah, dan sungai/saluran air kecil sekalipun
    // tampil lengkap seperti data OpenStreetMap penuh, sekaligus tetap tajam
    // di zoom berapa pun (garis vector di-render ulang, bukan bitmap yang
    // buram saat di-zoom). Jika plugin/CDN MapLibre gagal dimuat (mis. tidak
    // ada internet saat skrip CDN diminta), otomatis jatuh ke raster lama.
    try {
      streetLayer = L.maplibreGL({ style: streetVectorStyleUrl, attribution: '&copy; MapTiler &copy; OpenStreetMap contributors' });
      // PENTING: kegagalan memuat style/tile vector (mis. key MapTiler tidak
      // valid, style.json 404, atau tidak ada internet) TIDAK melempar
      // exception secara sinkron di sini — MapLibre GL memuatnya secara
      // ASINKRON, sehingga try/catch di atas tidak pernah menangkapnya dan
      // peta tampil KOSONG/PUTIH tanpa fallback (bug: mode "Peta" blank,
      // padahal mode "Satelit" normal karena memakai raster biasa). Untuk
      // itu, pasang listener 'error' pada instance maplibregl.Map di bawah
      // (baru tersedia setelah layer benar-benar ditambahkan ke peta lewat
      // event 'add'), lalu jatuh ke raster street begitu terjadi error saat
      // mode "street" sedang aktif.
      streetLayer.once('add', function () {
        try {
          var glMap = streetLayer.getMaplibreMap && streetLayer.getMaplibreMap();
          if (glMap && typeof glMap.on === 'function') {
            glMap.on('error', function () {
              if (streetLayer !== streetRasterLayer && modeLayers.street === streetLayer && map.hasLayer(streetLayer)) {
                map.removeLayer(streetLayer);
                modeLayers.street = streetRasterLayer;
                streetRasterLayer.addTo(map);
              }
            });
          }
        } catch (e2) {}
      });
    } catch (e) {
      streetLayer = streetRasterLayer;
    }
  }

  var modeLayers = {
    street: streetLayer,
    satellite: L.tileLayer(${JSON.stringify(satelliteUrl)}, { maxZoom: MAX_NATIVE_ZOOM, attribution: '&copy; Esri' }),
    hybrid: L.layerGroup([
      L.tileLayer(${JSON.stringify(satelliteUrl)}, { maxZoom: MAX_NATIVE_ZOOM, attribution: '&copy; Esri' }),
      L.tileLayer(${JSON.stringify(hybridLabelUrl)}, { maxZoom: MAX_NATIVE_ZOOM, attribution: '&copy; Carto' })
    ])
  };
  if (typeof offlineStreetLayer !== 'undefined' && offlineStreetLayer) {
    modeLayers.offline = offlineStreetLayer;
  }

  function activateMapMode(mode) {
    Object.keys(modeLayers).forEach(function (key) {
      if (map.hasLayer(modeLayers[key])) map.removeLayer(modeLayers[key]);
    });
    var nextLayer = modeLayers[mode] || modeLayers.street;
    try {
      nextLayer.addTo(map);
    } catch (e) {
      // Layer vector gagal ditambahkan (mis. style.json gagal diunduh, atau
      // file PMTiles offline belum tersalin): jatuh ke raster street sebagai
      // pengaman terakhir.
      if (streetLayer !== streetRasterLayer) {
        modeLayers.street = streetRasterLayer;
      } else {
        modeLayers.street = streetLayer;
      }
      streetRasterLayer.addTo(map);
      document.querySelectorAll('.mode-btn').forEach(function (btn) {
        btn.classList.toggle('active', btn.dataset.mode === 'street');
      });
      return;
    }
    document.querySelectorAll('.mode-btn').forEach(function (btn) {
      btn.classList.toggle('active', btn.dataset.mode === mode);
    });
  }


  activateMapMode(${JSON.stringify(mapMode)});
  document.querySelectorAll('.mode-btn').forEach(function (btn) {
    btn.addEventListener('click', function () { activateMapMode(btn.dataset.mode); });
  });
  } catch (e) {
    // Kegagalan tak terduga saat inisialisasi mode peta (mis. MapLibre GL
    // gagal total): pastikan minimal satu layer raster street tampil supaya
    // peta tidak benar-benar kosong, dan JANGAN lempar ulang exception agar
    // kode render marker di bawah tetap berjalan.
    try {
      var fallbackLayer = L.tileLayer(${JSON.stringify(streetUrl)}, { maxZoom: MAX_NATIVE_ZOOM, attribution: '&copy; Carto' });
      fallbackLayer.addTo(map);
    } catch (e3) {}
  }
`
    : '';

  const searchScript = packageSearchEnabled
    ? `
  var pkgSearchInput = document.getElementById('pkgSearch');
  if (pkgSearchInput) {
    pkgSearchInput.addEventListener('input', function () {
      var query = pkgSearchInput.value.trim().toLowerCase();
      var matched = [];
      markerLayers.forEach(function (entry) {
        var name = String(entry.packageName || '').toLowerCase();
        var visible = !query || name.indexOf(query) !== -1;
        var isOnMap = map.hasLayer(entry.layer);
        if (visible && !isOnMap) entry.layer.addTo(map);
        if (!visible && isOnMap) map.removeLayer(entry.layer);
        if (visible && query) matched.push(entry.layer.getLatLng());
      });
      if (query && matched.length > 0) {
        if (matched.length === 1) {
          map.setView(matched[0], Math.max(map.getZoom(), MAX_NATIVE_ZOOM - 2));
        } else {
          map.fitBounds(L.latLngBounds(matched), { padding: [40, 40] });
        }
      }
    });
  }
`
    : '';

  const layerFilterScript = showLayerFilter
    ? `
  (function () {
    var panel = document.getElementById('layerFilter');
    if (!panel) return;
    var groups = {};
    markerLayers.forEach(function (entry) {
      var key = entry.groupKey || 'Lainnya';
      if (!groups[key]) groups[key] = { color: entry.color, entries: [] };
      groups[key].entries.push(entry);
    });
    var groupKeys = Object.keys(groups);
    if (groupKeys.length === 0) return;
    var title = document.createElement('div');
    title.className = 'lf-title';
    title.textContent = 'Jenis Infrastruktur';
    panel.appendChild(title);
    groupKeys.forEach(function (key) {
      var group = groups[key];
      var label = document.createElement('label');
      var checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = true;
      checkbox.addEventListener('change', function () {
        group.entries.forEach(function (entry) {
          var isOnMap = map.hasLayer(entry.layer);
          if (checkbox.checked && !isOnMap) entry.layer.addTo(map);
          if (!checkbox.checked && isOnMap) map.removeLayer(entry.layer);
        });
      });
      var swatch = document.createElement('span');
      swatch.className = 'lf-swatch';
      swatch.style.background = group.color || '#ef4444';
      var text = document.createElement('span');
      text.textContent = key + ' (' + group.entries.length + ')';
      label.appendChild(checkbox);
      label.appendChild(swatch);
      label.appendChild(text);
      panel.appendChild(label);
    });
  })();
`
    : '';

  return `
  var TILE_DATA = ${tileDataJson};
  var MARKERS = ${markersJson};
  var ANNOTATIONS = ${annotationsJson};
  var MIN_ZOOM = ${opts.minZoom};
  var MAX_NATIVE_ZOOM = ${maxNativeZoom};
  var MAX_ZOOM = ${maxZoomWithOvershoot};
  var SHOW_DRAWING_TOOLS = ${showDrawingTools};

  var map = L.map('map', { zoomControl: true, minZoom: MIN_ZOOM, maxZoom: MAX_ZOOM });
${tileLayerScript}
${switchModeScript}

  // PENTING: saat dokumen ini baru dimuat, WebView/kontainer terkadang belum
  // memiliki ukuran akhir (mis. modal masih beranimasi atau layout RN belum
  // selesai mengukur), sehingga Leaflet menghitung grid ubin berdasarkan
  // ukuran SEMENTARA yang lebih kecil dari ukuran sebenarnya, membuat peta
  // tampil terpotong-potong (sebagian ubin kosong) sampai peta digeser
  // manual. Memanggil invalidateSize() beberapa kali setelah container
  // benar-benar stabil memaksa Leaflet mengukur ulang & memuat ubin yang
  // hilang tanpa perlu interaksi pengguna.
  function refreshMapSize() {
    try { map.invalidateSize(false); } catch (e) {}
  }
  [0, 150, 350, 700, 1200].forEach(function (delay) {
    setTimeout(refreshMapSize, delay);
  });
  if (window.ResizeObserver) {
    try {
      new ResizeObserver(refreshMapSize).observe(document.getElementById('map'));
    } catch (e) {}
  }
  window.addEventListener('resize', refreshMapSize);

  var markerLayers = MARKERS.map(function (m) {
    var layer = L.circleMarker([m.lat, m.lng], {
      radius: 8, color: '#fff', weight: 2, fillColor: m.color, fillOpacity: 1,
    }).addTo(map).bindPopup(m.popupHtml);
    if (m.label) {
      layer.bindTooltip(m.label, { permanent: true, direction: 'top', offset: [0, -8], className: 'marker-label' });
    }
    return { layer: layer, packageName: m.packageName || '', groupKey: m.groupKey || '', color: m.color };
  });

  if (MARKERS.length === 0) {
    map.setView([${opts.centerLat}, ${opts.centerLng}], ${opts.zoom});
  } else if (MARKERS.length === 1) {
    map.setView([MARKERS[0].lat, MARKERS[0].lng], Math.max(${opts.zoom}, 10));
  } else {
    var bounds = L.latLngBounds(MARKERS.map(function (m) { return [m.lat, m.lng]; }));
    if (bounds.isValid()) {
      setTimeout(function () {
        map.fitBounds(bounds, { padding: [40, 40], maxZoom: Math.min(${opts.zoom} + 2, MAX_ZOOM) });
      }, 50);
    }
  }
${searchScript}
${layerFilterScript}

  function renderSavedAnnotation(a) {
    var latlngs = a.points.map(function (p) { return [p.lat, p.lng]; });
    var layer = a.type === 'polygon'
      ? L.polygon(latlngs, { color: a.color, weight: 3 })
      : L.polyline(latlngs, { color: a.color, weight: 3 });
    layer.addTo(map);
    var label = a.label || (a.type === 'polygon' ? 'Polygon' : 'Garis');
    if (a.label) {
      layer.bindTooltip(a.label, { permanent: true, direction: 'center', className: 'marker-label' });
    }
    var popupHtml = '<b>' + label + '</b><br/>'
      + '<button onclick="window.__editAnnotationLabel(\\'' + a.id + '\\')" style="margin-top:6px;margin-right:6px;background:#2563eb;color:#fff;border:none;border-radius:6px;padding:6px 10px;font-weight:700;">Edit Label</button>'
      + '<button onclick="window.__deleteAnnotation(\\'' + a.id + '\\')" style="margin-top:6px;background:#dc2626;color:#fff;border:none;border-radius:6px;padding:6px 10px;font-weight:700;">Hapus</button>';
    layer.bindPopup(popupHtml);
  }
  ANNOTATIONS.forEach(renderSavedAnnotation);

  window.__deleteAnnotation = function (id) {
    if (window.ReactNativeWebView) {
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'delete_annotation', id: id }));
    }
  };

  window.__editAnnotationLabel = function (id) {
    map.closePopup();
    if (window.ReactNativeWebView) {
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'edit_annotation_label', id: id }));
    }
  };

  var drawMode = null;
  var currentPoints = [];
  var currentLayer = null;
  var mapLocked = false;
  var btnLine = document.getElementById('btnLine');
  var btnPolygon = document.getElementById('btnPolygon');
  var btnLock = document.getElementById('btnLock');
  var btnFinish = document.getElementById('btnFinish');
  var btnCancel = document.getElementById('btnCancel');
  var hint = document.getElementById('hint');

  if (SHOW_DRAWING_TOOLS && btnLine && btnPolygon && btnLock && btnFinish && btnCancel && hint) {
    function setMapLocked(locked) {
      mapLocked = locked;
      if (locked) {
        map.dragging.disable();
        map.touchZoom.disable();
        map.doubleClickZoom.disable();
        map.scrollWheelZoom.disable();
        if (map.tap) map.tap.disable();
        btnLock.textContent = '🔒 Peta Terkunci';
        btnLock.className = 'active';
      } else {
        map.dragging.enable();
        map.touchZoom.enable();
        map.doubleClickZoom.enable();
        map.scrollWheelZoom.enable();
        if (map.tap) map.tap.enable();
        btnLock.textContent = '🔓 Kunci Peta';
        btnLock.className = 'secondary';
      }
    }

    btnLock.addEventListener('click', function () { setMapLocked(!mapLocked); });

    function updateToolbarUI() {
      btnLine.className = drawMode === 'polyline' ? 'active' : '';
      btnPolygon.className = drawMode === 'polygon' ? 'active' : '';
      var drawing = drawMode !== null;
      btnFinish.style.display = drawing ? 'inline-block' : 'none';
      btnCancel.style.display = drawing ? 'inline-block' : 'none';
      hint.style.display = drawing ? 'block' : 'none';
    }

    function redrawCurrent() {
      if (currentLayer) { map.removeLayer(currentLayer); currentLayer = null; }
      if (currentPoints.length === 0) return;
      currentLayer = drawMode === 'polygon'
        ? L.polygon(currentPoints, { color: '#ef4444', weight: 3, dashArray: '6 4' })
        : L.polyline(currentPoints, { color: '#ef4444', weight: 3, dashArray: '6 4' });
      currentLayer.addTo(map);
    }

    function startDraw(mode) {
      drawMode = mode;
      currentPoints = [];
      redrawCurrent();
      updateToolbarUI();
      setMapLocked(true);
    }

    function cancelDraw() {
      drawMode = null;
      currentPoints = [];
      if (currentLayer) { map.removeLayer(currentLayer); currentLayer = null; }
      updateToolbarUI();
      setMapLocked(false);
    }

    function finishDraw() {
      if (!drawMode || currentPoints.length < 2) { cancelDraw(); return; }
      var points = currentPoints.map(function (p) { return { lat: p[0], lng: p[1] }; });
      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'save_annotation', shapeType: drawMode, points: points }));
      }
      cancelDraw();
    }

    btnLine.addEventListener('click', function () { if (drawMode === 'polyline') { cancelDraw(); } else { startDraw('polyline'); } });
    btnPolygon.addEventListener('click', function () { if (drawMode === 'polygon') { cancelDraw(); } else { startDraw('polygon'); } });
    btnFinish.addEventListener('click', finishDraw);
    btnCancel.addEventListener('click', cancelDraw);

    map.on('click', function (e) {
      if (!drawMode) return;
      currentPoints.push([e.latlng.lat, e.latlng.lng]);
      redrawCurrent();
    });
  }

  window.__addAnnotation = function (annotationJson) {
    try {
      renderSavedAnnotation(JSON.parse(annotationJson));
    } catch (e) {}
  };
`;
}


/**
 * Membangun satu dokumen HTML mandiri (self-contained, TANPA request jaringan
 * apa pun) berisi peta Leaflet interaktif: mendukung pinch-zoom & pan native
 * browser, menampilkan ubin peta offline (dari base64 yang sudah diunduh
 * sebelumnya), marker lokasi survei, serta alat gambar garis & polygon.
 * Dipakai di dalam WebView (react-native-webview) sehingga TIDAK memerlukan
 * server HTTP lokal maupun koneksi internet sama sekali setelah tile
 * diunduh.
 */
export function buildMapHtml(opts: BuildMapHtmlOptions): string {
  const tileDataJson = JSON.stringify(opts.tileData);
  const markersJson = JSON.stringify(opts.markers);
  const annotationsJson = JSON.stringify(opts.annotations);
  const script = buildScript(tileDataJson, markersJson, annotationsJson, opts);
  return buildHeadHtml(opts) + script + FOOT_HTML;
}

export interface BuildPickerMapHtmlOptions {
  /** Titik tengah peta saat pertama dibuka (mis. lokasi GPS saat ini atau
   * pusat wilayah default) jika belum ada titik yang dipilih sebelumnya. */
  centerLat: number;
  centerLng: number;
  zoom: number;
  /** Mode tampilan peta online: street, satellite, atau hybrid. */
  mapMode?: OnlineMapMode;
  /** Template URL tile online (mis. `CONFIG.OFFLINE_MAP_TILE_URL_TEMPLATE`).
   * Diabaikan jika `tileData` diisi (mode offline). */
  onlineTileUrlTemplate?: string;
  /** URL style MapLibre untuk pemilih koordinat online. */
  onlineVectorStyleUrl?: string;
  /**
   * Jika diisi, peta memuat ubin dari tile PNG offline yang sudah diunduh
   * (base64, hasil `loadTileDataBase64`) alih-alih dari internet, sehingga
   * pemilihan titik tetap bisa dilakukan tanpa koneksi. Dipakai bersama
   * `tileMinZoom`/`tileMaxZoom` (rentang zoom tile yang tersedia).
   */
  tileData?: Record<string, string>;
  tileMinZoom?: number;
  tileMaxZoom?: number;
  /** Batas zoom saat pemilih koordinat memakai peta online vector. */
  minOnlineZoom?: number;
  maxOnlineZoom?: number;
  /** Titik yang sudah tersimpan sebelumnya (mis. saat mengedit paket), jika
   * ada akan langsung ditampilkan sebagai marker yang bisa digeser. */
  initialPoint?: { lat: number; lng: number } | null;
}

/**
 * Membangun dokumen HTML mandiri berisi peta Leaflet SEDERHANA yang hanya
 * dipakai untuk MEMILIH satu titik koordinat (bukan menampilkan banyak
 * marker/anotasi seperti `buildMapHtml`): pengguna cukup mengetuk peta atau
 * menggeser marker untuk menentukan/menyesuaikan titik, lalu setiap
 * perubahan dikirim ke aplikasi lewat pesan `{ type: 'picker_point', lat,
 * lng }`. Dipakai oleh `CoordinatePickerModal` baik di dalam WebView
 * (native) maupun `<iframe srcDoc>` (web), karena itu pesan dikirim lewat
 * `ReactNativeWebView.postMessage` (native) ATAU `window.parent.postMessage`
 * (web) — mana pun yang tersedia.
 */
export function buildPickerMapHtml(opts: BuildPickerMapHtmlOptions): string {
  const initialPointJson = JSON.stringify(opts.initialPoint || null);
  const mode = opts.mapMode || 'hybrid';
  // Sama seperti buildScript() di atas: hindari tile.openstreetmap.org
  // langsung karena diblokir untuk pemakaian bulk aplikasi. Pakai sumber
  // yang sama dengan ONLINE_MAP_MODES agar konsisten di seluruh peta online.
  const streetUrl = CONFIG.ONLINE_MAP_MODES.street.tileUrlTemplate;
  const satelliteUrl = CONFIG.ONLINE_MAP_MODES.satellite.tileUrlTemplate;
  const labelUrl = CONFIG.ONLINE_MAP_MODES.hybrid.labelTileUrlTemplate;
  const pickerMaxZoom = opts.maxOnlineZoom ?? 19;
  const baseLayers = `
    var streetLayer = L.tileLayer(${JSON.stringify(streetUrl)}, { maxZoom: ${pickerMaxZoom}, attribution: '&copy; Carto' });
    var satelliteLayer = L.tileLayer(${JSON.stringify(satelliteUrl)}, { maxZoom: ${pickerMaxZoom}, attribution: '&copy; Esri' });
    var labelLayer = L.tileLayer(${JSON.stringify(labelUrl)}, { maxZoom: ${pickerMaxZoom}, attribution: '&copy; Carto' });
    var modeLayers = {
      street: streetLayer,
      satellite: satelliteLayer,
      hybrid: L.layerGroup([satelliteLayer, labelLayer])
    };
    function activateMode(newMode) {
      Object.keys(modeLayers).forEach(function (key) {
        if (map.hasLayer(modeLayers[key])) map.removeLayer(modeLayers[key]);
      });
      var layer = modeLayers[newMode] || modeLayers.street;
      layer.addTo(map);
      document.querySelectorAll('.mode-btn').forEach(function (btn) {
        btn.classList.toggle('active', btn.dataset.mode === newMode);
      });
    }
  `;
  if (!opts.tileData && (opts.onlineVectorStyleUrl || opts.mapMode)) {
    return `<!DOCTYPE html>
<html><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
<style>${LEAFLET_CSS}</style>
<style>html,body{margin:0;padding:0;width:100%;height:100%;overflow:hidden}body{position:relative}#map{position:absolute;inset:0;width:100%;height:100%}.hint{position:absolute;bottom:12px;left:12px;right:12px;z-index:1000;background:rgba(15,23,42,.85);color:#fff;padding:8px 12px;border-radius:8px;font:12px sans-serif;text-align:center;box-sizing:border-box}.mapmode{position:absolute;top:12px;right:12px;z-index:1000;display:flex;gap:6px;background:rgba(15,23,42,.8);padding:6px;border-radius:10px;max-width:calc(100% - 24px);box-sizing:border-box}.mode-btn{background:transparent;border:1px solid rgba(255,255,255,.4);color:#fff;border-radius:8px;padding:6px 10px;font-size:11px;font-weight:700;white-space:nowrap}.mode-btn.active{background:#2563eb;border-color:#2563eb}</style>
</head><body><div id="map"></div><div class="mapmode"><button class="mode-btn" data-mode="street">Peta</button><button class="mode-btn" data-mode="satellite">Satelit</button><button class="mode-btn" data-mode="hybrid">Hybrid</button></div><div class="hint">Ketuk peta untuk menentukan titik, atau geser penanda untuk menyesuaikan.</div>
<script>${LEAFLET_JS}</script>
<script>
  function sendMessage(msg) {
    var json = JSON.stringify(msg);
    if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) window.ReactNativeWebView.postMessage(json);
    else if (window.parent) window.parent.postMessage(json, '*');
  }
  var INITIAL_POINT = ${initialPointJson};
  var map = L.map('map', { zoomControl: true, attributionControl: false }).setView([INITIAL_POINT ? INITIAL_POINT.lat : ${opts.centerLat}, INITIAL_POINT ? INITIAL_POINT.lng : ${opts.centerLng}], ${opts.zoom});
  ${baseLayers}
  activateMode(${JSON.stringify(mode)});
  document.querySelectorAll('.mode-btn').forEach(function (btn) { btn.addEventListener('click', function () { activateMode(btn.dataset.mode); }); });
  var marker = null;
  function setMarker(lat, lng, fromUser) {
    if (marker) marker.setLatLng([lat, lng]);
    else {
      marker = L.marker([lat, lng], { draggable: true }).addTo(map);
      marker.on('dragend', function () { var p = marker.getLatLng(); sendMessage({ type:'picker_point', lat:p.lat, lng:p.lng }); });
    }
    if (fromUser) sendMessage({ type:'picker_point', lat:lat, lng:lng });
  }
  if (INITIAL_POINT) setMarker(INITIAL_POINT.lat, INITIAL_POINT.lng, false);
  map.on('click', function (e) { setMarker(e.latlng.lat, e.latlng.lng, true); });
  function refreshMapSize() { try { map.invalidateSize(false); } catch (e) {} }
  [0, 150, 350, 700, 1200].forEach(function (delay) { setTimeout(refreshMapSize, delay); });
  if (window.ResizeObserver) { try { new ResizeObserver(refreshMapSize).observe(document.getElementById('map')); } catch (e) {} }
  window.addEventListener('resize', refreshMapSize);
</script></body></html>`;
  }
  const useOfflineTiles = !!opts.tileData;
  const tileMinZoom = opts.tileMinZoom ?? 5;
  const tileMaxZoom = opts.tileMaxZoom ?? 18;
  const tileLayerScript = useOfflineTiles
    ? `
  var TILE_DATA = ${JSON.stringify(opts.tileData || {})};
  var MIN_ZOOM = ${tileMinZoom};
  var MAX_NATIVE_ZOOM = ${tileMaxZoom};
  var OfflineTileLayer = L.GridLayer.extend({
    createTile: function (coords, done) {
      var container = document.createElement('div');
      container.style.width = '256px';
      container.style.height = '256px';
      container.style.overflow = 'hidden';
      var z = Math.min(coords.z, MAX_NATIVE_ZOOM);
      var scale = Math.pow(2, coords.z - z);
      var nativeX = Math.floor(coords.x / scale);
      var nativeY = Math.floor(coords.y / scale);
      var key = z + '/' + nativeX + '/' + nativeY;
      var data = TILE_DATA[key];
      if (data) {
        var img = document.createElement('img');
        var size = 256 * scale;
        var offsetX = -(coords.x % scale) * 256;
        var offsetY = -(coords.y % scale) * 256;
        img.src = data;
        img.style.width = size + 'px';
        img.style.height = size + 'px';
        img.style.position = 'relative';
        img.style.left = offsetX + 'px';
        img.style.top = offsetY + 'px';
        img.style.imageRendering = 'pixelated';
        container.appendChild(img);
      } else {
        container.style.background = '#e2e8f0';
      }
      setTimeout(function () { done(null, container); }, 0);
      return container;
    },
  });
  new OfflineTileLayer({ tileSize: 256, minZoom: MIN_ZOOM, maxZoom: MAX_NATIVE_ZOOM + 3, maxNativeZoom: MAX_NATIVE_ZOOM }).addTo(map);
`
    : `
  L.tileLayer(${JSON.stringify(opts.onlineTileUrlTemplate || '')}, {
    tileSize: 256, maxZoom: ${opts.maxOnlineZoom ?? 19},
    attribution: '&copy; OpenStreetMap contributors',
  }).addTo(map);
`;
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
<style>${LEAFLET_CSS}</style>
<style>
  html, body { height: 100%; width: 100%; margin: 0; padding: 0; overflow: hidden; }
  body { position: relative; }
  #map { position: absolute; inset: 0; width: 100%; height: 100%; }
  .hint { position: absolute; bottom: 12px; left: 12px; right: 12px; z-index: 1000; background: rgba(15,23,42,0.85); color: #fff; padding: 8px 12px; border-radius: 8px; font-size: 12px; text-align: center; box-sizing: border-box; }
  .modebadge { position: absolute; top: 10px; left: 10px; z-index: 1000; background: rgba(15,23,42,0.85); color: #fff; padding: 6px 10px; border-radius: 8px; font-size: 11px; font-weight: 700; }
</style>
</head>
<body>
<div id="map"></div>
<div class="modebadge">${useOfflineTiles ? '📥 Peta Offline' : '🌐 Peta Online'}</div>
<div class="hint" id="hint">Ketuk peta untuk menentukan titik, atau geser penanda untuk menyesuaikan.</div>
<script>${LEAFLET_JS}</script>
<script>
  function sendMessage(msg) {
    var json = JSON.stringify(msg);
    if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
      window.ReactNativeWebView.postMessage(json);
    } else if (window.parent) {
      window.parent.postMessage(json, '*');
    }
  }

  var INITIAL_POINT = ${initialPointJson};
  var map = L.map('map', { zoomControl: true, attributionControl: false }).setView(
    [INITIAL_POINT ? INITIAL_POINT.lat : ${opts.centerLat}, INITIAL_POINT ? INITIAL_POINT.lng : ${opts.centerLng}],
    ${opts.zoom}
  );
${tileLayerScript}

  var marker = null;

  function setMarker(lat, lng, fromUser) {
    if (marker) {
      marker.setLatLng([lat, lng]);
    } else {
      marker = L.marker([lat, lng], { draggable: true }).addTo(map);
      marker.on('dragend', function () {
        var p = marker.getLatLng();
        sendMessage({ type: 'picker_point', lat: p.lat, lng: p.lng });
      });
    }
    if (fromUser) {
      sendMessage({ type: 'picker_point', lat: lat, lng: lng });
    }
  }

  if (INITIAL_POINT) {
    setMarker(INITIAL_POINT.lat, INITIAL_POINT.lng, false);
  }

  map.on('click', function (e) {
    setMarker(e.latlng.lat, e.latlng.lng, true);
  });

  function refreshMapSize() {
    try { map.invalidateSize(false); } catch (e) {}
  }
  [0, 150, 350, 700, 1200].forEach(function (delay) {
    setTimeout(refreshMapSize, delay);
  });
  if (window.ResizeObserver) {
    try {
      new ResizeObserver(refreshMapSize).observe(document.getElementById('map'));
    } catch (e) {}
  }
  window.addEventListener('resize', refreshMapSize);
</script>
</body>
</html>`;
}


