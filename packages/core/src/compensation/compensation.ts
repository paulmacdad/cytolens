/**
 * Compensation application module.
 *
 * Applies spectral compensation to raw FCS event data using a pre-computed
 * spillover matrix. The compensation transform is:
 *
 *   compensated[event] = raw[event] x S^-1
 *
 * where S is the N×N spillover matrix and S^-1 is its inverse.
 * This corrects for fluorochrome spectral overlap across detector channels.
 *
 * Implementation notes:
 * - Event data remains Float32 throughout to match FCS storage precision.
 * - The compensation matrix is computed once in Float64 for numerical stability,
 *   then applied per-event in Float32 arithmetic.
 * - Only channels present in the spillover matrix are compensated; additional
 *   channels in the EventMatrix (e.g. scatter parameters) are passed through
 *   unchanged, with their column indices noted in unmatchedChannels.
 */

import type { EventMatrix } from '../gating/engine.js';
import { invertMatrix } from './spillover.js';
import type { SpilloverMatrix } from './spillover.js';

export type { SpilloverMatrix };

/**
 * Result of applying compensation to an event matrix.
 */
export interface CompensationResult {
  /**
   * Flat compensated event array, same layout as EventMatrix.data.
   * [e0c0, e0c1, ..., e0cK, e1c0, ...]
   * Channels not present in the spillover matrix retain their raw values.
   */
  data: Float32Array;
  /** Channel names in column order (matches EventMatrix.channels order). */
  channels: string[];
  /** Number of events. */
  eventCount: number;
  /**
   * Channel names that were NOT found in the spillover matrix and were
   * passed through without modification (e.g. FSC, SSC, Time).
   */
  unmatchedChannels: string[];
}

/**
 * Apply compensation to an event matrix.
 *
 * Only channels whose names appear in the spillover matrix are compensated.
 * All other channels are copied through unchanged.
 *
 * The function:
 * 1. Builds S^-1 from the spillover matrix.
 * 2. For each event, extracts the N fluorescence values for the matched
 *    channels and multiplies the row vector by S^-1.
 * 3. Writes compensated values back into the output buffer; unmatched
 *    channels receive raw values.
 *
 * @param events   - Raw event matrix from FCS parsing.
 * @param spillover - Parsed spillover matrix (from parseSpilloverKeyword).
 * @returns Compensated event data with the same channel layout as the input.
 * @throws {Error} if the spillover matrix is singular.
 */
export function applyCompensation(
  events: EventMatrix,
  spillover: SpilloverMatrix,
): CompensationResult {
  const { data, channels, eventCount } = events;
  const { size: n } = spillover;
  const totalCols = channels.length;

  // Map each spillover channel to its column index in the event matrix
  const spillColIndex: number[] = new Array(n).fill(-1);
  for (let si = 0; si < n; si++) {
    const ci = channels.indexOf(spillover.channels[si]);
    spillColIndex[si] = ci; // -1 if channel not found in event matrix
  }

  const unmatchedChannels: string[] = [];
  for (let ci = 0; ci < totalCols; ci++) {
    if (!spillover.channels.includes(channels[ci])) {
      unmatchedChannels.push(channels[ci]);
    }
  }

  // Invert the spillover matrix once (Float64 for numerical stability)
  const invS = invertMatrix(spillover.values, n);

  // Output buffer — same size as input
  const out = new Float32Array(data.length);

  // Temporary row vector for the N fluorescence channels of a single event
  const rawVec = new Float64Array(n);
  const compVec = new Float64Array(n);

  for (let e = 0; e < eventCount; e++) {
    const base = e * totalCols;

    // Copy all channels to output first (handles unmatched / scatter params)
    for (let c = 0; c < totalCols; c++) {
      out[base + c] = data[base + c];
    }

    // Extract fluorescence channels into rawVec
    let allPresent = true;
    for (let si = 0; si < n; si++) {
      const ci = spillColIndex[si];
      if (ci < 0) { allPresent = false; break; }
      rawVec[si] = data[base + ci];
    }

    if (!allPresent) continue; // skip compensation for this event if any channel missing

    // compVec = rawVec x invS  (row vector times matrix)
    // compVec[j] = sum_i( rawVec[i] * invS[i*n + j] )
    for (let j = 0; j < n; j++) {
      let acc = 0.0;
      for (let i = 0; i < n; i++) {
        acc += rawVec[i] * invS[i * n + j];
      }
      compVec[j] = acc;
    }

    // Write compensated values back to their column positions
    for (let si = 0; si < n; si++) {
      const ci = spillColIndex[si];
      if (ci >= 0) {
        out[base + ci] = compVec[si];
      }
    }
  }

  return {
    data: out,
    channels: [...channels],
    eventCount,
    unmatchedChannels,
  };
}

export { invertMatrix } from './spillover.js';
