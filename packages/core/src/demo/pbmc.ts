/**
 * Synthetic PBMC flow cytometry demo dataset.
 *
 * Generates a realistic 8-color PBMC panel without requiring a real FCS file.
 * Intended as the first thing new CytoLens users see — it must look like real data.
 *
 * Generation strategy
 * ───────────────────
 * 1. Each cell population is a Gaussian cluster in log-fluorescence space.
 * 2. Scatter (FSC/SSC) uses linear space; fluorescence uses log10 space.
 * 3. Box-Muller transform gives proper Gaussian noise.
 * 4. Spillover is applied after generating clean cluster values.
 * 5. TIME channel increases monotonically with slight drift (real cytometer behaviour).
 * 6. Values are clipped to instrument-realistic ranges before storage.
 *
 * Channel order (matches PBMC_CHANNELS in spillover.ts):
 *   0 FSC-A  1 FSC-H  2 SSC-A  3 SSC-H  4 TIME
 *   5 CD3-FITC  6 CD4-PE  7 CD8-APC  8 CD19-BV421
 *   9 CD56-PE-Cy7  10 LD-eF780  11 HLA-DR-PerCPCy55
 */

import type { EventMatrix } from '../gating/engine.js';
import { CH, PBMC_CHANNELS, getPBMCSpilloverMatrix } from './spillover.js';

// ── Instrument range constants ───────────────────────────────────────────────

/** FSC/SSC linear range (arbitrary instrument units, 0–262144 for 18-bit) */
const SCATTER_MAX = 262144;

/** Fluorescence channel range in linear units (post-logicle display: 0–262144) */
const FLUO_MIN_LINEAR = 1;
const FLUO_MAX_LINEAR = 262144;

/** Log10 of dim autofluorescence floor */
const LOG_AUTOFLUOR = 2.3;  // ~200 linear units

// ── Box-Muller PRNG ──────────────────────────────────────────────────────────

/**
 * Seeded LCG for reproducible demo data.
 * Using multiplier/increment from Numerical Recipes.
 */
class SeededRNG {
  private state: number;

  constructor(seed = 0xdeadbeef) {
    this.state = seed >>> 0;
  }

  /** Returns float in [0, 1) */
  next(): number {
    // LCG: Xn+1 = (a * Xn + c) mod 2^32
    this.state = (Math.imul(1664525, this.state) + 1013904223) >>> 0;
    return this.state / 0x100000000;
  }

  /** Box-Muller: returns a standard normal variate */
  gauss(): number {
    const u1 = Math.max(this.next(), 1e-10);
    const u2 = this.next();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }

  /** Normal with given mean and sd */
  normal(mean: number, sd: number): number {
    return mean + this.gauss() * sd;
  }

  /** Log-normal: sample in log10 space then exponentiate */
  logNormal(log10Mean: number, log10Sd: number): number {
    return Math.pow(10, this.normal(log10Mean, log10Sd));
  }
}

// ── Population descriptors ───────────────────────────────────────────────────

/**
 * Each entry describes one cell population cluster.
 * Fluorescence values are log10 of linear MFI.
 * Scatter values are linear (0–262144).
 *
 * Brightness convention:
 *   negative (dim): log10 ~2.0–2.5   (autofluorescence / unstained)
 *   low positive:   log10 ~3.0–3.5
 *   intermediate:   log10 ~3.5–4.2
 *   bright:         log10 ~4.2–5.0
 */
interface PopulationDef {
  name: string;
  fraction: number;       // Fraction of total nEvents
  // Scatter
  fscA:  { mean: number; sd: number };
  fscH:  { mean: number; sd: number };
  sscA:  { mean: number; sd: number };
  sscH:  { mean: number; sd: number };
  // Fluorescence channels (log10 space)
  fitc:  { mean: number; sd: number };  // CD3-FITC
  pe:    { mean: number; sd: number };  // CD4-PE
  apc:   { mean: number; sd: number };  // CD8-APC
  bv421: { mean: number; sd: number };  // CD19-BV421
  pecy7: { mean: number; sd: number };  // CD56-PE-Cy7
  ldead: { mean: number; sd: number };  // LIVE-DEAD eFluor780
  percp: { mean: number; sd: number };  // HLA-DR-PerCP-Cy5.5
  /** If true, FSC-H / FSC-A ratio is inflated to simulate doublets */
  isDoublet?: boolean;
}

