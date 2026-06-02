/**
 * Experiment-level statistics.
 *
 * Aggregates per-population stats across the full gate hierarchy for one
 * sample. The output is a flat list of PopulationStats (one per gate),
 * with parent/total counts wired up from the GateResult map.
 *
 * Usage:
 *   const result = applyGateHierarchy(roots, matrix);
 *   const stats  = computeExperimentStats(result.nodeResults, matrix, roots);
 */

import type { GateResult }         from '../gating/gate.js';
import type { GateNode }           from '../gating/gate.js';
import type { EventMatrix }        from '../gating/engine.js';
import { computePopulationStats }  from './population.js';
import type { PopulationStats }    from './population.js';

export type { PopulationStats } from './population.js';

export interface ExperimentStats {
  sampleId: string;
  populations: PopulationStats[];
  /** Unix timestamp (ms) when stats were computed */
  computedAt: number;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Compute statistics for every gated population in the experiment.
 *
 * @param gateResults - Map of gateId → GateResult from `applyGateHierarchy`
 * @param matrix      - Event data matrix (same one used for gating)
 * @param gateNodes   - Root gate nodes of the hierarchy
 * @param sampleId    - Identifier for the sample (FCS file name / UUID)
 */
export function computeExperimentStats(
  gateResults: Map<string, GateResult>,
  matrix: EventMatrix,
  gateNodes: GateNode[],
  sampleId = 'unknown',
): ExperimentStats {
  const populations: PopulationStats[] = [];

  // Build an all-ones mask representing the total event count
  const allEventsMask = makeAllOnes(matrix.eventCount);

  // Walk the full hierarchy depth-first; pass parent mask down so percentages
  // are computed against the correct parent population.
  for (const node of gateNodes) {
    collectStats(
      node,
      allEventsMask,   // roots are children of "all events"
      gateResults,
      matrix,
      populations,
    );
  }

  return {
    sampleId,
    populations,
    computedAt: Date.now(),
  };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Recursively walk the gate tree, accumulating PopulationStats.
 *
 * @param node       - Current gate node
 * @param parentMask - Mask of the parent gate (or all-events for roots)
 * @param results    - Full map of gate results for cross-population lookups
 * @param matrix     - Event matrix
 * @param out        - Accumulator array
 */
function collectStats(
  node: GateNode,
  parentMask: Uint8Array,
  results: Map<string, GateResult>,
  matrix: EventMatrix,
  out: PopulationStats[],
): void {
  const result = results.get(node.gate.id);

  if (!result) {
    // Gate was not evaluated (e.g. boolean gate stub) — skip but recurse
    // using parent mask so children are not silently dropped.
    for (const child of node.children) {
      collectStats(child, parentMask, results, matrix, out);
    }
    return;
  }

  const stats = computePopulationStats(
    node.gate.id,
    node.gate.name,
    result.mask,
    parentMask,
    matrix,
  );

  out.push(stats);

  // Recurse: children use this gate's mask as their parent
  for (const child of node.children) {
    collectStats(child, result.mask, results, matrix, out);
  }
}

function makeAllOnes(length: number): Uint8Array {
  const mask = new Uint8Array(length);
  mask.fill(1);
  return mask;
}
