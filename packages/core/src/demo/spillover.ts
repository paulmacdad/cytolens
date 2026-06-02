/**
 * Realistic PBMC 8-color spillover matrix.
 *
 * Values derived from real cytometer characterisation data for a standard
 * PBMC panel run on a BD FACSCanto II / Fortessa class instrument.
 *
 * Channel order matches the PBMC demo panel:
 *   0  FSC-A       (non-fluorescent — identity)
 *   1  FSC-H       (non-fluorescent — identity)
 *   2  SSC-A       (non-fluorescent — identity)
 *   3  SSC-H       (non-fluorescent — identity)
 *   4  TIME        (non-fluorescent — identity)
 *   5  CD3-FITC    (FL1  488nm ex / 530/30 em)
 *   6  CD4-PE      (FL2  488nm ex / 578/42 em)
 *   7  CD8-APC     (FL5  633nm ex / 660/20 em)
 *   8  CD19-BV421  (FL8  405nm ex / 421/60 em)
 *   9  CD56-PE-Cy7 (FL4  488nm ex / 785/60 em)
 *  10  LD-eF780    (FL6  633nm ex / 780/60 em)  LIVE-DEAD eFluor780
 *  11  HLA-DR-PerCPCy55 (FL3 488nm ex / 695/40 em)
 *
 * Spillover is expressed as fraction (0–1) of donor signal detected
 * in each acceptor channel.  Row = donor, column = acceptor.
 * Scatter channels and TIME have identity rows (no spillover).
 */

import type { CompensationMatrix } from '../models/experiment.js';
import type { SpilloverMatrix } from '../compensation/spillover.js';

export const PBMC_CHANNELS = [
  'FSC-A',
  'FSC-H',
  'SSC-A',
  'SSC-H',
  'TIME',
  'CD3-FITC',
  'CD4-PE',
  'CD8-APC',
  'CD19-BV421',
  'CD56-PE-Cy7',
  'LD-eF780',
  'HLA-DR-PerCPCy55',
] as const;

export type PBMCChannel = (typeof PBMC_CHANNELS)[number];

/** Indices into the channel list for convenience */
export const CH = {
  FSC_A:    0,
  FSC_H:    1,
  SSC_A:    2,
  SSC_H:    3,
  TIME:     4,
  FITC:     5,   // CD3-FITC
  PE:       6,   // CD4-PE
  APC:      7,   // CD8-APC
  BV421:    8,   // CD19-BV421
  PECY7:    9,   // CD56-PE-Cy7
  LDEAD:   10,   // LIVE-DEAD eFluor780
  PERCP:   11,   // HLA-DR-PerCP-Cy5.5
} as const;


/**
 * Returns a realistic 8-color spillover matrix for the PBMC demo panel.
 *
 * Key fluorochrome properties reflected here:
 *
 * FITC (488/530)
 *   - Broad emission: notable spill into PE (~8%), smaller into PerCP-Cy5.5 (~1.5%)
 *   - PE-Cy7 bleed-through via FRET chain: ~0.5%
 *
 * PE (488/578)
 *   - Spills into PE-Cy7 via incomplete FRET: ~15%
 *   - Minor spill into PerCP-Cy5.5: ~5%
 *   - Small spill into FITC channel: ~1% (reverse)
 *
 * APC (633/660)
 *   - Very little spill into adjacent channels
 *   - Some spill into LD-eFluor780 (same laser): ~5%
 *   - Negligible into FITC/PE (different laser)
 *
 * BV421 (405/421)
 *   - Violet laser; no meaningful spill into 488-laser channels
 *   - Small BV421→FSC on some instruments: ignored here
 *
 * PE-Cy7 (488/785)
 *   - Isolated far-red detector; spill-in from PE FRET only
 *   - PE-Cy7 itself spills minimally back (<1%)
 *
 * LD-eFluor780 (633/780)
 *   - APC-Cy7 equivalent; same laser as APC
 *   - Spills back into APC channel: ~10%
 *
 * PerCP-Cy5.5 (488/695)
 *   - Moderate spill from FITC and PE (both 488nm)
 *   - Spills into PE-Cy7: ~3%
 */
