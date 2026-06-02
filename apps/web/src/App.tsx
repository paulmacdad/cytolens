/**
 * App — root component for CytoLens.
 *
 * Layout:
 *
 *   ┌─────────────────────────────────────────────────────┐
 *   │  Toolbar                                            │
 *   ├─────────┬───────────────────────────┬──────────────┤
 *   │ Workspace│  WorksheetGrid           │  Right panel │
 *   │ Tree     │  (multi-plot grid)       │  (ControlPanel│
 *   │  w-52   │                           │  or StatsTable)
 *   │         │                           │   w-64       │
 *   ├─────────┴───────────────────────────┴──────────────┤
 *   │  Status bar                                         │
 *   └─────────────────────────────────────────────────────┘
 *
 * Welcome state (no data): full-screen centered welcome screen.
 */

import React, {
  useCallback,
  useRef,
  useState,
  useMemo,
} from 'react';
import {
  WorkspaceTree,
  ControlPanel,
  WorksheetGrid,
} from '@cytolens/ui';
import type { PlotLayout } from '@cytolens/ui';
import {
  useExperimentStore,
  useSelectedSample,
  useSelectedGate,
  useSampleList,
} from './stores/experiment.js';
import { useUIStore } from './stores/ui.js';
import type { DrawMode } from '@cytolens/ui';
import type { EventMatrix } from '@cytolens/core';
import { statsToCSV, downloadCSV } from '@cytolens/core';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts.js';

// ---------------------------------------------------------------------------
// CytoLens animated dot-cloud SVG logo
// ---------------------------------------------------------------------------

