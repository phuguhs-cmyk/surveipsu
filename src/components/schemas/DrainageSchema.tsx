import React from 'react';
import Svg, { Rect, Line, Text as SvgText, Path } from 'react-native-svg';

/**
 * Skema penampang melintang saluran drainase, digambar parametrik dari
 * data ukuran (lebar, kedalaman, jenis saluran terbuka/tertutup).
 */
interface Props {
  channelType?: string;
  width?: string;
  depth?: string;
  sedimentCondition?: string;
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

export default function DrainageSchema({ channelType, width, depth, sedimentCondition, staStart, staEnd, svgRef }: Props) {
  const w = toNum(width) || 0.5;
  const d = toNum(depth) || 0.5;
  const isClosed = (channelType || '').toLowerCase().includes('tertutup');

  const margin = 60;
  const chanPxWidth = Math.min(W - margin * 2, 160);
  const chanTop = 70;
  // Skala tinggi berdasar rasio d/w agar proporsional secara visual, dibatasi.
  const chanPxHeight = Math.max(40, Math.min(120, chanPxWidth * (d / w)));
  const chanX = (W - chanPxWidth) / 2;

  const sedimentRatio = sedimentCondition && sedimentCondition !== 'Tidak Ada'
    ? sedimentCondition === 'Ringan' ? 0.15 : sedimentCondition === 'Sedang' ? 0.35 : 0.6
    : 0;
  const sedimentPxHeight = sedimentRatio * chanPxHeight;

  return (
    <Svg ref={svgRef} width={W} height={H}>
      {/* Tanah sekitar */}
      <Rect x={0} y={chanTop - 10} width={W} height={chanPxHeight + 40} fill="#d6d3d1" />

      {/* Dinding saluran (bentuk U sederhana) */}
      <Path
        d={`M ${chanX} ${chanTop} L ${chanX} ${chanTop + chanPxHeight} L ${chanX + chanPxWidth} ${chanTop + chanPxHeight} L ${chanX + chanPxWidth} ${chanTop}`}
        stroke="#475569"
        strokeWidth={4}
        fill="none"
      />

      {/* Tutup saluran jika tertutup */}
      {isClosed && (
        <Rect x={chanX - 4} y={chanTop - 8} width={chanPxWidth + 8} height={8} fill="#334155" />
      )}

      {/* Sedimen di dasar saluran */}
      {sedimentPxHeight > 0 && (
        <Rect
          x={chanX + 2}
          y={chanTop + chanPxHeight - sedimentPxHeight}
          width={chanPxWidth - 4}
          height={sedimentPxHeight - 2}
          fill="#92400e"
          opacity={0.6}
        />
      )}

      {/* Dimensi lebar */}
      <Line x1={chanX} y1={chanTop - 20} x2={chanX + chanPxWidth} y2={chanTop - 20} stroke="#1d4ed8" strokeWidth={1} />
      <Line x1={chanX} y1={chanTop - 26} x2={chanX} y2={chanTop - 14} stroke="#1d4ed8" strokeWidth={1} />
      <Line x1={chanX + chanPxWidth} y1={chanTop - 26} x2={chanX + chanPxWidth} y2={chanTop - 14} stroke="#1d4ed8" strokeWidth={1} />
      <SvgText x={W / 2} y={chanTop - 28} fontSize={13} fill="#1d4ed8" textAnchor="middle" fontWeight="bold">
        {`Lebar: ${width || '-'} m`}
      </SvgText>

      {/* Dimensi kedalaman */}
      <Line x1={chanX + chanPxWidth + 16} y1={chanTop} x2={chanX + chanPxWidth + 16} y2={chanTop + chanPxHeight} stroke="#1d4ed8" strokeWidth={1} />
      <SvgText x={chanX + chanPxWidth + 20} y={chanTop + chanPxHeight / 2} fontSize={12} fill="#1d4ed8">
        {`${depth || '-'} m`}
      </SvgText>

      <SvgText x={W / 2} y={H - 26} fontSize={11} fill="#334155" textAnchor="middle">
        {channelType ? `Jenis: ${channelType}` : ''}
        {sedimentCondition ? ` — Sedimentasi: ${sedimentCondition}` : ''}
      </SvgText>
      <SvgText x={W / 2} y={H - 8} fontSize={11} fill="#334155" textAnchor="middle">
        {staStart || staEnd ? `STA ${staStart || '-'} s/d ${staEnd || '-'}` : ''}
      </SvgText>
    </Svg>
  );
}
