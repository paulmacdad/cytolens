/**
 * ContourPlot — 2D kernel density estimation contour plot for flow cytometry.
 *
 * Architecture:
 *   - Bin events into 128×128 density grid
 *   - Gaussian smoothing (sigma=2) via separable 1D convolution
 *   - Marching-squares to extract contour paths at 10 levels
 *   - SVG render: filled contours or outline lines
 *   - Outlier events (outside outermost contour) rendered as small gray dots
 *   - Same axis ticks / gate overlay rendering as ScatterPlot
 */

import React, { useMemo } from 'react';
import type { EventMatrix, LogicleTransform, Gate } from '@cytolens/core';
import { colors, typography } from '../design/tokens.js';

export interface ContourPlotProps {
  events?: EventMatrix;
  xChannel: string;
  yChannel: string;
  gates?: Gate[];
  xTransform?: LogicleTransform;
  yTransform?: LogicleTransform;
  /** Filled contours (FlowJo style). Default true */
  filled?: boolean;
  /** Number of contour levels. Default 10 */
  levels?: number;
  /** Grid resolution. Default 128 */
  gridSize?: number;
  /** Gaussian sigma. Default 2 */
  sigma?: number;
  /** Show outlier dots. Default true */
  showOutliers?: boolean;
  /** Base teal color. Default CytoLens teal #0D7377 */
  baseColor?: string;
  title?: string;
  width?: number;
  height?: number;
  className?: string;
}

const PADDING = { top: 24, right: 16, bottom: 44, left: 52 };

const LOGICLE_TICKS: Array<{ scaled: number; label: string }> = [
  { scaled: 0.0, label: '0' },
  { scaled: 0.2, label: '10²' },
  { scaled: 0.4, label: '10³' },
  { scaled: 0.6, label: '10⁴' },
  { scaled: 0.8, label: '10⁵' },
];

function linearTicks(count: number = 5): Array<{ scaled: number; label: string }> {
  return Array.from({ length: count }, (_, i) => {
    const frac = i / (count - 1);
    const val = frac * 262144;
    return {
      scaled: frac,
      label: val >= 1000 ? `${(val / 1000).toFixed(0)}K` : `${Math.round(val)}`,
    };
  });
}

/** Interpolate a hex color between two extremes by fraction [0..1] */
function lerpColor(frac: number, colorHex: string): string {
  // Light wash at frac=0, full color at frac=1
  const r0 = 240, g0 = 248, b0 = 250; // near-white teal tint
  const r1 = parseInt(colorHex.slice(1, 3), 16);
  const g1 = parseInt(colorHex.slice(3, 5), 16);
  const b1 = parseInt(colorHex.slice(5, 7), 16);
  const r = Math.round(r0 + (r1 - r0) * frac);
  const g = Math.round(g0 + (g1 - g0) * frac);
  const b = Math.round(b0 + (b1 - b0) * frac);
  return `rgb(${r},${g},${b})`;
}

