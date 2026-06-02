/**
 * Spillover matrix parsing and compensation matrix construction.
 *
 * Handles the $SPILLOVER / $SPILL keyword from the FCS TEXT segment.
 * The keyword format (FCS 3.1 spec §3.2.17) is:
 *   "N,F1,F2,...,FN,v11,v12,...,vNN"
 * where N = number of channels, F1..FN = channel names,
 * and the vij values are laid out row-major so that v[i*N + j] is the
 * fraction of fluorochrome i detected in channel j.
 */

/**
 * Parsed representation of an FCS spillover / compensation matrix.
 */
export interface SpilloverMatrix {
  /** Ordered channel names (length === size). */
  channels: string[];
  /** Row-major N×N spillover values. Length === size * size. */
  values: Float64Array;
  /** Number of channels N. */
  size: number;
}

/**
 * Parse a raw $SPILLOVER / $SPILL keyword value into a SpilloverMatrix.
 *
 * Returns `null` when the keyword is absent, empty, or malformed.
 *
 * @param keyword - Raw keyword value string from the FCS TEXT segment.
 */
export function parseSpilloverKeyword(keyword: string | null | undefined): SpilloverMatrix | null {
  if (!keyword || keyword.trim() === '') return null;

  const parts = keyword.split(',').map((s) => s.trim());
  if (parts.length < 1) return null;

  const n = parseInt(parts[0], 10);
  if (!Number.isFinite(n) || n < 1) return null;

  // Expect: 1 (N) + N (channel names) + N*N (values)
  const expected = 1 + n + n * n;
  if (parts.length < expected) return null;

  const channels: string[] = [];
  for (let i = 1; i <= n; i++) {
    channels.push(parts[i]);
  }

  const values = new Float64Array(n * n);
  for (let i = 0; i < n * n; i++) {
    const v = parseFloat(parts[1 + n + i]);
    if (!Number.isFinite(v)) return null;
    values[i] = v;
  }

  return { channels, values, size: n };
}

/**
 * Build the compensation matrix (S^-1) from a spillover matrix (S).
 *
 * Flow cytometry compensation is defined as:
 *   compensated = raw x S^-1
 *
 * The returned Float64Array is a row-major N×N matrix.
 * Throws if the spillover matrix is singular (non-invertible).
 *
 * @param spillover - Parsed spillover matrix.
 */
export function buildCompensationMatrix(spillover: SpilloverMatrix): Float64Array {
  return invertMatrix(spillover.values, spillover.size);
}

/**
 * Invert an N×N matrix stored as a flat row-major Float64Array.
 * Uses Gauss-Jordan elimination with partial pivoting.
 * Supports N up to 64 (adequate for all current cytometry panels).
 *
 * @param matrix - Row-major N×N input matrix (not mutated).
 * @param n      - Matrix dimension.
 * @returns Row-major N×N inverse matrix.
 * @throws {Error} if the matrix is singular or n > 64.
 */
export function invertMatrix(matrix: Float64Array, n: number): Float64Array {
  if (n > 64) throw new Error('invertMatrix: n=' + n + ' exceeds maximum supported dimension 64');
  if (matrix.length !== n * n) throw new Error('invertMatrix: matrix length does not match n*n');

  // Augmented matrix [A | I] as a plain number array for mutation
  const aug: number[] = new Array(n * 2 * n);
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      aug[r * 2 * n + c] = matrix[r * n + c];
      aug[r * 2 * n + n + c] = r === c ? 1.0 : 0.0;
    }
  }

  // Forward elimination with partial pivoting
  for (let col = 0; col < n; col++) {
    // Find pivot row (max absolute value in this column)
    let maxVal = Math.abs(aug[col * 2 * n + col]);
    let maxRow = col;
    for (let r = col + 1; r < n; r++) {
      const v = Math.abs(aug[r * 2 * n + col]);
      if (v > maxVal) { maxVal = v; maxRow = r; }
    }

    if (maxVal < 1e-14) throw new Error('invertMatrix: matrix is singular or near-singular');

    // Swap rows col <-> maxRow
    if (maxRow !== col) {
      for (let c = 0; c < 2 * n; c++) {
        const tmp = aug[col * 2 * n + c];
        aug[col * 2 * n + c] = aug[maxRow * 2 * n + c];
        aug[maxRow * 2 * n + c] = tmp;
      }
    }

    // Scale pivot row so diagonal becomes 1
    const pivotInv = 1.0 / aug[col * 2 * n + col];
    for (let c = 0; c < 2 * n; c++) {
      aug[col * 2 * n + c] *= pivotInv;
    }

    // Eliminate this column in all other rows (full Gauss-Jordan)
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const factor = aug[r * 2 * n + col];
      if (factor === 0) continue;
      for (let c = 0; c < 2 * n; c++) {
        aug[r * 2 * n + c] -= factor * aug[col * 2 * n + c];
      }
    }
  }

  // Extract right half — that is now the inverse
  const inv = new Float64Array(n * n);
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      inv[r * n + c] = aug[r * 2 * n + n + c];
    }
  }
  return inv;
}
