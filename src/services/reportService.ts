import { Platform } from 'react-native';
import { sortReportRowsBySegment } from '../utils/sta';
import { MODE_REPORT_COLUMNS } from '../config';
import { summarizeItemsByType, formatDimensionSummary } from '../utils/itemSummary';
import { safeJsonParse } from './commonUtils';
import { ExecutedOutputEntry } from './apiService';



// ─── Foto: fetch & konversi ke base64 ────────────────────────────────────────

async function fetchImageAsBase64(url: string): Promise<string> {
  if (!url) return '';
  if (String(url).startsWith('data:') || String(url).startsWith('blob:')) return String(url);

  const idMatch = url.match(/[?&]id=([^&]+)/);
  // Ukuran thumbnail diperkecil dari w800 ke w600: foto di PDF hanya
  // ditampilkan pada ukuran kecil (180x130 px, lihat .photo di BASE_STYLE),
  // sehingga w800 jauh lebih besar dari yang dibutuhkan dan hanya memperlambat
  // proses unduh + konversi base64 tanpa menambah kualitas yang terlihat.
  const urls = idMatch
    ? [`https://drive.google.com/thumbnail?id=${idMatch[1]}&sz=w400`, url]
    : [url];

  if (Platform.OS === 'web') {
    for (const tryUrl of urls) {
      try {
        const res = await fetch(tryUrl);
        if (!res.ok) continue;
        const blob = await res.blob();
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
        if (dataUrl) return dataUrl;
      } catch { /* coba URL berikutnya, biasanya gagal karena CORS */ }
    }
    // Fallback: fetch/blob gagal (umumnya diblokir CORS oleh Google Drive di
    // browser). Tag <img> TIDAK memerlukan izin CORS untuk sekadar menampilkan
    // gambar (berbeda dengan fetch/canvas yang membaca isi piksel), jadi kita
    // pakai langsung URL thumbnail Drive sebagai src. Ini memastikan foto
    // tetap tampil saat window.print() dari browser desktop.
    return urls[0] || '';
  }

  // Native: expo-file-system/legacy
  const FileSystemLegacy = await import('expo-file-system/legacy');
  for (const tryUrl of urls) {
    try {
      const localUri =
        FileSystemLegacy.cacheDirectory +
        'pdf_photo_' + Date.now() + '_' + Math.random().toString(36).slice(2) + '.jpg';
      const result = await FileSystemLegacy.downloadAsync(tryUrl, localUri);
      if (result.status !== 200) continue;
      const base64 = await FileSystemLegacy.readAsStringAsync(result.uri, {
        encoding: FileSystemLegacy.EncodingType.Base64,
      });
      FileSystemLegacy.deleteAsync(result.uri, { idempotent: true }).catch(() => {});
      if (base64) return `data:image/jpeg;base64,${base64}`;
    } catch { /* coba URL berikutnya */ }
  }
  return '';
}

/**
 * Mengambil daftar URL foto dari satu baris data survei. Mendukung format
 * baru (kolom "Foto URLs" berisi JSON array, jumlah foto tidak dibatasi)
 * MAUPUN format lama (kolom terpisah "URL Foto 1/2/3") untuk data yang
 * tersimpan sebelum perubahan ini.
 */
export function extractRowPhotoUrls(row: any): string[] {
  if (Array.isArray(row['_photoUrls'])) {
    return row['_photoUrls'].filter((u: any) => !!u);
  }
  const raw = row['Foto URLs'];
  if (raw) {
    const parsed = safeJsonParse<any>(String(raw), null);
    if (Array.isArray(parsed)) return parsed.filter((u) => !!u);
  }
  return [row['URL Foto 1'], row['URL Foto 2'], row['URL Foto 3']].filter((u) => !!u);
}

