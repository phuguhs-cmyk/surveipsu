import React from 'react';
import Svg, { Rect, Line, Text as SvgText, Polygon, G } from 'react-native-svg';

/**
 * Skema penampang melintang (cross-section) jalan, digambar secara
 * parametrik dari data ukuran yang sudah diinput surveyor (lebar jalan di
 * STA awal & akhir, dimensi kerusakan), BUKAN gambar bebas (freehand).
 * Karena berbasis react-native-svg, skema ini tampil sama di web maupun
 * native (APK), berbeda dengan SketchCanvasModal (kanvas HTML, web-only).
 */
interface Props {
  widthStart?: string;
  widthEnd?: string;
  damageLength?: string;
  damageWidth?: string;
  damageDepth?: string;
  staStart?: string;
  staEnd?: string;
  pavementType?: string;
  svgRef?: React.RefObject<any>;
}

const W = 320;
const H = 220;

function toNum(v?: string): number {
  const n = parseFloat((v || '').replace(',', '.'));
  return isNaN(n) || n <= 0 ? 0 : n;
}

export default function RoadSchema({
  widthStart,
  widthEnd,
  damageLength,
  damageWidth,
  damageDepth,
  staStart,
  staEnd,
  pavementType,
  svgRef,
}: Props) {
  const wStart = toNum(widthStart) || 4;
  const wEnd = toNum(widthEnd) || wStart;
  const widthM = Math.max(wStart, wEnd);
  const dW = toNum(damageWidth);
  const dD = toNum(damageDepth);

  const margin = 40;
  const roadPxWidth = W - margin * 2;
  const roadY = 110;
  const roadThickness = 24;

  // Lebar kerusakan sebagai proporsi dari lebar jalan (dibatasi agar tetap
  // muat di dalam gambar jalan).
  const damageRatio = dW > 0 ? Math.min(dW / widthM, 1) : 0;
  const damagePxWidth = damageRatio * roadPxWidth;
  const damageX = margin + (roadPxWidth - damagePxWidth) / 2;
  const damageDepthPx = dD > 0 ? Math.min(6 + dD * 1.5, 40) : 0;

  return (
    <Svg ref={svgRef} width={W} height={H}>
      {/* Tanah dasar */}
      <Rect x={0} y={roadY + roadThickness} width={W} height={40} fill="#d6d3d1" />
      {/* Badan jalan */}
      <Rect x={margin} y={roadY} width={roadPxWidth} height={roadThickness} fill="#94a3b8" stroke="#334155" strokeWidth={1.5} />
      {/* Lapisan perkerasan tipis di atas */}
      <Rect x={margin} y={roadY} width={roadPxWidth} height={6} fill="#475569" />

      {/* Area kerusakan (jika ada) */}
      {damagePxWidth > 0 && (
        <Rect
          x={damageX}
          y={roadY}
          width={damagePxWidth}
          height={Math.max(damageDepthPx, 8)}
          fill="#ef4444"
          opacity={0.55}
          stroke="#b91c1c"
          strokeWidth={1}
        />
      )}

      {/* Garis dimensi lebar jalan di STA awal (kiri) & STA akhir (kanan) */}
      <Line x1={margin} y1={roadY - 16} x2={margin + roadPxWidth} y2={roadY - 16} stroke="#1d4ed8" strokeWidth={1} />
      <Line x1={margin} y1={roadY - 22} x2={margin} y2={roadY - 10} stroke="#1d4ed8" strokeWidth={1} />
      <Line x1={margin + roadPxWidth} y1={roadY - 22} x2={margin + roadPxWidth} y2={roadY - 10} stroke="#1d4ed8" strokeWidth={1} />
      <SvgText x={margin} y={roadY - 24} fontSize={11} fill="#1d4ed8" textAnchor="start">
        {`${widthStart || '-'} m`}
      </SvgText>
      <SvgText x={margin + roadPxWidth} y={roadY - 24} fontSize={11} fill="#1d4ed8" textAnchor="end">
        {`${widthEnd || '-'} m`}
      </SvgText>

      {damagePxWidth > 0 && (
        <SvgText x={damageX + damagePxWidth / 2} y={roadY + Math.max(damageDepthPx, 8) + 16} fontSize={11} fill="#b91c1c" textAnchor="middle">
          {`Kerusakan ${damageLength || '-'}m x ${damageWidth || '-'}m x ${damageDepth || '-'}cm`}
        </SvgText>
      )}

      <SvgText x={W / 2} y={H - 26} fontSize={11} fill="#334155" textAnchor="middle">
        {pavementType ? `Perkerasan: ${pavementType}` : ''}
      </SvgText>
      <SvgText x={W / 2} y={H - 8} fontSize={11} fill="#334155" textAnchor="middle">
        {staStart || staEnd ? `STA ${staStart || '-'} s/d ${staEnd || '-'}` : ''}
      </SvgText>
    </Svg>
  );
}
