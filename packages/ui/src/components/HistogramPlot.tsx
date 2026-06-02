/**
 * HistogramPlot — 1D event distribution for a single channel.
 *
 * Renders a binned histogram as SVG path for crisp display at any DPI.
 * Supports overlay mode (multiple samples on the same axes).
 *
 * Features:
 *   - Logicle-aware X axis ticks (0, 10^3, 10^4, 10^5)
 *   - Y axis showing event count or normalized frequency
 *   - Channel name label on X axis
 *   - Overlay mode: multiple series as filled curves at 40% opacity
 *   - Median dashed line per series
 *   - MFI stats annotation per series
 *   - Optional viability gate threshold line
 */

import React, { useMemo } from 'react';
import type { EventMatrix, LogicleTransform } from '@cytolens/core';
import { colors, typography } from '../design/tokens.js';

export interface HistogramSeries {
  events: EventMatrix;
  channel: string;
  color?: string;
  label?: string;
  transform?: LogicleTransform;
}

export interface ViabilityGate {
  /** Raw (pre-transform) threshold value */
  threshold: number;
  /** 'above' = live events above threshold, 'below' = below */
  liveAbove?: boolean;
  color?: string;
}

export interface HistogramPlotProps {
  series: HistogramSeries[];
  bins?: number;
  title?: string;
  width?: number;
  height?: number;
  className?: string;
  /** Fill under curve (false = line only) */
  filled?: boolean;
  /** Normalize Y axis to frequency (0–1) instead of raw count */
  normalized?: boolean;
  /** Optional viability / threshold gate line */
  viabilityGate?: ViabilityGate;
}

const PADDING = { top: 16, right: 16, bottom: 44, left: 48 };

/** Standard CytoLens palette for histogram series */
const SERIES_COLORS = [
  colors.gates[0]!,  // blue
  colors.gates[2]!,  // red
  colors.gates[1]!,  // green
  colors.gates[3]!,  // amber
  colors.gates[4]!,  // violet
  colors.gates[5]!,  // cyan
  colors.gates[6]!,  // pink
];

/** Logicle tick values and their display labels */
const LOGICLE_TICKS: Array<{ scaled: number; label: string }> = [
  { scaled: 0.000, label: '0' },
  { scaled: 0.200, label: '10²' },
  { scaled: 0.400, label: '10³' },
  { scaled: 0.600, label: '10⁴' },
  { scaled: 0.800, label: '10⁵' },
];

/** Linear ticks (0–262144 raw range) */
function linearTicks(max: number): Array<{ scaled: number; label: string }> {
  const step = max / 4;
  return [0, 1, 2, 3, 4].map(i => ({
    scaled: i / 4,
    label: (i * step >= 1000) ? `${((i * step) / 1000).toFixed(0)}K` : `${(i * step).toFixed(0)}`,
  }));
}