const POPULATIONS: PopulationDef[] = [
  // ── Non-cellular / artefact events ────────────────────────────────────────

  {
    name: 'Debris',
    fraction: 0.08,
    fscA:  { mean: 25000, sd: 12000 },
    fscH:  { mean: 23000, sd: 11000 },
    sscA:  { mean: 18000, sd: 10000 },
    sscH:  { mean: 17000, sd: 9000  },
    fitc:  { mean: 2.2,  sd: 0.35 },
    pe:    { mean: 2.1,  sd: 0.30 },
    apc:   { mean: 2.0,  sd: 0.25 },
    bv421: { mean: 2.2,  sd: 0.30 },
    pecy7: { mean: 2.0,  sd: 0.25 },
    ldead: { mean: 2.5,  sd: 0.40 },
    percp: { mean: 2.1,  sd: 0.30 },
  },

  {
    name: 'Doublets',
    fraction: 0.03,
    isDoublet: true,
    fscA:  { mean: 145000, sd: 20000 },
    fscH:  { mean: 115000, sd: 18000 },  // FSC-H lower than FSC-A (ratio > 1 after inflate)
    sscA:  { mean: 55000,  sd: 15000 },
    sscH:  { mean: 50000,  sd: 13000 },
    fitc:  { mean: 3.0,  sd: 0.50 },
    pe:    { mean: 3.2,  sd: 0.50 },
    apc:   { mean: 2.8,  sd: 0.45 },
    bv421: { mean: 2.9,  sd: 0.45 },
    pecy7: { mean: 2.7,  sd: 0.40 },
    ldead: { mean: 2.8,  sd: 0.40 },
    percp: { mean: 3.0,  sd: 0.45 },
  },

  {
    name: 'Dead cells',
    fraction: 0.05,
    fscA:  { mean: 62000, sd: 18000 },
    fscH:  { mean: 60000, sd: 17000 },
    sscA:  { mean: 38000, sd: 14000 },
    sscH:  { mean: 36000, sd: 13000 },
    fitc:  { mean: 2.8,  sd: 0.50 },
    pe:    { mean: 2.9,  sd: 0.50 },
    apc:   { mean: 2.5,  sd: 0.40 },
    bv421: { mean: 2.6,  sd: 0.40 },
    pecy7: { mean: 2.7,  sd: 0.45 },
    ldead: { mean: 4.6,  sd: 0.25 },   // ← high LIVE-DEAD (dead cells stain brightly)
    percp: { mean: 2.7,  sd: 0.45 },
  },

  {
    name: 'Granulocytes',
    fraction: 0.05,
    fscA:  { mean: 82000,  sd: 14000 },
    fscH:  { mean: 80000,  sd: 13500 },
    sscA:  { mean: 145000, sd: 22000 },  // ← hallmark: very high SSC
    sscH:  { mean: 140000, sd: 21000 },
    fitc:  { mean: 2.4,  sd: 0.35 },
    pe:    { mean: 2.3,  sd: 0.35 },
    apc:   { mean: 2.2,  sd: 0.30 },
    bv421: { mean: 2.2,  sd: 0.30 },
    pecy7: { mean: 2.4,  sd: 0.35 },
    ldead: { mean: 2.6,  sd: 0.35 },
    percp: { mean: 3.0,  sd: 0.40 },
  },

  // ── Live single cell populations ──────────────────────────────────────────
  // These 79% are the main immunology interest.
  // Fractions are of total nEvents (already account for 21% non-lymphocyte).
  // Live lymphocyte gate: FSC 60–130k, SSC 5–50k (tight cluster).

  {
    name: 'CD4 T cells',
    fraction: 0.217,   // 35% of T cells × 62% T cells × 79% live = ~17% total; adjusted for realism
    fscA:  { mean: 92000,  sd: 10000 },
    fscH:  { mean: 90000,  sd: 9500  },
    sscA:  { mean: 22000,  sd: 7000  },
    sscH:  { mean: 21000,  sd: 6500  },
    fitc:  { mean: 4.35, sd: 0.18 },   // CD3 bright
    pe:    { mean: 4.50, sd: 0.18 },   // CD4 bright
    apc:   { mean: 2.25, sd: 0.20 },   // CD8 negative
    bv421: { mean: 2.20, sd: 0.20 },   // CD19 negative
    pecy7: { mean: 2.15, sd: 0.20 },   // CD56 negative
    ldead: { mean: 2.00, sd: 0.18 },   // viable (low LD)
    percp: { mean: 2.30, sd: 0.25 },   // HLA-DR dim (not activated)
  },

  {
    name: 'CD8 T cells',
    fraction: 0.136,   // 22% of T cells × 62% × 79%
    fscA:  { mean: 90000,  sd: 9500  },
    fscH:  { mean: 88000,  sd: 9000  },
    sscA:  { mean: 24000,  sd: 7500  },
    sscH:  { mean: 23000,  sd: 7000  },
    fitc:  { mean: 4.30, sd: 0.18 },   // CD3 bright
    pe:    { mean: 2.25, sd: 0.20 },   // CD4 negative
    apc:   { mean: 4.45, sd: 0.20 },   // CD8 bright
    bv421: { mean: 2.20, sd: 0.20 },   // CD19 negative
    pecy7: { mean: 2.15, sd: 0.20 },   // CD56 negative
    ldead: { mean: 2.00, sd: 0.18 },   // viable
    percp: { mean: 2.30, sd: 0.25 },   // HLA-DR dim
  },

  {
    name: 'DN T cells',
    fraction: 0.031,   // 5% of T cells × 62% × 79%
    fscA:  { mean: 86000,  sd: 9000  },
    fscH:  { mean: 84000,  sd: 8500  },
    sscA:  { mean: 21000,  sd: 6500  },
    sscH:  { mean: 20000,  sd: 6000  },
    fitc:  { mean: 4.10, sd: 0.22 },   // CD3 intermediate-bright
    pe:    { mean: 2.25, sd: 0.22 },   // CD4 negative
    apc:   { mean: 2.20, sd: 0.22 },   // CD8 negative
    bv421: { mean: 2.20, sd: 0.20 },
    pecy7: { mean: 2.15, sd: 0.20 },
    ldead: { mean: 2.00, sd: 0.18 },
    percp: { mean: 2.30, sd: 0.25 },
  },

  {
    name: 'B cells',
    fraction: 0.095,   // 12% of live singlets × 79%
    fscA:  { mean: 80000,  sd: 9000  },
    fscH:  { mean: 78000,  sd: 8500  },
    sscA:  { mean: 25000,  sd: 8000  },
    sscH:  { mean: 24000,  sd: 7500  },
    fitc:  { mean: 2.20, sd: 0.20 },   // CD3 negative
    pe:    { mean: 2.20, sd: 0.22 },   // CD4 negative
    apc:   { mean: 2.18, sd: 0.20 },   // CD8 negative
    bv421: { mean: 4.55, sd: 0.18 },   // CD19 bright ← B cell hallmark
    pecy7: { mean: 2.15, sd: 0.20 },   // CD56 negative
    ldead: { mean: 2.00, sd: 0.18 },   // viable
    percp: { mean: 3.85, sd: 0.22 },   // HLA-DR positive (antigen presenting)
  },

  {
    name: 'NK cells',
    fraction: 0.063,   // 8% × 79%
    fscA:  { mean: 95000,  sd: 10000 },
    fscH:  { mean: 93000,  sd: 9500  },
    sscA:  { mean: 28000,  sd: 8000  },
    sscH:  { mean: 27000,  sd: 7500  },
    fitc:  { mean: 2.20, sd: 0.22 },   // CD3 negative
    pe:    { mean: 2.20, sd: 0.22 },   // CD4 negative
    apc:   { mean: 2.18, sd: 0.20 },   // CD8 negative (NK cells don't express CD8 uniformly)
    bv421: { mean: 2.18, sd: 0.20 },   // CD19 negative
    pecy7: { mean: 4.40, sd: 0.20 },   // CD56 bright ← NK hallmark
    ldead: { mean: 2.00, sd: 0.18 },   // viable
    percp: { mean: 2.35, sd: 0.28 },   // HLA-DR dim/negative on resting NK
  },

  {
    name: 'Monocytes',
    fraction: 0.111,   // 14% × 79%
    fscA:  { mean: 115000, sd: 12000 },  // monocytes are larger — higher FSC
    fscH:  { mean: 113000, sd: 11500 },
    sscA:  { mean: 52000,  sd: 12000 },  // higher SSC than lymphocytes
    sscH:  { mean: 50000,  sd: 11500 },
    fitc:  { mean: 2.25, sd: 0.28 },   // CD3 negative
    pe:    { mean: 2.20, sd: 0.25 },   // CD4 dim on classical monocytes but gated as negative here
    apc:   { mean: 2.18, sd: 0.22 },   // CD8 negative
    bv421: { mean: 2.18, sd: 0.22 },   // CD19 negative
    pecy7: { mean: 2.15, sd: 0.22 },   // CD56 negative
    ldead: { mean: 2.05, sd: 0.20 },   // viable
    percp: { mean: 4.70, sd: 0.18 },   // HLA-DR very bright ← monocyte hallmark
  },

  {
    name: 'Other live',
    fraction: 0.032,   // 4% × 79%
    fscA:  { mean: 88000,  sd: 14000 },
    fscH:  { mean: 86000,  sd: 13500 },
    sscA:  { mean: 30000,  sd: 12000 },
    sscH:  { mean: 28000,  sd: 11500 },
    fitc:  { mean: 2.50, sd: 0.45 },
    pe:    { mean: 2.45, sd: 0.45 },
    apc:   { mean: 2.40, sd: 0.40 },
    bv421: { mean: 2.38, sd: 0.38 },
    pecy7: { mean: 2.35, sd: 0.40 },
    ldead: { mean: 2.10, sd: 0.25 },
    percp: { mean: 2.60, sd: 0.45 },
  },
];

