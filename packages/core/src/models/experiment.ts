/**
 * Experiment data model.
 *
 * An Experiment is the top-level container analogous to a FlowJo workspace
 * or FCS Express experiment. It holds references to samples, a shared
 * gate hierarchy, compensation matrices, and display settings.
 */

import type { Gate } from '../gating/gate.js';

export interface CompensationMatrix {
  id: string;
  name: string;
  /** Channel names in row/column order */
  channels: string[];
  /** Row-major spillover matrix (channels.length x channels.length) */
  values: Float64Array;
}

export interface TransformConfig {
  channelName: string;
  type: 'logicle' | 'biexponential' | 'log' | 'linear' | 'none';
  params: Record<string, number>;
}

export interface ExperimentSettings {
  /** Default transform applied to all parameters unless overridden */
  defaultTransform: TransformConfig['type'];
  /** Per-channel transform overrides */
  channelTransforms: TransformConfig[];
  /** Active compensation matrix ID */
  compensationMatrixId?: string;
}

export interface Experiment {
  id: string;
  name: string;
  description?: string;
  createdAt: Date;
  modifiedAt: Date;
  /** Sample IDs in display order */
  sampleIds: string[];
  /** Gate definitions keyed by gate ID */
  gates: Map<string, Gate>;
  /** Compensation matrices keyed by ID */
  compensationMatrices: Map<string, CompensationMatrix>;
  settings: ExperimentSettings;
  /** Key-value metadata (institution, PI, project, etc.) */
  metadata: Record<string, string>;
}

export function createExperiment(partial: Partial<Experiment> & { name: string }): Experiment {
  const now = new Date();
  return {
    id: crypto.randomUUID(),
    createdAt: now,
    modifiedAt: now,
    sampleIds: [],
    gates: new Map(),
    compensationMatrices: new Map(),
    settings: {
      defaultTransform: 'logicle',
      channelTransforms: [],
    },
    metadata: {},
    ...partial,
  };
}
