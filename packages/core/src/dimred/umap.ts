import { UMAP } from 'umap-js';
import type { EventMatrix } from '../gating/engine.js';

export interface UMAPOptions {
  nNeighbors?: number;    // default 15
  minDist?: number;       // default 0.1
  nEpochs?: number;       // default 200
  spread?: number;        // default 1.0
  /** Max events to subsample for UMAP (performance). Default 20000 */
  maxEvents?: number;
  /** Which channels to use. Default: all non-scatter, non-time channels */
  channels?: string[];
  onProgress?: (epoch: number, total: number) => void;
}

export interface UMAPResult {
  /** Flat [x0, y0, x1, y1, ...] for nEvents (or sampled subset) */
  embedding: Float32Array;
  usedEvents: number;
  usedChannels: string[];
  durationMs: number;
}

const ARCSINH_COFACTOR = 150;

function arcsinh(x: number): number {
  return Math.log(x / ARCSINH_COFACTOR + Math.sqrt((x / ARCSINH_COFACTOR) ** 2 + 1));
}

/** Channels to exclude: scatter, time, height, width */
const EXCLUDE_PATTERNS = ['FSC', 'SSC', 'TIME', '-H', '-W'];

function autoSelectChannels(channels: string[]): string[] {
  return channels.filter(ch => {
    const upper = ch.toUpperCase();
    return !EXCLUDE_PATTERNS.some(p => upper.includes(p.toUpperCase()));
  });
}

export async function runUMAP(matrix: EventMatrix, options: UMAPOptions = {}): Promise<UMAPResult> {
  const t0 = performance.now();

  const {
    nNeighbors = 15,
    minDist = 0.1,
    nEpochs = 200,
    spread = 1.0,
    maxEvents = 20000,
    channels: requestedChannels,
    onProgress,
  } = options;

  // Resolve channels
  const usedChannels = requestedChannels ?? autoSelectChannels(matrix.channels);
  if (usedChannels.length === 0) {
    throw new Error('No channels available for UMAP after exclusion of scatter/time/height/width channels.');
  }

  const channelIndices = usedChannels.map(ch => {
    const idx = matrix.channels.indexOf(ch);
    if (idx === -1) throw new Error(`Channel "${ch}" not found in event matrix.`);
    return idx;
  });

  const nCh = matrix.channels.length;
  const totalEvents = matrix.eventCount;

  // Subsample
  let indices: number[];
  if (totalEvents <= maxEvents) {
    indices = Array.from({ length: totalEvents }, (_, i) => i);
  } else {
    // Uniform random subsample
    const step = totalEvents / maxEvents;
    indices = [];
    for (let i = 0; i < maxEvents; i++) {
      indices.push(Math.min(totalEvents - 1, Math.floor(i * step)));
    }
  }

  const usedEvents = indices.length;

  // Build input vectors with arcsinh transform
  const vectors: number[][] = new Array(usedEvents);
  for (let i = 0; i < usedEvents; i++) {
    const e = indices[i]!;
    const vec = new Array(usedChannels.length);
    for (let c = 0; c < usedChannels.length; c++) {
      const raw = matrix.data[e * nCh + channelIndices[c]!] ?? 0;
      vec[c] = arcsinh(raw);
    }
    vectors[i] = vec;
  }

  // Run UMAP
  const umap = new UMAP({
    nNeighbors,
    minDist,
    nEpochs,
    spread,
    nComponents: 2,
  });

  let result: number[][];
  if (onProgress) {
    result = await umap.fitAsync(vectors, (epoch: number) => {
      onProgress(epoch, nEpochs);
    });
  } else {
    result = umap.fit(vectors);
  }

  // Pack into Float32Array
  const embedding = new Float32Array(usedEvents * 2);
  for (let i = 0; i < usedEvents; i++) {
    embedding[i * 2]     = result[i]![0] ?? 0;
    embedding[i * 2 + 1] = result[i]![1] ?? 0;
  }

  return {
    embedding,
    usedEvents,
    usedChannels,
    durationMs: performance.now() - t0,
  };
}