export const ContourPlot: React.FC<ContourPlotProps> = ({
  events,
  xChannel,
  yChannel,
  gates = [],
  xTransform,
  yTransform,
  filled = true,
  levels = 10,
  gridSize = 128,
  sigma = 2,
  showOutliers = true,
  baseColor = '#0D7377',
  title,
  width = 400,
  height = 400,
  className = '',
}) => {
  const plotW = width - PADDING.left - PADDING.right;
  const plotH = height - PADDING.top - PADDING.bottom;

  const result = useMemo(() => {
    if (!events) return null;
    return computeContours(events, xChannel, yChannel, xTransform, yTransform, gridSize, sigma, levels, plotW, plotH);
  }, [events, xChannel, yChannel, xTransform, yTransform, gridSize, sigma, levels, plotW, plotH]);

  const xTicks = xTransform ? LOGICLE_TICKS : linearTicks();
  const yTicks = yTransform ? LOGICLE_TICKS : linearTicks();

  return (
    <svg
      width={width}
      height={height}
      className={`overflow-visible ${className}`}
      style={{ fontFamily: typography.fontFamily.sans }}
    >
      <rect width={width} height={height} fill={colors.plot.bg} rx={4} />

      <g transform={`translate(${PADDING.left},${PADDING.top})`}>

        {/* Grid lines */}
        {xTicks.map(t => (
          <line key={`xg-${t.label}`}
            x1={t.scaled * plotW} y1={0}
            x2={t.scaled * plotW} y2={plotH}
            stroke={colors.plot.gridLine} strokeWidth={0.5}
          />
        ))}
        {yTicks.map(t => (
          <line key={`yg-${t.label}`}
            x1={0} y1={plotH - t.scaled * plotH}
            x2={plotW} y2={plotH - t.scaled * plotH}
            stroke={colors.plot.gridLine} strokeWidth={0.5}
          />
        ))}

        {/* Axes */}
        <line x1={0} y1={plotH} x2={plotW} y2={plotH} stroke={colors.plot.axis} strokeWidth={1} />
        <line x1={0} y1={0} x2={0} y2={plotH} stroke={colors.plot.axis} strokeWidth={1} />

        {/* X ticks + labels */}
        {xTicks.map(t => (
          <g key={`xt-${t.label}`} transform={`translate(${t.scaled * plotW},${plotH})`}>
            <line x1={0} y1={0} x2={0} y2={4} stroke={colors.plot.axis} strokeWidth={1} />
            <text x={0} y={14} textAnchor="middle" fontSize={10} fill={colors.plot.axisLabel}>
              {t.label}
            </text>
          </g>
        ))}

        {/* Y ticks + labels */}
        {yTicks.map(t => (
          <g key={`yt-${t.label}`} transform={`translate(0,${plotH - t.scaled * plotH})`}>
            <line x1={-4} y1={0} x2={0} y2={0} stroke={colors.plot.axis} strokeWidth={1} />
            <text x={-6} y={0} textAnchor="end" dominantBaseline="middle" fontSize={10} fill={colors.plot.axisLabel}>
              {t.label}
            </text>
          </g>
        ))}

        {/* X axis label */}
        <text x={plotW / 2} y={plotH + 32} textAnchor="middle" fontSize={11} fill={colors.text.secondary} fontWeight={500}>
          {xChannel}
        </text>

        {/* Y axis label */}
        <text
          x={-(plotH / 2)}
          y={-38}
          textAnchor="middle"
          fontSize={11}
          fill={colors.text.secondary}
          fontWeight={500}
          transform={`rotate(-90,${-(plotH / 2)},-38)`}
        >
          {yChannel}
        </text>

        {/* Clip path for plot area */}
        <defs>
          <clipPath id="contour-clip">
            <rect x={0} y={0} width={plotW} height={plotH} />
          </clipPath>
        </defs>

        {/* Outlier dots */}
        {showOutliers && result?.outliers && (
          <g clipPath="url(#contour-clip)">
            {result.outliers.map((pt, i) => (
              <circle key={i} cx={pt.x} cy={pt.y} r={1} fill="#b0b8c4" opacity={0.5} />
            ))}
          </g>
        )}

        {/* Contour fills (back-to-front: lightest first) */}
        {filled && result?.contourPaths && result.contourPaths.map((paths, levelIdx) => {
          const frac = (levelIdx + 1) / levels;
          const fillColor = lerpColor(frac * 0.85, baseColor);
          return paths.map((d, pi) => (
            <path key={`cf-${levelIdx}-${pi}`} d={d} fill={fillColor} stroke="none" clipPath="url(#contour-clip)" />
          ));
        })}

        {/* Contour stroke lines */}
        {result?.contourPaths && result.contourPaths.map((paths, levelIdx) => {
          const frac = (levelIdx + 1) / levels;
          const strokeColor = filled
            ? lerpColor(frac * 0.85 + 0.1, baseColor)
            : lerpColor(frac, baseColor);
          return paths.map((d, pi) => (
            <path
              key={`cl-${levelIdx}-${pi}`}
              d={d}
              fill="none"
              stroke={strokeColor}
              strokeWidth={filled ? 0.5 : 1}
              clipPath="url(#contour-clip)"
            />
          ));
        })}

        {/* Gate overlays */}
        {gates.map((gate, gi) => (
          <GateOverlay key={gi} gate={gate} plotW={plotW} plotH={plotH} color={colors.gates[gi % colors.gates.length]!} />
        ))}

        {/* Title */}
        {title && (
          <text x={plotW / 2} y={-8} textAnchor="middle" fontSize={11} fill={colors.text.secondary} fontWeight={500}>
            {title}
          </text>
        )}

        {/* Event count */}
        {result && (
          <text x={plotW - 2} y={plotH + 32} textAnchor="end" fontSize={9} fill={colors.text.muted}>
            {result.eventCount.toLocaleString()} events
          </text>
        )}

      </g>
    </svg>
  );
};