async function resolvePhotoUrls(rows: any[]): Promise<any[]> {
  // Menyiapkan foto SEMUA baris + SEMUA foto sekaligus secara paralel penuh
  // (tanpa batas) membuat proses ini sangat lambat pada paket besar: puluhan/
  // ratusan foto diunduh bersamaan, saling berebut bandwidth (terutama di
  // jaringan seluler), sehingga PDF terasa "menggantung" lama sebelum tampil.
  // Sebagai gantinya, seluruh foto dari seluruh baris digabung menjadi satu
  // antrean dan diproses dengan batas concurrency tetap (PHOTO_CONCURRENCY),
  // mirip worker pool. Ini jauh lebih cepat & stabil dibanding baik
  // sepenuhnya sekuensial maupun sepenuhnya paralel tanpa batas.
  const PHOTO_CONCURRENCY = 3;
  const MAX_NATIVE_PHOTOS = 12;

  const tasks: { rowIndex: number; url: string }[] = [];
  rows.forEach((row, rowIndex) => {
    extractRowPhotoUrls(row)
      .filter((url) => !String(url).startsWith('ERROR_UPLOAD'))
      .forEach((url) => tasks.push({ rowIndex, url: String(url) }));
  });

  // Android WebView/PrintManager can terminate the app when a large report
  // contains many embedded base64 images. The table remains complete; only
  // the first few photos are embedded in the native PDF.
  const photoTasks = Platform.OS === 'web' ? tasks : tasks.slice(0, MAX_NATIVE_PHOTOS);

  const resolvedByRow: string[][] = rows.map(() => []);
  let cursor = 0;
  async function worker() {
    while (cursor < photoTasks.length) {
      const task = photoTasks[cursor];
      cursor += 1;
      const base64 = await fetchImageAsBase64(task.url);
      resolvedByRow[task.rowIndex].push(base64);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(PHOTO_CONCURRENCY, photoTasks.length) }, () => worker())
  );

  return rows.map((row, index) => ({ ...row, _resolvedPhotoUrls: resolvedByRow[index] }));
}


// ─── Print helper (web: window.print, native: expo-print + expo-sharing) ─────

async function printHtml(html: string, title: string): Promise<void> {
  if (Platform.OS === 'web') {
    const win = window.open('', '_blank');
    if (!win) {
      alert('Popup diblokir browser. Izinkan popup untuk mencetak PDF.');
      return;
    }
    win.document.write(html);
    win.document.close();
    win.focus();
    win.onload = () => win.print();
    setTimeout(() => { try { win.print(); } catch { /* sudah diprint */ } }, 800);
    return;
  }

  const Print = await import('expo-print');
  // Use Android's system print dialog directly. It avoids creating a large
  // temporary PDF and launching a share intent, both of which can terminate
  // low-memory devices while printing reports with photos.
  await Print.printAsync({ html });
}

// ─── HTML helpers ─────────────────────────────────────────────────────────────

const EXCLUDED_KEYS = new Set([
  '_infrastructureType', '_photoUrls', '_resolvedPhotoUrls', 'ID Survei', 'ID Paket', 'Nama Paket',
  'ID Item Pekerjaan', 'Nama Surveyor', 'Tipe Infrastruktur',
  'Latitude', 'Longitude', 'Akurasi GPS (m)', 'Alamat/Keterangan Lokasi',
  'Timestamp', 'Foto URLs', 'URL Foto 1', 'URL Foto 2', 'URL Foto 3', 'Status', 'ID Lokal', 'Mode Detail JSON',
  // Kolom mode-spesifik lama (Kondisi Eksisting/Permasalahan/Tindakan
  // Diusulkan/Volume Penanganan/Satuan) ditampilkan ulang secara terpisah
  // per Mode Survei lewat MODE_REPORT_COLUMNS, jadi tidak dobel di sini.
  'Kondisi Eksisting', 'Permasalahan', 'Tindakan Diusulkan', 'Volume Penanganan', 'Satuan', 'Mode Survei',
  // Kecamatan/Desa/Kelurahan ditampilkan terpisah di tabel utama (lihat
  // buildItemHtml). Kode Desa/Kelurahan sengaja TIDAK ditampilkan di
  // laporan (hanya disimpan di background), sama seperti di aplikasi.
  'Kecamatan', 'Desa/Kelurahan', 'Kode Desa/Kelurahan',
]);


function getModeFieldValue(row: any, key: string, sheetHeader?: string): string {
  if (sheetHeader && row[sheetHeader] !== undefined && row[sheetHeader] !== '') {
    return row[sheetHeader];
  }
  const parsed = safeJsonParse<any>(row['Mode Detail JSON'] || '{}', {});
  return parsed[key] ?? '';
}


