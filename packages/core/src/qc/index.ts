/**
 * QC module public API.
 *
 * Re-exports everything needed by consumers of the qc package.
 * Import from here, not from the individual sub-modules.
 *
 * @example
 * import { runSampleQC } from '@cytolens/core/qc';
 */

export type {
  QCResult,
  QCWarning,
  QCError,
  QCMetrics,
} from './sample.js';

export { runSampleQC } from './sample.js';
