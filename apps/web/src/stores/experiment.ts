/**
 * Experiment store — global state for the loaded experiment.
 *
 * Zustand store. All mutations go through actions defined here.
 * React components consume slices via selector hooks.
 */

import { create } from 'zustand';
import { createExperiment, createSample, parseFCS } from '@cytolens/core';
import type { Experiment, Sample, Gate, GateNode, GateResult } from '@cytolens/core';

export interface ExperimentState {
  experiment: Experiment | null;
  samples: Map<string, Sample>;
  gateRoots: GateNode[];
  gateResults: Map<string, GateResult>;
  selectedSampleId: string | null;
  selectedGateId: string | null;
  isLoading: boolean;
  loadError: string | null;

  // Actions
  createNewExperiment: (name: string) => void;
  loadFCSFile: (file: File) => Promise<void>;
  selectSample: (sampleId: string | null) => void;
  selectGate: (gateId: string | null) => void;
  addGate: (gate: Gate, parentId?: string) => void;
  removeGate: (gateId: string) => void;
  updateGate: (gateId: string, updates: Partial<Gate>) => void;
}

export const useExperimentStore = create<ExperimentState>((set, get) => ({
  experiment: null,
  samples: new Map(),
  gateRoots: [],
  gateResults: new Map(),
  selectedSampleId: null,
  selectedGateId: null,
  isLoading: false,
  loadError: null,

  createNewExperiment: (name: string) => {
    const experiment = createExperiment({ name });
    set({ experiment, samples: new Map(), gateRoots: [], gateResults: new Map() });
  },

  loadFCSFile: async (file: File) => {
    const { experiment } = get();

    // Auto-create an experiment if none exists
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

    // Add sample to store immediately with loading status
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

      set({
        samples: updatedSamples,
        selectedSampleId: loadedSample.id,
        isLoading: false,
      });
    } catch (err) {
      const errorSample: Sample = {
        ...sample,
        status: 'error',
        error: err instanceof Error ? err.message : String(err),
      };
      const errSamples = new Map(get().samples);
      errSamples.set(errorSample.id, errorSample);
      set({ samples: errSamples, isLoading: false, loadError: errorSample.error });
    }
  },

  selectSample: (sampleId) => set({ selectedSampleId: sampleId, selectedGateId: null }),
  selectGate: (gateId) => set({ selectedGateId: gateId }),

  addGate: (gate: Gate, _parentId?: string) => {
    const { experiment } = get();
    if (!experiment) return;
    const updatedExp = {
      ...experiment,
      gates: new Map(experiment.gates).set(gate.id, gate),
      modifiedAt: new Date(),
    };
    // For now, add all gates as root nodes — hierarchy wiring is TODO
    set({
      experiment: updatedExp,
      gateRoots: [...get().gateRoots, { gate, children: [] }],
    });
  },

  removeGate: (gateId: string) => {
    const { experiment } = get();
    if (!experiment) return;
    const gates = new Map(experiment.gates);
    gates.delete(gateId);
    const updatedExp = { ...experiment, gates, modifiedAt: new Date() };
    set({
      experiment: updatedExp,
      gateRoots: get().gateRoots.filter(n => n.gate.id !== gateId),
      selectedGateId: get().selectedGateId === gateId ? null : get().selectedGateId,
    });
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
}));

// Convenience selectors
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
