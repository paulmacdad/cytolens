/**
 * WasmGatingEngine — TypeScript wrapper for Rust polygon_gate WASM function.
 *
 * Falls back to the TS implementation in @cytolens/core if WASM is unavailable.
 */

export interface WasmGatingEngine {
  polygonGate(
    xVals: Float32Array,
    yVals: Float32Array,
    vertexX: Float32Array,
    vertexY: Float32Array,
  ): Uint8Array;
  isAvailable: boolean;
}

let _module: { polygon_gate?: (...args: unknown[]) => Uint8Array } | null = null;

export async function loadWasmGatingEngine(): Promise<WasmGatingEngine> {
  try {
    // Dynamic import — wasm-pack output
    // @ts-ignore
    _module = await import('../pkg/cytoflow_wasm.js');
    return {
      isAvailable: true,
      polygonGate(xVals, yVals, vx, vy) {
        return _module!.polygon_gate!(xVals, yVals, vx, vy);
      },
    };
  } catch {
    return {
      isAvailable: false,
      polygonGate(xVals, yVals, vx, vy) {
        // Pure TS fallback — ray casting
        const n = xVals.length;
        const nv = vx.length;
        const mask = new Uint8Array(n);
        for (let i = 0; i < n; i++) {
          mask[i] = pointInPoly(xVals[i]!, yVals[i]!, vx, vy, nv) ? 1 : 0;
        }
        return mask;
      },
    };
  }
}

function pointInPoly(x: number, y: number, vx: Float32Array, vy: Float32Array, nv: number): boolean {
  let inside = false;
  let j = nv - 1;
  for (let i = 0; i < nv; i++) {
    const xi = vx[i]!, yi = vy[i]!, xj = vx[j]!, yj = vy[j]!;
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
    j = i;
  }
  return inside;
}
