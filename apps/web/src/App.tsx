/**
 * App — root component.
 *
 * Three-panel layout:
 *   ┌──────────────────────────────────────────┐
 *   │  Toolbar                                 │
 *   ├─────────┬────────────────────┬───────────┤
 *   │ Sample/ │   Plot area        │ Properties│
 *   │ Gate    │   (2 plots side    │ / controls│
 *   │ tree    │    by side)        │           │
 *   │         │                   │           │
 *   └─────────┴────────────────────┴───────────┘
 *
 * Medium-gray theme — not full dark, not pure white.
 * SnapGene-quality information density.
 */

import React, { useCallback, useRef, useState } from 'react';
import { WorkspaceTree, ControlPanel, ScatterPlot, HistogramPlot } from '@cytoflow/ui';
import {
  useExperimentStore,
  useSelectedSample,
  useSelectedGate,
  useSampleList,
} from './stores/experiment.js';
import { useUIStore } from './stores/ui.js';
import type { DrawMode } from '@cytoflow/ui';
import type { EventMatrix } from '@cytoflow/core';
import { createLogicle, LOGICLE_PRESETS } from '@cytoflow/core';

// ---------------------------------------------------------------------------
// Toolbar
// ---------------------------------------------------------------------------

const TOOLS: Array<{ id: DrawMode; label: string; icon: string; title: string }> = [
  { id: 'select', label: 'Select', icon: '↖', title: 'Select / Pan (V)' },
  { id: 'polygon', label: 'Polygon', icon: '⬟', title: 'Draw polygon gate (P)' },
  { id: 'rectangle', label: 'Rectangle', icon: '⬜', title: 'Draw rectangle gate (R)' },
  { id: 'ellipse', label: 'Ellipse', icon: '⭕', title: 'Draw ellipse gate (E)' },
];

