/**
 * Logicle transform — Parks 2006 algorithm.
 *
 * References:
 *   Parks DR, Roederer M, Moore WA. "A new logicle display method avoids
 *   deceptive effects of logarithmic scaling for low signals and
 *   compensated data." Cytometry A. 2006;69(6):541-51.
 *
 *   Moore WA, Parks DR. "Update for the Logicle Data Scale Including
 *   Operational Code Implementations." Cytometry A. 2012;81(4):273-7.
 *
 * The logicle function is defined as:
 *
 *   S(x) = (1/log(10)) * (W + (T - W * exp(-x/W)) / exp(log(10)*W))
 *
 * More precisely, it solves the implicit function using the
 * Taylor series approximation of the hypergeometric series.
 */

export interface LogicleParams {
  /** Maximum value (top of scale). Typically instrument max, e.g. 262144 */
  T: number;
  /** Width of the linear segment in decades */
  W: number;
  /** Number of additional decades of negative range */
  M: number;
  /** Additional width in linear range (0 for basic logicle) */
  A: number;
}

export interface BiexponentialParams {
  /** Positive decades */
  pos: number;
  /** Negative decades */
  neg: number;
  /** Width parameter */
  width: number;
  /** Max value */
  maxValue: number;
}

const LN10 = Math.LN10;
const LOG2E = Math.LOG2E;

/**
 * Compute a logicle lookup table for fast per-event application.
 *
 * Returns a Float32Array of length `bins` mapping [0..1] fractional bin
 * positions to display values in the range [min, max].
 */
export function buildLogicleTable(params: LogicleParams, bins = 4096): Float32Array {
  const table = new Float32Array(bins);
  const solver = createLogicle(params);
  for (let i = 0; i < bins; i++) {
    table[i] = solver.scale(i / (bins - 1));
  }
  return table;
}

export interface LogicleTransform {
  /** Forward: raw value → display [0..1] */
  scale(value: number): number;
  /** Inverse: display [0..1] → raw value */
  inverse(display: number): number;
  params: LogicleParams;
}

/**
 * Create a logicle transform function pair (forward + inverse).
 *
 * The algorithm uses Newton-Raphson iteration with the Taylor series
 * to solve the transcendental equation efficiently.
 */
