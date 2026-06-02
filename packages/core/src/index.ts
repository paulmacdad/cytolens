// FCS parsing
export * from './fcs/types.js';
export { parseFCS } from './fcs/FCSParser.js';

// Transforms
export {
  createLogicle,
  createBiexponential,
  createLinear,
  createLog,
  buildLogicleTable,
  LOGICLE_PRESETS,
} from './transforms/logicle.js';
export type { LogicleParams, BiexponentialParams, LinearTransformParams, LogTransformParams, LogicleTransform } from './transforms/logicle.js';

// Gating
export type {
  Gate,
  GateNode,
  GateResult,
  PolygonGate,
  RectangleGate,
  EllipseGate,
  EllipseGate as EllipseGateType,
  IntervalGate,
  QuadrantGate,
  BooleanGate,
  Point2D,
  GateType,
  BooleanOperator,
} from './gating/gate.js';
export { applyGateHierarchy } from './gating/engine.js';
export type { EventMatrix, GatingEngineResult } from './gating/engine.js';

// Models
export { createExperiment } from './models/experiment.js';
export type { Experiment, CompensationMatrix, TransformConfig, ExperimentSettings } from './models/experiment.js';
export { createSample } from './models/sample.js';
export type { Sample, SampleStatus, SampleQCFlags } from './models/sample.js';

// Future modules (files may not exist yet — created by parallel agents)
export * from './compensation/index.js';
export * from './stats/index.js';
export * from './qc/index.js';
export * from './utils/index.js';
export * from './demo/index.js';
export * from './dimred/index.js';
export * from './compat/index.js';
