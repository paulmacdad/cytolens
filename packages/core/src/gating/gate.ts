/**
 * Gate interfaces and types.
 *
 * Gates define regions in 1D or 2D parameter space that select
 * populations of events. The hierarchy of gates forms a tree
 * (GatingML-compatible).
 */

export type GateType =
  | 'polygon'
  | 'rectangle'
  | 'ellipse'
  | 'quadrant'
  | 'interval'
  | 'boolean';

export type BooleanOperator = 'AND' | 'OR' | 'NOT';

/** A 2D coordinate point */
export interface Point2D {
  x: number;
  y: number;
}

/** Base gate — all gate types extend this */
export interface BaseGate {
  id: string;
  name: string;
  type: GateType;
  /** X-axis parameter name e.g. "FSC-A" */
  xChannel: string;
  /** Y-axis parameter name. Absent for 1D interval gates. */
  yChannel?: string;
  /** Parent gate ID. undefined = root (all events) */
  parentId?: string;
  /** Display colour (hex) */
  color?: string;
  /** GatingML gate ID for round-trip export */
  gatingMLId?: string;
}

export interface PolygonGate extends BaseGate {
  type: 'polygon';
  vertices: Point2D[];
}

export interface RectangleGate extends BaseGate {
  type: 'rectangle';
  /** Minimum x value */
  minX: number;
  /** Maximum x value */
  maxX: number;
  /** Minimum y value */
  minY: number;
  /** Maximum y value */
  maxY: number;
}

export interface EllipseGate extends BaseGate {
  type: 'ellipse';
  /** Centre x */
  cx: number;
  /** Centre y */
  cy: number;
  /** Semi-axis length in x direction */
  rx: number;
  /** Semi-axis length in y direction */
  ry: number;
  /** Rotation angle in radians */
  angle: number;
}

export interface QuadrantGate extends BaseGate {
  type: 'quadrant';
  /** x divider position */
  dividerX: number;
  /** y divider position */
  dividerY: number;
  /** Names for Q1 (upper-right), Q2 (upper-left), Q3 (lower-left), Q4 (lower-right) */
  quadrantNames: [string, string, string, string];
}

export interface IntervalGate extends BaseGate {
  type: 'interval';
  /** 1D gate: min and max on xChannel */
  min: number;
  max: number;
}

export interface BooleanGate extends BaseGate {
  type: 'boolean';
  operator: BooleanOperator;
  /** Gate IDs to combine */
  gateIds: string[];
}

export type Gate =
  | PolygonGate
  | RectangleGate
  | EllipseGate
  | QuadrantGate
  | IntervalGate
  | BooleanGate;

/** Result of applying a gate to a sample */
export interface GateResult {
  gateId: string;
  /** Uint8Array bitmask: 1 = event in gate, 0 = outside */
  mask: Uint8Array;
  /** Count of events in gate */
  count: number;
  /** Percentage of parent population */
  percentOfParent: number;
  /** Percentage of all events */
  percentOfTotal: number;
}

/** A node in the gate hierarchy tree */
export interface GateNode {
  gate: Gate;
  result?: GateResult;
  children: GateNode[];
}
