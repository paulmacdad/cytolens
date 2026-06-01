/**
 * GatingCanvas — interactive gate drawing overlay.
 *
 * Renders on top of a ScatterPlot canvas. Supports:
 *   - Polygon gates: click to add vertices, double-click to close
 *   - Rectangle gates: click-drag
 *   - Ellipse gates: click-drag with shift = circle
 *
 * Gate vertices are in display space [0..1] and converted to data
 * space by the parent using the active transforms.
 */

import React, { useRef, useEffect, useCallback, useState } from 'react';
import type { Gate, Point2D } from '@cytolens/core';

export type DrawMode = 'polygon' | 'rectangle' | 'ellipse' | 'select' | 'none';

export interface GatingCanvasProps {
  width: number;
  height: number;
  mode: DrawMode;
  /** Existing gates to display */
  gates?: Gate[];
  /** Called when a new gate is completed */
  onGateComplete?: (points: Point2D[], mode: DrawMode) => void;
  /** Called when a gate is selected */
  onGateSelect?: (gateId: string | null) => void;
  className?: string;
}

interface DrawState {
  mode: DrawMode;
  vertices: Point2D[];
  mousePos: Point2D | null;
  dragStart: Point2D | null;
  isDrawing: boolean;
}

export const GatingCanvas: React.FC<GatingCanvasProps> = ({
  width,
  height,
  mode,
  gates = [],
  onGateComplete,
  onGateSelect,
  className = '',
}) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const [state, setState] = useState<DrawState>({
    mode,
    vertices: [],
    mousePos: null,
    dragStart: null,
    isDrawing: false,
  });

  // Sync mode from props
  useEffect(() => {
    setState(s => ({ ...s, mode, vertices: [], dragStart: null, isDrawing: false }));
  }, [mode]);

  const getPos = useCallback((e: React.MouseEvent<SVGSVGElement>): Point2D => {
    const rect = svgRef.current!.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (state.mode === 'none' || state.mode === 'select') return;
    const pos = getPos(e);

    if (state.mode === 'polygon') {
      setState(s => ({
        ...s,
        vertices: [...s.vertices, pos],
        isDrawing: true,
      }));
    } else {
      setState(s => ({
        ...s,
        dragStart: pos,
        isDrawing: true,
      }));
    }
  }, [state.mode, getPos]);

  const handleMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    const pos = getPos(e);
    setState(s => ({ ...s, mousePos: pos }));
  }, [getPos]);

  const handleMouseUp = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (state.mode === 'rectangle' || state.mode === 'ellipse') {
      if (state.dragStart && state.mousePos) {
        const pts: Point2D[] = [state.dragStart, state.mousePos];
        onGateComplete?.(pts, state.mode);
        setState(s => ({ ...s, dragStart: null, mousePos: null, isDrawing: false }));
      }
    }
  }, [state.mode, state.dragStart, state.mousePos, onGateComplete]);

  const handleDoubleClick = useCallback(() => {
    if (state.mode === 'polygon' && state.vertices.length >= 3) {
      onGateComplete?.(state.vertices, 'polygon');
      setState(s => ({ ...s, vertices: [], isDrawing: false }));
    }
  }, [state.mode, state.vertices, onGateComplete]);

  // Build SVG path for polygon in-progress
  const polygonPath = (() => {
    const verts = state.vertices;
    if (verts.length === 0) return '';
    const pts = verts.map(v => `${v.x.toFixed(1)},${v.y.toFixed(1)}`).join(' ');
    const mouseExt = state.mousePos
      ? ` ${state.mousePos.x.toFixed(1)},${state.mousePos.y.toFixed(1)}`
      : '';
    return `M${pts}${mouseExt}`;
  })();

  // Build rect/ellipse preview while dragging
  const dragPreview = (() => {
    if (!state.dragStart || !state.mousePos) return null;
    const x0 = Math.min(state.dragStart.x, state.mousePos.x);
    const y0 = Math.min(state.dragStart.y, state.mousePos.y);
    const w = Math.abs(state.mousePos.x - state.dragStart.x);
    const h = Math.abs(state.mousePos.y - state.dragStart.y);

    if (state.mode === 'rectangle') {
      return <rect x={x0} y={y0} width={w} height={h} fill="rgba(37,99,235,0.1)" stroke="#2563eb" strokeWidth={1.5} strokeDasharray="4,2" />;
    }
    if (state.mode === 'ellipse') {
      const cx = x0 + w / 2;
      const cy = y0 + h / 2;
      return <ellipse cx={cx} cy={cy} rx={w / 2} ry={h / 2} fill="rgba(37,99,235,0.1)" stroke="#2563eb" strokeWidth={1.5} strokeDasharray="4,2" />;
    }
    return null;
  })();

  const cursor: Record<DrawMode, string> = {
    polygon: 'crosshair',
    rectangle: 'crosshair',
    ellipse: 'crosshair',
    select: 'default',
    none: 'default',
  };

  return (
    <svg
      ref={svgRef}
      width={width}
      height={height}
      style={{ position: 'absolute', top: 0, left: 0, cursor: cursor[state.mode], userSelect: 'none' }}
      className={className}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onDoubleClick={handleDoubleClick}
    >
      {/* Render existing gates */}
      {gates.map((gate, i) => (
        <GateOverlaySVG key={gate.id} gate={gate} index={i} />
      ))}

      {/* Polygon in-progress */}
      {state.mode === 'polygon' && state.vertices.length > 0 && (
        <>
          <polyline
            points={state.vertices.map(v => `${v.x},${v.y}`).join(' ')}
            fill="none"
            stroke="#2563eb"
            strokeWidth={1.5}
            strokeDasharray="4,2"
          />
          {state.mousePos && (
            <line
              x1={state.vertices[state.vertices.length - 1]!.x}
              y1={state.vertices[state.vertices.length - 1]!.y}
              x2={state.mousePos.x}
              y2={state.mousePos.y}
              stroke="#2563eb"
              strokeWidth={1}
              strokeDasharray="3,3"
            />
          )}
          {state.vertices.map((v, i) => (
            <circle key={i} cx={v.x} cy={v.y} r={3} fill="#2563eb" />
          ))}
        </>
      )}

      {/* Drag preview */}
      {dragPreview}
    </svg>
  );
};

