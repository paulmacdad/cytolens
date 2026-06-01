/**
 * Gating engine.
 *
 * Evaluates a hierarchy of gates against a set of events.
 * Each gate is applied only to events that passed its parent gate,
 * matching the standard flow cytometry analysis paradigm.
 *
 * Performance notes:
 * - Uses typed arrays throughout; no heap allocation per event.
 * - For >500k events, consider offloading to FCSWorker or WASM module.
 */

import type {
  Gate,
  GateNode,
  GateResult,
  PolygonGate,
  RectangleGate,
  EllipseGate,
  IntervalGate,
  QuadrantGate,
  BooleanGate,
  Point2D,
} from './gate.js';

export interface EventMatrix {
  /** Flat event array: [e0p0, e0p1, ..., e1p0, ...] */
  data: Float32Array;
  /** Channel names in column order */
  channels: string[];
  /** Number of events */
  eventCount: number;
}

export interface GatingEngineResult {
  nodeResults: Map<string, GateResult>;
  /** Execution time in ms */
  durationMs: number;
}

/**
 * Apply a full gate hierarchy to an event matrix.
 *
 * @param roots - Top-level gate nodes (children of "all events")
 * @param matrix - Event data matrix
 * @param allEventsMask - Optional parent mask. If undefined, all events are included.
 */
export function applyGateHierarchy(
  roots: GateNode[],
  matrix: EventMatrix,
  allEventsMask?: Uint8Array,
): GatingEngineResult {
  const t0 = performance.now();
  const nodeResults = new Map<string, GateResult>();

  const totalEvents = matrix.eventCount;
  const topMask = allEventsMask ?? makeAllOnes(totalEvents);

  for (const node of roots) {
    applyNodeRecursive(node, matrix, topMask, totalEvents, nodeResults);
  }

  return {
    nodeResults,
    durationMs: performance.now() - t0,
  };
}

function applyNodeRecursive(
  node: GateNode,
  matrix: EventMatrix,
  parentMask: Uint8Array,
  totalEvents: number,
  results: Map<string, GateResult>,
): void {
  const mask = applyGate(node.gate, matrix, parentMask);
  const count = countOnes(mask);
  const parentCount = countOnes(parentMask);

  const result: GateResult = {
    gateId: node.gate.id,
    mask,
    count,
    percentOfParent: parentCount > 0 ? (count / parentCount) * 100 : 0,
    percentOfTotal: totalEvents > 0 ? (count / totalEvents) * 100 : 0,
  };

  // Attach result to the node (mutates — acceptable for analysis pipeline)
  node.result = result;
  results.set(node.gate.id, result);

  for (const child of node.children) {
    applyNodeRecursive(child, matrix, mask, totalEvents, results);
  }
}

// ---------------------------------------------------------------------------
// Gate dispatch
// ---------------------------------------------------------------------------

function applyGate(gate: Gate, matrix: EventMatrix, parentMask: Uint8Array): Uint8Array {
  switch (gate.type) {
    case 'polygon':   return applyPolygon(gate, matrix, parentMask);
    case 'rectangle': return applyRectangle(gate, matrix, parentMask);
    case 'ellipse':   return applyEllipse(gate, matrix, parentMask);
    case 'interval':  return applyInterval(gate, matrix, parentMask);
    case 'quadrant':  return applyQuadrant(gate, matrix, parentMask)[0]; // returns Q1 mask
    case 'boolean':   return applyBoolean(gate, matrix, parentMask);
    default:
      throw new Error(`Unknown gate type: ${(gate as Gate).type}`);
  }
}

// ---------------------------------------------------------------------------
// Polygon gate — ray casting algorithm
// ---------------------------------------------------------------------------

function applyPolygon(gate: PolygonGate, matrix: EventMatrix, parentMask: Uint8Array): Uint8Array {
  const xIdx = channelIndex(matrix, gate.xChannel);
  const yIdx = channelIndex(matrix, gate.yChannel ?? '');
  const { data, channels, eventCount } = matrix;
  const nCh = channels.length;
  const { vertices } = gate;
  const n = vertices.length;
  const mask = new Uint8Array(eventCount);

  for (let e = 0; e < eventCount; e++) {
    if (!parentMask[e]) continue;
    const x = data[e * nCh + xIdx] ?? 0;
    const y = data[e * nCh + yIdx] ?? 0;
    mask[e] = pointInPolygon(x, y, vertices, n) ? 1 : 0;
  }

  return mask;
}

/** Ray casting point-in-polygon test */
function pointInPolygon(x: number, y: number, vertices: Point2D[], n: number): boolean {
  let inside = false;
  let j = n - 1;
  for (let i = 0; i < n; i++) {
    const vi = vertices[i];
    const vj = vertices[j];
    if (vi == null || vj == null) { j = i; continue; }
    const xi = vi.x, yi = vi.y;
    const xj = vj.x, yj = vj.y;
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
    j = i;
  }
  return inside;
}

// ---------------------------------------------------------------------------
// Rectangle gate
// ---------------------------------------------------------------------------

