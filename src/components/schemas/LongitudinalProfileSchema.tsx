import React from 'react';
import Svg, { Line, Text as SvgText, Polyline, Circle, Rect } from 'react-native-svg';
import { ProfileResult } from '../../utils/longitudinalProfile';

interface Props {
  title: string;
  profile: ProfileResult;
  tptReference?: 'actual' | 'top' | 'bottom';
  svgRef?: React.RefObject<any>;
  compact?: boolean;
}

// Ukuran diperkecil agar grafik profil memanjang tidak memanjang berlebihan
// di layar — grafik ini hanya berfungsi membantu memvisualisasikan garis
// perubahan ukuran antar-STA, bukan komponen utama yang perlu ruang besar.
const W = 260;
const PADDING_LEFT = 38;
const PADDING_RIGHT = 12;
// PADDING_TOP diperbesar dari 22 ke 34 agar label seri pertama (digambar
// pada chartTop - 6, tepat di atas grafik pertama) tidak bertumpuk dengan
// baris terakhir judul grafik — sebelumnya keduanya berada nyaris pada
// posisi Y yang sama sehingga teks judul & label seri saling timpa.
const PADDING_TOP = 34;
const CHART_H = 68;
const CHART_GAP = 22;
// Ruang bawah dipisahkan menjadi area label STA dan keterangan total panjang
// agar keduanya tidak saling bertumpuk pada gambar hasil capture/PDF.
const AXIS_H = 38;
// Tinggi satu baris judul (judul bisa dipecah jadi beberapa baris bila
// terlalu panjang untuk lebar grafik, lihat wrapTitle()).
const TITLE_LINE_H = 13;

function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, '');
}

// Perkiraan kasar lebar 1 karakter (px) untuk font bold ukuran `fontSize`,
// dipakai memecah judul panjang (mis. "Dinding Penahan Tanah (DPT) — RT 1/RW
// 1") jadi beberapa baris supaya tidak melebihi lebar grafik dan tidak
// bertumpuk dengan label seri di bawahnya.
function wrapTitle(text: string, maxWidth: number, fontSize: number): string[] {
  const charWidth = fontSize * 0.62;
  const maxCharsPerLine = Math.max(8, Math.floor(maxWidth / charWidth));
  if (text.length <= maxCharsPerLine) return [text];

  const words = text.split(' ');
  const lines: string[] = [];
  let current = '';
  words.forEach((word) => {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length > maxCharsPerLine && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  });
  if (current) lines.push(current);
  return lines.slice(0, 2);
}


/**
 * Menggambar profil memanjang (longitudinal profile) satu item pekerjaan
 * bersegmen: sumbu X = jarak kumulatif (STA) dari awal hingga akhir item,
 * sumbu Y = ukuran (lebar/tinggi/kedalaman) tiap seri. Titik-titik STA antar
 * segmen disambungkan menjadi satu garis memanjang, dengan penanda titik
 * sambung STA dan sorotan pada segmen yang punya kondisi khusus (kerusakan/
 * sedimentasi/kemiringan). Berbasis react-native-svg, sehingga tampil sama
 * di web maupun native (APK), dan bisa di-capture jadi foto seperti skema
 * penampang melintang lainnya.
 */
