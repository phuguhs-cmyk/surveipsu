import { computeCumulativeDistances } from './sta';

/**
 * Utilitas untuk membangun "profil memanjang" (longitudinal profile) satu
 * item pekerjaan bersegmen (Jalan, Drainase, Dinding Penahan Tanah), yaitu
 * grafik yang menyambungkan ukuran (lebar/tinggi/kedalaman) tiap segmen dari
 * STA awal hingga STA akhir item pekerjaan, sehingga terlihat sebagai satu
 * garis/profil yang memanjang — melengkapi skema penampang melintang
 * (cross-section) per segmen yang sudah ada di components/schemas/*.
 */

function toNum(v?: string): number {
  const n = parseFloat((v || '').replace(',', '.'));
  return isNaN(n) ? 0 : n;
}

/** Satu segmen sumber data, format-agnostic (bisa dari sheet row atau form EditSegment). */
export interface ProfileSegmentInput {
  staStart: string;
  staEnd: string;
  /** Mengambil nilai field berdasarkan "key" internal (sama seperti EDIT_FIELDS[].key). */
  get: (key: string) => string | undefined;
}

/** Definisi satu seri/garis pada grafik (mis. "Lebar Jalan", "Tinggi Dinding"). */
export interface ProfileSeriesDef {
  label: string;
  unit: string;
  color: string;
  /** Field key nilai di STA awal segmen. */
  startKey: string;
  /** Field key nilai di STA akhir segmen; jika kosong dianggap sama dengan startKey (segmen datar). */
  endKey?: string;
  /** Field key elevasi dasar di STA awal/akhir untuk seri berbasis elevasi. */
  baseStartKey?: string;
  baseEndKey?: string;
  /** Gunakan rentang elevasi absolut, bukan skala dimensi mulai dari nol. */
  absoluteY?: boolean;
  /** Gambar seri menurun ke bawah (cocok untuk "kedalaman"), bukan ke atas. */
  invertY?: boolean;
  /**
   * Jika true, garis dasar/pondasi tidak flat di 0 sepanjang grafik.
   * STA awal keseluruhan tetap mulai dari 0, tapi dasar STA berikutnya
   * mengikuti (=sama dengan) level puncak (dasar+nilai) STA akhir segmen
   * sebelumnya — menghasilkan profil bertingkat (staircase) yang mengikuti
   * kontur/kondisi nyata di lapangan. Cocok untuk "Tinggi Dinding" TPT.
   */
  cumulativeBase?: boolean;
  /** Field key yang menandai kondisi khusus (kerusakan/sedimentasi/kemiringan) untuk disorot. */
  highlightKey?: string;
  highlightTest?: (value: string | undefined) => boolean;
  highlightLabel?: string;
}

export interface ProfilePoint {
  distStart: number;
  distEnd: number;
  valueStart: number;
  valueEnd: number;
  /** Level dasar/pondasi di titik distStart/distEnd (0 jika bukan cumulativeBase). */
  baseStart: number;
  baseEnd: number;
  staStartLabel: string;
  staEndLabel: string;
  highlighted: boolean;
}

export interface ProfileSeries {
  label: string;
  unit: string;
  color: string;
  invertY?: boolean;
  cumulativeBase?: boolean;
  absoluteY?: boolean;
  hasBase?: boolean;
  highlightLabel?: string;
  points: ProfilePoint[];
}

export interface ProfileResult {
  totalLength: number;
  staBreaks: { dist: number; staLabel: string }[];
  series: ProfileSeries[];
}

/**
 * Konfigurasi seri per jenis infrastruktur bersegmen. Key harus selaras
 * dengan EDIT_FIELDS[type][].key di config.ts.
 */
