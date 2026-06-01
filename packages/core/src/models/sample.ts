/**
 * Sample data model.
 *
 * A Sample corresponds to a single FCS file (one tube / one well).
 * It holds the raw event matrix and per-sample gate overrides.
 */

import type { FCSMetadata } from '../fcs/types.js';

export type SampleStatus = 'pending' | 'loading' | 'ready' | 'error';

export interface SampleQCFlags {
  /** Sample passed basic QC checks */
  passedQC: boolean;
  /** Low event count warning threshold */
  lowEventCount: boolean;
  /** Abnormal scatter pattern detected */
  abnormalScatter: boolean;
  /** High debris fraction */
  highDebris: boolean;
  /** Signal drift detected (time vs channel correlation) */
  signalDrift: boolean;
  /** Notes from QC analysis */
  notes: string[];
}

export interface Sample {
  id: string;
  experimentId: string;
  /** Original filename */
  filename: string;
  /** Display label (can differ from filename) */
  label: string;
  status: SampleStatus;
  /** FCS metadata (available once loaded) */
  metadata?: FCSMetadata;
  /** Flat event array [e0ch0, e0ch1, ..., e1ch0, ...] */
  events?: Float32Array;
  /** Actual event count loaded */
  eventCount: number;
  /** Sample-specific gate annotations (override experiment-level gates) */
  gateAnnotations: Map<string, string>;
  /** QC results */
  qcFlags?: SampleQCFlags;
  /** Keywords extracted from FCS file for filtering/grouping */
  keywords: Record<string, string>;
  /** Error message if status === 'error' */
  error?: string;
  /** File size in bytes */
  fileSize?: number;
  /** Load timestamp */
  loadedAt?: Date;
}

export function createSample(partial: Partial<Sample> & { filename: string; experimentId: string }): Sample {
  return {
    id: crypto.randomUUID(),
    label: partial.filename,
    status: 'pending',
    eventCount: 0,
    gateAnnotations: new Map(),
    keywords: {},
    ...partial,
  };
}