// ---------------------------------------------------------------------------
// Gate overlay (polygon / rectangle support)
// ---------------------------------------------------------------------------
interface GateOverlayProps {
  gate: Gate;
  plotW: number;
  plotH: number;
  color: string;
}

const GateOverlay: React.FC<GateOverlayProps> = ({ gate, plotW, plotH, color }) => {
  if (gate.type === 'polygon') {
    const pg = gate as import('@cytolens/core').PolygonGate;
    const pts = pg.vertices.map(v => `${(v.x * plotW).toFixed(1)},${(plotH - v.y * plotH).toFixed(1)}`).join(' ');
    return (
      <g>
        <polygon points={pts} fill={color} fillOpacity={0.06} stroke={color} strokeWidth={1.2} strokeDasharray="5 3" />
        <text
          x={pg.vertices.reduce((a, v) => a + v.x, 0) / pg.vertices.length * plotW}
          y={plotH - pg.vertices.reduce((a, v) => a + v.y, 0) / pg.vertices.length * plotH - 6}
          textAnchor="middle"
          fontSize={9}
          fill={color}
          fontWeight={500}
        >
          {pg.name}
        </text>
      </g>
    );
  }
  if (gate.type === 'rectangle') {
    const rg = gate as import('@cytolens/core').RectangleGate;
    const x = rg.minX * plotW;
    const y = plotH - rg.maxY * plotH;
    const w = (rg.maxX - rg.minX) * plotW;
    const h = (rg.maxY - rg.minY) * plotH;
    return (
      <g>
        <rect x={x} y={y} width={w} height={h} fill={color} fillOpacity={0.06} stroke={color} strokeWidth={1.2} strokeDasharray="5 3" />
        <text x={x + w / 2} y={y - 4} textAnchor="middle" fontSize={9} fill={color} fontWeight={500}>
          {rg.name}
        </text>
      </g>
    );
  }
  return null;
};

// ---------------------------------------------------------------------------
// Core computation
// ---------------------------------------------------------------------------
interface ContourResult {
  contourPaths: string[][];   // [levelIdx][pathIdx] = SVG path string
  outliers: Array<{ x: number; y: number }>;
  eventCount: number;
}