// ── Time channel helpers ─────────────────────────────────────────────────────

/**
 * Assign TIME values: monotonically increasing, with realistic acquisition
 * noise and a small upward drift in one fluorescence channel (instrument warm-up).
 * Total acquisition duration ≈ 120 seconds (typical PBMC tube).
 */
function buildTimeChannel(nEvents: number, rng: SeededRNG): Float32Array {
  const times = new Float32Array(nEvents);
  // TIME is typically stored as ms × 10 (Beckman) or seconds (BD)
  // We use 0–12000 range (arbitrary units ≈ seconds × 100)
  const totalTime = 12000;
  for (let i = 0; i < nEvents; i++) {
    // Monotonically increasing with small jitter (events don't arrive at perfectly even rate)
    const base = (i / nEvents) * totalTime;
    const jitter = rng.normal(0, totalTime / nEvents * 0.3);
    times[i] = Math.max(0, base + jitter);
  }
  // Sort to guarantee monotonic (cytometer always outputs in time order)
  times.sort();
  return times;
}

// ── Spillover application ────────────────────────────────────────────────────

/**
 * Apply spillover to fluorescence channels only (columns 5–11).
 * Scatter channels are unaffected.
 *
 * For each event, the observed value in channel j = sum over all donors d
 * of (true signal in d) × spillover[d][j].
 *
 * We apply this only to the fluorescence sub-matrix for efficiency.
 */