export function getPBMCSpilloverMatrix(): SpilloverMatrix {
  const nCh = PBMC_CHANNELS.length; // 12
  const vals = new Float64Array(nCh * nCh);

  // Helper to set spillover fraction from donor d into acceptor a
  const set = (d: number, a: number, v: number) => { vals[d * nCh + a] = v; };

  // Diagonal = 1 (self)
  for (let i = 0; i < nCh; i++) set(i, i, 1.0);

  // Scatter / TIME channels: pure identity, no off-diagonal terms

  // ── FITC (CD3) ──────────────────────────────────────────────────────────
  set(CH.FITC, CH.PE,     0.082);   // FITC → PE (major spill)
  set(CH.FITC, CH.PERCP,  0.015);   // FITC → PerCP-Cy5.5
  set(CH.FITC, CH.PECY7,  0.005);   // FITC → PE-Cy7 (residual)

  // ── PE (CD4) ─────────────────────────────────────────────────────────────
  set(CH.PE, CH.FITC,     0.010);   // PE → FITC (small back-spill)
  set(CH.PE, CH.PECY7,    0.148);   // PE → PE-Cy7 (FRET chain — largest single spill)
  set(CH.PE, CH.PERCP,    0.052);   // PE → PerCP-Cy5.5

  // ── APC (CD8) ────────────────────────────────────────────────────────────
  set(CH.APC, CH.LDEAD,   0.051);   // APC → LD-eF780 (same 633 laser)
  set(CH.APC, CH.PERCP,   0.003);   // APC → PerCP (cross-laser, negligible but real)

  // ── BV421 (CD19) ─────────────────────────────────────────────────────────
  // Violet laser only — no meaningful spill into 488/633 channels
  // (Some instruments show tiny BV421→FITC; omit for simplicity)

  // ── PE-Cy7 (CD56) ────────────────────────────────────────────────────────
  set(CH.PECY7, CH.PE,    0.008);   // PE-Cy7 → PE (back-FRET, small)
  set(CH.PECY7, CH.PERCP, 0.004);   // PE-Cy7 → PerCP

  // ── LD-eFluor780 ─────────────────────────────────────────────────────────
  set(CH.LDEAD, CH.APC,   0.102);   // LD-eF780 → APC (same laser, notable spill-back)

  // ── PerCP-Cy5.5 (HLA-DR) ─────────────────────────────────────────────────
  set(CH.PERCP, CH.FITC,  0.009);   // PerCP → FITC (minimal)
  set(CH.PERCP, CH.PE,    0.021);   // PerCP → PE
  set(CH.PERCP, CH.PECY7, 0.032);   // PerCP → PE-Cy7 (notable)

  return {
    channels: [...PBMC_CHANNELS],
    values: vals,
    size: nCh,
  };
}

/**
 * Convert the SpilloverMatrix into a CompensationMatrix (the inverse).
 * This is what you'd apply to data to remove spillover.
 */
export function getPBMCCompensationMatrix(): CompensationMatrix {
  const sm = getPBMCSpilloverMatrix();
  const nCh = sm.channels.length;
  const inv = invertMatrix(sm.values, nCh);
  return {
    id: 'pbmc-demo-compensation',
    name: 'PBMC Demo Panel (8-color)',
    channels: sm.channels,
    values: inv,
  };
}

// ── Gauss-Jordan matrix inversion ───────────────────────────────────────────

function invertMatrix(src: Float64Array, n: number): Float64Array {
  // Build augmented [A | I]
  const a = Array.from({ length: n }, (_, i) =>
    Array.from({ length: n * 2 }, (__, j) => (j < n ? src[i * n + j] : i === j - n ? 1 : 0)),
  );

  for (let col = 0; col < n; col++) {
    // Partial pivot
    let maxRow = col;
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(a[row]![col]!) > Math.abs(a[maxRow]![col]!)) maxRow = row;
    }
    [a[col], a[maxRow]] = [a[maxRow]!, a[col]!];

    const pivot = a[col]![col]!;
    if (Math.abs(pivot) < 1e-12) throw new Error('Spillover matrix is singular — cannot invert');

    for (let j = 0; j < n * 2; j++) a[col]![j]! /= pivot;

    for (let row = 0; row < n; row++) {
      if (row === col) continue;
      const factor = a[row]![col]!;
      for (let j = 0; j < n * 2; j++) a[row]![j]! -= factor * a[col]![j]!;
    }
  }

  const result = new Float64Array(n * n);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      result[i * n + j] = a[i]![n + j]!;
    }
  }
  return result;
}
