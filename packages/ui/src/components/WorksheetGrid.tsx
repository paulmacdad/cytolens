/**
 * WorksheetGrid — multi-plot layout workspace for CytoLens.
 *
 * CSS grid of resizable plot cells, like FlowJo's layout area.
 * Each cell has a title bar with type icon, channel labels, drag handle,
 * and close button. Click a title bar to select a plot (highlighted border).
 * "Add plot" button appends a new scatter cell.
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { ScatterPlot } from './ScatterPlot.js';
import { HistogramPlot } from './HistogramPlot.js';
import { UMAPPlot } from './UMAPPlot.js';
import type { EventMatrix, Gate } from '@cytolens/core';
import { runUMAP } from '@cytolens/core';
import { createLogicle, createLinear, LOGICLE_PRESETS } from '@cytolens/core';
import type { LogicleTransform } from '@cytolens/core';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TransformType = 'linear' | 'log' | 'logicle';

export interface PlotLayout {
  id: string;
  type: 'scatter' | 'histogram' | 'contour' | 'umap';
  xChannel: string;
  yChannel?: string;
  xTransformType?: TransformType;
  yTransformType?: TransformType;
  colorMode?: 'density' | 'uniform';
  width?: number;
  height?: number;
  gridColumn?: number;
  gridRow?: number;
}

export interface WorksheetGridProps {
  layout: PlotLayout[];
  onLayoutChange?: (layout: PlotLayout[]) => void;
  events?: EventMatrix;
  gates?: Gate[];
  gateStats?: Map<string, { count: number; percent: number }>;
  onAddPlot?: () => void;
  className?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TYPE_ICONS: Record<PlotLayout['type'], string> = {
  scatter: '⬡',
  histogram: '▦',
  contour: '◎',
  umap: '✦',
};

function makeTransform(t: TransformType | undefined): LogicleTransform {
  if (t === 'logicle') {
    return createLogicle(LOGICLE_PRESETS.BD_18BIT) as unknown as LogicleTransform;
  }
  return createLinear({ gain: 1 / 262144, offset: 0 }) as unknown as LogicleTransform;
}

// ---------------------------------------------------------------------------
// Default PBMC layout (exported so App.tsx can reference it)
// ---------------------------------------------------------------------------

export const DEFAULT_PBMC_LAYOUT: PlotLayout[] = [
  {
    id: 'plot-fsc-ssc',
    type: 'scatter',
    xChannel: 'FSC-A',
    yChannel: 'SSC-A',
    xTransformType: 'linear',
    yTransformType: 'linear',
    colorMode: 'density',
  },
  {
    id: 'plot-fsc-h',
    type: 'scatter',
    xChannel: 'FSC-A',
    yChannel: 'FSC-H',
    xTransformType: 'linear',
    yTransformType: 'linear',
    colorMode: 'density',
  },
  {
    id: 'plot-cd3-ssc',
    type: 'scatter',
    xChannel: 'CD3-FITC',
    yChannel: 'SSC-A',
    xTransformType: 'logicle',
    yTransformType: 'linear',
    colorMode: 'density',
  },
  {
    id: 'plot-cd4-cd8',
    type: 'scatter',
    xChannel: 'CD4-PE',
    yChannel: 'CD8-APC',
    xTransformType: 'logicle',
    yTransformType: 'logicle',
    colorMode: 'density',
  },
];

// ---------------------------------------------------------------------------
// PlotCell
// ---------------------------------------------------------------------------

interface PlotCellProps {
  layout: PlotLayout;
  events?: EventMatrix;
  gates?: Gate[];
  isSelected: boolean;
  onSelect: (id: string) => void;
  onRemove: (id: string) => void;
}

const PlotCell: React.FC<PlotCellProps> = ({
  layout,
  events,
  gates,
  isSelected,
  onSelect,
  onRemove,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [plotSize, setPlotSize] = useState({ w: 300, h: 260 });

  // UMAP state (only used when layout.type === 'umap')
  const [umapEmbedding, setUmapEmbedding] = useState<Float32Array | null>(null);
  const [umapRunning, setUmapRunning] = useState(false);
  const [umapProgress, setUmapProgress] = useState(0);

  const handleRunUMAP = useCallback(async () => {
    if (!events || umapRunning) return;
    setUmapRunning(true);
    setUmapProgress(0);
    setUmapEmbedding(null);
    try {
      const result = await runUMAP(events, {
        nEpochs: 200,
        maxEvents: 20000,
        onProgress: (epoch, total) => {
          setUmapProgress(epoch / total);
        },
      });
      setUmapEmbedding(result.embedding);
    } catch (err) {
      console.error('UMAP failed:', err);
    } finally {
      setUmapRunning(false);
      setUmapProgress(0);
    }
  }, [events, umapRunning]);

  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver(entries => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        // 32px reserved for title bar
        if (width > 40 && height > 72) {
          setPlotSize({ w: Math.floor(width), h: Math.floor(height - 32) });
        }
      }
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  const xTransform = makeTransform(layout.xTransformType);
  const yTransform = makeTransform(layout.yTransformType);

  const title =
    layout.type === 'histogram'
      ? layout.xChannel
      : layout.type === 'umap'
        ? 'UMAP'
        : `${layout.xChannel} / ${layout.yChannel ?? '—'}`;

  const visibleGates = (gates ?? []).filter(
    g =>
      g.xChannel === layout.xChannel &&
      (layout.type === 'histogram' || g.yChannel === layout.yChannel),
  );

  return (
    <div
      ref={containerRef}
      className={`flex flex-col bg-white rounded-lg overflow-hidden border-2 transition-all ${
        isSelected
          ? 'border-blue-500 shadow-md shadow-blue-100'
          : 'border-gray-200 hover:border-gray-300 hover:shadow-sm'
      }`}
      style={{ minHeight: 300 }}
    >
      {/* Title bar */}
      <div
        className={`flex items-center gap-1.5 px-2 py-1 border-b cursor-pointer select-none flex-shrink-0 ${
          isSelected
            ? 'bg-blue-50 border-blue-200'
            : 'bg-gray-50 border-gray-200 hover:bg-gray-100'
        }`}
        onClick={() => onSelect(layout.id)}
        title="Click to select"
      >
        {/* Drag handle */}
        <span
          className="text-gray-300 text-xs cursor-grab active:cursor-grabbing"
          title="Drag to reorder"
        >
          ⠿
        </span>

        {/* Type icon */}
        <span className="text-xs text-gray-400">{TYPE_ICONS[layout.type]}</span>

        {/* Channel title */}
        <span className="flex-1 text-xs font-medium text-gray-700 truncate">{title}</span>

        {/* Transform badge */}
        {layout.xTransformType && layout.xTransformType !== 'linear' && (
          <span className="text-xs bg-gray-100 text-gray-500 px-1 rounded uppercase">
            {layout.xTransformType.slice(0, 3)}
          </span>
        )}

        {/* Remove */}
        <button
          className="ml-1 w-4 h-4 flex items-center justify-center text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors text-sm leading-none"
          onClick={e => {
            e.stopPropagation();
            onRemove(layout.id);
          }}
          title="Remove plot"
        >
          ×
        </button>
      </div>

      {/* Plot body */}
      <div className="flex-1 overflow-hidden">
        {!events ? (
          <div className="w-full h-full flex items-center justify-center text-xs text-gray-300 select-none">
            No data loaded
          </div>
        ) : layout.type === 'histogram' ? (
          <HistogramPlot
            series={[{
              events,
              channel: layout.xChannel,
              color: '#2563eb',
              label: layout.xChannel,
              transform: xTransform,
            }]}
            width={plotSize.w}
            height={plotSize.h}
            bins={200}
            filled
          />
        ) : layout.type === 'umap' ? (
          <UMAPPlot
            embedding={umapEmbedding}
            events={events}
            gates={visibleGates}
            isRunning={umapRunning}
            progress={umapProgress}
            onRunUMAP={handleRunUMAP}
            colorBy="density"
            width={plotSize.w}
            height={plotSize.h}
          />
        ) : (
          <ScatterPlot
            events={events}
            xChannel={layout.xChannel}
            yChannel={layout.yChannel ?? layout.xChannel}
            xTransform={xTransform}
            yTransform={yTransform}
            gates={visibleGates}
            width={plotSize.w}
            height={plotSize.h}
            alpha={0.35}
            pointSize={1.2}
            color="#2563eb"
          />
        )}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// WorksheetGrid