function applySpillover(
  data: Float32Array,
  nEvents: number,
  nCh: number,
  spillover: Float64Array,
  fluoStart: number,    // first fluorescence channel index (5)
  nFluo: number,        // number of fluorescence channels (7)
): void {
  const buf = new Float64Array(nFluo);

  for (let e = 0; e < nEvents; e++) {
    const base = e * nCh + fluoStart;

    // Copy true values
    for (let j = 0; j < nFluo; j++) buf[j] = data[base + j]!;

    // Apply spillover: observed[j] = sum_d(true[d] * S[d][j])
    // S is indexed in the full channel space; we slice out the fluo block.
    for (let j = 0; j < nFluo; j++) {
      let observed = 0;
      const sj = fluoStart + j;
      for (let d = 0; d < nFluo; d++) {
        const sd = fluoStart + d;
        observed += buf[d]! * spillover[sd * nCh + sj]!;
      }
      data[base + j] = Math.max(FLUO_MIN_LINEAR, Math.min(FLUO_MAX_LINEAR, observed));
    }
  }
}

// ── Main generator ───────────────────────────────────────────────────────────

/**
 * Generate a realistic synthetic PBMC dataset.
 *
 * @param nEvents - Total event count (default 100,000)
 * @param seed    - RNG seed for reproducibility (default: fixed value)
 * @returns EventMatrix with channels and flat Float32Array data
 */