export const PROFILE_SERIES_CONFIG: Record<string, ProfileSeriesDef[]> = {
  'Jalan': [
    {
      label: 'Elevasi Jalan',
      unit: 'm',
      color: '#0f766e',
      startKey: 'roadElevationStart',
      endKey: 'roadElevationEnd',
      absoluteY: true,
    },
    {
      label: 'Lebar Jalan',
      unit: 'm',
      color: '#2563eb',
      startKey: 'widthStart',
      endKey: 'widthEnd',
      highlightKey: 'damageWidth',
      highlightTest: (v) => !!v && parseFloat((v || '').replace(',', '.')) > 0,
      highlightLabel: 'Kerusakan',
    },
  ],
  'Drainase/Saluran Air': [
    {
      label: 'Dasar Saluran',
      unit: 'm',
      color: '#0f766e',
      startKey: 'invertElevationStart',
      endKey: 'invertElevationEnd',
      absoluteY: true,
    },
    {
      label: 'Atas Saluran',
      unit: 'm',
      color: '#2563eb',
      startKey: 'depth',
      baseStartKey: 'invertElevationStart',
      baseEndKey: 'invertElevationEnd',
      absoluteY: true,
    },
    {
      label: 'Lebar Saluran',
      unit: 'm',
      color: '#2563eb',
      startKey: 'width',
    },
    {
      label: 'Kedalaman',
      unit: 'm',
      color: '#b45309',
      startKey: 'depth',
      invertY: true,
      highlightKey: 'sedimentCondition',
      highlightTest: (v) => !!v && v !== 'Tidak Ada',
      highlightLabel: 'Sedimentasi',
    },
  ],
  'Dinding Penahan Tanah (DPT)': [
    {
      label: 'Puncak Dinding',
      unit: 'm',
      color: '#7c3aed',
      startKey: 'heightStart',
      endKey: 'heightEnd',
      baseStartKey: 'baseElevationStart',
      baseEndKey: 'baseElevationEnd',
      cumulativeBase: true,
      absoluteY: true,
      highlightKey: 'tiltCondition',
      highlightTest: (v) => !!v && v !== 'Tidak Ada Pergeseran',
      highlightLabel: 'Kemiringan',
    },
  ],
};

/**
 * Membangun data profil memanjang dari daftar segmen SATU item pekerjaan.
 * Segmen tidak harus sudah terurut; fungsi ini mengurutkan berdasarkan STA
 * terlebih dahulu (lihat computeCumulativeDistances yang memanggil parseStaToMeters).
 */
export function buildLongitudinalProfile(
  segments: ProfileSegmentInput[],
  seriesDefs: ProfileSeriesDef[]
): ProfileResult {
  const distanced = computeCumulativeDistances(segments);
  const totalLength = distanced.length > 0 ? distanced[distanced.length - 1].distEnd : 0;

  const staBreaks: { dist: number; staLabel: string }[] = [];
  distanced.forEach(({ seg, distStart, distEnd }, idx) => {
    if (idx === 0) staBreaks.push({ dist: distStart, staLabel: seg.staStart || '-' });
    staBreaks.push({ dist: distEnd, staLabel: seg.staEnd || '-' });
  });

  const series: ProfileSeries[] = seriesDefs.map((def) => {
    let runningBase = 0;
    const points: ProfilePoint[] = distanced.map(({ seg, distStart, distEnd }) => {
      const highlighted = def.highlightKey ? !!def.highlightTest?.(seg.get(def.highlightKey)) : false;
      const hasExplicitBase = !!def.baseStartKey;
      const baseStart = hasExplicitBase
        ? toNum(seg.get(def.baseStartKey!))
        : def.cumulativeBase ? runningBase : 0;
      const baseEnd = hasExplicitBase
        ? toNum(seg.get(def.baseEndKey || def.baseStartKey!))
        : baseStart;
      const heightStart = toNum(seg.get(def.startKey));
      const heightEnd = def.endKey ? toNum(seg.get(def.endKey)) : heightStart;
      const topStartValue = baseStart + heightStart;
      const topEndValue = baseEnd + heightEnd;
      const valueStart = topStartValue - baseStart;
      const valueEnd = topEndValue - baseEnd;
      if (def.cumulativeBase && !hasExplicitBase) {
        runningBase = baseStart + valueEnd;
      }
      return {
        distStart,
        distEnd,
        valueStart,
        valueEnd,
        baseStart,
        baseEnd,
        staStartLabel: seg.staStart || '-',
        staEndLabel: seg.staEnd || '-',
        highlighted,
      };
    });
    return {
      label: def.label,
      unit: def.unit,
      color: def.color,
      invertY: def.invertY,
      cumulativeBase: def.cumulativeBase,
      absoluteY: def.absoluteY,
      hasBase: !!def.baseStartKey || !!def.cumulativeBase,
      highlightLabel: def.highlightLabel,
      points,
    };
  });

  return {
    totalLength,
    staBreaks,
    series: series.filter((serie) => serie.points.some((point) => point.valueStart !== 0 || point.valueEnd !== 0)),
  };
}
