/**
 * CytoLens demo dataset module.
 *
 * Provides synthetic PBMC flow cytometry data so users can explore
 * the app without loading a real FCS file.
 *
 * Usage:
 *   import { generatePBMCDemo, getPBMCPopulationInfo } from '@cytolens/core';
 *
 *   const matrix = generatePBMCDemo();   // 100,000 events
 *   const pops   = getPBMCPopulationInfo();
 */

export {
  generatePBMCDemo,
  getPBMCPopulationInfo,
} from './pbmc.js';

export type {
  PopulationInfo,
} from './pbmc.js';

export {
  getPBMCSpilloverMatrix,
  getPBMCCompensationMatrix,
  PBMC_CHANNELS,
  CH,
} from './spillover.js';

// SpilloverMatrix is re-exported from @cytolens/core via compensation/index.js
// PBMCChannel is unique to this module
export type {
  PBMCChannel,
} from './spillover.js';
