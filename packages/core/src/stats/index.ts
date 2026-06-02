/**
 * Statistics module — public surface.
 *
 * Re-exports everything consumers need from population.ts and experiment.ts.
 * Import from '@cytolens/core/stats' or directly from this barrel.
 */

export type { ChannelStats, PopulationStats }  from './population.js';
export { computePopulationStats }              from './population.js';

export type { ExperimentStats }                from './experiment.js';
export { computeExperimentStats }              from './experiment.js';