export const HistogramPlot: React.FC<HistogramPlotProps> = ({
  series,
  bins = 256,
  title,
  width = 400,
  height = 200,
  className = '',
  filled = true,
  normalized = false,
  viabilityGate,
}) => {
  const plotW = width - PADDING.left - PADDING.right;
  const plotH = height - PADDING.top - PADDING.bottom;

  const computed = useMemo(() => {
    return series.map(s => computeHistogram(s, bins, plotW, plotH, normalized));
  }, [series, bins, plotW, plotH, normalized]);

  // Determine tick set: if any series has a logicle transform, use logicle ticks
  const hasLogicle = series.some(s => !!s.transform);
  const xTicks = hasLogicle ? LOGICLE_TICKS : linearTicks(262144);

  // Y axis ticks (5 levels)
  const yTicks = [0, 0.25, 0.5, 0.75, 1.0];
  const yLabel = normalized ? 'Frequency' : 'Count';

  // Compute global max count for Y axis label
  const globalMax = useMemo(() => {
    let m = 0;
    computed.forEach(c => { if (c.rawMax > m) m = c.rawMax; });
    return m;
  }, [computed]);

  const yTickLabels = yTicks.map(frac => {
    if (normalized) return (frac * 1).toFixed(2);
    const v = frac * globalMax;
    return v >= 1000 ? `${(v / 1000).toFixed(0)}K` : `${Math.round(v)}`;
  });

  // Viability gate X position
  const gateX = useMemo(() => {
    if (!viabilityGate || series.length === 0) return null;
    const s0 = series[0]!;
    const scaled = s0.transform
      ? s0.transform.scale(viabilityGate.threshold)
      : viabilityGate.threshold / 262144;
    return Math.max(0, Math.min(plotW, scaled * plotW));
  }, [viabilityGate, series, plotW]);

  return (
    <svg
      width={width}
      height={height}
      className={`overflow-visible ${className}`}
      style={{ fontFamily: typography.fontFamily.sans }}
    >
      <rect width={width} height={height} fill={colors.plot.bg} rx={4} />

      <g transform={`translate(${PADDING.left},${PADDING.top})`}>

        {/* Horizontal grid lines */}
        {yTicks.map(frac => (
          <line
            key={frac}
            x1={0} y1={plotH * (1 - frac)}
            x2={plotW} y2={plotH * (1 - frac)}
            stroke={colors.plot.gridLine}
            strokeWidth={frac === 0 ? 0 : 0.5}
          />
        ))}

        {/* Y axis ticks and labels */}
        {yTicks.map((frac, i) => (
          <g key={frac} transform={`translate(0,${plotH * (1 - frac)})`}>
            <line x1={-4} y1={0} x2={0} y2={0} stroke={colors.plot.axis} strokeWidth={1} />
            <text
              x={-6} y={0}
              textAnchor="end"
              dominantBaseline="middle"
              fontSize={10}
              fill={colors.plot.axisLabel}
            >
              {yTickLabels[i]}
            </text>
          </g>
        ))}

        {/* Y axis label */}
        <text
          x={-(plotH / 2)}
          y={-36}
          textAnchor="middle"
          fontSize={10}
          fill={colors.plot.axisLabel}
          transform={`rotate(-90,${-(plotH / 2)},-36)`}
        >
          {yLabel}
        </text>

        {/* X axis ticks and labels */}
        {xTicks.map(tick => {
          const x = tick.scaled * plotW;
          return (
            <g key={tick.label} transform={`translate(${x},${plotH})`}>
              <line x1={0} y1={0} x2={0} y2={4} stroke={colors.plot.axis} strokeWidth={1} />
              <text
                x={0} y={14}
                textAnchor="middle"
                fontSize={10}
                fill={colors.plot.axisLabel}
              >
                {tick.label}
              </text>
            </g>
          );
        })}

        {/* X axis label (channel name) */}
        <text
          x={plotW / 2}
          y={plotH + 32}
          textAnchor="middle"
          fontSize={11}
          fill={colors.text.secondary}
          fontWeight={500}
        >
          {series[0]?.channel ?? ''}
        </text>

        {/* Axes */}
        <line x1={0} y1={plotH} x2={plotW} y2={plotH} stroke={colors.plot.axis} strokeWidth={1} />
        <line x1={0} y1={0} x2={0} y2={plotH} stroke={colors.plot.axis} strokeWidth={1} />

        {/* Viability gate line */}
        {gateX !== null && (
          <g>
            <line
              x1={gateX} y1={0}
              x2={gateX} y2={plotH}
              stroke={viabilityGate?.color ?? colors.status.warning}
              strokeWidth={1.5}
              strokeDasharray="4 3"
            />
            {/* Handle diamond */}
            <polygon
              points={`${gateX},${plotH + 5} ${gateX - 5},${plotH + 10} ${gateX},${plotH + 15} ${gateX + 5},${plotH + 10}`}
              fill={viabilityGate?.color ?? colors.status.warning}
              opacity={0.85}
            />
          </g>
        )}

        {/* Histogram paths */}
        {computed.map((h, i) => {
          const color = series[i]?.color ?? SERIES_COLORS[i % SERIES_COLORS.length]!;
          const isOverlay = series.length > 1;
          return (
            <g key={i}>
              {filled && (
                <path
                  d={h.fillPath}
                  fill={color}
                  fillOpacity={isOverlay ? 0.4 : 0.2}
                />
              )}
              <path
                d={h.linePath}
                fill="none"
                stroke={color}
                strokeWidth={1.5}
                strokeLinejoin="round"
              />
              {/* Median line */}
              {h.medianX !== null && (
                <line
                  x1={h.medianX} y1={0}
                  x2={h.medianX} y2={plotH}
                  stroke={color}
                  strokeWidth={1}
                  strokeDasharray="3 3"
                  opacity={0.8}
                />
              )}
            </g>
          );
        })}

        {/* Title */}
        {title && (
          <text
            x={plotW / 2}
            y={-6}
            textAnchor="middle"
            fontSize={11}
            fill={colors.text.secondary}
            fontWeight={500}
          >
            {title}
          </text>
        )}

        {/* Stats legend: MFI per series */}
        {series.length > 0 && (
          <g transform={`translate(${plotW - 4}, 4)`}>
            {computed.map((h, i) => {
              const color = series[i]?.color ?? SERIES_COLORS[i % SERIES_COLORS.length]!;
              const label = series[i]?.label ?? series[i]?.channel ?? `Series ${i + 1}`;
              return (
                <g key={i} transform={`translate(0, ${i * 14})`}>
                  <line
                    x1={-28} y1={0} x2={-20} y2={0}
                    stroke={color} strokeWidth={2}
                  />
                  <circle cx={-24} cy={0} r={2} fill={color} />
                  <text
                    x={-32} y={0}
                    textAnchor="end"
                    dominantBaseline="middle"
                    fontSize={9}
                    fill={colors.text.secondary}
                  >
                    {label}: MFI {h.mfi.toFixed(0)}
                  </text>
                </g>
              );
            })}
          </g>
        )}

      </g>
    </svg>
  );
};