const Toolbar: React.FC = () => {
  const activeTool = useUIStore(s => s.activeTool);
  const setActiveTool = useUIStore(s => s.setActiveTool);
  const loadFCSFile = useExperimentStore(s => s.loadFCSFile);
  const isLoading = useExperimentStore(s => s.isLoading);
  const toggleLeft = useUIStore(s => s.togglePanel);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    Array.from(files).forEach(f => loadFCSFile(f));
    e.target.value = '';
  }, [loadFCSFile]);

  return (
    <div className="h-10 flex items-center gap-1 px-3 bg-white border-b border-gray-200 flex-shrink-0">
      {/* Brand */}
      <div className="flex items-center gap-2 mr-3">
        <span className="text-accent-600 font-bold text-sm tracking-tight">CytoLens</span>
        <span className="hidden sm:block text-xs text-gray-400">|</span>
      </div>

      {/* File actions */}
      <button
        className="toolbar-btn"
        title="Open FCS files"
        onClick={() => fileInputRef.current?.click()}
        disabled={isLoading}
      >
        <span>📂</span>
        <span className="hidden sm:inline">{isLoading ? 'Loading…' : 'Open'}</span>
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept=".fcs,.lmd"
        multiple
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />

      <div className="w-px h-5 bg-gray-200 mx-1" />

      {/* Gate tools */}
      {TOOLS.map(tool => (
        <button
          key={tool.id}
          className={`toolbar-btn ${activeTool === tool.id ? 'toolbar-btn-active' : ''}`}
          title={tool.title}
          onClick={() => setActiveTool(tool.id)}
        >
          <span>{tool.icon}</span>
          <span className="hidden md:inline">{tool.label}</span>
        </button>
      ))}

      <div className="flex-1" />

      {/* View toggles */}
      <button
        className="toolbar-btn"
        title="Toggle left panel"
        onClick={() => toggleLeft('left')}
      >
        ◧
      </button>
      <button
        className="toolbar-btn"
        title="Toggle right panel"
        onClick={() => toggleLeft('right')}
      >
        ◨
      </button>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Plot area — two scatter plots side by side
// ---------------------------------------------------------------------------

const PlotArea: React.FC<{ sample: ReturnType<typeof useSelectedSample> }> = ({ sample }) => {
  const logicle = createLogicle(LOGICLE_PRESETS.BD_18BIT);

  if (!sample || sample.status !== 'ready' || !sample.events || !sample.metadata) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-gray-50 text-gray-400 gap-3">
        <div className="text-5xl opacity-40">🔬</div>
        <div className="text-sm font-medium">No data loaded</div>
        <div className="text-xs">Open an FCS file to begin analysis</div>
      </div>
    );
  }

  const channels = sample.metadata.channels;
  const chNames = channels.map(c => c.name);

  const matrix: EventMatrix = {
    data: sample.events,
    channels: chNames,
    eventCount: sample.eventCount,
  };

  // Pick default channels — FSC-A vs SSC-A first, then first two channels
  const fscIdx = chNames.findIndex(n => n.toUpperCase().includes('FSC'));
  const sscIdx = chNames.findIndex(n => n.toUpperCase().includes('SSC'));
  const xCh1 = chNames[fscIdx !== -1 ? fscIdx : 0] ?? chNames[0] ?? 'Ch1';
  const yCh1 = chNames[sscIdx !== -1 ? sscIdx : 1] ?? chNames[1] ?? 'Ch2';
  const xCh2 = chNames[2] ?? xCh1;
  const yCh2 = chNames[3] ?? yCh1;

  return (
    <div className="flex-1 overflow-auto bg-gray-50 p-4">
      <div className="flex gap-4 flex-wrap">
        {/* Plot 1: FSC vs SSC */}
        <div className="plot-container p-2">
          <div className="text-xs text-gray-500 font-medium mb-1 px-1">
            {xCh1} / {yCh1}
          </div>
          <div className="relative">
            <ScatterPlot
              events={matrix}
              xChannel={xCh1}
              yChannel={yCh1}
              width={380}
              height={360}
              alpha={0.35}
              pointSize={1.2}
              color="#2563eb"
            />
          </div>
        </div>

        {/* Plot 2: next two channels */}
        <div className="plot-container p-2">
          <div className="text-xs text-gray-500 font-medium mb-1 px-1">
            {xCh2} / {yCh2}
          </div>
          <div className="relative">
            <ScatterPlot
              events={matrix}
              xChannel={xCh2}
              yChannel={yCh2}
              xTransform={logicle}
              yTransform={logicle}
              width={380}
              height={360}
              alpha={0.35}
              pointSize={1.2}
              color="#16a34a"
            />
          </div>
        </div>

        {/* Histogram — channel 0 */}
        <div className="plot-container p-2">
          <div className="text-xs text-gray-500 font-medium mb-1 px-1">
            Distribution — {xCh1}
          </div>
          <HistogramPlot
            series={[{
              events: matrix,
              channel: xCh1,
              color: '#2563eb',
              label: xCh1,
            }]}
            width={380}
            height={180}
            bins={200}
            filled
          />
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Welcome / drop zone overlay
// ---------------------------------------------------------------------------

const WelcomeOverlay: React.FC<{ onDrop: (files: FileList) => void }> = ({ onDrop }) => {
  const [dragActive, setDragActive] = useState(false);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(true);
  };

  const handleDragLeave = () => setDragActive(false);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    if (e.dataTransfer.files.length > 0) {
      onDrop(e.dataTransfer.files);
    }
  };

  return (
    <div
      className={`absolute inset-0 flex flex-col items-center justify-center transition-colors ${
        dragActive ? 'bg-accent-50 border-2 border-dashed border-accent-400' : 'bg-gray-50'
      }`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className="text-center max-w-sm">
        <div className="text-6xl mb-4 opacity-30">🔬</div>
        <h2 className="text-xl font-semibold text-gray-600 mb-2">CytoLens</h2>
        <p className="text-sm text-gray-400 mb-6">See every cell clearly.</p>
        <div className={`border-2 border-dashed rounded-xl p-8 transition-colors ${
          dragActive ? 'border-accent-400 bg-accent-50' : 'border-gray-300 bg-white'
        }`}>
          <div className="text-2xl mb-2">{dragActive ? '📥' : '📂'}</div>
          <p className="text-sm font-medium text-gray-600 mb-1">
            {dragActive ? 'Drop to open' : 'Drop FCS files here'}
          </p>
          <p className="text-xs text-gray-400">or use File → Open in the toolbar</p>
        </div>
        <div className="mt-4 flex gap-2 justify-center text-xs text-gray-400">
          <span className="px-2 py-0.5 bg-gray-100 rounded">FCS 3.0</span>
          <span className="px-2 py-0.5 bg-gray-100 rounded">FCS 3.1</span>
          <span className="px-2 py-0.5 bg-gray-100 rounded">LMD</span>
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Root App
// ---------------------------------------------------------------------------

const App: React.FC = () => {
  const leftPanelWidth = useUIStore(s => s.leftPanelWidth);
  const rightPanelWidth = useUIStore(s => s.rightPanelWidth);
  const isLeftOpen = useUIStore(s => s.isLeftPanelOpen);
  const isRightOpen = useUIStore(s => s.isRightPanelOpen);

  const samples = useSampleList();
  const gateRoots = useExperimentStore(s => s.gateRoots);
  const gateResults = useExperimentStore(s => s.gateResults);
  const selectedSampleId = useExperimentStore(s => s.selectedSampleId);
  const selectedGateId = useExperimentStore(s => s.selectedGateId);
  const selectSample = useExperimentStore(s => s.selectSample);
  const selectGate = useExperimentStore(s => s.selectGate);
  const updateGate = useExperimentStore(s => s.updateGate);
  const loadFCSFile = useExperimentStore(s => s.loadFCSFile);

  const selectedSample = useSelectedSample();
  const selectedGate = useSelectedGate();
  const gateResult = selectedGateId ? gateResults.get(selectedGateId) : undefined;

  const showWelcome = samples.length === 0;

  const handleDropFiles = useCallback((files: FileList) => {
    Array.from(files).forEach(f => {
      if (f.name.match(/\.(fcs|lmd)$/i)) loadFCSFile(f);
    });
  }, [loadFCSFile]);

  const handleGlobalDragOver = useCallback((e: React.DragEvent) => {
    if (e.dataTransfer.types.includes('Files')) {
      e.preventDefault();
    }
  }, []);

  const handleGlobalDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files.length > 0) handleDropFiles(e.dataTransfer.files);
  }, [handleDropFiles]);

  return (
    <div
      className="flex flex-col h-screen bg-gray-100 overflow-hidden"
      onDragOver={handleGlobalDragOver}
      onDrop={handleGlobalDrop}
    >
      {/* Top toolbar */}
      <Toolbar />

      {/* Three-panel body */}
      <div className="flex flex-1 overflow-hidden min-h-0">
        {/* Left panel — workspace tree */}
        {isLeftOpen && (
          <div
            className="flex flex-col bg-white border-r border-gray-200 flex-shrink-0 overflow-hidden"
            style={{ width: leftPanelWidth }}
          >
            <WorkspaceTree
              samples={samples}
              gateRoots={gateRoots}
              gateResults={gateResults}
              selectedSampleId={selectedSampleId ?? undefined}
              selectedGateId={selectedGateId ?? undefined}
              onSampleSelect={selectSample}
              onGateSelect={selectGate}
              className="flex-1"
            />
          </div>
        )}

        {/* Centre — plot area */}
        <div className="flex-1 relative min-w-0 overflow-hidden flex flex-col">
          {showWelcome ? (
            <WelcomeOverlay onDrop={handleDropFiles} />
          ) : (
            <PlotArea sample={selectedSample} />
          )}
        </div>

        {/* Right panel — properties */}
        {isRightOpen && (
          <div
            className="flex flex-col bg-white border-l border-gray-200 flex-shrink-0 overflow-hidden"
            style={{ width: rightPanelWidth }}
          >
            <ControlPanel
              selectedSample={selectedSample ?? undefined}
              selectedGate={selectedGate ?? undefined}
              gateResult={gateResult}
              onGateColorChange={(id, color) => updateGate(id, { color })}
              onGateNameChange={(id, name) => updateGate(id, { name })}
              className="flex-1"
            />
          </div>
        )}
      </div>

      {/* Status bar */}
      <StatusBar />
    </div>
  );
};

const StatusBar: React.FC = () => {
  const samples = useSampleList();
  const isLoading = useExperimentStore(s => s.isLoading);
  const loadError = useExperimentStore(s => s.loadError);
  const totalEvents = samples.reduce((sum, s) => sum + s.eventCount, 0);

  return (
    <div className="h-6 flex items-center px-3 gap-4 bg-white border-t border-gray-200 flex-shrink-0">
      <span className="text-xs text-gray-400">
        {isLoading ? '⌛ Loading…' : `${samples.length} sample${samples.length !== 1 ? 's' : ''}`}
      </span>
      {totalEvents > 0 && (
        <span className="text-xs text-gray-400">
          {totalEvents.toLocaleString()} events total
        </span>
      )}
      {loadError && (
        <span className="text-xs text-red-500 truncate">⚠ {loadError}</span>
      )}
      <div className="flex-1" />
      <span className="text-xs text-gray-300">CytoLens v0.1.0</span>
    </div>
  );
};

export default App;
