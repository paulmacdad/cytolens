/**
 * Compensation module public API.
 *
 * Re-exports everything from spillover.ts and compensation.ts so consumers
 * can import directly from the compensation package root:
 *
 *   import { parseSpilloverKeyword, applyCompensation } from '../compensation/index.js';
 */

export type { SpilloverMatrix } from './spillover.js';
export { parseSpilloverKeyword, buildCompensationMatrix, invertMatrix } from './spillover.js';

export type { CompensationResult } from './compensation.js';
export { applyCompensation } from './compensation.js';