const CytoLensLogo: React.FC<{ size?: number; className?: string; animated?: boolean }> = ({
  size = 24,
  className = '',
  animated = false,
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 48 48"
    className={className}
    fill="none"
    aria-label="CytoLens logo"
  >
    <circle cx="24" cy="24" r="20" stroke="#0d9488" strokeWidth="2" opacity="0.9" />
    <circle cx="24" cy="24" r="13" stroke="#14b8a6" strokeWidth="1.2" opacity="0.5" />
    <circle cx="24" cy="24" r="3.5" fill="#0d9488">
      {animated && <animate attributeName="fill" values="#0d9488;#14b8a6;#2dd4bf;#0d9488" dur="3s" repeatCount="indefinite" />}
    </circle>
    <circle cx="17" cy="20" r="2.5" fill="#14b8a6">
      {animated && <animate attributeName="fill" values="#14b8a6;#2dd4bf;#0d9488;#14b8a6" dur="3.4s" repeatCount="indefinite" />}
    </circle>
    <circle cx="31" cy="20" r="2.5" fill="#14b8a6">
      {animated && <animate attributeName="fill" values="#2dd4bf;#0d9488;#14b8a6;#2dd4bf" dur="2.8s" repeatCount="indefinite" />}
    </circle>
    <circle cx="20" cy="30" r="2" fill="#2dd4bf">
      {animated && <animate attributeName="fill" values="#0d9488;#14b8a6;#2dd4bf;#0d9488" dur="4s" repeatCount="indefinite" />}
    </circle>
    <circle cx="30" cy="30" r="2" fill="#2dd4bf">
      {animated && <animate attributeName="fill" values="#2dd4bf;#0d9488;#14b8a6;#2dd4bf" dur="3.2s" repeatCount="indefinite" />}
    </circle>
    <circle cx="15" cy="28" r="1.6" fill="#5eead4">
      {animated && <animate attributeName="fill" values="#5eead4;#0d9488;#2dd4bf;#5eead4" dur="5s" repeatCount="indefinite" />}
    </circle>
    <circle cx="33" cy="27" r="1.6" fill="#5eead4">
      {animated && <animate attributeName="fill" values="#5eead4;#2dd4bf;#0d9488;#5eead4" dur="4.5s" repeatCount="indefinite" />}
    </circle>
    <circle cx="26" cy="16" r="1.4" fill="#99f6e4">
      {animated && <animate attributeName="fill" values="#99f6e4;#5eead4;#14b8a6;#99f6e4" dur="3.8s" repeatCount="indefinite" />}
    </circle>
    <circle cx="21" cy="16" r="1.2" fill="#99f6e4">
      {animated && <animate attributeName="fill" values="#14b8a6;#99f6e4;#5eead4;#14b8a6" dur="4.2s" repeatCount="indefinite" />}
    </circle>
    <circle cx="35" cy="22" r="1.2" fill="#ccfbf1">
      {animated && <animate attributeName="fill" values="#ccfbf1;#5eead4;#2dd4bf;#ccfbf1" dur="6s" repeatCount="indefinite" />}
    </circle>
    <circle cx="13" cy="23" r="1.2" fill="#ccfbf1">
      {animated && <animate attributeName="fill" values="#2dd4bf;#ccfbf1;#5eead4;#2dd4bf" dur="5.5s" repeatCount="indefinite" />}
    </circle>
  </svg>
);

// ---------------------------------------------------------------------------
// Tool definitions
// ---------------------------------------------------------------------------

const TOOLS: Array<{ id: DrawMode; label: string; icon: string; title: string; key: string }> = [
  { id: 'select',    label: 'Select',    icon: '↖',  title: 'Select / Pan (V)', key: 'V' },
  { id: 'polygon',   label: 'Polygon',   icon: '⬡',  title: 'Polygon gate (P)', key: 'P' },
  { id: 'rectangle', label: 'Rect',      icon: '▭',  title: 'Rectangle gate (R)', key: 'R' },
  { id: 'ellipse',   label: 'Ellipse',   icon: '⬭',  title: 'Ellipse gate (E)', key: 'E' },
];

// ---------------------------------------------------------------------------
// Toolbar
// ---------------------------------------------------------------------------

const Toolbar: React.FC<{
  onOpenFile: () => void;
  onLoadDemo: () => void;
  onExportPNG: () => void;
  onExportCSV: () => void;
  hasData: boolean;
}> = ({ onOpenFile, onLoadDemo, onExportPNG, onExportCSV, hasData }) => {
  const activeTool = useUIStore(s => s.activeTool);
  const setActiveTool = useUIStore(s => s.setActiveTool);
  const isLeftOpen = useUIStore(s => s.isLeftPanelOpen);
  const isRightOpen = useUIStore(s => s.isRightPanelOpen);
  const togglePanel = useUIStore(s => s.togglePanel);

  return (
    <div className="flex items-center gap-1 px-3 h-10 bg-white border-b border-gray-200 flex-shrink-0">
      <div className="flex items-center gap-2 mr-2">
        <CytoLensLogo size={22} />
        <span className="text-sm font-bold text-gray-800 tracking-tight select-none">CytoLens</span>
      </div>
      <div className="h-4 w-px bg-gray-200 mx-1" />
      <button
        className="flex items-center gap-1 text-xs px-2 py-1 rounded hover:bg-gray-100 text-gray-600 transition-colors"
        onClick={onOpenFile}
        title="Open FCS file (Ctrl+O)"
      >
        <span>📂</span> Open
      </button>
      <button
        className="flex items-center gap-1 text-xs px-2 py-1 rounded hover:bg-teal-50 text-teal-600 font-medium transition-colors"
        onClick={onLoadDemo}
        title="Load PBMC demo data (Ctrl+D)"
      >
        <span>🧪</span> Demo
      </button>
      <div className="h-4 w-px bg-gray-200 mx-1" />
      <div className="flex gap-0.5">
        {TOOLS.map(t => (
          <button
            key={t.id}
            className={`w-7 h-7 flex items-center justify-center rounded text-sm transition-colors ${
              activeTool === t.id
                ? 'bg-teal-600 text-white shadow-sm'
                : 'text-gray-500 hover:bg-gray-100'
            }`}
            onClick={() => setActiveTool(t.id)}
            title={t.title}
          >
            {t.icon}
          </button>
        ))}
      </div>
      <div className="h-4 w-px bg-gray-200 mx-1" />
      <button
        className={`w-7 h-7 flex items-center justify-center rounded text-xs transition-colors ${
          isLeftOpen ? 'bg-gray-100 text-gray-700' : 'text-gray-400 hover:bg-gray-100'
        }`}
        onClick={() => togglePanel('left')}
        title="Toggle workspace panel"
      >
        ◧
      </button>
      <button
        className={`w-7 h-7 flex items-center justify-center rounded text-xs transition-colors ${
          isRightOpen ? 'bg-gray-100 text-gray-700' : 'text-gray-400 hover:bg-gray-100'
        }`}
        onClick={() => togglePanel('right')}
        title="Toggle properties panel"
      >
        ◨
      </button>
      <div className="flex-1" />
      {hasData && (
        <>
          <button
            className="text-xs px-2 py-1 rounded hover:bg-gray-100 text-gray-500 transition-colors"
            onClick={onExportPNG}
            title="Export PNG"
          >
            📷 PNG
          </button>
          <button
            className="text-xs px-2 py-1 rounded hover:bg-gray-100 text-gray-500 transition-colors"
            onClick={onExportCSV}
            title="Export CSV"
          >
            📊 CSV
          </button>
        </>
      )}
      <button
        className="w-7 h-7 flex items-center justify-center rounded text-gray-300 hover:text-gray-500 hover:bg-gray-100 text-sm transition-colors"
        title="AI assistant (coming soon)"
        disabled
      >
        ✦
      </button>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Feature cards data for welcome screen
// ---------------------------------------------------------------------------

const FEATURE_CARDS = [
  {
    key: 'webgl',
    title: 'WebGL rendering',
    desc: 'Millions of events rendered instantly in the browser, no server needed.',
  },
  {
    key: 'import',
    title: 'FlowJo + GatingML import',
    desc: 'Import gates from .wsp workspaces and GatingML files. Hierarchies preserved.',
  },
  {
    key: 'oss',
    title: 'Open source & free',
    desc: 'No subscriptions, no data uploads. Runs entirely in your browser.',
  },
];

// ---------------------------------------------------------------------------
// Welcome screen
// ---------------------------------------------------------------------------

const WelcomeScreen: React.FC<{
  onOpenFile: () => void;
  onLoadDemo: () => void;
  onDrop: (files: FileList) => void;
}> = ({ onOpenFile, onLoadDemo, onDrop }) => {
  const [dragActive, setDragActive] = useState(false);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(true);
  };
  const handleDragLeave = () => setDragActive(false);
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    if (e.dataTransfer.files.length > 0) onDrop(e.dataTransfer.files);
  };

  return (
    <div
      className={`flex-1 flex flex-col items-center justify-center p-8 overflow-y-auto transition-colors ${
        dragActive ? 'bg-teal-50' : 'bg-gray-50'
      }`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className="flex flex-col items-center w-full max-w-xl">

        {/* Animated logo */}
        <div className="mb-5 drop-shadow-sm">
          <CytoLensLogo size={96} animated />
        </div>

        {/* Wordmark */}
        <h1
          className="text-5xl font-extrabold tracking-tight mb-2"
          style={{ color: '#0d9488' }}
        >
          CytoLens
        </h1>
        <p className="text-base text-gray-400 mb-10 tracking-wide">
          See every cell clearly.
        </p>

        {/* Primary CTAs */}
        <div className="flex gap-4 mb-8 w-full max-w-sm">
          <button
            className="flex-1 flex flex-col items-center gap-2.5 py-6 px-4 bg-white border-2 border-gray-200 rounded-2xl hover:border-teal-400 hover:shadow-lg transition-all group"
            onClick={onOpenFile}
          >
            <span className="text-3xl group-hover:scale-110 transition-transform">📂</span>
            <span className="text-sm font-bold text-gray-700">Open FCS File</span>
            <span className="text-xs text-gray-400">FCS 3.0, 3.1, LMD</span>
          </button>
          <button
            className="flex-1 flex flex-col items-center gap-2.5 py-6 px-4 rounded-2xl hover:shadow-lg transition-all group"
            style={{ background: '#0d9488', border: '2px solid #0d9488' }}
            onClick={onLoadDemo}
          >
            <span className="text-3xl group-hover:scale-110 transition-transform">🧪</span>
            <span className="text-sm font-bold text-white">Load Demo Data</span>
            <span className="text-xs" style={{ color: '#99f6e4' }}>PBMC · 50k events</span>
          </button>
        </div>

        {/* Drag-drop zone */}
        <div
          className={`w-full max-w-sm border-2 border-dashed rounded-2xl p-5 text-center transition-all mb-10 ${
            dragActive
              ? 'border-teal-400 bg-teal-50 scale-[1.01]'
              : 'border-gray-200 bg-white'
          }`}
        >
          <div className="text-xl mb-1">{dragActive ? '📥' : '⬇'}</div>
          <p className="text-sm text-gray-400">
            {dragActive ? 'Drop to open' : 'Or drag & drop FCS files here'}
          </p>
        </div>

        {/* Feature cards */}
        <div className="grid grid-cols-3 gap-4 w-full">
          {FEATURE_CARDS.map(card => (
            <div
              key={card.key}
              className="flex flex-col items-center gap-2 p-4 bg-white rounded-xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow"
            >
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center"
                style={{ background: '#f0fdfa' }}
              >
                <span style={{ color: '#0d9488', fontSize: '18px' }}>
                  {card.key === 'webgl' ? '⚡' : card.key === 'import' ? '↕' : '◎'}
                </span>
              </div>
              <span className="text-xs font-bold text-gray-700 text-center">{card.title}</span>
              <span className="text-xs text-gray-400 text-center leading-relaxed">{card.desc}</span>
            </div>
          ))}
        </div>

        {/* Keyboard hint */}
        <p className="mt-8 text-xs text-gray-300 font-mono">
          V select · P polygon · R rect · E ellipse · Ctrl+Z undo
        </p>

      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Right panel
// ---------------------------------------------------------------------------

const RightPanel: React.FC<{
  channels: string[];
  onExportPNG: () => void;
  onExportCSV: () => void;
}> = ({ channels, onExportPNG, onExportCSV }) => {
  const selectedSample = useSelectedSample();
  const selectedGate = useSelectedGate();
  const gateResults = useExperimentStore(s => s.gateResults);
  const selectedGateId = useExperimentStore(s => s.selectedGateId);
  const updateGate = useExperimentStore(s => s.updateGate);
  const gateResult = selectedGateId ? gateResults.get(selectedGateId) : undefined;

  return (
    <div className="flex flex-col h-full bg-white overflow-hidden">
      <div className="px-3 py-2 border-b border-gray-100">
        <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Properties</span>
      </div>
      <div className="flex-1 overflow-y-auto">
        <ControlPanel
          {...(selectedSample != null ? { selectedSample } : {})}
          {...(selectedGate != null ? { selectedGate } : {})}
          {...(gateResult != null ? { gateResult } : {})}
          onGateColorChange={(id, color) => updateGate(id, { color })}
          onGateNameChange={(id, name) => updateGate(id, { name })}
        />
        {!selectedSample && !selectedGate && (
          <div className="px-4 py-6 text-xs text-gray-400 text-center">
            Select a plot or gate<br />to see properties
          </div>
        )}
      </div>
      <div className="px-3 py-2 border-t border-gray-100 space-y-1">
        <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Export</span>
        <button
          className="w-full text-xs py-1.5 px-2 rounded border border-gray-200 hover:bg-gray-50 text-gray-600 text-left mt-1"
          onClick={onExportPNG}
        >
          📷 Export PNG
        </button>
        <button
          className="w-full text-xs py-1.5 px-2 rounded border border-gray-200 hover:bg-gray-50 text-gray-600 text-left"
          onClick={onExportCSV}
        >
          📊 Export CSV
        </button>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Status bar
// ---------------------------------------------------------------------------

const StatusBar: React.FC = () => {
  const samples = useSampleList();
  const isLoading = useExperimentStore(s => s.isLoading);
  const loadError = useExperimentStore(s => s.loadError);
  const totalEvents = samples.reduce((sum, s) => sum + s.eventCount, 0);

  return (
    <div className="h-6 flex items-center px-3 gap-4 bg-white border-t border-gray-100 flex-shrink-0">
      <span className="text-xs text-gray-400">
        {isLoading
          ? '⌛ Loading…'
          : `${samples.length} sample${samples.length !== 1 ? 's' : ''}`}
      </span>
      {totalEvents > 0 && (
        <span className="text-xs text-gray-400">
          {totalEvents.toLocaleString()} events
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

// ---------------------------------------------------------------------------
// Root App
// ---------------------------------------------------------------------------

const App: React.FC = () => {
  const isLeftOpen = useUIStore(s => s.isLeftPanelOpen);
  const isRightOpen = useUIStore(s => s.isRightPanelOpen);
  const leftPanelWidth = useUIStore(s => s.leftPanelWidth);
  const rightPanelWidth = useUIStore(s => s.rightPanelWidth);
  const setActiveTool = useUIStore(s => s.setActiveTool);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const samples = useSampleList();
  const gateRoots = useExperimentStore(s => s.gateRoots);
  const gateResults = useExperimentStore(s => s.gateResults);
  const selectedSampleId = useExperimentStore(s => s.selectedSampleId);
  const selectedGateId = useExperimentStore(s => s.selectedGateId);
  const selectSample = useExperimentStore(s => s.selectSample);
  const selectGate = useExperimentStore(s => s.selectGate);
  const loadFCSFile = useExperimentStore(s => s.loadFCSFile);
  const loadDemoData = useExperimentStore(s => s.loadDemoData);
  const removeGate = useExperimentStore(s => s.removeGate);
  const worksheetLayout = useExperimentStore(s => s.worksheetLayout);
  const setWorksheetLayout = useExperimentStore(s => s.setWorksheetLayout);
  const experiment = useExperimentStore(s => s.experiment);
  const computedStats = useExperimentStore(s => s.computedStats);

  const selectedSample = useSelectedSample();

  const channelList = useMemo(() => {
    if (!selectedSample?.metadata) return [];
    return selectedSample.metadata.channels.map(c => c.name);
  }, [selectedSample?.metadata]);

  const hasData = samples.some(s => s.status === 'ready');

  const eventMatrix = useMemo<EventMatrix | undefined>(() => {
    if (!selectedSample || selectedSample.status !== 'ready' || !selectedSample.events || !selectedSample.metadata) {
      return undefined;
    }
    return {
      data: selectedSample.events,
      channels: selectedSample.metadata.channels.map(c => c.name),
      eventCount: selectedSample.eventCount,
    };
  }, [selectedSample]);

  const allGates = useMemo(() => {
    if (!experiment) return [];
    return Array.from(experiment.gates.values());
  }, [experiment]);

  const handleOpenFile = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    Array.from(files).forEach(f => {
      if (f.name.match(/\.(fcs|lmd)$/i)) loadFCSFile(f);
    });
    e.target.value = '';
  }, [loadFCSFile]);

  const handleDropFiles = useCallback((files: FileList) => {
    Array.from(files).forEach(f => {
      if (f.name.match(/\.(fcs|lmd)$/i)) loadFCSFile(f);
    });
  }, [loadFCSFile]);

  const handleGlobalDragOver = useCallback((e: React.DragEvent) => {
    if (e.dataTransfer.types.includes('Files')) e.preventDefault();
  }, []);

  const handleGlobalDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files.length > 0) handleDropFiles(e.dataTransfer.files);
  }, [handleDropFiles]);

  // Undo: remove the most recently inserted gate
  const handleUndo = useCallback(() => {
    if (!experiment) return;
    const gates = Array.from(experiment.gates.values());
    if (gates.length === 0) return;
    const lastGate = gates[gates.length - 1];
    if (lastGate) removeGate(lastGate.id);
  }, [experiment, removeGate]);

  // Delete selected gate
  const handleDeleteGate = useCallback(() => {
    if (selectedGateId) removeGate(selectedGateId);
  }, [selectedGateId, removeGate]);

  // Escape: revert to select tool and deselect gate
  const handleEscape = useCallback(() => {
    setActiveTool('select');
    // selectGate accepts string; passing empty string deselects
    selectGate('');
  }, [setActiveTool, selectGate]);

  // Zoom stubs — delegate to UI store if zoom actions are present
  const zoomIn = useCallback(() => {
    const s = useUIStore.getState() as unknown as Record<string, unknown>;
    if (typeof s['zoomIn'] === 'function') (s['zoomIn'] as () => void)();
  }, []);
  const zoomOut = useCallback(() => {
    const s = useUIStore.getState() as unknown as Record<string, unknown>;
    if (typeof s['zoomOut'] === 'function') (s['zoomOut'] as () => void)();
  }, []);
  const zoomReset = useCallback(() => {
    const s = useUIStore.getState() as unknown as Record<string, unknown>;
    if (typeof s['zoomReset'] === 'function') (s['zoomReset'] as () => void)();
  }, []);

  // Wire keyboard shortcuts
  useKeyboardShortcuts({
    onSelectTool: useCallback(() => setActiveTool('select'), [setActiveTool]),
    onPolygonTool: useCallback(() => setActiveTool('polygon'), [setActiveTool]),
    onRectangleTool: useCallback(() => setActiveTool('rectangle'), [setActiveTool]),
    onEllipseTool: useCallback(() => setActiveTool('ellipse'), [setActiveTool]),
    onDeleteGate: handleDeleteGate,
    onUndo: handleUndo,
    onOpenFile: handleOpenFile,
    onLoadDemo: loadDemoData,
    onEscape: handleEscape,
    onZoomIn: zoomIn,
    onZoomOut: zoomOut,
    onZoomReset: zoomReset,
  });

  const handleExportPNG = useCallback(() => {
    const canvas = document.querySelector<HTMLCanvasElement>('canvas');
    if (!canvas) return;
    const url = canvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = url;
    a.download = `cytolens-${Date.now()}.png`;
    a.click();
  }, []);

  const handleExportCSV = useCallback(() => {
    if (!computedStats || !selectedSample) return;
    const multi = {
      experimentId: experiment?.id ?? 'exp',
      experimentName: experiment?.name ?? 'Experiment',
      computedAt: new Date().toISOString(),
      channels: computedStats.populations[0]?.channels.map(c => c.channel) ?? [],
      samples: [{ ...computedStats, sampleLabel: selectedSample.label }],
    };
    const csv = statsToCSV(multi);
    downloadCSV(csv, `${selectedSample.label}-stats.csv`);
  }, [computedStats, selectedSample, experiment]);

  return (
    <div
      className="flex flex-col h-screen bg-gray-100 overflow-hidden"
      onDragOver={handleGlobalDragOver}
      onDrop={handleGlobalDrop}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept=".fcs,.lmd"
        multiple
        className="hidden"
        onChange={handleFileChange}
      />

      <Toolbar
        onOpenFile={handleOpenFile}
        onLoadDemo={loadDemoData}
        onExportPNG={handleExportPNG}
        onExportCSV={handleExportCSV}
        hasData={hasData}
      />

      <div className="flex flex-1 overflow-hidden min-h-0">
        {isLeftOpen && (
          <div
            className="flex flex-col bg-white border-r border-gray-200 flex-shrink-0 overflow-hidden"
            style={{ width: leftPanelWidth }}
          >
            <WorkspaceTree
              samples={samples}
              gateRoots={gateRoots}
              gateResults={gateResults}
              {...(selectedSampleId != null ? { selectedSampleId } : {})}
              {...(selectedGateId != null ? { selectedGateId } : {})}
              onSampleSelect={id => selectSample(id)}
              onGateSelect={id => selectGate(id)}
              className="flex-1"
            />
          </div>
        )}

        {hasData ? (
          <WorksheetGrid
            layout={worksheetLayout}
            onLayoutChange={setWorksheetLayout}
            {...(eventMatrix !== undefined ? { events: eventMatrix } : {})}
            gates={allGates}
            className="flex-1 min-w-0"
          />
        ) : (
          <WelcomeScreen
            onOpenFile={handleOpenFile}
            onLoadDemo={loadDemoData}
            onDrop={handleDropFiles}
          />
        )}

        {isRightOpen && (
          <div
            className="flex flex-col bg-white border-l border-gray-200 flex-shrink-0 overflow-hidden"
            style={{ width: rightPanelWidth }}
          >
            <RightPanel
              channels={channelList}
              onExportPNG={handleExportPNG}
              onExportCSV={handleExportCSV}
            />
          </div>
        )}
      </div>

      <StatusBar />
    </div>
  );
};

export default App;
