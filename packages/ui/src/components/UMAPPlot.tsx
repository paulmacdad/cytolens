/**
 * UMAPPlot — UMAP dimensionality reduction visualization for CytoLens.
 *
 * Features:
 *   - WebGL scatter rendering (reuses ScatterPlot WebGL logic)
 *   - Color by density (viridis) or by channel MFI value (plasma colormap)
 *   - Progress bar during UMAP computation
 *   - "Run UMAP" prompt when no embedding is available
 *   - Gate overlay labels
 */

import React, {
  useRef,
  useEffect,
  useCallback,
  useState,
  useMemo,
} from 'react';
import type { EventMatrix } from '@cytolens/core';
import type { Gate } from '@cytolens/core';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UMAPPlotProps {
  embedding: Float32Array | null;
  /** Color points by: 'density' | channel name for MFI coloring */
  colorBy?: 'density' | string;
  events?: EventMatrix;
  gates?: Gate[];
  gateStats?: Map<string, { count: number; percent: number }>;
  isRunning?: boolean;
  /** 0..1 */
  progress?: number;
  onRunUMAP?: () => void;
  title?: string;
  width?: number;
  height?: number;
  className?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DENSITY_GRID = 64;
const AXIS_MARGIN = 32;

// Viridis colormap stops [t, r, g, b]
const VIRIDIS: [number, number, number, number][] = [
  [0.00,  68 / 255,   1 / 255,  84 / 255],
  [0.25,  59 / 255,  82 / 255, 139 / 255],
  [0.50,  33 / 255, 145 / 255, 140 / 255],
  [0.75,  94 / 255, 201 / 255,  98 / 255],
  [1.00, 253 / 255, 231 / 255,  37 / 255],
];

// Plasma colormap stops for channel MFI coloring
const PLASMA: [number, number, number, number][] = [
  [0.00,  13 / 255,   8 / 255, 135 / 255],
  [0.25, 126 / 255,   3 / 255, 168 / 255],
  [0.50, 204 / 255,  71 / 255, 120 / 255],
  [0.75, 248 / 255, 149 / 255,  64 / 255],
  [1.00, 240 / 255, 249 / 255,  33 / 255],
];

function sampleColormap(
  t: number,
  stops: [number, number, number, number][],
): [number, number, number] {
  const clamped = Math.max(0, Math.min(1, t));
  for (let i = 0; i < stops.length - 1; i++) {
    const [t0, r0, g0, b0] = stops[i]!;
    const [t1, r1, g1, b1] = stops[i + 1]!;
    if (clamped >= t0 && clamped <= t1) {
      const f = (clamped - t0) / (t1 - t0);
      return [r0 + f * (r1 - r0), g0 + f * (g1 - g0), b0 + f * (b1 - b0)];
    }
  }
  return [stops[stops.length - 1]![1], stops[stops.length - 1]![2], stops[stops.length - 1]![3]];
}

// ---------------------------------------------------------------------------
// GLSL shaders
// ---------------------------------------------------------------------------

const VERTEX_SHADER = `#version 300 es
precision highp float;
in vec2 a_position;
in vec3 a_color;
uniform vec2 u_resolution;
uniform float u_pointSize;
out vec3 v_color;
void main() {
  vec2 clip = (a_position / u_resolution) * 2.0 - 1.0;
  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
  gl_PointSize = u_pointSize;
  v_color = a_color;
}
`;

const FRAGMENT_SHADER = `#version 300 es
precision highp float;
in vec3 v_color;
uniform float u_alpha;
out vec4 outColor;
void main() {
  vec2 d = gl_PointCoord - 0.5;
  if (dot(d, d) > 0.25) discard;
  outColor = vec4(v_color, u_alpha);
}
`;

// ---------------------------------------------------------------------------
// WebGL helpers
// ---------------------------------------------------------------------------

function compileShader(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.error('UMAPPlot shader error:', gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

// ---------------------------------------------------------------------------
// Density computation
// ---------------------------------------------------------------------------

function computeDensityColors(normX: Float32Array, normY: Float32Array, n: number): Float32Array {
  const grid = new Int32Array(DENSITY_GRID * DENSITY_GRID);
  for (let e = 0; e < n; e++) {
    const cx = Math.min(DENSITY_GRID - 1, Math.max(0, Math.floor(normX[e]! * DENSITY_GRID)));
    const cy = Math.min(DENSITY_GRID - 1, Math.max(0, Math.floor(normY[e]! * DENSITY_GRID)));
    grid[cy * DENSITY_GRID + cx]++;
  }
  let maxCount = 1;
  for (let i = 0; i < grid.length; i++) { if (grid[i]! > maxCount) maxCount = grid[i]!; }
  const colors = new Float32Array(n * 3);
  for (let e = 0; e < n; e++) {
    const cx = Math.min(DENSITY_GRID - 1, Math.max(0, Math.floor(normX[e]! * DENSITY_GRID)));
    const cy = Math.min(DENSITY_GRID - 1, Math.max(0, Math.floor(normY[e]! * DENSITY_GRID)));
    const [r, g, b] = sampleColormap(grid[cy * DENSITY_GRID + cx]! / maxCount, VIRIDIS);
    colors[e * 3]     = r;
    colors[e * 3 + 1] = g;
    colors[e * 3 + 2] = b;
  }
  return colors;
}

// ---------------------------------------------------------------------------
// Normalize embedding to [0..1]
// ---------------------------------------------------------------------------

function normalizeEmbedding(embedding: Float32Array, n: number): { normX: Float32Array; normY: Float32Array; minX: number; maxX: number; minY: number; maxY: number } {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (let i = 0; i < n; i++) {
    const x = embedding[i * 2]!;
    const y = embedding[i * 2 + 1]!;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  const rangeX = maxX - minX || 1;
  const rangeY = maxY - minY || 1;
  // Pad by 5%
  const padX = rangeX * 0.05;
  const padY = rangeY * 0.05;
  const normX = new Float32Array(n);
  const normY = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    normX[i] = (embedding[i * 2]! - minX + padX) / (rangeX + 2 * padX);
    normY[i] = (embedding[i * 2 + 1]! - minY + padY) / (rangeY + 2 * padY);
  }
  return { normX, normY, minX, maxX, minY, maxY };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const UMAPPlot: React.FC<UMAPPlotProps> = ({
  embedding,
  colorBy = 'density',
  events,
  gates = [],
  gateStats,
  isRunning = false,
  progress = 0,
  onRunUMAP,
  title,
  width = 400,
  height = 400,
  className = '',
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const glRef = useRef<WebGL2RenderingContext | null>(null);
  const programRef = useRef<WebGLProgram | null>(null);
  const vaoRef = useRef<WebGLVertexArrayObject | null>(null);
  const posBufRef = useRef<WebGLBuffer | null>(null);
  const colBufRef = useRef<WebGLBuffer | null>(null);
  const [isWebGL2, setIsWebGL2] = useState(true);
  const [pointCount, setPointCount] = useState(0);

  // ---------------------------------------------------------------------------
  // Initialise WebGL2
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gl = canvas.getContext('webgl2', {
      antialias: false, alpha: false,
      premultipliedAlpha: false, preserveDrawingBuffer: false,
    }) as WebGL2RenderingContext | null;
    if (!gl) { setIsWebGL2(false); return; }
    glRef.current = gl;

    const vs = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
    const fs = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
    if (!vs || !fs) return;

    const program = gl.createProgram();
    if (!program) return;
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error('UMAPPlot GL link failed:', gl.getProgramInfoLog(program));
      return;
    }
    programRef.current = program;

    const vao = gl.createVertexArray();
    vaoRef.current = vao;
    const posBuf = gl.createBuffer();
    posBufRef.current = posBuf;
    const colBuf = gl.createBuffer();
    colBufRef.current = colBuf;

    const posLoc = gl.getAttribLocation(program, 'a_position');
    const colLoc = gl.getAttribLocation(program, 'a_color');

    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, colBuf);
    gl.enableVertexAttribArray(colLoc);
    gl.vertexAttribPointer(colLoc, 3, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);

    return () => {
      gl.deleteProgram(program);
      gl.deleteBuffer(posBuf);
      gl.deleteBuffer(colBuf);
      gl.deleteVertexArray(vao);
    };
  }, []);

  // ---------------------------------------------------------------------------
  // Render when embedding changes
  // ---------------------------------------------------------------------------
  const render = useCallback(() => {
    const gl = glRef.current;
    const program = programRef.current;
    const vao = vaoRef.current;
    const posBuf = posBufRef.current;
    const colBuf = colBufRef.current;
    if (!gl || !program || !vao || !posBuf || !colBuf || !embedding) return;

    const n = embedding.length / 2;
    if (n === 0) return;

    const { normX, normY } = normalizeEmbedding(embedding, n);

    // Positions in canvas pixel space
    const positions = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) {
      positions[i * 2]     = normX[i]! * width;
      positions[i * 2 + 1] = normY[i]! * height;
    }

    // Colors
    let colors: Float32Array;
    if (colorBy === 'density') {
      colors = computeDensityColors(normX, normY, n);
    } else if (events) {
      // Color by channel MFI
      const chIdx = events.channels.indexOf(colorBy);
      if (chIdx === -1) {
        colors = computeDensityColors(normX, normY, n);
      } else {
        const nCh = events.channels.length;
        // Collect values for the sampled events (embedding length may be subsampled)
        let minVal = Infinity, maxVal = -Infinity;
        const vals = new Float32Array(n);
        const step = events.eventCount / n;
        for (let i = 0; i < n; i++) {
          const e = Math.min(events.eventCount - 1, Math.floor(i * step));
          const v = Math.log(Math.max(1, events.data[e * nCh + chIdx]!));
          vals[i] = v;
          if (v < minVal) minVal = v;
          if (v > maxVal) maxVal = v;
        }
        const range = maxVal - minVal || 1;
        colors = new Float32Array(n * 3);
        for (let i = 0; i < n; i++) {
          const [r, g, b] = sampleColormap((vals[i]! - minVal) / range, PLASMA);
          colors[i * 3]     = r;
          colors[i * 3 + 1] = g;
          colors[i * 3 + 2] = b;
        }
      }
    } else {
      colors = computeDensityColors(normX, normY, n);
    }

    gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
    gl.bufferData(gl.ARRAY_BUFFER, positions, gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, colBuf);
    gl.bufferData(gl.ARRAY_BUFFER, colors, gl.DYNAMIC_DRAW);

    setPointCount(n);

    gl.viewport(0, 0, width, height);
    gl.clearColor(1, 1, 1, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    gl.useProgram(program);
    gl.uniform2f(gl.getUniformLocation(program, 'u_resolution'), width, height);
    gl.uniform1f(gl.getUniformLocation(program, 'u_pointSize'), 2.0);
    gl.uniform1f(gl.getUniformLocation(program, 'u_alpha'), 0.6);

    gl.bindVertexArray(vao);
    gl.drawArrays(gl.POINTS, 0, n);
    gl.bindVertexArray(null);
  }, [embedding, colorBy, events, width, height]);

  useEffect(() => {
    render();
  }, [render]);

  // ---------------------------------------------------------------------------
  // Gate labels — simple overlay (no channel-specific centroid, just legend)
  // ---------------------------------------------------------------------------
  const gateLabels = useMemo(() => {
    if (!gates || gates.length === 0) return [];
    return gates
      .map(gate => {
        const stat = gateStats?.get(gate.id);
        if (!stat) return null;
        return {
          id: gate.id,
          name: gate.name,
          color: gate.color ?? '#ef4444',
          count: stat.count,
          percent: stat.percent,
        };
      })
      .filter(Boolean) as Array<{ id: string; name: string; color: string; count: number; percent: number }>;
  }, [gates, gateStats]);

  // ---------------------------------------------------------------------------
  // Legend bar (viridis or plasma)
  // ---------------------------------------------------------------------------
  const colorStops = colorBy === 'density' ? VIRIDIS : PLASMA;
  const legendStops = colorStops.map(([t, r, g, b]) => {
    const hex = `#${Math.round(r * 255).toString(16).padStart(2, '0')}${Math.round(g * 255).toString(16).padStart(2, '0')}${Math.round(b * 255).toString(16).padStart(2, '0')}`;
    return <stop key={t} offset={`${(1 - t) * 100}%`} stopColor={hex} />;
  });

  const totalW = width + AXIS_MARGIN;
  const totalH = height + AXIS_MARGIN;

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <div
      className={`relative select-none ${className}`}
      style={{ width: totalW, height: totalH + (title ? 20 : 0) }}
    >
      {title && (
        <div
          className="text-center text-xs text-gray-500 font-medium py-0.5"
          style={{ width: totalW, fontFamily: 'Arial, sans-serif' }}
        >
          {title}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'flex-start' }}>
        {/* Y label */}
        <div style={{ width: 16, height, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span
            style={{
              transform: 'rotate(-90deg)',
              whiteSpace: 'nowrap',
              fontSize: 11,
              fontWeight: 600,
              color: '#333',
              fontFamily: 'Arial, sans-serif',
            }}
          >
            UMAP 2
          </span>
        </div>

        {/* Canvas */}
        <div style={{ position: 'relative', width, height }}>
          <canvas
            ref={canvasRef}
            width={width}
            height={height}
            style={{ display: 'block', imageRendering: 'pixelated' }}
            className="rounded border border-gray-200"
          />

          {/* SVG overlay: legend + gate labels */}
          {embedding && (
            <svg
              style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none', overflow: 'visible' }}
              width={width}
              height={height}
            >
              {/* Colormap legend */}
              <defs>
                <linearGradient id="umap-colormap-legend" x1="0" y1="0" x2="0" y2="1">
                  {legendStops}
                </linearGradient>
              </defs>
              <rect x={width - 28} y={height - 104} width={12} height={80} fill="url(#umap-colormap-legend)" rx={2} />
              <text x={width - 14} y={height - 100} fontSize={9} fill="#555" fontFamily="Arial, sans-serif">Hi</text>
              <text x={width - 14} y={height - 24} fontSize={9} fill="#555" fontFamily="Arial, sans-serif">Lo</text>

              {/* Gate legend (bottom-left) */}
              {gateLabels.map((g, i) => (
                <g key={g.id} transform={`translate(6, ${height - 14 - i * 14})`}>
                  <rect x={0} y={-8} width={8} height={8} fill={g.color} rx={1} />
                  <text x={11} y={0} fontSize={9} fill="#555" fontFamily="Arial, sans-serif">
                    {g.name} {g.percent.toFixed(1)}%
                  </text>
                </g>
              ))}
            </svg>
          )}

          {/* "Run UMAP" prompt */}
          {!embedding && !isRunning && (
            <div
              className="absolute inset-0 flex flex-col items-center justify-center bg-gray-50 rounded"
              style={{ gap: 8 }}
            >
              <div style={{ fontSize: 13, color: '#888', fontFamily: 'Arial, sans-serif' }}>
                No embedding computed
              </div>
              {onRunUMAP && (
                <button
                  onClick={onRunUMAP}
                  className="px-4 py-1.5 bg-blue-600 text-white rounded text-sm font-medium hover:bg-blue-700 transition-colors"
                  style={{ fontFamily: 'Arial, sans-serif' }}
                >
                  Run UMAP
                </button>
              )}
            </div>
          )}

          {/* Progress overlay */}
          {isRunning && (
            <div
              className="absolute inset-0 flex flex-col items-center justify-center bg-white bg-opacity-90 rounded"
              style={{ gap: 10 }}
            >
              <div style={{ fontSize: 13, color: '#555', fontFamily: 'Arial, sans-serif' }}>
                Computing UMAP (200 epochs)...
              </div>
              <div
                style={{
                  width: width * 0.6,
                  height: 6,
                  background: '#e5e7eb',
                  borderRadius: 4,
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    width: `${Math.round(progress * 100)}%`,
                    height: '100%',
                    background: '#2563eb',
                    borderRadius: 4,
                    transition: 'width 0.3s ease',
                  }}
                />
              </div>
              <div style={{ fontSize: 11, color: '#888', fontFamily: 'Arial, sans-serif' }}>
                {Math.round(progress * 100)}%
              </div>
            </div>
          )}

          {/* Event count badge */}
          {embedding && (
            <div
              style={{
                position: 'absolute',
                bottom: 4,
                left: 6,
                fontSize: 10,
                color: '#888',
                fontFamily: 'Arial, sans-serif',
                pointerEvents: 'none',
              }}
            >
              {pointCount.toLocaleString()} events
            </div>
          )}

          {!isWebGL2 && (
            <div className="absolute inset-0 flex items-center justify-center bg-gray-50 rounded text-sm text-gray-500">
              WebGL 2 not available
            </div>
          )}
        </div>
      </div>

      {/* X label */}
      <div
        style={{
          width: width + 16,
          textAlign: 'center',
          fontSize: 11,
          fontWeight: 600,
          color: '#333',
          fontFamily: 'Arial, sans-serif',
          paddingTop: 2,
          paddingLeft: 16,
        }}
      >
        UMAP 1
      </div>
    </div>
  );
};

export default UMAPPlot;