// ---------------------------------------------------------------------------
// Existing gate SVG rendering
// ---------------------------------------------------------------------------

const GATE_COLORS = ['#2563eb', '#16a34a', '#dc2626', '#d97706', '#7c3aed', '#0891b2'];

const GateOverlaySVG: React.FC<{ gate: Gate; index: number }> = ({ gate, index }) => {
  const color = gate.color ?? GATE_COLORS[index % GATE_COLORS.length] ?? '#2563eb';

  if (gate.type === 'polygon') {
    const pts = gate.vertices.map(v => `${v.x},${v.y}`).join(' ');
    return (
      <polygon
        points={pts}
        fill={color}
        fillOpacity={0.08}
        stroke={color}
        strokeWidth={1.5}
      />
    );
  }

  if (gate.type === 'rectangle') {
    return (
      <rect
        x={gate.minX}
        y={gate.minY}
        width={gate.maxX - gate.minX}
        height={gate.maxY - gate.minY}
        fill={color}
        fillOpacity={0.08}
        stroke={color}
        strokeWidth={1.5}
      />
    );
  }

  if (gate.type === 'ellipse') {
    return (
      <ellipse
        cx={gate.cx}
        cy={gate.cy}
        rx={gate.rx}
        ry={gate.ry}
        transform={`rotate(${(gate.angle * 180) / Math.PI}, ${gate.cx}, ${gate.cy})`}
        fill={color}
        fillOpacity={0.08}
        stroke={color}
        strokeWidth={1.5}
      />
    );
  }

  return null;
};

export default GatingCanvas;