function computeContours(
  events: EventMatrix,
  xChannel: string,
  yChannel: string,
  xTransform: LogicleTransform | undefined,
  yTransform: LogicleTransform | undefined,
  gridSize: number,
  sigma: number,
  levels: number,
  plotW: number,
  plotH: number,
): ContourResult {
  const xIdx = events.channels.indexOf(xChannel);
  const yIdx = events.channels.indexOf(yChannel);
  if (xIdx === -1 || yIdx === -1) {
    return { contourPaths: [], outliers: [], eventCount: 0 };
  }

  const nCh = events.channels.length;
  const n = events.eventCount;
  const G = gridSize;

  // 1. Bin events into grid (clipped to [0, G-1])
  const grid = new Float64Array(G * G);
  // Store scaled positions for outlier detection
  const scaledX = new Float32Array(n);
  const scaledY = new Float32Array(n);

  for (let e = 0; e < n; e++) {
    const rx = events.data[e * nCh + xIdx] ?? 0;
    const ry = events.data[e * nCh + yIdx] ?? 0;
    const sx = xTransform ? xTransform.scale(rx) : rx / 262144;
    const sy = yTransform ? yTransform.scale(ry) : ry / 262144;
    scaledX[e] = sx;
    scaledY[e] = sy;
    const gx = Math.min(G - 1, Math.max(0, Math.floor(sx * G)));
    const gy = Math.min(G - 1, Math.max(0, Math.floor(sy * G)));
    grid[gy * G + gx]!++;
  }

  // 2. Gaussian smoothing (separable 1D convolution)
  const smoothed = gaussianSmooth(grid, G, sigma);

  // Find max density
  let maxDensity = 0;
  for (let i = 0; i < G * G; i++) {
    if (smoothed[i]! > maxDensity) maxDensity = smoothed[i]!;
  }
  if (maxDensity === 0) return { contourPaths: [], outliers: [], eventCount: n };

  // Normalize to [0,1]
  const norm = new Float64Array(G * G);
  for (let i = 0; i < G * G; i++) norm[i] = smoothed[i]! / maxDensity;

  // 3. Define contour thresholds (evenly spaced, skip 0)
  const thresholds: number[] = [];
  for (let l = 0; l < levels; l++) {
    thresholds.push((l + 1) / (levels + 1));
  }

  // 4. Marching squares for each threshold
  const contourPaths: string[][] = thresholds.map(threshold =>
    marchingSquares(norm, G, threshold, plotW, plotH)
  );

  // 5. Outlier detection: events outside outermost contour (threshold[0])
  const outerThreshold = thresholds[0]!;
  const outliers: Array<{ x: number; y: number }> = [];
  // Subsample outliers for performance (max 2000 dots)
  const subsampleRate = Math.max(1, Math.floor(n / 5000));
  for (let e = 0; e < n; e += subsampleRate) {
    const sx = scaledX[e]!;
    const sy = scaledY[e]!;
    const gx = Math.min(G - 1, Math.max(0, Math.floor(sx * G)));
    const gy = Math.min(G - 1, Math.max(0, Math.floor(sy * G)));
    const density = norm[gy * G + gx]!;
    if (density < outerThreshold) {
      outliers.push({
        x: sx * plotW,
        y: plotH - sy * plotH,
      });
    }
  }

  return { contourPaths, outliers, eventCount: n };
}