function esc(value: any): string {
  if (value === null || value === undefined) return '-';
  return String(value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

const BASE_STYLE = `
  @page { size: A4 landscape; margin: 12mm; }
  @page photo-landscape { size: A4 landscape; margin: 12mm; }
  body { font-family: Helvetica, Arial, sans-serif; padding: 0; color: #1e293b; font-size: 10px; }
  h1 { font-size: 16px; margin: 0 0 2px 0; }
  h2 { font-size: 13px; margin: 0 0 2px 0; color: #1e40af; }
  .meta { font-size: 10px; color: #64748b; margin-bottom: 14px; }
  table { width: 100%; border-collapse: collapse; margin: 0 0 14px 0; table-layout: fixed; }
  thead { display: table-header-group; }
  th { background: #1e40af; color: #fff; font-size: 9px; font-weight: 700; padding: 5px 3px; border: 1px solid #1e3a8a; text-align: center; white-space: normal; word-break: break-word; overflow-wrap: break-word; hyphens: auto; line-height: 1.15; vertical-align: middle; }
  td { font-size: 9px; padding: 4px; border: 1px solid #cbd5e1; vertical-align: top; overflow-wrap: anywhere; }
  tbody tr:nth-child(even) { background: #f8fafc; }
  .report-section { page-break-inside: auto; margin-bottom: 14px; }
  .report-section-title { font-size: 11px; font-weight: 700; color: #1e40af; margin: 8px 0 4px; }
  .no-cell { text-align: center; width: 4%; }
  .location-cell { width: 18%; }
  .small-cell { width: 9%; }
  .photos { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10mm; margin-top: 6mm; }
  .photo { width: 100%; height: 70mm; object-fit: contain; border-radius: 4px; border: 1px solid #e2e8f0; background: #f8fafc; }
  .appendix-item { page: photo-landscape; page-break-before: always; page-break-inside: avoid; }
  .appendix-title { font-size: 13px; font-weight: bold; color: #1e40af; margin-bottom: 8px; }
  .appendix-meta { font-size: 10px; color: #64748b; margin-bottom: 8px; }
  .no-photo { font-size: 10px; color: #94a3b8; font-style: italic; }
  .footer { margin-top: 20px; font-size: 9px; color: #94a3b8; text-align: right; border-top: 1px solid #e2e8f0; padding-top: 6px; }
  .page-break { page-break-before: always; }
`;

function buildItemHtml(row: any, index: number): string {
  const row2 = row['_infrastructureType'] === 'Jalan' ? fillLegacyRoadWidth(row) : row;
  const photos = (row2['_resolvedPhotoUrls'] || []).filter(
    (url: string) => url && (String(url).startsWith('data:') || String(url).startsWith('http'))
  );

  const detailRows = Object.keys(row2)
    .filter((k) => !EXCLUDED_KEYS.has(k) && row2[k] !== '' && row2[k] != null)
    .map((k) => `<tr><td class="k">${esc(k)}</td><td class="v">${esc(row2[k])}</td></tr>`)
    .join('');

  // Field khusus Mode Survei (Panjang/Lebar/Tinggi Rencana, Volume
  // Penanganan, Kapasitas, dst.) ditampilkan sebagai tabel terpisah,
  // hanya kolom yang relevan dengan mode baris ini (lihat MODE_REPORT_COLUMNS
  // di config.ts), bukan seluruh kolom mode data untuk semua mode sekaligus.
  const modeColumnDefs = MODE_REPORT_COLUMNS[row['Mode Survei'] as keyof typeof MODE_REPORT_COLUMNS] || [];
  const modeRows = modeColumnDefs
    .map((col) => ({ label: col.label, value: getModeFieldValue(row, col.key, col.sheetHeader) }))
    .filter((item) => item.value !== '' && item.value != null)
    .map((item) => `<tr><td class="k">${esc(item.label)}</td><td class="v">${esc(item.value)}</td></tr>`)
    .join('');
  const priorityRow = row['Prioritas']
    ? `<tr><td class="k">Prioritas</td><td class="v">${esc(row['Prioritas'])}</td></tr>` : '';

  const timestamp = row['Timestamp'] ? new Date(row['Timestamp']).toLocaleString('id-ID') : '-';
  const coord = row['Latitude'] != null && row['Longitude'] != null
    ? `${row['Latitude']}, ${row['Longitude']}` : '-';
  const segmentLabel = row['No. Segmen'] && row['STA Awal'] !== undefined
    ? ` &mdash; Segmen ${esc(row['No. Segmen'])} STA ${esc(row['STA Awal'])}-${esc(row['STA Akhir'])}`
    : '';
  const modeBadge = row['Mode Survei'] ? ` <span class="mode-badge">${esc(row['Mode Survei'])}</span>` : '';

  return `
    <div class="item-card">
      <div class="item-title">${index}. ${esc(row['_infrastructureType'])}${segmentLabel} &mdash; ${esc(row['Alamat/Keterangan Lokasi'] || '-')}${modeBadge}</div>

      <table>
        <tr><td class="k">Surveyor</td><td class="v">${esc(row['Nama Surveyor'])}</td></tr>
        <tr><td class="k">Kecamatan</td><td class="v">${esc(row['Kecamatan'])}</td></tr>
        <tr><td class="k">Desa/Kelurahan</td><td class="v">${esc(row['Desa/Kelurahan'])}</td></tr>
        <tr><td class="k">Waktu Survei</td><td class="v">${esc(timestamp)}</td></tr>
        <tr><td class="k">Koordinat</td><td class="v">${esc(coord)}</td></tr>
        <tr><td class="k">Akurasi GPS</td><td class="v">${esc(row['Akurasi GPS (m)'])} m</td></tr>
        <tr><td class="k">Status</td><td class="v">${esc(row['Status'])}</td></tr>
      </table>
      ${detailRows ? `<table>${detailRows}</table>` : ''}
      ${modeRows || priorityRow ? `<table>${modeRows}${priorityRow}</table>` : ''}
    </div>`;
}

const TABLE_HIDDEN_KEYS = new Set([
  ...EXCLUDED_KEYS,
  'ID Item Pekerjaan', 'Nama Surveyor', 'Prioritas', 'Kecamatan', 'Desa/Kelurahan',
]);

interface ReportColumn {
  key: string;
  label: string;
  className?: string;
  value?: (row: any) => any;
}

/**
 * Beberapa data lama (sebelum lebar jalan dipecah menjadi "Lebar STA Awal
 * (m)"/"Lebar STA Akhir (m)") masih menyimpan/menampilkan kolom generik
 * "Lebar Jalan (m)" yang sekarang tidak pernah diisi lagi, sehingga selalu
 * tampak kosong ("-") di laporan. Isi otomatis dari rata-rata kedua kolom
 * STA tsb (jika keduanya/salah satunya ada) supaya laporan tidak kosong.
 */
function fillLegacyRoadWidth(row: any): any {
  if (row['Lebar Jalan (m)'] !== undefined && row['Lebar Jalan (m)'] !== '' && row['Lebar Jalan (m)'] != null) {
    return row;
  }
  const toNum = (v: any) => {
    if (v === undefined || v === null || v === '') return null;
    const n = parseFloat(String(v).replace(',', '.'));
    return isNaN(n) ? null : n;
  };
  const widths = [toNum(row['Lebar STA Awal (m)']), toNum(row['Lebar STA Akhir (m)'])].filter(
    (n): n is number => n !== null
  );
  if (widths.length === 0) return row;
  const avg = widths.reduce((a, b) => a + b, 0) / widths.length;
  return { ...row, 'Lebar Jalan (m)': Number.isInteger(avg) ? String(avg) : avg.toFixed(2) };
}

function getTableColumns(rows: any[]): ReportColumn[] {
  const mode = rows[0]?.['Mode Survei'];
  const modeColumns = MODE_REPORT_COLUMNS[mode as keyof typeof MODE_REPORT_COLUMNS] || [];
  const knownKeys = new Set<string>(modeColumns.map((column) => column.key));
  const dynamicKeys = Array.from(new Set(rows.flatMap((row) => Object.keys(row))))
    .filter((key) => !TABLE_HIDDEN_KEYS.has(key) && !key.startsWith('_') && !key.startsWith('URL Foto') && key !== 'Mode Survei' && !knownKeys.has(key));

  return [
    { key: '_no', label: 'No', className: 'no-cell' },
    { key: 'Alamat/Keterangan Lokasi', label: 'Lokasi', className: 'location-cell' },
    ...modeColumns.map((column) => ({
      key: column.key,
      label: column.label,
      className: 'small-cell',
      value: (row: any) => getModeFieldValue(row, column.key, column.sheetHeader),
    })),
    ...dynamicKeys.map((key) => ({ key, label: key, className: 'small-cell' })),
    { key: 'Prioritas', label: 'Prioritas', className: 'small-cell' },
  ];
}

function buildReportTable(type: string, mode: string, rawRows: any[]): string {
  const rows = type === 'Jalan' ? rawRows.map(fillLegacyRoadWidth) : rawRows;
  const columns = getTableColumns(rows);
  // Semakin banyak kolom, semakin sempit tiap kolom (table-layout: fixed
  // membagi rata lebar tabel) — sehingga label header panjang (mis. "Kondisi
  // Kerusakan (cm)") mudah menumpuk/keluar dari batas sel. Ukuran huruf
  // header diperkecil otomatis mengikuti jumlah kolom agar teks tetap
  // terbungkus rapi di dalam kolomnya, tanpa perlu ubah lebar tabel.
  const headerFontSize = columns.length > 18 ? 6.5 : columns.length > 14 ? 7.5 : columns.length > 10 ? 8.5 : 9;
  const headerStyle = ` style="font-size:${headerFontSize}px;"`;
  const header = columns.map((column) => `<th class="${column.className || ''}"${headerStyle}>${esc(column.label)}</th>`).join('');
  const body = rows.map((row, index) => {
    const cells = columns.map((column) => {
      const value = column.value ? column.value(row) : column.key === '_no' ? index + 1 : row[column.key];
      return `<td class="${column.className || ''}">${esc(value === '' || value == null ? '-' : value)}</td>`;
    }).join('');
    return `<tr>${cells}</tr>`;
  }).join('');

  return `<section class="report-section">
    <div class="report-section-title">${esc(type)}${mode ? ` - ${esc(mode)}` : ''} (${rows.length} data)</div>
    <table><thead><tr>${header}</tr></thead><tbody>${body}</tbody></table>
  </section>`;
}

function buildReportTables(rows: any[]): string {
  const groups = new Map<string, any[]>();
  rows.forEach((row) => {
    const key = `${row['_infrastructureType'] || 'Lainnya'}\u0000${row['Mode Survei'] || 'Tanpa mode'}`;
    const group = groups.get(key) || [];
    group.push(row);
    groups.set(key, group);
  });
  return Array.from(groups.entries()).map(([key, group]) => {
    const [type, mode] = key.split('\u0000');
    return buildReportTable(type, mode, group);
  }).join('');
}

/**
 * Tabel ringkasan ukuran (Total Panjang, Lebar & Tinggi/Dalam rata-rata) +
 * Catatan per Item Pekerjaan, dikelompokkan per jenis infrastruktur.
 * Ditampilkan sebelum tabel detail per-segmen di laporan PDF.
 */
function buildItemSummaryTables(rows: any[]): string {
  const byType = new Map<string, any[]>();
  rows.forEach((row) => {
    const type = row['_infrastructureType'] || 'Lainnya';
    const group = byType.get(type) || [];
    group.push(row);
    byType.set(type, group);
  });

  return Array.from(byType.entries()).map(([type, typeRows]) => {
    const summaries = summarizeItemsByType(type, typeRows);
    const body = summaries.map((item, index) => `
      <tr>
        <td class="no-cell">${index + 1}</td>
        <td>${esc(item.label)}</td>
        <td>${esc(item.constructionType)}</td>
        <td>${esc(formatDimensionSummary(item))}</td>
        <td>${esc(item.damageSummary)}</td>
        <td>${esc(item.condition)}</td>
      </tr>`).join('');

    return `<section class="report-section">
      <div class="report-section-title">${esc(type)} &mdash; Ringkasan Ukuran per Item Pekerjaan (${summaries.length} item)</div>
      <table>
        <thead><tr><th class="no-cell">No</th><th>Lokasi</th><th>Jenis Konstruksi</th><th>Ukuran</th><th>Kerusakan</th><th>Kondisi</th></tr></thead>
        <tbody>${body}</tbody>
      </table>
    </section>`;
  }).join('');
}


function buildPhotoAppendix(rows: any[]): string {
  const groups = new Map<string, { label: string; photos: string[] }>();
  rows.forEach((row) => {
    const itemId = String(row['ID Item Pekerjaan'] || row['Alamat/Keterangan Lokasi'] || row['_infrastructureType'] || 'item');
    const group = groups.get(itemId) || {
      label: `${row['_infrastructureType'] || 'Infrastruktur'} — ${row['Alamat/Keterangan Lokasi'] || '-'}`,
      photos: [],
    };
    (row['_resolvedPhotoUrls'] || []).forEach((url: string) => {
      if (url && !group.photos.includes(url)) group.photos.push(url);
    });
    groups.set(itemId, group);
  });

  return Array.from(groups.values())
    .filter((group) => group.photos.length > 0)
    .flatMap((group) => {
      const pages: string[] = [];
      for (let offset = 0; offset < group.photos.length; offset += 4) {
        const pagePhotos = group.photos.slice(offset, offset + 4);
        pages.push(`
          <section class="appendix-item">
            <div class="appendix-title">Lampiran Foto — ${esc(group.label)}</div>
            <div class="appendix-meta">Foto ${offset + 1}-${offset + pagePhotos.length} dari ${group.photos.length}</div>
            <div class="photos">${pagePhotos.map((url) => `<img src="${url}" class="photo" />`).join('')}</div>
          </section>`);
      }
      return pages;
    })
    .join('');
}


// ─── Laporan Per Paket ────────────────────────────────────────────────────────

function buildPackageReportHtml(packageName: string, rows: any[]): string {
  const generatedAt = new Date().toLocaleString('id-ID');
  return `<html><head><meta charset="utf-8"/><style>${BASE_STYLE}</style></head><body>
    <h1>Laporan Hasil Survei Infrastruktur</h1>
    <div class="meta">
      Paket Pekerjaan: <strong>${esc(packageName)}</strong><br/>
      Total Item: ${rows.length} &nbsp;|&nbsp; Dicetak: ${esc(generatedAt)}
    </div>
    ${buildItemSummaryTables(rows)}
    ${buildReportTables(rows) || '<p>Belum ada data survei.</p>'}

    ${buildPhotoAppendix(rows)}
    <div class="footer">Dokumen dihasilkan otomatis oleh Aplikasi Survei Infrastruktur.</div>
  </body></html>`;
}

export async function printPackageReport(packageName: string, rows: any[]): Promise<void> {
  const resolvedRows = await resolvePhotoUrls(sortReportRowsBySegment(rows));
  const html = buildPackageReportHtml(packageName, resolvedRows);
  await printHtml(html, `Laporan Survei - ${packageName}`);
}


// ─── Laporan Semua Paket ──────────────────────────────────────────────────────

interface PackageSummary {
  packageId: string;
  packageName: string;
  totalItems: number;
  postedItems: number;
  lastUpdate: string;
  byType: Record<string, number>;
}

function buildAllPackagesHtml(packages: PackageSummary[], allRows: any[]): string {
  const generatedAt = new Date().toLocaleString('id-ID');
  const totalItems = packages.reduce((s, p) => s + p.totalItems, 0);
  const totalPosted = packages.reduce((s, p) => s + p.postedItems, 0);
  const infrastructureTypes = Array.from(new Set(packages.flatMap((pkg) => Object.keys(pkg.byType))));

  const typeHeaders = infrastructureTypes.map(
    (t) => `<th>${esc(t.replace('Drainase/Saluran Air', 'Drainase').replace('Dinding Penahan Tanah (DPT)', 'DPT').replace('Gorong-gorong', 'Gorong²'))}</th>`
  ).join('');

  const packageRows = packages.map((pkg, idx) => `
    <tr>
      <td style="text-align:center">${idx + 1}</td>
      <td style="font-weight:600;color:#1e40af">${esc(pkg.packageName)}</td>
      <td style="text-align:center;font-weight:600">${pkg.totalItems}</td>
      ${infrastructureTypes.map((t) => `<td style="text-align:center">${pkg.byType[t] || '-'}</td>`).join('')}
      <td style="text-align:center;color:${pkg.postedItems === pkg.totalItems && pkg.totalItems > 0 ? '#16a34a' : '#334155'};font-weight:600">${pkg.postedItems}/${pkg.totalItems}</td>
      <td style="text-align:center;font-size:9px">${pkg.lastUpdate ? new Date(pkg.lastUpdate).toLocaleDateString('id-ID') : '-'}</td>
    </tr>`).join('');

  const totalRow = `
    <tr style="background:#dbeafe;font-weight:700">
      <td></td><td>TOTAL</td>
      <td style="text-align:center">${totalItems}</td>
      ${infrastructureTypes.map((t) => {
        const sum = packages.reduce((s, p) => s + (p.byType[t] || 0), 0);
        return `<td style="text-align:center">${sum || '-'}</td>`;
      }).join('')}
      <td style="text-align:center">${totalPosted}/${totalItems}</td>
      <td></td>
    </tr>`;

  const summaryTable = `
    <table style="width:100%;border-collapse:collapse;margin-bottom:20px">
      <thead>
        <tr style="background:#1e40af;color:#fff">
          <th style="width:30px">No</th>
          <th style="text-align:left">Nama Paket Pekerjaan</th>
          <th>Total</th>${typeHeaders}<th>Survei Selesai</th><th>Update</th>
        </tr>
      </thead>
      <tbody>${packageRows}${totalRow}</tbody>
    </table>`;

  const detailSections = packages.map((pkg, pkgIdx) => {
    const pkgRows = sortReportRowsBySegment(allRows.filter((r) => r['ID Paket'] === pkg.packageId));
    return `
      <div class="${pkgIdx > 0 ? 'page-break' : ''}">
        <h2>Paket ${pkgIdx + 1}: ${esc(pkg.packageName)}</h2>
        <div class="meta">${pkg.totalItems} item survei &nbsp;|&nbsp; ${pkg.postedItems} survei selesai</div>
        ${buildReportTables(pkgRows) || '<p style="color:#94a3b8;font-style:italic">Belum ada data survei.</p>'}
        ${buildPhotoAppendix(pkgRows)}
      </div>`;
  }).join('');

  return `<html><head><meta charset="utf-8"/>
    <style>
      ${BASE_STYLE}
      thead th { font-size:10px; padding:5px 4px; text-align:center; }
      tbody td { font-size:10px; padding:4px; border-bottom:1px solid #e2e8f0; }
      tbody tr:nth-child(even) { background:#f8fafc; }
    </style>
  </head><body>
    <h1>Rekapitulasi Laporan Semua Paket Pekerjaan</h1>
    <div class="meta">
      Total Paket: <strong>${packages.length}</strong> &nbsp;|&nbsp;
      Total Data Survei: <strong>${totalItems}</strong> &nbsp;|&nbsp;
      Survei Selesai: <strong>${totalPosted}</strong> &nbsp;|&nbsp;
      Dicetak: ${esc(generatedAt)}
    </div>
    ${summaryTable}
    <div class="page-break"></div>
    <h1 style="margin-bottom:12px">Detail Hasil Survei Per Paket</h1>
    ${detailSections}
    <div class="footer">Dokumen dihasilkan otomatis oleh Aplikasi Survei Infrastruktur.</div>
  </body></html>`;
}

export async function printAllPackagesReport(packages: PackageSummary[], allRows: any[]): Promise<void> {
  const resolvedRows = await resolvePhotoUrls(allRows);
  const html = buildAllPackagesHtml(packages, resolvedRows);
  await printHtml(html, 'Laporan Semua Paket Pekerjaan');
}


// ─── Laporan Pelaksanaan Pekerjaan (fisik/konstruksi, terpisah dari survei) ──

interface ExecutedPackageSummary {
  packageId: string;
  packageName: string;
  executed?: boolean;
  executedYear?: number;
  executedContractor?: string;
  executedOutput?: ExecutedOutputEntry[];
}

function buildExecutedOutputTable(rows: ExecutedOutputEntry[] | undefined): string {
  if (!rows || rows.length === 0) {
    return '<p style="color:#94a3b8;font-style:italic">Belum ada rincian output pelaksanaan.</p>';
  }
  const body = rows.map((row, index) => `
    <tr>
      <td style="text-align:center">${index + 1}</td>
      <td>${esc(row.infraType)}</td>
      <td style="text-align:center">${row.panjang ? esc(row.panjang) : '-'}</td>
      <td style="text-align:center">${row.tinggi ? esc(row.tinggi) : '-'}</td>
      <td>${row.catatan ? esc(row.catatan) : '-'}</td>
    </tr>`).join('');
  return `
    <table style="width:100%;border-collapse:collapse;margin-bottom:10px">
      <thead>
        <tr style="background:#1e40af;color:#fff">
          <th style="width:30px">No</th>
          <th style="text-align:left">Jenis Infrastruktur</th>
          <th>Panjang (m)</th>
          <th>Tinggi/Lebar (m)</th>
          <th style="text-align:left">Catatan</th>
        </tr>
      </thead>
      <tbody>${body}</tbody>
    </table>`;
}

/**
 * Laporan pelaksanaan fisik/konstruksi SATU paket pekerjaan. Terpisah dari
 * laporan hasil survei (printPackageReport) karena mencatat progres
 * pelaksanaan di lapangan (tahun anggaran, penyedia jasa/kontraktor, rincian
 * output per jenis infrastruktur) yang diisi admin lewat modal "Info
 * Pelaksanaan", bukan data hasil survei kondisi.
 */
export async function printPackageExecutionReport(pkg: ExecutedPackageSummary): Promise<void> {
  const generatedAt = new Date().toLocaleString('id-ID');
  const html = `<html><head><meta charset="utf-8"/><style>${BASE_STYLE}</style></head><body>
    <h1>Laporan Pelaksanaan Pekerjaan</h1>
    <div class="meta">
      Paket: <strong>${esc(pkg.packageName)}</strong> &nbsp;|&nbsp;
      Dicetak: ${esc(generatedAt)}
    </div>
    <table style="width:100%;border-collapse:collapse;margin-bottom:16px">
      <tbody>
        <tr><td style="font-weight:700;width:180px">Status Pelaksanaan</td><td>${pkg.executed ? '✓ Sudah Dilaksanakan' : 'Belum Dilaksanakan'}</td></tr>
        ${pkg.executed ? `<tr><td style="font-weight:700">Tahun Pelaksanaan</td><td>${pkg.executedYear ? esc(pkg.executedYear) : '-'}</td></tr>` : ''}
        ${pkg.executed ? `<tr><td style="font-weight:700">Penyedia Jasa/Kontraktor</td><td>${pkg.executedContractor ? esc(pkg.executedContractor) : '-'}</td></tr>` : ''}
      </tbody>
    </table>
    ${pkg.executed ? `
      <h2 style="margin-bottom:8px">Rincian Output Pelaksanaan</h2>
      ${buildExecutedOutputTable(pkg.executedOutput)}
    ` : '<p style="color:#94a3b8;font-style:italic">Paket ini belum ditandai sebagai sudah dilaksanakan.</p>'}
    <div class="footer">Dokumen dihasilkan otomatis oleh Aplikasi Survei Infrastruktur.</div>
  </body></html>`;
  await printHtml(html, `Laporan Pelaksanaan - ${pkg.packageName}`);
}

/**
 * Rekapitulasi PELAKSANAAN FISIK seluruh paket pekerjaan (bukan rekap hasil
 * survei seperti printAllPackagesReport). Menonjolkan paket mana yang sudah
 * dilaksanakan (tahun, penyedia jasa, total output per jenis infrastruktur)
 * dan mana yang masih belum, sehingga progres pelaksanaan fisik di lapangan
 * bisa dipantau lintas paket dalam satu dokumen.
 */
export async function printExecutionRecapReport(packages: ExecutedPackageSummary[]): Promise<void> {
  const generatedAt = new Date().toLocaleString('id-ID');
  const executedPackages = packages.filter((p) => p.executed);
  const notExecutedPackages = packages.filter((p) => !p.executed);

  const infrastructureTypes = Array.from(
    new Set(executedPackages.flatMap((p) => (p.executedOutput || []).map((o) => o.infraType)))
  );

  const totalsByType = new Map<string, number>();
  executedPackages.forEach((p) => {
    (p.executedOutput || []).forEach((o) => {
      const n = parseFloat(String(o.panjang || '').replace(',', '.'));
      if (!isNaN(n)) totalsByType.set(o.infraType, (totalsByType.get(o.infraType) || 0) + n);
    });
  });

  const typeHeaders = infrastructureTypes.map((t) => `<th>${esc(t)} (m)</th>`).join('');

  const executedRows = executedPackages.map((pkg, idx) => {
    const outputByType = new Map<string, string[]>();
    (pkg.executedOutput || []).forEach((o) => {
      const list = outputByType.get(o.infraType) || [];
      list.push(o.panjang ? String(o.panjang) : '-');
      outputByType.set(o.infraType, list);
    });
    return `
      <tr>
        <td style="text-align:center">${idx + 1}</td>
        <td style="font-weight:600;color:#1e40af">${esc(pkg.packageName)}</td>
        <td style="text-align:center">${pkg.executedYear ? esc(pkg.executedYear) : '-'}</td>
        <td>${pkg.executedContractor ? esc(pkg.executedContractor) : '-'}</td>
        ${infrastructureTypes.map((t) => `<td style="text-align:center">${(outputByType.get(t) || ['-']).join(', ')}</td>`).join('')}
      </tr>`;
  }).join('');

  const totalRow = `
    <tr style="background:#dbeafe;font-weight:700">
      <td></td><td>TOTAL</td><td></td><td></td>
      ${infrastructureTypes.map((t) => {
        const sum = totalsByType.get(t) || 0;
        return `<td style="text-align:center">${sum ? sum.toFixed(2) : '-'}</td>`;
      }).join('')}
    </tr>`;

  const executedTable = executedPackages.length > 0 ? `
    <table style="width:100%;border-collapse:collapse;margin-bottom:20px">
      <thead>
        <tr style="background:#1e40af;color:#fff">
          <th style="width:30px">No</th>
          <th style="text-align:left">Nama Paket Pekerjaan</th>
          <th>Tahun</th>
          <th style="text-align:left">Penyedia Jasa</th>
          ${typeHeaders}
        </tr>
      </thead>
      <tbody>${executedRows}${totalRow}</tbody>
    </table>` : '<p style="color:#94a3b8;font-style:italic">Belum ada paket yang dilaksanakan.</p>';

  const notExecutedList = notExecutedPackages.length > 0
    ? `<ul>${notExecutedPackages.map((p) => `<li>${esc(p.packageName)}</li>`).join('')}</ul>`
    : '<p style="color:#94a3b8;font-style:italic">Semua paket sudah dilaksanakan.</p>';

  const html = `<html><head><meta charset="utf-8"/>
    <style>
      ${BASE_STYLE}
      thead th { font-size:10px; padding:5px 4px; text-align:center; }
      tbody td { font-size:10px; padding:4px; border-bottom:1px solid #e2e8f0; }
      tbody tr:nth-child(even) { background:#f8fafc; }
      ul { margin:0; padding-left:18px; font-size:10px; }
      li { margin-bottom:2px; }
    </style>
  </head><body>
    <h1>Rekapitulasi Pelaksanaan Pekerjaan Fisik</h1>
    <div class="meta">
      Total Paket: <strong>${packages.length}</strong> &nbsp;|&nbsp;
      Sudah Dilaksanakan: <strong>${executedPackages.length}</strong> &nbsp;|&nbsp;
      Belum Dilaksanakan: <strong>${notExecutedPackages.length}</strong> &nbsp;|&nbsp;
      Dicetak: ${esc(generatedAt)}
    </div>
    <h2 style="margin-bottom:8px">Paket Sudah Dilaksanakan</h2>
    ${executedTable}
    <h2 style="margin-bottom:8px">Paket Belum Dilaksanakan</h2>
    ${notExecutedList}
    <div class="footer">Dokumen dihasilkan otomatis oleh Aplikasi Survei Infrastruktur.</div>
  </body></html>`;
  await printHtml(html, 'Rekapitulasi Pelaksanaan Pekerjaan Fisik');
}