function applyRectangle(gate: RectangleGate, matrix: EventMatrix, parentMask: Uint8Array): Uint8Array {
  const xIdx = channelIndex(matrix, gate.xChannel);
  const yIdx = channelIndex(matrix, gate.yChannel ?? '');
  const { data, channels, eventCount } = matrix;
  const nCh = channels.length;
  const { minX, maxX, minY, maxY } = gate;
  const mask = new Uint8Array(eventCount);

  for (let e = 0; e < eventCount; e++) {
    if (!parentMask[e]) continue;
    const x = data[e * nCh + xIdx] ?? 0;
    const y = data[e * nCh + yIdx] ?? 0;
    mask[e] = (x >= minX && x <= maxX && y >= minY && y <= maxY) ? 1 : 0;
  }

  return mask;
}

// ---------------------------------------------------------------------------
// Ellipse gate — Mahalanobis distance
// ---------------------------------------------------------------------------

function applyEllipse(gate: EllipseGate, matrix: EventMatrix, parentMask: Uint8Array): Uint8Array {
  const xIdx = channelIndex(matrix, gate.xChannel);
  const yIdx = channelIndex(matrix, gate.yChannel ?? '');
  const { data, channels, eventCount } = matrix;
  const nCh = channels.length;
  const { cx, cy, rx, ry, angle } = gate;
  const cosA = Math.cos(-angle);
  const sinA = Math.sin(-angle);
  const mask = new Uint8Array(eventCount);

  for (let e = 0; e < eventCount; e++) {
    if (!parentMask[e]) continue;
    const dx = (data[e * nCh + xIdx] ?? 0) - cx;
    const dy = (data[e * nCh + yIdx] ?? 0) - cy;
    // Rotate to ellipse axis frame
    const rx2 = dx * cosA - dy * sinA;
    const ry2 = dx * sinA + dy * cosA;
    const d = (rx2 * rx2) / (rx * rx) + (ry2 * ry2) / (ry * ry);
    mask[e] = d <= 1 ? 1 : 0;
  }

  return mask;
}

// ---------------------------------------------------------------------------
// Interval gate (1D)
// ---------------------------------------------------------------------------

function applyInterval(gate: IntervalGate, matrix: EventMatrix, parentMask: Uint8Array): Uint8Array {
  const xIdx = channelIndex(matrix, gate.xChannel);
  const { data, channels, eventCount } = matrix;
  const nCh = channels.length;
  const { min, max } = gate;
  const mask = new Uint8Array(eventCount);

  for (let e = 0; e < eventCount; e++) {
    if (!parentMask[e]) continue;
    const x = data[e * nCh + xIdx] ?? 0;
    mask[e] = (x >= min && x <= max) ? 1 : 0;
  }

  return mask;
}

// ---------------------------------------------------------------------------
// Quadrant gate — returns masks for all 4 quadrants
// ---------------------------------------------------------------------------

function applyQuadrant(
  gate: QuadrantGate,
  matrix: EventMatrix,
  parentMask: Uint8Array,
): [Uint8Array, Uint8Array, Uint8Array, Uint8Array] {
  const xIdx = channelIndex(matrix, gate.xChannel);
  const yIdx = channelIndex(matrix, gate.yChannel ?? '');
  const { data, channels, eventCount } = matrix;
  const nCh = channels.length;
  const { dividerX, dividerY } = gate;

  const q1 = new Uint8Array(eventCount); // upper-right
  const q2 = new Uint8Array(eventCount); // upper-left
  const q3 = new Uint8Array(eventCount); // lower-left
  const q4 = new Uint8Array(eventCount); // lower-right

  for (let e = 0; e < eventCount; e++) {
    if (!parentMask[e]) continue;
    const x = data[e * nCh + xIdx] ?? 0;
    const y = data[e * nCh + yIdx] ?? 0;
    const right = x >= dividerX;
    const upper = y >= dividerY;
    if (right && upper) q1[e] = 1;
    else if (!right && upper) q2[e] = 1;
    else if (!right && !upper) q3[e] = 1;
    else q4[e] = 1;
  }

  return [q1, q2, q3, q4];
}

// ---------------------------------------------------------------------------
// Boolean gate
// ---------------------------------------------------------------------------

function applyBoolean(gate: BooleanGate, matrix: EventMatrix, parentMask: Uint8Array): Uint8Array {
  // Note: for boolean gates, we need the results of the referenced gates.
  // In the hierarchy traversal order, referenced gates should already be evaluated.
  // This stub returns an empty mask as a placeholder — the engine must pre-fetch
  // referenced results and pass them in context.
  // TODO: wire up gate result lookup in the traversal engine
  console.warn(`Boolean gate "${gate.name}" evaluation is not yet fully wired — returning empty mask`);
  return new Uint8Array(matrix.eventCount);
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function channelIndex(matrix: EventMatrix, name: string): number {
  const idx = matrix.channels.indexOf(name);
  if (idx === -1) {
    throw new Error(`Channel "${name}" not found in event matrix. Available: ${matrix.channels.join(', ')}`);
  }
  return idx;
}

function countOnes(mask: Uint8Array): number {
  let n = 0;
  for (let i = 0; i < mask.length; i++) {
    if (mask[i]) n++;
  }
  return n;
}

function makeAllOnes(length: number): Uint8Array {
  const mask = new Uint8Array(length);
  mask.fill(1);
  return mask;
}
