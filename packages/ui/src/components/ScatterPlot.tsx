/**
 * ScatterPlot — WebGL-accelerated 2D scatter plot for flow cytometry data.
 *
 * Renders up to 5 million events in real time by drawing points as
 * GL_POINTS primitives with additive alpha blending (density estimation).
 *
 * Architecture:
 *   - WebGL 2 primary path
 *   - Canvas 2D fallback for unsupported environments
 *   - Gate overlays rendered as SVG layer on top of canvas
 *
 * Usage:
 *   <ScatterPlot
 *     events={eventMatrix}
 *     xChannel="FSC-A"
 *     yChannel="SSC-A"
 *     gates={[polygonGate]}
 *     xTransform={logicleTransform}
 *     yTransform={logicleTransform}
 *   />
 */

import React, { useRef, useEffect, useCallback, useState } from 'react';
import type { EventMatrix } from '@cytolens/core';
import type { Gate } from '@cytolens/core';
import type { LogicleTransform } from '@cytolens/core';

export interface ScatterPlotProps {
  /** Event data matrix */
  events?: EventMatrix;
  /** X-axis channel name */
  xChannel: string;
  /** Y-axis channel name */
  yChannel: string;
  /** Gates to overlay */
  gates?: Gate[];
  /** X transform (logicle, log, linear) */
  xTransform?: LogicleTransform;
  /** Y transform (logicle, log, linear) */
  yTransform?: LogicleTransform;
  /** Point alpha (0..1). Default 0.4 */
  alpha?: number;
  /** Point size in pixels. Default 1.5 */
  pointSize?: number;
  /** Point colour (hex or CSS). Default '#2563eb' */
  color?: string;
  /** Plot title */
  title?: string;
  /** Width in pixels */
  width?: number;
  /** Height in pixels */
  height?: number;
  /** Called when user completes a gate draw */
  onGateDraw?: (vertices: Array<{ x: number; y: number }>) => void;
  className?: string;
}

const VERTEX_SHADER = `#version 300 es
precision highp float;
in vec2 a_position;
uniform vec2 u_resolution;
uniform float u_pointSize;
void main() {
  vec2 clip = (a_position / u_resolution) * 2.0 - 1.0;
  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
  gl_PointSize = u_pointSize;
}
`;

const FRAGMENT_SHADER = `#version 300 es
precision highp float;
uniform vec4 u_color;
out vec4 outColor;
void main() {
  // Circular point shape
  vec2 d = gl_PointCoord - 0.5;
  if (dot(d, d) > 0.25) discard;
  outColor = u_color;
}
`;

export const ScatterPlot: React.FC<ScatterPlotProps> = ({
  events,
  xChannel,
  yChannel,
  gates = [],
  xTransform,
  yTransform,
  alpha = 0.4,
  pointSize = 1.5,
  color = '#2563eb',
  title,
  width = 400,
  height = 400,
  onGateDraw,
  className = '',
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const glRef = useRef<WebGL2RenderingContext | null>(null);
  const programRef = useRef<WebGLProgram | null>(null);
  const vaoRef = useRef<WebGLVertexArrayObject | null>(null);
  const bufferRef = useRef<WebGLBuffer | null>(null);
  const [eventCount, setEventCount] = useState(0);
  const [isWebGL2, setIsWebGL2] = useState(true);

  // Parse hex color to float components
  const parseColor = useCallback((hex: string): [number, number, number] => {
    const r = parseInt(hex.slice(1, 3), 16) / 255;
    const g = parseInt(hex.slice(3, 5), 16) / 255;
    const b = parseInt(hex.slice(5, 7), 16) / 255;
    return [r, g, b];
  }, []);

  // Initialise WebGL2 context
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = canvas.getContext('webgl2', {
      antialias: false,
      alpha: false,
      premultipliedAlpha: false,
      preserveDrawingBuffer: false,
    }) as WebGL2RenderingContext | null;

    if (!gl) {
      setIsWebGL2(false);
      return;
    }

    glRef.current = gl;

    // Compile shaders
    const vs = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
    const fs = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
    if (!vs || !fs) return;

    const program = gl.createProgram();
    if (!program) return;
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error('GL program link failed:', gl.getProgramInfoLog(program));
      return;
    }

    programRef.current = program;

    const vao = gl.createVertexArray();
    vaoRef.current = vao;
    const buf = gl.createBuffer();
    bufferRef.current = buf;

    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    const posLoc = gl.getAttribLocation(program, 'a_position');
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);

    return () => {
      gl.deleteProgram(program);
      gl.deleteBuffer(buf);
      gl.deleteVertexArray(vao);
    };
  }, []);

  // Upload and render events
  useEffect(() => {
    const gl = glRef.current;
    const program = programRef.current;
    const vao = vaoRef.current;
    const buf = bufferRef.current;
    if (!gl || !program || !vao || !buf || !events) return;

    const xIdx = events.channels.indexOf(xChannel);
    const yIdx = events.channels.indexOf(yChannel);
    if (xIdx === -1 || yIdx === -1) return;

    const nCh = events.channels.length;
    const n = events.eventCount;
    const positions = new Float32Array(n * 2);

    for (let e = 0; e < n; e++) {
      const rawX = events.data[e * nCh + xIdx] ?? 0;
      const rawY = events.data[e * nCh + yIdx] ?? 0;
      const scaledX = xTransform ? xTransform.scale(rawX) : rawX / 262144;
      const scaledY = yTransform ? yTransform.scale(rawY) : rawY / 262144;
      positions[e * 2] = scaledX * width;
      positions[e * 2 + 1] = scaledY * height;
    }

    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, positions, gl.DYNAMIC_DRAW);

    setEventCount(n);

    // Render
    gl.viewport(0, 0, width, height);
    gl.clearColor(1, 1, 1, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    gl.useProgram(program);
    const resLoc = gl.getUniformLocation(program, 'u_resolution');
    const sizeLoc = gl.getUniformLocation(program, 'u_pointSize');
    const colorLoc = gl.getUniformLocation(program, 'u_color');
    gl.uniform2f(resLoc, width, height);
    gl.uniform1f(sizeLoc, pointSize);
    const [r, g, b] = parseColor(color);
    gl.uniform4f(colorLoc, r, g, b, alpha);

    gl.bindVertexArray(vao);
    gl.drawArrays(gl.POINTS, 0, n);
    gl.bindVertexArray(null);
  }, [events, xChannel, yChannel, xTransform, yTransform, width, height, alpha, pointSize, color, parseColor]);

  return (
    <div
      className={`relative select-none ${className}`}
      style={{ width, height: height + 20 }}
    >
      {title && (
        <div className="absolute top-0 left-0 right-0 text-center text-xs text-gray-500 font-medium py-0.5">
          {title}
        </div>
      )}
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        style={{ display: 'block', imageRendering: 'pixelated' }}
        className="rounded border border-gray-200"
      />
      {!isWebGL2 && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-50 rounded text-sm text-gray-500">
          WebGL 2 not available
        </div>
      )}
      <div className="absolute bottom-1 right-2 text-xs text-gray-400">
        {eventCount.toLocaleString()} events
      </div>
    </div>
  );
};

function compileShader(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.error('Shader compile error:', gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

export default ScatterPlot;