export function generatePBMCDemo(nEvents = 100_000, seed = 0xcafe1234): EventMatrix {
  const rng = new SeededRNG(seed);
  const channels = [...PBMC_CHANNELS];
  const nCh = channels.length;
  const data = new Float32Array(nEvents * nCh);

  // Normalise population fractions (they may not sum to exactly 1 due to rounding)
  const totalFrac = POPULATIONS.reduce((s, p) => s + p.fraction, 0);
  let eventStart = 0;

  for (const pop of POPULATIONS) {
    const popCount = Math.round((pop.fraction / totalFrac) * nEvents);
    const end = Math.min(eventStart + popCount, nEvents);

    for (let e = eventStart; e < end; e++) {
      const base = e * nCh;

      // ── Scatter channels (linear) ──────────────────────────────────────
      let fscA = rng.normal(pop.fscA.mean, pop.fscA.sd);
      let fscH = rng.normal(pop.fscH.mean, pop.fscH.sd);
      const sscA = rng.normal(pop.sscA.mean, pop.sscA.sd);
      const sscH = rng.normal(pop.sscH.mean, pop.sscH.sd);

      // Doublets: inflate FSC-A relative to FSC-H (elongated pulse)
      if (pop.isDoublet) {
        fscA = fscH * (1.12 + rng.next() * 0.15);
      }

      data[base + CH.FSC_A] = Math.max(100, Math.min(SCATTER_MAX, fscA));
      data[base + CH.FSC_H] = Math.max(100, Math.min(SCATTER_MAX, fscH));
      data[base + CH.SSC_A] = Math.max(100, Math.min(SCATTER_MAX, sscA));
      data[base + CH.SSC_H] = Math.max(100, Math.min(SCATTER_MAX, sscH));

      // TIME — will be overwritten below with monotonic values
      data[base + CH.TIME] = 0;

      // ── Fluorescence channels (log-normal) ────────────────────────────
      // We clamp to instrument range after applying spillover.
      data[base + CH.FITC]  = Math.pow(10, rng.normal(pop.fitc.mean,  pop.fitc.sd));
      data[base + CH.PE]    = Math.pow(10, rng.normal(pop.pe.mean,    pop.pe.sd));
      data[base + CH.APC]   = Math.pow(10, rng.normal(pop.apc.mean,   pop.apc.sd));
      data[base + CH.BV421] = Math.pow(10, rng.normal(pop.bv421.mean, pop.bv421.sd));
      data[base + CH.PECY7] = Math.pow(10, rng.normal(pop.pecy7.mean, pop.pecy7.sd));
      data[base + CH.LDEAD] = Math.pow(10, rng.normal(pop.ldead.mean, pop.ldead.sd));
      data[base + CH.PERCP] = Math.pow(10, rng.normal(pop.percp.mean, pop.percp.sd));
    }

    eventStart = end;
  }

  // Fill any leftover events (rounding) as debris
  const debrisPop = POPULATIONS[0]!;
  for (let e = eventStart; e < nEvents; e++) {
    const base = e * nCh;
    data[base + CH.FSC_A] = Math.max(100, rng.normal(debrisPop.fscA.mean, debrisPop.fscA.sd));
    data[base + CH.FSC_H] = Math.max(100, rng.normal(debrisPop.fscH.mean, debrisPop.fscH.sd));
    data[base + CH.SSC_A] = Math.max(100, rng.normal(debrisPop.sscA.mean, debrisPop.sscA.sd));
    data[base + CH.SSC_H] = Math.max(100, rng.normal(debrisPop.sscH.mean, debrisPop.sscH.sd));
    data[base + CH.FITC]  = Math.pow(10, rng.normal(LOG_AUTOFLUOR, 0.3));
    data[base + CH.PE]    = Math.pow(10, rng.normal(LOG_AUTOFLUOR, 0.3));
    data[base + CH.APC]   = Math.pow(10, rng.normal(LOG_AUTOFLUOR, 0.25));
    data[base + CH.BV421] = Math.pow(10, rng.normal(LOG_AUTOFLUOR, 0.28));
    data[base + CH.PECY7] = Math.pow(10, rng.normal(LOG_AUTOFLUOR, 0.25));
    data[base + CH.LDEAD] = Math.pow(10, rng.normal(2.4, 0.4));
    data[base + CH.PERCP] = Math.pow(10, rng.normal(LOG_AUTOFLUOR, 0.28));
  }

  // ── Shuffle events so populations aren't in order ──────────────────────
  // Fisher-Yates on event indices
  for (let i = nEvents - 1; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1));
    // Swap rows i and j
    const baseI = i * nCh;
    const baseJ = j * nCh;
    for (let c = 0; c < nCh; c++) {
      const tmp = data[baseI + c]!;
      data[baseI + c] = data[baseJ + c]!;
      data[baseJ + c] = tmp;
    }
  }

  // ── Apply spillover ────────────────────────────────────────────────────
  const { values: spilloverVals } = getPBMCSpilloverMatrix();
  const fluoStart = CH.FITC;   // 5
  const nFluo = nCh - fluoStart;  // 7 (FITC through PerCP-Cy5.5)
  applySpillover(data, nEvents, nCh, spilloverVals, fluoStart, nFluo);

  // ── TIME channel: monotonic with jitter ────────────────────────────────
  const times = buildTimeChannel(nEvents, rng);
  for (let e = 0; e < nEvents; e++) {
    data[e * nCh + CH.TIME] = times[e]!;
  }

  return {
    data,
    channels,
    eventCount: nEvents,
  };
}

