/**
 * Per-sample QC checks.
 *
 * Run on ingest to flag low-quality samples before any analysis.
 * All checks are non-destructive — results are advisory only.
 */

import type { EventMatrix } from '../gating/engine.js';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface QCWarning {
  code: string;
  message: string;
  severity: 'low' | 'medium' | 'high';
}

export interface QCError {
  code: string;
  message: string;
}

export interface QCMetrics {
  /** Total events in the file */
  eventCount: number;
  /** True when eventCount < 1000 */
  lowEventCount: boolean;
  /** Number of channels (parameters) */
  channelCount: number;
  /** Whether a TIME channel was detected */
  hasTimeChannel: boolean;
  /**
   * Coefficient of variation of event acquisition rate over time.
   * Null when no TIME channel is present.
   * Range 0..1 (0 = perfectly uniform, 1 = high variability).
   */
  timeDrift: number | null;
  /**
   * Fraction of events that have at least one channel at or above
   * 95% of the instrument range ( keyword).  Range 0..1.
   */
  saturationFraction: number;
  /**
   * Fraction of events flagged as potential debris or aggregates
   * based on anomalous scatter ratios.  Range 0..1.
   */
  anomalousEventFraction: number;
}

export interface QCResult {
  passed: boolean;
  warnings: QCWarning[];
  errors: QCError[];
  metrics: QCMetrics;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const LOW_EVENT_THRESHOLD = 1000;
const TIME_DRIFT_CV_THRESHOLD = 0.5;
const TIME_BINS = 20;
const SATURATION_THRESHOLD = 0.02;   // 2 %
const SATURATION_FRACTION = 0.95;    // >= 95% of  counts as saturated

// Anomaly detection: SSC/FSC ratio outside 3 SD from mean flags an event.
const ANOMALY_SD_MULTIPLIER = 3;

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Run all QC checks on a sample.
 *
 * @param matrix   Parsed event matrix from the FCS file.
 * @param keywords FCS keyword dictionary (keys may be mixed-case —
 *                 this function normalises them internally).
 */
export function runSampleQC(
  matrix: EventMatrix,
  keywords: Record<string, string>,
): QCResult {
  const warnings: QCWarning[] = [];
  const errors: QCError[] = [];

  // Normalise keyword keys to uppercase for lookups
  const kw = normaliseKeywords(keywords);

  // --- 1. Event count -------------------------------------------------
  const { eventCount } = matrix;
  const lowEventCount = eventCount < LOW_EVENT_THRESHOLD;
  if (lowEventCount) {
    warnings.push({
      code: 'LOW_EVENTS',
      message: `Only ${eventCount} events acquired (threshold: ${LOW_EVENT_THRESHOLD}). Statistical power may be insufficient.`,
      severity: eventCount < 200 ? 'high' : 'medium',
    });
  }

  // --- 2. Time channel detection & drift ------------------------------
  const timeChannelName = findTimeChannel(matrix.channels);
  const hasTimeChannel = timeChannelName !== null;
  let timeDrift: number | null = null;

  if (hasTimeChannel && timeChannelName !== null) {
    timeDrift = computeTimeDriftCV(matrix, timeChannelName);
    if (timeDrift > TIME_DRIFT_CV_THRESHOLD) {
      warnings.push({
        code: 'TIME_DRIFT',
        message: `Acquisition rate is uneven over time (CV = ${(timeDrift * 100).toFixed(1)}%). This may indicate instrument instability, a clog, or sample depletion.`,
        severity: timeDrift > 0.8 ? 'high' : 'medium',
      });
    }
  } else {
    warnings.push({
      code: 'NO_TIME_CHANNEL',
      message: 'No TIME channel detected. Time-based QC (drift detection) is unavailable.',
      severity: 'low',
    });
  }

  // --- 3. Saturation --------------------------------------------------
  const channelRanges = parseChannelRanges(kw, matrix.channels);
  const saturationFraction = computeSaturationFraction(matrix, channelRanges);

  if (saturationFraction > SATURATION_THRESHOLD) {
    warnings.push({
      code: 'SATURATION',
      message: `${(saturationFraction * 100).toFixed(1)}% of events have at least one channel at or near the detector ceiling (>= 95% of range). Detector voltage may be too high.`,
      severity: saturationFraction > 0.1 ? 'high' : 'medium',
    });
  }

  // --- 4. Anomalous events (debris / aggregates) ----------------------
  const anomalousEventFraction = computeAnomalousFraction(matrix);

  if (anomalousEventFraction > 0.5) {
    warnings.push({
      code: 'HIGH_DEBRIS',
      message: `${(anomalousEventFraction * 100).toFixed(1)}% of events appear anomalous (potential debris or aggregates based on scatter profile). Review FSC/SSC plot.`,
      severity: anomalousEventFraction > 0.8 ? 'high' : 'medium',
    });
  }

  const metrics: QCMetrics = {
    eventCount,
    lowEventCount,
    channelCount: matrix.channels.length,
    hasTimeChannel,
    timeDrift,
    saturationFraction,
    anomalousEventFraction,
  };

  // A sample fails QC if there are any errors, or any high-severity warnings.
  const passed =
    errors.length === 0 &&
    !warnings.some(w => w.severity === 'high');

  return { passed, warnings, errors, metrics };
}

// ---------------------------------------------------------------------------
// Check implementations
// ---------------------------------------------------------------------------

/**
 * Compute CV of event rate across TIME_BINS equal-time bins.
 * CV = stddev / mean  (0 = uniform, higher = drifting).
 */
function computeTimeDriftCV(matrix: EventMatrix, timeChannel: string): number {
  const { data, channels, eventCount } = matrix;
  const nCh = channels.length;
  const tIdx = channels.indexOf(timeChannel);

  if (tIdx === -1 || eventCount === 0) return 0;

  const times = new Float64Array(eventCount);
  for (let e = 0; e < eventCount; e++) {
    times[e] = data[e * nCh + tIdx] ?? 0;
  }

  const tMin = minOf(times);
  const tMax = maxOf(times);
  const range = tMax - tMin;

  if (range <= 0) return 0;

  const binCounts = new Float64Array(TIME_BINS);
  for (let e = 0; e < eventCount; e++) {
    const binIdx = Math.min(
      TIME_BINS - 1,
      Math.floor(((times[e] - tMin) / range) * TIME_BINS),
    );
    binCounts[binIdx]++;
  }

  return coefficientOfVariation(binCounts);
}

/**
 * Parse  keywords to get the instrument range for each channel.
 * Returns a map from channel name to range value.
 * Falls back to 262144 (18-bit ADC) if keyword is missing or unparseable.
 */
function parseChannelRanges(
  kw: Record<string, string>,
  channels: string[],
): Map<string, number> {
  const DEFAULT_RANGE = 262144;
  const ranges = new Map<string, number>();

  for (let i = 0; i < channels.length; i++) {
    const paramNum = i + 1; // FCS parameter numbering is 1-based
    const rangeKey = `$P${paramNum}R`;
    const raw = kw[rangeKey];
    const range = raw !== undefined ? parseFloat(raw) : NaN;
    ranges.set(channels[i], isFinite(range) && range > 0 ? range : DEFAULT_RANGE);
  }

  return ranges;
}

/**
 * Fraction of events where any channel value >= SATURATION_FRACTION * range.
 */
function computeSaturationFraction(
  matrix: EventMatrix,
  channelRanges: Map<string, number>,
): number {
  const { data, channels, eventCount } = matrix;
  const nCh = channels.length;

  if (eventCount === 0) return 0;

  // Pre-compute per-channel thresholds once
  const thresholds = channels.map(ch => {
    const range = channelRanges.get(ch) ?? 262144;
    return range * SATURATION_FRACTION;
  });

  let saturatedCount = 0;

  for (let e = 0; e < eventCount; e++) {
    const base = e * nCh;
    for (let c = 0; c < nCh; c++) {
      if ((data[base + c] ?? 0) >= thresholds[c]) {
        saturatedCount++;
        break; // count each event at most once
      }
    }
  }

  return saturatedCount / eventCount;
}

/**
 * Estimate fraction of anomalous events using FSC/SSC area ratio.
 *
 * Debris has very low FSC with disproportionately high SSC.
 * Aggregates produce abnormally high FSC values.
 * Both appear as outliers in the FSC/SSC ratio distribution.
 *
 * Strategy: flag events beyond ANOMALY_SD_MULTIPLIER SDs from the mean ratio.
 * Returns 0 if FSC and SSC channels are not both present.
 */
function computeAnomalousFraction(matrix: EventMatrix): number {
  const { data, channels, eventCount } = matrix;
  const nCh = channels.length;

  const fscIdx = findChannelIndex(channels, ['FSC-A', 'FSC', 'FS', 'FSC_A']);
  const sscIdx = findChannelIndex(channels, ['SSC-A', 'SSC', 'SS', 'SSC_A']);

  if (fscIdx === -1 || sscIdx === -1 || eventCount === 0) return 0;

  const ratios = new Float64Array(eventCount);
  for (let e = 0; e < eventCount; e++) {
    const base = e * nCh;
    const fsc = data[base + fscIdx] ?? 0;
    const ssc = data[base + sscIdx] ?? 1;
    ratios[e] = fsc / (ssc > 0 ? ssc : 1);
  }

  const mean = arithmeticMean(ratios);
  const sd = standardDeviation(ratios, mean);

  if (sd === 0) return 0;

  const lower = mean - ANOMALY_SD_MULTIPLIER * sd;
  const upper = mean + ANOMALY_SD_MULTIPLIER * sd;

  let anomalous = 0;
  for (let e = 0; e < eventCount; e++) {
    if (ratios[e] < lower || ratios[e] > upper) anomalous++;
  }

  return anomalous / eventCount;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Case-insensitive channel name search against a list of candidates. */
function findChannelIndex(channels: string[], candidates: string[]): number {
  const upper = channels.map(c => c.toUpperCase());
  for (const candidate of candidates) {
    const idx = upper.indexOf(candidate.toUpperCase());
    if (idx !== -1) return idx;
  }
  return -1;
}

/** Locate the TIME channel by common FCS naming conventions. */
function findTimeChannel(channels: string[]): string | null {
  for (const name of channels) {
    if (name.toUpperCase() === 'TIME') return name;
  }
  return null;
}

/** Normalise all keyword keys to uppercase for consistent lookups. */
function normaliseKeywords(kw: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(kw)) {
    out[k.toUpperCase()] = v;
  }
  return out;
}

function minOf(arr: Float64Array): number {
  let m = Infinity;
  for (let i = 0; i < arr.length; i++) { if (arr[i] < m) m = arr[i]; }
  return m;
}

function maxOf(arr: Float64Array): number {
  let m = -Infinity;
  for (let i = 0; i < arr.length; i++) { if (arr[i] > m) m = arr[i]; }
  return m;
}

function arithmeticMean(arr: Float64Array): number {
  if (arr.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < arr.length; i++) sum += arr[i];
  return sum / arr.length;
}

function standardDeviation(arr: Float64Array, mean: number): number {
  if (arr.length < 2) return 0;
  let variance = 0;
  for (let i = 0; i < arr.length; i++) {
    const d = arr[i] - mean;
    variance += d * d;
  }
  return Math.sqrt(variance / arr.length);
}

function coefficientOfVariation(arr: Float64Array): number {
  const mean = arithmeticMean(arr);
  if (mean === 0) return 0;
  const sd = standardDeviation(arr, mean);
  return sd / mean;
}
