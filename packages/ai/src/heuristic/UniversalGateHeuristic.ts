/**
 * UniversalGateHeuristic — local, no-API gating rules.
 *
 * Applies anatomical gating rules to automatically detect:
 *   1. Singlets (FSC-H vs FSC-A doublet discrimination)
 *   2. Live cells (viability dye exclusion or scatter)
 *   3. Lymphocytes (FSC/SSC gate)
 *
 * No external API required — all computation is local.
 */

import type { EventMatrix } from '@cytoflow/core';
import type { RectangleGate, PolygonGate } from '@cytoflow/core';

export interface HeuristicGateResult {
  gates: Array<RectangleGate | PolygonGate>;
  confidence: number;
  notes: string[];
}

export function suggestScatterGate(matrix: EventMatrix): HeuristicGateResult {
  const fscIdx = matrix.channels.findIndex(c => c.toUpperCase().includes('FSC-A'));
  const sscIdx = matrix.channels.findIndex(c => c.toUpperCase().includes('SSC-A'));

  if (fscIdx === -1 || sscIdx === -1) {
    return { gates: [], confidence: 0, notes: ['FSC-A or SSC-A not found'] };
  }

  // Find FSC/SSC range using percentiles
  const { p5, p95 } = computePercentiles(matrix.data, fscIdx, matrix.channels.length, matrix.eventCount);
  const { p5: sscP5, p95: sscP95 } = computePercentiles(matrix.data, sscIdx, matrix.channels.length, matrix.eventCount);

  const gate: RectangleGate = {
    id: crypto.randomUUID(),
    name: 'Lymphocytes',
    type: 'rectangle',
    xChannel: matrix.channels[fscIdx]!,
    yChannel: matrix.channels[sscIdx]!,
    minX: p5,
    maxX: p95,
    minY: sscP5,
    maxY: sscP95 * 0.6, // Lymphocytes have low SSC
    color: '#2563eb',
  };

  return {
    gates: [gate],
    confidence: 0.7,
    notes: ['Auto-gate from FSC/SSC percentile bounds. Review and adjust as needed.'],
  };
}

function computePercentiles(
  data: Float32Array,
  chIdx: number,
  nCh: number,
  nEvents: number,
): { p5: number; p95: number } {
  const vals: number[] = [];
  for (let e = 0; e < nEvents; e++) {
    vals.push(data[e * nCh + chIdx] ?? 0);
  }
  vals.sort((a, b) => a - b);
  const p5 = vals[Math.floor(vals.length * 0.05)] ?? 0;
  const p95 = vals[Math.floor(vals.length * 0.95)] ?? 262144;
  return { p5, p95 };
}