// ── Population metadata (useful for overlays / gate suggestions) ──────────────

export interface PopulationInfo {
  name: string;
  fraction: number;
  positiveMarkers: string[];
  negativeMarkers: string[];
  /** Approximate expected % of total events */
  expectedPercent: number;
}

/**
 * Returns metadata about each PBMC population in the demo dataset.
 * Useful for building initial gate suggestions or tutorial tooltips.
 */
export function getPBMCPopulationInfo(): PopulationInfo[] {
  return [
    {
      name: 'Debris',
      fraction: 0.08,
      positiveMarkers: [],
      negativeMarkers: [],
      expectedPercent: 8,
    },
    {
      name: 'Doublets',
      fraction: 0.03,
      positiveMarkers: [],
      negativeMarkers: [],
      expectedPercent: 3,
    },
    {
      name: 'Dead cells',
      fraction: 0.05,
      positiveMarkers: ['LD-eF780'],
      negativeMarkers: [],
      expectedPercent: 5,
    },
    {
      name: 'Granulocytes',
      fraction: 0.05,
      positiveMarkers: [],
      negativeMarkers: ['CD3-FITC', 'CD19-BV421'],
      expectedPercent: 5,
    },
    {
      name: 'CD4 T cells',
      fraction: 0.217,
      positiveMarkers: ['CD3-FITC', 'CD4-PE'],
      negativeMarkers: ['CD8-APC', 'CD19-BV421', 'LD-eF780'],
      expectedPercent: 21.7,
    },
    {
      name: 'CD8 T cells',
      fraction: 0.136,
      positiveMarkers: ['CD3-FITC', 'CD8-APC'],
      negativeMarkers: ['CD4-PE', 'CD19-BV421', 'LD-eF780'],
      expectedPercent: 13.6,
    },
    {
      name: 'DN T cells',
      fraction: 0.031,
      positiveMarkers: ['CD3-FITC'],
      negativeMarkers: ['CD4-PE', 'CD8-APC', 'CD19-BV421', 'LD-eF780'],
      expectedPercent: 3.1,
    },
    {
      name: 'B cells',
      fraction: 0.095,
      positiveMarkers: ['CD19-BV421', 'HLA-DR-PerCPCy55'],
      negativeMarkers: ['CD3-FITC', 'LD-eF780'],
      expectedPercent: 9.5,
    },
    {
      name: 'NK cells',
      fraction: 0.063,
      positiveMarkers: ['CD56-PE-Cy7'],
      negativeMarkers: ['CD3-FITC', 'CD19-BV421', 'LD-eF780'],
      expectedPercent: 6.3,
    },
    {
      name: 'Monocytes',
      fraction: 0.111,
      positiveMarkers: ['HLA-DR-PerCPCy55'],
      negativeMarkers: ['CD3-FITC', 'CD19-BV421', 'CD56-PE-Cy7', 'LD-eF780'],
      expectedPercent: 11.1,
    },
    {
      name: 'Other live',
      fraction: 0.032,
      positiveMarkers: [],
      negativeMarkers: ['LD-eF780'],
      expectedPercent: 3.2,
    },
  ];
}