export default function LongitudinalProfileSchema({ title, profile, tptReference = 'actual', svgRef, compact = false }: Props) {
  const { totalLength, staBreaks, series } = profile;
  const chartW = W - PADDING_LEFT - PADDING_RIGHT;
  const safeTotalLength = totalLength > 0 ? totalLength : 1;
  const titleLines = wrapTitle(title, W - 16, 12);
  const paddingTop = PADDING_TOP + (titleLines.length - 1) * TITLE_LINE_H;
  const totalH = paddingTop + series.length * (CHART_H + CHART_GAP) + AXIS_H;

  const xFor = (dist: number) => PADDING_LEFT + (dist / safeTotalLength) * chartW;

  return (
    <Svg
      ref={svgRef}
      id={svgRef ? 'longitudinal-profile-capture' : undefined}
      width={compact ? W : W}
      height={compact ? 140 : totalH}
      viewBox={`0 0 ${W} ${totalH}`}
      preserveAspectRatio="xMidYMid meet"
    >
      {titleLines.map((line, i) => (
        <SvgText
          key={`title-${i}`}
          x={W / 2}
          y={16 + i * TITLE_LINE_H}
          fontSize={12}
          fill="#1e293b"
          textAnchor="middle"
          fontWeight="bold"
        >
          {line}
        </SvgText>
      ))}

      {series.map((serie, sIndex) => {
        const chartTop = paddingTop + sIndex * (CHART_H + CHART_GAP);

        const chartBottom = chartTop + CHART_H;
        // Untuk seri "cumulativeBase" (mis. Tinggi Dinding TPT), nilai yang
        // digambar adalah level PUNCAK (dasar + tinggi), sedangkan dasar
        // (pondasi) ikut naik bertingkat mengikuti puncak segmen sebelumnya —
        // bukan garis dasar 0 yang flat sepanjang grafik.
        const topStart = (p: typeof serie.points[number]) => p.baseStart + p.valueStart;
        const topEnd = (p: typeof serie.points[number]) => p.baseEnd + p.valueEnd;
        const firstPoint = serie.points[0];
        const referenceTop = firstPoint ? topStart(firstPoint) : 0;
        const referenceBottom = firstPoint?.baseStart ?? 0;
        const baseFor = (p: typeof serie.points[number]) => {
          if (title !== 'Dinding Penahan Tanah (DPT)' || tptReference === 'actual' || !serie.hasBase) return p.baseStart;
          return tptReference === 'top' ? referenceTop - p.valueStart : referenceBottom;
        };
        const baseEndFor = (p: typeof serie.points[number]) => {
          if (title !== 'Dinding Penahan Tanah (DPT)' || tptReference === 'actual' || !serie.hasBase) return p.baseEnd;
          return tptReference === 'top' ? referenceTop - p.valueEnd : referenceBottom;
        };
        const topFor = (p: typeof serie.points[number]) => baseFor(p) + p.valueStart;
        const topEndFor = (p: typeof serie.points[number]) => baseEndFor(p) + p.valueEnd;
        const values = serie.hasBase
          ? serie.points.flatMap((p) => [baseFor(p), topFor(p), baseEndFor(p), topEndFor(p)])
          : serie.points.flatMap((p) => [p.valueStart, p.valueEnd]).filter((v) => v > 0);
        const rawMin = values.length > 0 ? Math.min(...values) : 0;
        const rawMax = values.length > 0 ? Math.max(...values) : 1;
        const range = Math.max(rawMax - rawMin, 1);
        const padding = serie.absoluteY ? range * 0.12 : 0;
        const minVal = serie.absoluteY ? rawMin - padding : 0;
        const maxVal = serie.absoluteY ? rawMax + padding : Math.max(rawMax * 1.2, 1);
        const safeRange = Math.max(maxVal - minVal, 1);

        const yFor = (v: number) => {
          const ratio = Math.max(0, Math.min((v - minVal) / safeRange, 1));
          return serie.invertY
            ? chartTop + ratio * CHART_H
            : chartBottom - ratio * CHART_H;
        };
        const baselineY = serie.invertY ? chartTop : chartBottom;

        // Bangun titik polyline: tiap segmen kontribusi 2 titik (start, end),
        // disambung langsung ke titik awal segmen berikutnya (karena
        // distEnd segmen ini == distStart segmen berikutnya, kalau menyambung).
        const linePoints = serie.hasBase
          ? serie.points
              .flatMap((p) => [`${xFor(p.distStart)},${yFor(topFor(p))}`, `${xFor(p.distEnd)},${yFor(topEndFor(p))}`])
              .join(' ')
          : serie.points
              .flatMap((p) => [`${xFor(p.distStart)},${yFor(p.valueStart)}`, `${xFor(p.distEnd)},${yFor(p.valueEnd)}`])
              .join(' ');
        // Garis dasar/pondasi bertingkat (staircase), hanya untuk cumulativeBase.
        const basePoints = serie.hasBase
          ? serie.points
              .flatMap((p) => [`${xFor(p.distStart)},${yFor(baseFor(p))}`, `${xFor(p.distEnd)},${yFor(baseEndFor(p))}`])
              .join(' ')
          : '';

        return (
          <React.Fragment key={serie.label}>
            {/* Garis dasar (baseline) */}
            <Line
              x1={PADDING_LEFT}
              y1={baselineY}
              x2={PADDING_LEFT + chartW}
              y2={baselineY}
              stroke="#cbd5e1"
              strokeWidth={1}
            />

            {/* Highlight blok segmen dengan kondisi khusus */}
            {serie.highlightLabel &&
              serie.points
                .filter((p) => p.highlighted)
                .map((p, i) => (
                  <Rect
                    key={`hl-${i}`}
                    x={xFor(p.distStart)}
                    y={chartTop}
                    width={Math.max(xFor(p.distEnd) - xFor(p.distStart), 2)}
                    height={CHART_H}
                    fill="#ef4444"
                    opacity={0.12}
                  />
                ))}

            {/* Garis dasar/pondasi bertingkat mengikuti STA sebelumnya */}
            {serie.hasBase && (
              <Polyline points={basePoints} fill="none" stroke="#92400e" strokeWidth={1.5} strokeDasharray="3,2" />
            )}

            {/* Garis profil memanjang (puncak) */}
            <Polyline points={linePoints} fill="none" stroke={serie.color} strokeWidth={2} />

            {/* Titik sambung tiap STA */}
            {serie.points.map((p, i) => (
              <React.Fragment key={`pt-${i}`}>
                <Circle
                  cx={xFor(p.distStart)}
                  cy={yFor(serie.hasBase ? topFor(p) : p.valueStart)}
                  r={2.5}
                  fill={serie.color}
                />
                {i === serie.points.length - 1 && (
                  <Circle
                    cx={xFor(p.distEnd)}
                    cy={yFor(serie.hasBase ? topEndFor(p) : p.valueEnd)}
                    r={2.5}
                    fill={serie.color}
                  />
                )}
              </React.Fragment>
            ))}

            <SvgText x={PADDING_LEFT} y={chartTop - 6} fontSize={11} fill={serie.color} fontWeight="bold">
              {`${serie.label} (${serie.unit})${serie.highlightLabel ? ` — merah: ${serie.highlightLabel}` : ''}${serie.hasBase ? ' — putus-putus: dasar' : ''}`}
            </SvgText>
            <SvgText x={PADDING_LEFT - 6} y={baselineY + (serie.invertY ? -4 : 12)} fontSize={9} fill="#64748b" textAnchor="end">
              {fmt(minVal)}
            </SvgText>
            <SvgText
              x={PADDING_LEFT - 6}
              y={(serie.invertY ? chartBottom : chartTop) + (serie.invertY ? 12 : -4)}
              fontSize={9}
              fill="#64748b"
              textAnchor="end"
            >
              {fmt(maxVal)}
            </SvgText>
          </React.Fragment>
        );
      })}

      {/* Sumbu jarak (STA) di bagian bawah, sama untuk semua seri */}
      <Line
        x1={PADDING_LEFT}
        y1={totalH - AXIS_H}
        x2={PADDING_LEFT + chartW}
        y2={totalH - AXIS_H}
        stroke="#334155"
        strokeWidth={1.5}
      />
      {staBreaks.map((brk, i) => (
        <React.Fragment key={`sta-${i}`}>
          <Line
            x1={xFor(brk.dist)}
            y1={totalH - AXIS_H - 4}
            x2={xFor(brk.dist)}
            y2={totalH - AXIS_H + 4}
            stroke="#334155"
            strokeWidth={1}
          />
          <SvgText
            x={xFor(brk.dist)}
            y={totalH - AXIS_H + 16}
            fontSize={8}
            fill="#334155"
            textAnchor={i === 0 ? 'start' : i === staBreaks.length - 1 ? 'end' : 'middle'}
          >
            {brk.staLabel}
          </SvgText>
        </React.Fragment>
      ))}
      <SvgText x={W / 2} y={totalH - AXIS_H + 34} fontSize={9} fill="#64748b" textAnchor="middle">
        {`Total Panjang: ${fmt(totalLength)} m`}
      </SvgText>
    </Svg>
  );
}
