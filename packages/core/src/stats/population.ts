/**
 * Population statistics for gated subsets.
 *
 * Computes per-channel descriptive statistics for all events passing a gate.
 * "MFI" follows flow cytometry convention: it is the MEDIAN fluorescence
 * intensity, not the mean. Mean is reported separately as `mean`.
 *
 * Performance: values array is extracted once per channel then sorted in-place
 * on a slice, so the original Float32Array is never mutated.
 */

import type { EventMatrix } from '../gating/engine.js';

export interface ChannelStats {
  channel: string;
  /** Median Fluorescence Intensity — the median (flow cytometry convention) */
  mfi: number;
  mean: number;
  /** Coefficient of variation: SD / mean * 100 */
  cv: number;
  sd: number;
  min: number;
  max: number;
  /** 5th percentile */
  p5: number;
  /** 95th percentile */
  p95: number;
}

export interface PopulationStats {
  gateId: string;
  gateName: string;
  eventCount: number;
  parentCount: number;
  totalCount: number;
  percentOfParent: number;
  percentOfTotal: number;
  channels: ChannelStats[];
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Compute full population statistics for a gated subset.
 *
 * @param gateId     - Gate identifier
 * @param gateName   - Human-readable gate name
 * @param mask       - Uint8Array bitmask for this gate (1 = in gate)
 * @param parentMask - Uint8Array bitmask for the parent gate (1 = in parent)
 * @param matrix     - Full event data matrix
 */
export function computePopulationStats(
  gateId: string,
  gateName: string,
  mask: Uint8Array,
  parentMask: Uint8Array,
  matrix: EventMatrix,
): PopulationStats {
  const eventCount = countOnes(mask);
  const parentCount = countOnes(parentMask);
  const totalCount = matrix.eventCount;

  const percentOfParent = parentCount > 0 ? (eventCount / parentCount) * 100 : 0;
  const percentOfTotal  = totalCount  > 0 ? (eventCount / totalCount)  * 100 : 0;

  // Precompute indices of events inside this gate — used for every channel
  const maskedIndices = extractMaskedIndices(mask, matrix.eventCount);

  const channels: ChannelStats[] = matrix.channels.map((channel, chIdx) =>
    computeChannelStats(channel, chIdx, maskedIndices, matrix),
  );

  return {
    gateId,
    gateName,
    eventCount,
    parentCount,
    totalCount,
    percentOfParent,
    percentOfTotal,
    channels,
  };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Return sorted indices of all events where mask[i] === 1.
 * Building this once avoids re-scanning the mask for every channel.
 */
function extractMaskedIndices(mask: Uint8Array, eventCount: number): Uint32Array {
  // First pass: count so we can allocate exactly
  let n = 0;
  for (let i = 0; i < eventCount; i++) {
    if (mask[i]) n++;
  }

  const indices = new Uint32Array(n);
  let pos = 0;
  for (let i = 0; i < eventCount; i++) {
    if (mask[i]) indices[pos++] = i;
  }

  return indices;
}

/**
 * Extract values for one channel across the masked event indices.
 * Returns a regular Float64Array sorted ascending (used for median / percentiles).
 */
function extractChannelValues(
  chIdx: number,
  maskedIndices: Uint32Array,
  matrix: EventMatrix,
): Float64Array {
  const nCh = matrix.channels.length;
  const { data } = matrix;
  const n = maskedIndices.length;
  const values = new Float64Array(n);

  for (let i = 0; i < n; i++) {
    const eventIdx = maskedIndices[i];
    // eventIdx is guaranteed defined — Uint32Array cannot hold undefined
    values[i] = data[(eventIdx as number) * nCh + chIdx] ?? 0;
  }

  // Sort in-place on our copy; Float64Array.sort() defaults to numeric ascending
  values.sort();

  return values;
}

/**
 * Compute the median of a sorted numeric array.
 * For even-length arrays, averages the two middle values (standard definition).
 */
function median(sorted: Float64Array): number {
  const n = sorted.length;
  if (n === 0) return 0;
  const mid = Math.floor(n / 2);
  if (n % 2 === 1) {
    return sorted[mid] ?? 0;
  }
  return ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
}

/**
 * Compute a percentile from a sorted array using linear interpolation
 * (same as numpy's default method, "linear").
 *
 * @param sorted - Values sorted ascending
 * @param p      - Percentile in range [0, 100]
 */
function percentile(sorted: Float64Array, p: number): number {
  const n = sorted.length;
  if (n === 0) return 0;
  if (n === 1) return sorted[0] ?? 0;

  const rank = (p / 100) * (n - 1);
  const lower = Math.floor(rank);
  const upper = Math.ceil(rank);
  const frac  = rank - lower;

  if (lower === upper) return sorted[lower] ?? 0;
  return ((sorted[lower] ?? 0) * (1 - frac)) + ((sorted[upper] ?? 0) * frac);
}

function computeChannelStats(
  channel: string,
  chIdx: number,
  maskedIndices: Uint32Array,
  matrix: EventMatrix,
): ChannelStats {
  const n = maskedIndices.length;

  if (n === 0) {
    return {
      channel,
      mfi: 0,
      mean: 0,
      cv: 0,
      sd: 0,
      min: 0,
      max: 0,
      p5: 0,
      p95: 0,
    };
  }

  // Extract sorted values — one allocation per channel
  const sorted = extractChannelValues(chIdx, maskedIndices, matrix);

  // Mean (single pass over sorted array — same values as unsorted)
  let sum = 0;
  for (let i = 0; i < n; i++) sum += sorted[i] ?? 0;
  const mean = sum / n;

  // Variance / SD
  let sumSqDev = 0;
  for (let i = 0; i < n; i++) {
    const diff = (sorted[i] ?? 0) - mean;
    sumSqDev += diff * diff;
  }
  const variance = n > 1 ? sumSqDev / (n - 1) : 0; // sample variance
  const sd = Math.sqrt(variance);

  // CV — guard against zero mean (common for scatter channels in log space)
  const cv = mean !== 0 ? (sd / Math.abs(mean)) * 100 : 0;

  const mfi  = median(sorted);
  const minV = sorted[0] ?? 0;
  const maxV = sorted[n - 1] ?? 0;
  const p5V  = percentile(sorted, 5);
  const p95V = percentile(sorted, 95);

  return {
    channel,
    mfi,
    mean,
    cv,
    sd,
    min: minV,
    max: maxV,
    p5: p5V,
    p95: p95V,
  };
}

function countOnes(mask: Uint8Array): number {
  let n = 0;
  for (let i = 0; i < mask.length; i++) {
    if (mask[i]) n++;
  }
  return n;
}
