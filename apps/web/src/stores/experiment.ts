/**
 * Experiment store — global state for the loaded experiment.
 *
 * Zustand store. All mutations go through actions defined here.
 * React components consume slices via selector hooks.
 */

import { create } from 'zustand';
import {
  createExperiment,
  createSample,
  parseFCS,
  applyGateHierarchy,
  computeExperimentStats,
} from '@cytolens/core';
import type {
  Experiment,
  Sample,
  Gate,
  GateNode,
  GateResult,
  EventMatrix,
  ExperimentStats,
} from '@cytolens/core';
import type { PlotLayout } from '@cytolens/ui';
import { DEFAULT_PBMC_LAYOUT } from '@cytolens/ui';

// ---------------------------------------------------------------------------
// PBMC demo data generator
// ---------------------------------------------------------------------------

const PBMC_DEMO_CHANNELS = [
  'FSC-A', 'FSC-H', 'SSC-A', 'SSC-H', 'TIME',
  'CD3-FITC', 'CD4-PE', 'CD8-APC', 'CD19-BV421',
  'CD56-PE-Cy7', 'LD-eF780', 'HLA-DR-PerCPCy55',
] as const;

function generatePBMCDemo(): EventMatrix {
  const N = 50_000;
  const nCh = PBMC_DEMO_CHANNELS.length;
  const data = new Float32Array(N * nCh);

  // Gaussian noise helper
  const rng = () => {
    let u = 0, v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
  const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

  // Rough lymphocyte / scatter distributions
  for (let i = 0; i < N; i++) {
    const base = i * nCh;

    // FSC-A: lymphocytes ~100k, monocytes ~200k
    const isMono = i < N * 0.12;
    const isDebris = i < N * 0.04;

    const fscA = isDebris
      ? clamp(20000 + rng() * 8000, 5000, 60000)
      : isMono
        ? clamp(220000 + rng() * 40000, 100000, 300000)
        : clamp(110000 + rng() * 20000, 60000, 200000);

    const fscH = clamp(fscA * (0.9 + rng() * 0.05), 0, 262143); // singlets close to diagonal
    const sscA = isMono
      ? clamp(80000 + rng() * 25000, 20000, 200000)
      : clamp(40000 + rng() * 18000, 5000, 140000);
    const sscH = clamp(sscA * (0.88 + rng() * 0.06), 0, 262143);
    const time = (i / N) * 240 * 1000; // 0-240s run time

    // Fluorescence: T cells ~70%, B cells ~15%, NK ~10%, mono ~12%
    const isT = i > N * 0.16 && i < N * 0.86;
    const isB = i > N * 0.86 && i < N * 1.0;
    const isNK = i > N * 0.12 && i < N * 0.16;

    const cd3 = isT ? clamp(80000 + rng() * 20000, 0, 262143) : clamp(rng() * 1500 + 300, 0, 2000);
    const cd4 = isT && i < N * 0.55 ? clamp(65000 + rng() * 18000, 0, 262143) : clamp(rng() * 1200 + 200, 0, 2000);
    const cd8 = isT && i >= N * 0.55 ? clamp(55000 + rng() * 15000, 0, 262143) : clamp(rng() * 1000 + 200, 0, 2000);
    const cd19 = isB ? clamp(70000 + rng() * 20000, 0, 262143) : clamp(rng() * 800 + 100, 0, 2000);
    const cd56 = isNK ? clamp(60000 + rng() * 18000, 0, 262143) : clamp(rng() * 900 + 100, 0, 2000);
    const ld = isDebris ? clamp(50000 + rng() * 20000, 0, 262143) : clamp(rng() * 800 + 100, 0, 2000);
    const hladr = (isMono || isB) ? clamp(60000 + rng() * 20000, 0, 262143) : clamp(rng() * 900 + 100, 0, 2000);

    data[base + 0] = fscA;
    data[base + 1] = fscH;
    data[base + 2] = sscA;
    data[base + 3] = sscH;
    data[base + 4] = time;
    data[base + 5] = cd3;
    data[base + 6] = cd4;
    data[base + 7] = cd8;
    data[base + 8] = cd19;
    data[base + 9] = cd56;
    data[base + 10] = ld;
    data[base + 11] = hladr;
  }

  return {
    data,
    channels: [...PBMC_DEMO_CHANNELS],
    eventCount: N,
  };
}

// ---------------------------------------------------------------------------
// Store interface
// ---------------------------------------------------------------------------

export interface ExperimentState {
  experiment: Experiment | null;
  samples: Map<string, Sample>;
  gateRoots: GateNode[];
  gateResults: Map<string, GateResult>;
  selectedSampleId: string | null;
  selectedGateId: string | null;
  isLoading: boolean;
  loadError: string | null;

  // Channel selection (used by plot area)
  xChannel: string | null;
  yChannel: string | null;

  // Computed stats
  computedStats: ExperimentStats | null;

  // Worksheet layout
  worksheetLayout: PlotLayout[];

  // Actions
  createNewExperiment: (name: string) => void;
  loadFCSFile: (file: File) => Promise<void>;
  loadDemoData: () => void;
  selectSample: (sampleId: string | null) => void;
  selectGate: (gateId: string | null) => void;
  addGate: (gate: Gate, parentId?: string) => void;
  removeGate: (gateId: string) => void;
  updateGate: (gateId: string, updates: Partial<Gate>) => void;
  setChannels: (xChannel: string, yChannel: string) => void;
  setWorksheetLayout: (layout: PlotLayout[]) => void;
  computeStats: () => void;
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useExperimentStore = create<ExperimentState>((set, get) => ({
  experiment: null,
  samples: new Map(),
  gateRoots: [],
  gateResults: new Map(),
  selectedSampleId: null,
  selectedGateId: null,
  isLoading: false,
  loadError: null,
  xChannel: null,
  yChannel: null,
  computedStats: null,
  worksheetLayout: [],

  createNewExperiment: (name: string) => {
    const experiment = createExperiment({ name });
    set({ experiment, samples: new Map(), gateRoots: [], gateResults: new Map() });
  },

  loadDemoData: () => {
    const exp = createExperiment({ name: 'PBMC Demo' });

    const events = generatePBMCDemo();

    const sample = createSample({
      filename: 'pbmc_demo.fcs',
      label: 'PBMC Demo',
      experimentId: exp.id,
      status: 'ready',
    });

    const loadedSample: Sample = {
      ...sample,
      status: 'ready',
      events: events.data,
      eventCount: events.eventCount,
      metadata: {
        header: {
          version: 'FCS3.1',
          textStart: 0,
          textEnd: 0,
          dataStart: 0,
          dataEnd: 0,
          analysisStart: 0,
          analysisEnd: 0,
        },
        channels: events.channels.map((name, idx) => ({
          name,
          shortName: name,
          index: idx + 1,
          bits: 32,
          range: 262144,
        })),
        keywords: {
          raw: new Map(),
          parameterCount: PBMC_DEMO_CHANNELS.length,
          eventCount: events.eventCount,
          dataType: 'F' as const,
          byteOrder: 'little' as const,
          dataMode: 'L' as const,
          instrument: 'BD FACSCanto II (Demo)',
          date: new Date().toLocaleDateString(),
          operator: 'Demo',
        },
      },
      loadedAt: new Date(),
      fileSize: 0,
    };

    exp.sampleIds.push(sample.id);
    const samples = new Map([[loadedSample.id, loadedSample]]);

    // Build a layout that maps to the actual demo channels
    const layout: PlotLayout[] = DEFAULT_PBMC_LAYOUT;

    set({
      experiment: exp,
      samples,
      selectedSampleId: loadedSample.id,
      gateRoots: [],
      gateResults: new Map(),
      xChannel: 'FSC-A',
      yChannel: 'SSC-A',
      worksheetLayout: layout,
      isLoading: false,
      loadError: null,
    });
  },

  loadFCSFile: async (file: File) => {
    const { experiment } = get();

    let exp = experiment;
    if (!exp) {
      exp = createExperiment({ name: file.name.replace('.fcs', '') });
    }

    const sample = createSample({
      filename: file.name,
      label: file.name.replace(/\.fcs$/i, ''),
      experimentId: exp.id,
      status: 'loading',
    });

    const samples = new Map(get().samples);
    samples.set(sample.id, sample);
    exp.sampleIds.push(sample.id);

    set({ experiment: exp, samples, isLoading: true, loadError: null });

    try {
      const buffer = await file.arrayBuffer();
      const fcsData = parseFCS(buffer, { maxEvents: 500_000 });

      const loadedSample: Sample = {
        ...sample,
        status: 'ready',
        metadata: fcsData.metadata,
        events: fcsData.events,
        eventCount: fcsData.eventCount,
        keywords: Object.fromEntries(fcsData.metadata.keywords.raw),
        loadedAt: new Date(),
        fileSize: file.size,
      };

      const updatedSamples = new Map(get().samples);
      updatedSamples.set(loadedSample.id, loadedSample);

      const chNames = fcsData.metadata.channels.map(c => c.name);
      const fscIdx = chNames.findIndex(n => n.toUpperCase().includes('FSC'));
      const sscIdx = chNames.findIndex(n => n.toUpperCase().includes('SSC'));
      const defaultX = chNames[fscIdx !== -1 ? fscIdx : 0] ?? chNames[0] ?? null;
      const defaultY = chNames[sscIdx !== -1 ? sscIdx : 1] ?? chNames[1] ?? null;

      // Build default 2-plot layout for loaded file
      const defaultLayout: PlotLayout[] = defaultX && defaultY
        ? [
            { id: 'plot-xy-0', type: 'scatter', xChannel: defaultX, yChannel: defaultY, xTransformType: 'linear', yTransformType: 'linear' },
            { id: 'plot-histo-0', type: 'histogram', xChannel: defaultX, xTransformType: 'linear' },
          ]
        : [];

      set({
        samples: updatedSamples,
        selectedSampleId: loadedSample.id,
        isLoading: false,
        xChannel: get().xChannel ?? defaultX,
        yChannel: get().yChannel ?? defaultY,
        worksheetLayout: get().worksheetLayout.length === 0 ? defaultLayout : get().worksheetLayout,
      });
    } catch (err) {
      const errorSample: Sample = {
        ...sample,
        status: 'error',
        error: err instanceof Error ? err.message : String(err),
      };
      const errSamples = new Map(get().samples);
      errSamples.set(errorSample.id, errorSample);
      set({ samples: errSamples, isLoading: false, loadError: errorSample.error ?? null });
    }
  },

  selectSample: (sampleId) => set({ selectedSampleId: sampleId, selectedGateId: null }),
  selectGate: (gateId) => set({ selectedGateId: gateId }),

  setChannels: (xChannel: string, yChannel: string) => set({ xChannel, yChannel }),

  setWorksheetLayout: (layout: PlotLayout[]) => set({ worksheetLayout: layout }),

  addGate: (gate: Gate, _parentId?: string) => {
    const { experiment, gateRoots } = get();
    if (!experiment) return;
    const updatedExp = {
      ...experiment,
      gates: new Map(experiment.gates).set(gate.id, gate),
      modifiedAt: new Date(),
    };
    const newRoots = [...gateRoots, { gate, children: [] }];
    set({ experiment: updatedExp, gateRoots: newRoots });
    get().computeStats();
  },

  removeGate: (gateId: string) => {
    const { experiment } = get();
    if (!experiment) return;
    const gates = new Map(experiment.gates);
    gates.delete(gateId);
    const updatedExp = { ...experiment, gates, modifiedAt: new Date() };
    const newRoots = get().gateRoots.filter(n => n.gate.id !== gateId);
    set({
      experiment: updatedExp,
      gateRoots: newRoots,
      selectedGateId: get().selectedGateId === gateId ? null : get().selectedGateId,
    });
    get().computeStats();
  },

  updateGate: (gateId: string, updates: Partial<Gate>) => {
    const { experiment } = get();
    if (!experiment) return;
    const existing = experiment.gates.get(gateId);
    if (!existing) return;
    const updated = { ...existing, ...updates } as Gate;
    const gates = new Map(experiment.gates).set(gateId, updated);
    set({ experiment: { ...experiment, gates, modifiedAt: new Date() } });
  },

  computeStats: () => {
    const { selectedSampleId, samples, gateRoots } = get();
    if (!selectedSampleId) return;
    const sample = samples.get(selectedSampleId);
    if (!sample || sample.status !== 'ready' || !sample.events || !sample.metadata) return;
    if (gateRoots.length === 0) {
      set({ gateResults: new Map(), computedStats: null });
      return;
    }

    const matrix: EventMatrix = {
      data: sample.events,
      channels: sample.metadata.channels.map(c => c.name),
      eventCount: sample.eventCount,
    };

    try {
      const { nodeResults } = applyGateHierarchy(gateRoots, matrix);
      const stats = computeExperimentStats(nodeResults, matrix, gateRoots, sample.id);
      set({ gateResults: nodeResults, computedStats: stats });
    } catch (err) {
      console.error('Gating computation failed:', err);
    }
  },
}));

// ---------------------------------------------------------------------------
// Selectors
// ---------------------------------------------------------------------------

export const useSelectedSample = () => {
  return useExperimentStore(s => {
    if (!s.selectedSampleId) return null;
    return s.samples.get(s.selectedSampleId) ?? null;
  });
};

export const useSelectedGate = () => {
  return useExperimentStore(s => {
    if (!s.selectedGateId || !s.experiment) return null;
    return s.experiment.gates.get(s.selectedGateId) ?? null;
  });
};

export const useSampleList = () => {
  return useExperimentStore(s => Array.from(s.samples.values()));
};
