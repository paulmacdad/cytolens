/**
 * HistogramPlot — 1D event distribution for a single channel.
 *
 * Renders a binned histogram as SVG path for crisp display at any DPI.
 * Supports overlay mode (multiple samples on the same axes).
 */

import React, { useMemo } from 'react';
import type { EventMatrix, LogicleTransform } from '@cytoflow/core';

export interface HistogramSeries {
  events: EventMatrix;
  channel: string;
  color?: string;
  label?: string;
  transform?: LogicleTransform;
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
}

const PADDING = { top: 12, right: 12, bottom: 32, left: 40 };

export const HistogramPlot: React.FC<HistogramPlotProps> = ({
  series,
  bins = 256,
  title,
  width = 400,
  height = 200,
  className = '',
  filled = true,
}) => {
  const plotW = width - PADDING.left - PADDING.right;
  const plotH = height - PADDING.top - PADDING.bottom;

  const histograms = useMemo(() => {
    return series.map(s => computeHistogram(s, bins, plotW, plotH));
  }, [series, bins, plotW, plotH]);

  return (
    <svg
      width={width}
      height={height}
      className={`overflow-visible ${className}`}
      style={{ fontFamily: '"Inter", system-ui, sans-serif' }}
    >
      <rect width={width} height={height} fill="#ffffff" rx={4} />

      <g transform={`translate(${PADDING.left},${PADDING.top})`}>
        {/* Grid lines */}
        {[0, 0.25, 0.5, 0.75, 1].map(frac => (
          <line
            key={frac}
            x1={0}
            y1={plotH * frac}
            x2={plotW}
            y2={plotH * frac}
            stroke="#e8eaed"
            strokeWidth={0.5}
          />
        ))}

        {/* Axes */}
        <line x1={0} y1={plotH} x2={plotW} y2={plotH} stroke="#9aa2b1" strokeWidth={1} />
        <line x1={0} y1={0} x2={0} y2={plotH} stroke="#9aa2b1" strokeWidth={1} />

        {/* Histogram paths */}
        {histograms.map((h, i) => {
          const color = series[i]?.color ?? `hsl(${i * 40}, 70%, 50%)`;
          return (
            <g key={i}>
              {filled && (
                <path
                  d={h.fillPath}
                  fill={color}
                  fillOpacity={0.2}
                />
              )}
              <path
                d={h.linePath}
                fill="none"
                stroke={color}
                strokeWidth={1.5}
                strokeLinejoin="round"
              />
            </g>
          );
        })}

        {/* Title */}
        {title && (
          <text
            x={plotW / 2}
            y={-4}
            textAnchor="middle"
            fontSize={11}
            fill="#555e6e"
            fontWeight={500}
          >
            {title}
          </text>
        )}

        {/* X axis label */}
        {series[0] && (
          <text
            x={plotW / 2}
            y={plotH + 20}
            textAnchor="middle"
            fontSize={11}
            fill="#555e6e"
          >
            {series[0].channel}
          </text>
        )}
      </g>
    </svg>
  );
};

interface HistogramPaths {
  linePath: string;
  fillPath: string;
}

function computeHistogram(s: HistogramSeries, bins: number, plotW: number, plotH: number): HistogramPaths {
  const { events, channel, transform } = s;
  const chIdx = events.channels.indexOf(channel);
  if (chIdx === -1) return { linePath: '', fillPath: '' };

  const nCh = events.channels.length;
  const counts = new Float64Array(bins);
  let maxCount = 0;

  for (let e = 0; e < events.eventCount; e++) {
    const rawVal = events.data[e * nCh + chIdx] ?? 0;
    const scaled = transform ? transform.scale(rawVal) : rawVal / 262144;
    const bin = Math.min(bins - 1, Math.max(0, Math.floor(scaled * bins)));
    counts[bin]!++;
    if (counts[bin]! > maxCount) maxCount = counts[bin]!;
  }

  if (maxCount === 0) return { linePath: '', fillPath: '' };

  const pts: string[] = [];
  for (let b = 0; b < bins; b++) {
    const x = (b / (bins - 1)) * plotW;
    const y = plotH - (counts[b]! / maxCount) * plotH;
    pts.push(`${b === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`);
  }

  const linePath = pts.join(' ');
  const fillPath = `${linePath} L${plotW},${plotH} L0,${plotH} Z`;

  return { linePath, fillPath };
}

export default HistogramPlot;
