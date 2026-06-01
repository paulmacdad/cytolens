/**
 * WorkspaceTree — left panel showing sample and gate hierarchy.
 *
 * Renders an expandable tree of:
 *   Experiment
 *   ├── Sample 1.fcs (50,000 events)
 *   │   ├── Lymphocytes (72.3%)
 *   │   │   ├── CD3+ T cells (45.1%)
 *   │   │   └── CD19+ B cells (18.2%)
 *   │   └── Debris (4.1%)
 *   └── Sample 2.fcs (45,320 events)
 */

import React, { useState, useCallback } from 'react';
import type { Sample, GateNode, GateResult } from '@cytolens/core';

export interface WorkspaceTreeProps {
  samples: Sample[];
  gateRoots?: GateNode[];
  gateResults?: Map<string, GateResult>;
  selectedSampleId?: string;
  selectedGateId?: string;
  onSampleSelect?: (sampleId: string) => void;
  onGateSelect?: (gateId: string) => void;
  className?: string;
}

export const WorkspaceTree: React.FC<WorkspaceTreeProps> = ({
  samples,
  gateRoots = [],
  gateResults = new Map(),
  selectedSampleId,
  selectedGateId,
  onSampleSelect,
  onGateSelect,
  className = '',
}) => {
  const [expandedSamples, setExpandedSamples] = useState<Set<string>>(new Set());
  const [expandedGates, setExpandedGates] = useState<Set<string>>(new Set());

  const toggleSample = useCallback((id: string) => {
    setExpandedSamples(s => {
      const next = new Set(s);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  const toggleGate = useCallback((id: string) => {
    setExpandedGates(s => {
      const next = new Set(s);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  return (
    <div className={`flex flex-col h-full overflow-hidden ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-200">
        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Workspace</span>
        <button className="text-xs text-blue-600 hover:text-blue-700">+ Add</button>
      </div>

      {/* Tree content */}
      <div className="flex-1 overflow-y-auto py-1">
        {samples.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-gray-400">
            <div className="text-2xl mb-2">📂</div>
            <div>Drop FCS files to begin</div>
          </div>
        ) : (
          samples.map(sample => (
            <SampleTreeItem
              key={sample.id}
              sample={sample}
              gateRoots={gateRoots}
              gateResults={gateResults}
              isExpanded={expandedSamples.has(sample.id)}
              isSelected={selectedSampleId === sample.id}
              selectedGateId={selectedGateId}
              expandedGates={expandedGates}
              onToggle={() => toggleSample(sample.id)}
              onSelect={() => onSampleSelect?.(sample.id)}
              onGateToggle={toggleGate}
              onGateSelect={onGateSelect}
            />
          ))
        )}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Sample tree item
// ---------------------------------------------------------------------------

interface SampleTreeItemProps {
  sample: Sample;
  gateRoots: GateNode[];
  gateResults: Map<string, GateResult>;
  isExpanded: boolean;
  isSelected: boolean;
  selectedGateId?: string;
  expandedGates: Set<string>;
  onToggle: () => void;
  onSelect: () => void;
  onGateToggle: (id: string) => void;
  onGateSelect?: (id: string) => void;
}

const STATUS_ICONS: Record<string, string> = {
  pending: '⏳',
  loading: '⌛',
  ready: '📊',
  error: '⚠️',
};

const SampleTreeItem: React.FC<SampleTreeItemProps> = ({
  sample,
  gateRoots,
  gateResults,
  isExpanded,
  isSelected,
  selectedGateId,
  expandedGates,
  onToggle,
  onSelect,
  onGateToggle,
  onGateSelect,
}) => {
  const hasGates = gateRoots.length > 0;
  const isExpandable = hasGates || sample.status === 'ready';

  return (
    <div>
      <div
        className={`flex items-center gap-1 px-2 py-1 cursor-pointer hover:bg-gray-50 rounded mx-1 ${
          isSelected ? 'bg-blue-50 text-blue-700' : 'text-gray-700'
        }`}
        onClick={onSelect}
      >
        <button
          className="w-4 h-4 flex items-center justify-center text-gray-400 hover:text-gray-600 flex-shrink-0"
          onClick={e => { e.stopPropagation(); if (isExpandable) onToggle(); }}
        >
          {isExpandable ? (isExpanded ? '▼' : '▶') : '·'}
        </button>
        <span className="text-xs mr-1 flex-shrink-0">{STATUS_ICONS[sample.status] ?? '📊'}</span>
        <span className="text-xs font-medium truncate flex-1 min-w-0">{sample.label}</span>
        {sample.status === 'ready' && (
          <span className="text-xs text-gray-400 flex-shrink-0">
            {(sample.eventCount / 1000).toFixed(0)}k
          </span>
        )}
      </div>

      {isExpanded && hasGates && (
        <div className="pl-6">
          {gateRoots.map(node => (
            <GateTreeItem
              key={node.gate.id}
              node={node}
              result={gateResults.get(node.gate.id)}
              isSelected={selectedGateId === node.gate.id}
              expandedGates={expandedGates}
              selectedGateId={selectedGateId}
              onToggle={onGateToggle}
              onSelect={onGateSelect}
            />
          ))}
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Gate tree item
// ---------------------------------------------------------------------------

interface GateTreeItemProps {
  node: GateNode;
  result?: GateResult;
  isSelected: boolean;
  expandedGates: Set<string>;
  selectedGateId?: string;
  onToggle: (id: string) => void;
  onSelect?: (id: string) => void;
  depth?: number;
}

const GATE_TYPE_ICONS: Record<string, string> = {
  polygon: '⬟',
  rectangle: '⬜',
  ellipse: '⭕',
  interval: '│',
  quadrant: '⊞',
  boolean: '⊕',
};

const GateTreeItem: React.FC<GateTreeItemProps> = ({
  node,
  result,
  isSelected,
  expandedGates,
  selectedGateId,
  onToggle,
  onSelect,
  depth = 0,
}) => {
  const { gate } = node;
  const hasChildren = node.children.length > 0;
  const isExpanded = expandedGates.has(gate.id);

  return (
    <div>
      <div
        className={`flex items-center gap-1 px-2 py-0.5 cursor-pointer hover:bg-gray-50 rounded mx-1 ${
          isSelected ? 'bg-blue-50 text-blue-700' : 'text-gray-600'
        }`}
        style={{ paddingLeft: `${8 + depth * 12}px` }}
        onClick={() => onSelect?.(gate.id)}
      >
        <button
          className="w-3 h-3 flex items-center justify-center text-gray-400 flex-shrink-0 text-xs"
          onClick={e => { e.stopPropagation(); if (hasChildren) onToggle(gate.id); }}
        >
          {hasChildren ? (isExpanded ? '▼' : '▶') : '·'}
        </button>
        <span
          className="w-2 h-2 rounded-full flex-shrink-0 mr-0.5"
          style={{ backgroundColor: gate.color ?? '#2563eb' }}
        />
        <span className="text-xs truncate flex-1">{gate.name}</span>
        {result && (
          <span className="text-xs text-gray-400 ml-1 flex-shrink-0">
            {result.percentOfParent.toFixed(1)}%
          </span>
        )}
      </div>

      {isExpanded && hasChildren && (
        <div>
          {node.children.map(child => (
            <GateTreeItem
              key={child.gate.id}
              node={child}
              result={child.result}
              isSelected={selectedGateId === child.gate.id}
              expandedGates={expandedGates}
              selectedGateId={selectedGateId}
              onToggle={onToggle}
              onSelect={onSelect}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default WorkspaceTree;
