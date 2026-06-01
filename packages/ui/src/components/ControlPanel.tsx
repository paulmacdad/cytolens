/**
 * ControlPanel — right-hand properties panel.
 *
 * Shows context-sensitive controls depending on what is selected:
 *   - No selection: experiment-level settings
 *   - Sample selected: channel mapper, compensation selector, transform settings
 *   - Gate selected: gate properties, colour picker, statistics
 */

import React from 'react';
import type { Gate, GateResult, Sample } from '@cytoflow/core';

export interface ControlPanelProps {
  selectedSample?: Sample;
  selectedGate?: Gate;
  gateResult?: GateResult;
  onGateColorChange?: (gateId: string, color: string) => void;
  onGateNameChange?: (gateId: string, name: string) => void;
  className?: string;
}

export const ControlPanel: React.FC<ControlPanelProps> = ({
  selectedSample,
  selectedGate,
  gateResult,
  onGateColorChange,
  onGateNameChange,
  className = '',
}) => {
  return (
    <div className={`flex flex-col h-full overflow-hidden bg-white ${className}`}>
      {/* Header */}
      <div className="px-3 py-2 border-b border-gray-200">
        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
          {selectedGate ? 'Gate Properties' : selectedSample ? 'Sample' : 'Properties'}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto">
        {selectedGate ? (
          <GateProperties
            gate={selectedGate}
            result={gateResult}
            onColorChange={onGateColorChange}
            onNameChange={onGateNameChange}
          />
        ) : selectedSample ? (
          <SampleProperties sample={selectedSample} />
        ) : (
          <EmptyState />
        )}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Sub-panels
// ---------------------------------------------------------------------------

const GateProperties: React.FC<{
  gate: Gate;
  result?: GateResult;
  onColorChange?: (gateId: string, color: string) => void;
  onNameChange?: (gateId: string, name: string) => void;
}> = ({ gate, result, onColorChange, onNameChange }) => {
  const PRESET_COLORS = [
    '#2563eb', '#16a34a', '#dc2626', '#d97706',
    '#7c3aed', '#0891b2', '#be185d', '#65a30d',
  ];

  return (
    <div className="p-3 space-y-4">
      {/* Name */}
      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1">Name</label>
        <input
          type="text"
          value={gate.name}
          onChange={e => onNameChange?.(gate.id, e.target.value)}
          className="w-full text-sm border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400"
        />
      </div>

      {/* Type */}
      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1">Type</label>
        <div className="text-sm text-gray-700 capitalize">{gate.type}</div>
      </div>

      {/* Channels */}
      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1">Channels</label>
        <div className="text-sm text-gray-700">
          {gate.xChannel}{gate.yChannel ? ` / ${gate.yChannel}` : ''}
        </div>
      </div>

      {/* Colour */}
      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1">Colour</label>
        <div className="flex flex-wrap gap-1.5">
          {PRESET_COLORS.map(c => (
            <button
              key={c}
              className={`w-5 h-5 rounded-full border-2 ${
                gate.color === c ? 'border-gray-700' : 'border-transparent'
              }`}
              style={{ backgroundColor: c }}
              onClick={() => onColorChange?.(gate.id, c)}
            />
          ))}
          <input
            type="color"
            value={gate.color ?? '#2563eb'}
            onChange={e => onColorChange?.(gate.id, e.target.value)}
            className="w-5 h-5 rounded cursor-pointer border border-gray-200"
          />
        </div>
      </div>

      {/* Statistics */}
      {result && (
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-2">Statistics</label>
          <div className="space-y-1">
            <StatRow label="Events" value={result.count.toLocaleString()} />
            <StatRow label="% of parent" value={`${result.percentOfParent.toFixed(2)}%`} />
            <StatRow label="% of total" value={`${result.percentOfTotal.toFixed(2)}%`} />
          </div>
        </div>
      )}
    </div>
  );
};

const SampleProperties: React.FC<{ sample: Sample }> = ({ sample }) => {
  const keywords = Object.entries(sample.keywords ?? {}).slice(0, 20);

  return (
    <div className="p-3 space-y-4">
      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1">File</label>
        <div className="text-sm text-gray-700 break-all">{sample.filename}</div>
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1">Events</label>
        <div className="text-sm text-gray-700">{sample.eventCount.toLocaleString()}</div>
      </div>
      {sample.metadata && (
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Channels</label>
          <div className="text-sm text-gray-700">{sample.metadata.channels.length}</div>
        </div>
      )}
      {keywords.length > 0 && (
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Keywords</label>
          <div className="space-y-0.5 max-h-48 overflow-y-auto">
            {keywords.map(([k, v]) => (
              <div key={k} className="flex gap-2 text-xs">
                <span className="text-gray-400 truncate w-24 flex-shrink-0">{k}</span>
                <span className="text-gray-700 truncate">{v}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

const StatRow: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="flex justify-between items-center">
    <span className="text-xs text-gray-500">{label}</span>
    <span className="text-xs font-medium text-gray-800 tabular-nums">{value}</span>
  </div>
);

const EmptyState: React.FC = () => (
  <div className="flex flex-col items-center justify-center h-32 text-gray-400">
    <div className="text-lg mb-1">☰</div>
    <div className="text-xs">Select a sample or gate</div>
  </div>
);

export default ControlPanel;