// ---------------------------------------------------------------------------

export const WorksheetGrid: React.FC<WorksheetGridProps> = ({
  layout,
  onLayoutChange,
  events,
  gates,
  gateStats,
  onAddPlot,
  className = '',
}) => {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const handleRemove = useCallback(
    (id: string) => {
      if (!onLayoutChange) return;
      onLayoutChange(layout.filter(p => p.id !== id));
      if (selectedId === id) setSelectedId(null);
    },
    [layout, onLayoutChange, selectedId],
  );

  const handleAddPlot = useCallback((type: PlotLayout['type'] = 'scatter') => {
    if (onAddPlot && type === 'scatter') {
      onAddPlot();
      return;
    }
    if (!onLayoutChange) return;
    const newPlot: PlotLayout =
      type === 'umap'
        ? {
            id: `plot-umap-${Date.now()}`,
            type: 'umap',
            xChannel: events?.channels[0] ?? 'FSC-A',
            colorMode: 'density',
          }
        : {
            id: `plot-${Date.now()}`,
            type: 'scatter',
            xChannel: events?.channels[0] ?? 'FSC-A',
            yChannel: events?.channels[1] ?? 'SSC-A',
            xTransformType: 'linear',
            yTransformType: 'linear',
            colorMode: 'density',
          };
    onLayoutChange([...layout, newPlot]);
  }, [onAddPlot, onLayoutChange, layout, events]);

  return (
    <div className={`flex flex-col h-full ${className}`}>
      {/* Grid */}
      <div className="flex-1 overflow-auto p-3" style={{ background: '#f8fafc' }}>
        {layout.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-gray-400">
            <div className="text-5xl mb-3 opacity-20">⬡</div>
            <p className="text-sm">No plots. Click "Add plot" to begin.</p>
          </div>
        ) : (
          <div
            className="grid gap-3"
            style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}
          >
            {layout.map(p => (
              <PlotCell
                key={p.id}
                layout={p}
                events={events}
                gates={gates}
                isSelected={selectedId === p.id}
                onSelect={setSelectedId}
                onRemove={handleRemove}
              />
            ))}
          </div>
        )}
      </div>

      {/* Bottom bar */}
      <div className="flex items-center gap-2 px-3 py-1.5 bg-white border-t border-gray-200 flex-shrink-0">
        <button
          className="flex items-center gap-1 text-xs px-2.5 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors font-medium"
          onClick={() => handleAddPlot('scatter')}
        >
          <span className="text-sm leading-none">+</span>
          Add plot
        </button>
        <button
          className="flex items-center gap-1 text-xs px-2.5 py-1 bg-indigo-600 text-white rounded hover:bg-indigo-700 transition-colors font-medium"
          onClick={() => handleAddPlot('umap')}
          title="Add UMAP dimensionality reduction plot"
        >
          <span className="text-sm leading-none">✦</span>
          Add UMAP
        </button>
        {selectedId && (
          <span className="text-xs text-gray-500">
            {(() => {
              const p = layout.find(pl => pl.id === selectedId);
              if (!p) return null;
              return p.yChannel ? `${p.xChannel} / ${p.yChannel}` : p.xChannel;
            })()}
          </span>
        )}
        <div className="flex-1" />
        <span className="text-xs text-gray-400">
          {layout.length} plot{layout.length !== 1 ? 's' : ''}
        </span>
      </div>
    </div>
  );
};

export default WorksheetGrid;