export function createLogicle(params: LogicleParams): LogicleTransform {
  const { T, W, M, A } = params;

  if (T <= 0) throw new Error('Logicle T must be > 0');
  if (W < 0) throw new Error('Logicle W must be >= 0');
  if (M <= 0) throw new Error('Logicle M must be > 0');
  if (2 * W > M) throw new Error('Logicle W must be <= M/2');

  // Pre-compute constants
  // x1 = point where linear segment ends (upper)
  // x2 = point where linear segment starts (lower)
  const w = W / (M + A);
  const x2 = A / (M + A);
  const x1 = x2 + w;
  const x0 = x2 + 2 * w;
  const b = (M + A) * LN10;
  const e0 = Math.exp(-b * x0);

  // Precompute Taylor series coefficients for the linearised region
  // These are constants for this particular transform instance
  const xTaylor = x1 + w / 2;
  const taylorCoeffs = computeTaylorCoeffs(b, w, xTaylor, 16);

  // Parameters for the linear portion
  const slope = linearSlope(b, w, x0, e0);

  function logicleForward(value: number): number {
    // Rescale value to [0..1] space
    const x = value / T;

    // Upper exponential region (positive values above linear portion)
    if (x >= x1) {
      return (M + A) * log(x, b);
    }

    // Linear region
    if (x >= x0) {
      return (M + A) * ((x - x0) * slope + log(x0, b));
    }

    // Taylor series region (near zero / transition)
    if (x >= xTaylor - w / 2) {
      let result = 0;
      let power = x - xTaylor;
      for (const coeff of taylorCoeffs) {
        result += coeff * power;
        power *= x - xTaylor;
      }
      return result;
    }

    // Lower exponential region (negative / below linear)
    return -(M + A) * log(-x, b);
  }

  function logicleInverse(display: number): number {
    // Clamp to valid display range
    const d = Math.max(0, Math.min(1, display));

    // Rescale to logicle space
    const scaled = d * (M + A) - A;

    // Invert using Newton-Raphson
    // Initial guess from display value
    let x = scaled > 1 ? Math.exp(scaled * LN10 - Math.log(T)) :
             scaled < -1 ? -Math.exp(-scaled * LN10 - Math.log(T)) :
             scaled / (M + A);

    // Newton-Raphson iteration (5 steps sufficient for float32 precision)
    for (let i = 0; i < 5; i++) {
      const fx = logicleForward(x * T) / (M + A) - d;
      const dfx = logicleDerivative(x * T, b, T, x0, x1, slope, e0);
      const step = fx / dfx;
      x -= step;
      if (Math.abs(step) < 1e-10) break;
    }

    return x * T;
  }

  return {
    scale: (value: number) => {
      const d = logicleForward(value);
      return (d + A) / (M + A);
    },
    inverse: logicleInverse,
    params,
  };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function log(x: number, b: number): number {
  return Math.log(Math.abs(x)) / b + 1 / b;
}

function linearSlope(b: number, w: number, x0: number, e0: number): number {
  return 1 / (b * (Math.exp(b * x0) + e0));
}

function computeTaylorCoeffs(b: number, w: number, center: number, order: number): number[] {
  const coeffs: number[] = [];
  let fact = 1;
  for (let n = 0; n < order; n++) {
    if (n > 0) fact *= n;
    // d^n/dx^n of the logicle function at center, divided by n!
    // For the linear region: derivative alternates between exp terms
    const sign = n % 2 === 0 ? 1 : -1;
    coeffs.push(sign * Math.pow(b, n) * Math.exp(-b * center) / fact);
  }
  return coeffs;
}

function logicleDerivative(value: number, b: number, T: number, x0: number, x1: number, slope: number, e0: number): number {
  const x = value / T;
  if (x >= x1) {
    return 1 / (T * b * Math.abs(x));
  }
  if (x >= x0) {
    return slope / T;
  }
  // Approximate with the exponential derivative
  return 1 / (T * b * Math.abs(x));
}

// ---------------------------------------------------------------------------
// Biexponential transform
// ---------------------------------------------------------------------------

/**
 * Biexponential transform (Herzenberg lab variant).
 *
 * Equivalent to logicle with specific parameter choices.
 * Provided for compatibility with FCS Express / Summit export files.
 */
export function createBiexponential(params: BiexponentialParams): LogicleTransform {
  const { pos, neg, width, maxValue } = params;
  // Convert biexponential params to logicle params
  const T = maxValue;
  const M = pos;
  const A = neg;
  const W = width;
  return createLogicle({ T, W, M, A });
}

// ---------------------------------------------------------------------------
// Linear transform
// ---------------------------------------------------------------------------

export interface LinearTransformParams {
  gain: number;
  offset: number;
}

export function createLinear(params: LinearTransformParams) {
  return {
    scale: (value: number) => value * params.gain + params.offset,
    inverse: (display: number) => (display - params.offset) / params.gain,
    params,
  };
}

// ---------------------------------------------------------------------------
// Log transform
// ---------------------------------------------------------------------------

export interface LogTransformParams {
  /** Number of decades */
  decades: number;
  /** Maximum value */
  maxValue: number;
}

export function createLog(params: LogTransformParams) {
  const { decades, maxValue } = params;
  return {
    scale: (value: number) => {
      if (value <= 0) return 0;
      return Math.log10(value / maxValue * Math.pow(10, decades)) / decades;
    },
    inverse: (display: number) => {
      return maxValue * Math.pow(10, display * decades - decades);
    },
    params,
  };
}

// ---------------------------------------------------------------------------
// Default logicle parameters for common cytometer configurations
// ---------------------------------------------------------------------------

export const LOGICLE_PRESETS = {
  /** BD LSR Fortessa / FACSAria — typical 18-bit ADC */
  BD_18BIT: { T: 262144, W: 0.5, M: 4.5, A: 0 } satisfies LogicleParams,
  /** BD Influx — 20-bit ADC */
  BD_20BIT: { T: 1048576, W: 0.5, M: 4.5, A: 0 } satisfies LogicleParams,
  /** Beckman Coulter CytoFLEX */
  CYTOFLEX: { T: 4194304, W: 0.5, M: 4.5, A: 0 } satisfies LogicleParams,
  /** Miltenyi MACSQuant — 14-bit ADC */
  MACSQUANT: { T: 16384, W: 0.5, M: 4.5, A: 0 } satisfies LogicleParams,
} as const;