interface HistogramData {
  linePath: string;
  fillPath: string;
  medianX: number | null;
  mfi: number;
  rawMax: number;
}

function computeHistogram(
  s: HistogramSeries,
  bins: number,
  plotW: number,
  plotH: number,
  normalized: boolean,
): HistogramData {
  const { events, channel, transform } = s;
  const chIdx = events.channels.indexOf(channel);
  if (chIdx === -1) return { linePath: '', fillPath: '', medianX: null, mfi: 0, rawMax: 0 };

  const nCh = events.channels.length;
  const counts = new Float64Array(bins);
  let maxCount = 0;
  let mfiSum = 0;
  let mfiCount = 0;

  // First pass: bin events
  for (let e = 0; e < events.eventCount; e++) {
    const rawVal = events.data[e * nCh + chIdx] ?? 0;
    const scaled = transform ? transform.scale(rawVal) : rawVal / 262144;
    const bin = Math.min(bins - 1, Math.max(0, Math.floor(scaled * bins)));
    counts[bin]!++;
    if (counts[bin]! > maxCount) maxCount = counts[bin]!;
    mfiSum += rawVal;
    mfiCount++;
  }

  const mfi = mfiCount > 0 ? mfiSum / mfiCount : 0;

  if (maxCount === 0) return { linePath: '', fillPath: '', medianX: null, mfi, rawMax: 0 };

  const norm = normalized ? 1 / (maxCount * bins) : 1;
  const scale = normalized ? maxCount * bins : maxCount;

  const pts: string[] = [];
  for (let b = 0; b < bins; b++) {
    const x = (b / (bins - 1)) * plotW;
    const y = plotH - (counts[b]! / scale) * plotH;
    pts.push(`${b === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`);
  }

  void norm; // used only for documentation; actual normalization via 'scale'

  const linePath = pts.join(' ');
  const fillPath = `${linePath} L${plotW},${plotH} L0,${plotH} Z`;

  // Median: find bin where cumulative count >= 50%
  const half = events.eventCount / 2;
  let cumulative = 0;
  let medianX: number | null = null;
  for (let b = 0; b < bins; b++) {
    cumulative += counts[b]!;
    if (cumulative >= half) {
      medianX = (b / (bins - 1)) * plotW;
      break;
    }
  }

  return { linePath, fillPath, medianX, mfi, rawMax: maxCount };
}

export default HistogramPlot;