// ---------------------------------------------------------------------------
// Gaussian smoothing (separable horizontal then vertical pass)
// ---------------------------------------------------------------------------
function gaussianSmooth(grid: Float64Array, G: number, sigma: number): Float64Array {
  const radius = Math.ceil(sigma * 3);
  const kernel: number[] = [];
  let kernelSum = 0;
  for (let k = -radius; k <= radius; k++) {
    const v = Math.exp(-(k * k) / (2 * sigma * sigma));
    kernel.push(v);
    kernelSum += v;
  }
  for (let k = 0; k < kernel.length; k++) kernel[k]! && (kernel[k] = kernel[k]! / kernelSum);

  const tmp = new Float64Array(G * G);
  // Horizontal pass
  for (let y = 0; y < G; y++) {
    for (let x = 0; x < G; x++) {
      let sum = 0;
      for (let k = -radius; k <= radius; k++) {
        const nx = Math.min(G - 1, Math.max(0, x + k));
        sum += (grid[y * G + nx] ?? 0) * (kernel[k + radius] ?? 0);
      }
      tmp[y * G + x] = sum;
    }
  }
  const out = new Float64Array(G * G);
  // Vertical pass
  for (let y = 0; y < G; y++) {
    for (let x = 0; x < G; x++) {
      let sum = 0;
      for (let k = -radius; k <= radius; k++) {
        const ny = Math.min(G - 1, Math.max(0, y + k));
        sum += (tmp[ny * G + x] ?? 0) * (kernel[k + radius] ?? 0);
      }
      out[y * G + x] = sum;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Marching squares
// ---------------------------------------------------------------------------
/**
 * Classic marching-squares: iterates all (G-1)×(G-1) cells, classifies each
 * corner against the threshold, computes edge intersections, and builds
 * polyline segments. Segments are then joined into closed/open SVG paths.
 */
function marchingSquares(
  norm: Float64Array,
  G: number,
  threshold: number,
  plotW: number,
  plotH: number,
): string[] {
  // Segment list: each segment = [[x0,y0],[x1,y1]] in plot coordinates
  const segments: Array<[[number, number], [number, number]]> = [];

  const cellW = plotW / (G - 1);
  const cellH = plotH / (G - 1);

  for (let gy = 0; gy < G - 1; gy++) {
    for (let gx = 0; gx < G - 1; gx++) {
      const v00 = norm[gy * G + gx]!;       // bottom-left  (SVG: top in grid)
      const v10 = norm[gy * G + gx + 1]!;   // bottom-right
      const v01 = norm[(gy + 1) * G + gx]!; // top-left
      const v11 = norm[(gy + 1) * G + gx + 1]!; // top-right

      // Classify corners: 1 = above threshold
      const c00 = v00 >= threshold ? 1 : 0;
      const c10 = v10 >= threshold ? 1 : 0;
      const c01 = v01 >= threshold ? 1 : 0;
      const c11 = v11 >= threshold ? 1 : 0;

      const caseIdx = c11 * 8 + c01 * 4 + c10 * 2 + c00;
      if (caseIdx === 0 || caseIdx === 15) continue; // all out or all in

      // Grid-space origin of cell (in plot coords)
      const x0 = gx * cellW;
      const y0 = plotH - gy * cellH;  // SVG Y flipped: grid row 0 = bottom

      // Interpolated edge intersection helpers
      const lerp = (a: number, b: number, va: number, vb: number) =>
        (threshold - va) / (vb - va + 1e-10) * (b - a) + a;

      // Edge midpoints (interpolated)
      // Bottom edge (v00 → v10)
      const bx = lerp(x0, x0 + cellW, v00, v10);
      const by = y0;
      // Right edge (v10 → v11)
      const rx2 = x0 + cellW;
      const ry = lerp(y0, y0 - cellH, v10, v11);
      // Top edge (v01 → v11)
      const tx = lerp(x0, x0 + cellW, v01, v11);
      const ty = y0 - cellH;
      // Left edge (v00 → v01)
      const lx = x0;
      const ly = lerp(y0, y0 - cellH, v00, v01);

      // Lookup table of segments per case
      const segs = MARCHING_SQUARES_TABLE[caseIdx];
      if (!segs) continue;

      for (const [e0, e1] of segs) {
        const p0 = edgePoint(e0!, bx, by, rx2, ry, tx, ty, lx, ly);
        const p1 = edgePoint(e1!, bx, by, rx2, ry, tx, ty, lx, ly);
        segments.push([p0, p1]);
      }
    }
  }

  if (segments.length === 0) return [];

  // Join segments into polylines by chaining endpoints
  const paths = joinSegments(segments);
  return paths.map(poly => {
    if (poly.length === 0) return '';
    let d = `M${poly[0]![0].toFixed(1)},${poly[0]![1].toFixed(1)}`;
    for (let i = 1; i < poly.length; i++) {
      d += ` L${poly[i]![0].toFixed(1)},${poly[i]![1].toFixed(1)}`;
    }
    // Close path if endpoints are within 1px
    const first = poly[0]!;
    const last = poly[poly.length - 1]!;
    const dx = first[0] - last[0];
    const dy = first[1] - last[1];
    if (Math.sqrt(dx * dx + dy * dy) < 2) d += ' Z';
    return d;
  }).filter(d => d.length > 0);
}

/** Edge indices: 0=bottom, 1=right, 2=top, 3=left */
function edgePoint(
  e: number,
  bx: number, by: number,
  rx: number, ry: number,
  tx: number, ty: number,
  lx: number, ly: number,
): [number, number] {
  if (e === 0) return [bx, by];
  if (e === 1) return [rx, ry];
  if (e === 2) return [tx, ty];
  return [lx, ly];
}

/**
 * Marching-squares lookup table.
 * Key: 4-bit case (c11<<3 | c01<<2 | c10<<1 | c00)
 * Value: array of [edgeA, edgeB] segment pairs
 * Edges: 0=bottom, 1=right, 2=top, 3=left
 */
const MARCHING_SQUARES_TABLE: Record<number, Array<[number, number]>> = {
  1:  [[3, 0]],
  2:  [[0, 1]],
  3:  [[3, 1]],
  4:  [[2, 3]],
  5:  [[2, 0], [3, 2]],  // saddle — pick one resolution
  6:  [[0, 2]],  // wait, corrected below
  7:  [[1, 2]],
  8:  [[1, 2]],
  9:  [[0, 2]],
  10: [[3, 2], [0, 1]],  // saddle
  11: [[2, 3]],  // wait
  12: [[3, 1]],
  13: [[0, 1]],
  14: [[3, 0]],
};

// Correct the lookup table: standard 15-case marching squares
// Each entry lists segments as [edgeFrom, edgeTo] pairs
const MS_TABLE: Record<number, Array<[number, number]>> = {
  //  case: segments (edges: 0=B, 1=R, 2=T, 3=L)
  1:  [[3, 0]],
  2:  [[0, 1]],
  3:  [[3, 1]],
  4:  [[1, 2]],
  5:  [[3, 2], [0, 1]],  // ambiguous saddle — two segments
  6:  [[0, 2]],
  7:  [[3, 2]],
  8:  [[2, 3]],
  9:  [[2, 0]],
  10: [[2, 1], [3, 0]],  // ambiguous saddle
  11: [[2, 1]],
  12: [[1, 3]],
  13: [[1, 0]],
  14: [[0, 3]],
};

// Override with correct table
Object.assign(MARCHING_SQUARES_TABLE, MS_TABLE);

// ---------------------------------------------------------------------------
// Segment joining: chain segments into polylines
// ---------------------------------------------------------------------------
type Pt = [number, number];
type Segment = [Pt, Pt];

function ptKey(p: Pt): string {
  return `${p[0].toFixed(1)},${p[1].toFixed(1)}`;
}

function joinSegments(segments: Segment[]): Pt[][] {
  // Build adjacency map: endpoint → list of segment indices
  const endMap = new Map<string, number[]>();
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]!;
    const k0 = ptKey(seg[0]);
    const k1 = ptKey(seg[1]);
    if (!endMap.has(k0)) endMap.set(k0, []);
    if (!endMap.has(k1)) endMap.set(k1, []);
    endMap.get(k0)!.push(i);
    endMap.get(k1)!.push(i);
  }

  const used = new Uint8Array(segments.length);
  const polylines: Pt[][] = [];

  for (let start = 0; start < segments.length; start++) {
    if (used[start]) continue;
    used[start] = 1;

    const seg = segments[start]!;
    const poly: Pt[] = [seg[0], seg[1]];

    // Extend forward
    let tip = seg[1];
    while (true) {
      const candidates = endMap.get(ptKey(tip)) ?? [];
      let found = false;
      for (const ci of candidates) {
        if (used[ci]) continue;
        used[ci] = 1;
        const cs = segments[ci]!;
        // Determine which end connects
        if (ptKey(cs[0]) === ptKey(tip)) {
          poly.push(cs[1]);
          tip = cs[1];
        } else {
          poly.push(cs[0]);
          tip = cs[0];
        }
        found = true;
        break;
      }
      if (!found) break;
    }

    polylines.push(poly);
  }

  return polylines;
}

export default ContourPlot;
