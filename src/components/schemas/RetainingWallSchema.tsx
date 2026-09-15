import React from 'react';
import Svg, { Rect, Line, Text as SvgText, Polygon } from 'react-native-svg';

/**
 * Skema penampang Dinding Penahan Tanah (DPT), digambar parametrik dari
 * data ukuran segmen (panjang, tinggi) dan kondisi kemiringan.
 */
interface Props {
  length?: string;
  heightStart?: string;
  heightEnd?: string;
  topWidth?: string;
  bottomWidth?: string;
  constructionType?: string;
  tiltCondition?: string;
  staStart?: string;
  staEnd?: string;
  svgRef?: React.RefObject<any>;
}

const W = 320;
const H = 220;

function toNum(v?: string): number {
  const n = parseFloat((v || '').replace(',', '.'));
  return isNaN(n) || n <= 0 ? 0 : n;
}

export default function RetainingWallSchema({
  length,
  heightStart,
  heightEnd,
  topWidth,
  bottomWidth,
  constructionType,
  tiltCondition,
  staStart,
  staEnd,
  svgRef,
}: Props) {
  const hStart = toNum(heightStart) || 1.5;
  const hEnd = toNum(heightEnd) || hStart;

  const baseY = 170;
  const wallPxWidth = 90;
  const wallX = (W - wallPxWidth) / 2;
  // Sisi kiri (STA awal) & sisi kanan (STA akhir) bisa berbeda tinggi.
  const wallPxHeightStart = Math.max(50, Math.min(120, hStart * 40));
  const wallPxHeightEnd = Math.max(50, Math.min(120, hEnd * 40));
  const wallTopYStart = baseY - wallPxHeightStart;
  const wallTopYEnd = baseY - wallPxHeightEnd;

  const isTilted = (tiltCondition || '').toLowerCase().includes('signifikan');
  const isSlightTilt = (tiltCondition || '').toLowerCase().includes('ringan');
  const tiltOffset = isTilted ? 18 : isSlightTilt ? 8 : 0;

  // Poligon dinding: sisi depan miring sesuai kondisi kemiringan, sisi atas
  // menghubungkan tinggi STA awal (kiri) dengan tinggi STA akhir (kanan).
  const points = [
    `${wallX},${baseY}`,
    `${wallX + tiltOffset},${wallTopYStart}`,
    `${wallX + wallPxWidth + tiltOffset},${wallTopYEnd}`,
    `${wallX + wallPxWidth},${baseY}`,
  ].join(' ');

  return (
    <Svg ref={svgRef} width={W} height={H}>
      {/* Tanah di belakang dinding */}
      <Rect x={wallX + wallPxWidth} y={Math.min(wallTopYStart, wallTopYEnd) - 10} width={W - (wallX + wallPxWidth)} height={Math.max(wallPxHeightStart, wallPxHeightEnd) + 30} fill="#d6d3d1" />
      {/* Tanah dasar di depan dinding */}
      <Rect x={0} y={baseY} width={W} height={30} fill="#d6d3d1" />

      {/* Badan dinding penahan tanah */}
      <Polygon points={points} fill={isTilted ? '#f59e0b' : '#94a3b8'} stroke="#334155" strokeWidth={1.5} />

      {/* Dimensi tinggi STA awal (kiri) */}
      <Line x1={wallX - 16} y1={wallTopYStart} x2={wallX - 16} y2={baseY} stroke="#1d4ed8" strokeWidth={1} />
      <Line x1={wallX - 22} y1={wallTopYStart} x2={wallX - 10} y2={wallTopYStart} stroke="#1d4ed8" strokeWidth={1} />
      <Line x1={wallX - 22} y1={baseY} x2={wallX - 10} y2={baseY} stroke="#1d4ed8" strokeWidth={1} />
      <SvgText x={wallX - 26} y={(wallTopYStart + baseY) / 2} fontSize={11} fill="#1d4ed8" textAnchor="end">
        {`${heightStart || '-'} m`}
      </SvgText>

      {/* Dimensi tinggi STA akhir (kanan) */}
      <Line x1={wallX + wallPxWidth + 16} y1={wallTopYEnd} x2={wallX + wallPxWidth + 16} y2={baseY} stroke="#1d4ed8" strokeWidth={1} />
      <Line x1={wallX + wallPxWidth + 10} y1={wallTopYEnd} x2={wallX + wallPxWidth + 22} y2={wallTopYEnd} stroke="#1d4ed8" strokeWidth={1} />
      <Line x1={wallX + wallPxWidth + 10} y1={baseY} x2={wallX + wallPxWidth + 22} y2={baseY} stroke="#1d4ed8" strokeWidth={1} />
      <SvgText x={wallX + wallPxWidth + 26} y={(wallTopYEnd + baseY) / 2} fontSize={11} fill="#1d4ed8" textAnchor="start">
        {`${heightEnd || '-'} m`}
      </SvgText>

      <SvgText x={W / 2} y={30} fontSize={13} fill="#1d4ed8" textAnchor="middle" fontWeight="bold">
        {`Panjang Segmen: ${length || '-'} m`}
      </SvgText>

      {(topWidth || bottomWidth) && (
        <SvgText x={W / 2} y={48} fontSize={11} fill="#1d4ed8" textAnchor="middle">
          {`Lebar Atas: ${topWidth || '-'} m — Lebar Bawah: ${bottomWidth || '-'} m`}
        </SvgText>
      )}

      <SvgText x={W / 2} y={H - 26} fontSize={11} fill="#334155" textAnchor="middle">
        {constructionType ? `Konstruksi: ${constructionType}` : ''}
        {tiltCondition ? ` — ${tiltCondition}` : ''}
      </SvgText>
      <SvgText x={W / 2} y={H - 8} fontSize={11} fill="#334155" textAnchor="middle">
        {staStart || staEnd ? `STA ${staStart || '-'} s/d ${staEnd || '-'}` : ''}
      </SvgText>
    </Svg>
  );
}

