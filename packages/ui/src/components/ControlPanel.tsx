/**
 * ControlPanel — right-hand properties panel.
 *
 * Sections:
 *   1. Axis / Channel selectors
 *   2. Transform (per axis)
 *   3. Selected gate info
 *   4. Display options
 *   5. Export
 */

import React from 'react';
import type { Gate, GateResult, Sample } from '@cytolens/core';

export interface ControlPanelProps {
  // Axis / channel
  availableChannels?: string[]
  xChannel?: string
  yChannel?: string
  onXChannelChange?: (ch: string) => void
  onYChannelChange?: (ch: string) => void

  // Transform
  xTransformType?: 'linear' | 'log' | 'logicle'
  yTransformType?: 'linear' | 'log' | 'logicle'
  onXTransformChange?: (t: 'linear' | 'log' | 'logicle') => void
  onYTransformChange?: (t: 'linear' | 'log' | 'logicle') => void

  // Gate
  selectedSample?: Sample
  selectedGate?: Gate
  gateResult?: GateResult
  onGateColorChange?: (id: string, color: string) => void
  onGateNameChange?: (id: string, name: string) => void
  onGateDelete?: (id: string) => void

  // Display
  pointSize?: number
  alpha?: number
  showDensity?: boolean
  histogramBins?: 64 | 128 | 256 | 512
  onPointSizeChange?: (v: number) => void
  onAlphaChange?: (v: number) => void
  onShowDensityChange?: (v: boolean) => void
  onHistogramBinsChange?: (v: 64 | 128 | 256 | 512) => void

  // Export
  onExportPNG?: () => void
  onExportCSV?: () => void

  className?: string
}

// ---------------------------------------------------------------------------
// Tiny shared primitives
// ---------------------------------------------------------------------------

const Divider: React.FC = () => (
  <div className="border-t border-gray-100 my-0" />
);

const SectionHeader: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="px-3 py-1.5 bg-gray-50 border-b border-gray-100">
    <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">
      {children}
    </span>
  </div>
);

const Label: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <label className="block text-xs font-medium text-gray-500 mb-0.5">{children}</label>
);

const StatRow: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="flex justify-between items-center py-0.5">
    <span className="text-xs text-gray-500">{label}</span>
    <span className="text-xs font-medium text-gray-800 tabular-nums">{value}</span>
  </div>
);

const Select: React.FC<{
  value: string
  options: { value: string; label: string }[]
  onChange: (v: string) => void
  placeholder?: string
}> = ({ value, options, onChange, placeholder }) => (
  <select
    value={value}
    onChange={e => onChange(e.target.value)}
    className="w-full text-xs border border-gray-200 rounded px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-blue-400 text-gray-700"
  >
    {placeholder && (
      <option value="" disabled>
        {placeholder}
      </option>
    )}
    {options.map(o => (
      <option key={o.value} value={o.value}>
        {o.label}
      </option>
    ))}
  </select>
);

const TRANSFORMS = [
  { value: 'linear', label: 'Linear' },
  { value: 'log', label: 'Log' },
  { value: 'logicle', label: 'Logicle' },
] as const;

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export const ControlPanel: React.FC<ControlPanelProps> = ({
  availableChannels = [],
  xChannel = '',
  yChannel = '',
  onXChannelChange,
  onYChannelChange,
  xTransformType = 'linear',
  yTransformType = 'linear',
  onXTransformChange,
  onYTransformChange,
  selectedSample,
  selectedGate,
  gateResult,
  onGateColorChange,
  onGateNameChange,
  onGateDelete,
  pointSize = 1.5,
  alpha = 0.6,
  showDensity = false,
  histogramBins = 256,
  onPointSizeChange,
  onAlphaChange,
  onShowDensityChange,
  onHistogramBinsChange,
  onExportPNG,
  onExportCSV,
  className = '',
}) => {
  const channelOptions = availableChannels.map(ch => ({ value: ch, label: ch }));

  return (
    <div className={`flex flex-col h-full overflow-hidden bg-white text-sm ${className}`}>

      {/* ── 1. Axis / Channel ─────────────────────────────────────────── */}
      <SectionHeader>Axes</SectionHeader>
      <div className="px-3 py-2 space-y-2">
        <div>
          <Label>X Axis</Label>
          <Select
            value={xChannel}
            options={channelOptions}
            onChange={v => onXChannelChange?.(v)}
            placeholder="Select channel…"
          />
        </div>
        <div>
          <Label>Y Axis</Label>
          <Select
            value={yChannel}
            options={channelOptions}
            onChange={v => onYChannelChange?.(v)}
            placeholder="Select channel…"
          />
        </div>
      </div>

      <Divider />

      {/* ── 2. Transform ──────────────────────────────────────────────── */}
      <SectionHeader>Transform</SectionHeader>
      <div className="px-3 py-2 space-y-2">
        <div>
          <Label>X Transform</Label>
          <Select
            value={xTransformType}
            options={TRANSFORMS as unknown as { value: string; label: string }[]}
            onChange={v => onXTransformChange?.(v as 'linear' | 'log' | 'logicle')}
          />
        </div>
        <div>
          <Label>Y Transform</Label>
          <Select
            value={yTransformType}
            options={TRANSFORMS as unknown as { value: string; label: string }[]}
            onChange={v => onYTransformChange?.(v as 'linear' | 'log' | 'logicle')}
          />
        </div>
      </div>

      <Divider />

      {/* ── 3. Gate info ──────────────────────────────────────────────── */}
      <SectionHeader>Gate</SectionHeader>
      {selectedGate ? (
        <div className="px-3 py-2 space-y-2">
          {/* Name */}
          <div>
            <Label>Name</Label>
            <input
              type="text"
              value={selectedGate.name}
              onChange={e => onGateNameChange?.(selectedGate.id, e.target.value)}
              className="w-full text-xs border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400"
            />
          </div>

          {/* Color */}
          <div>
            <Label>Colour</Label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={selectedGate.color ?? '#2563eb'}
                onChange={e => onGateColorChange?.(selectedGate.id, e.target.value)}
                className="w-7 h-7 rounded cursor-pointer border border-gray-200 p-0.5"
              />
              <span className="text-xs text-gray-500 tabular-nums">
                {selectedGate.color ?? '#2563eb'}
              </span>
            </div>
          </div>

          {/* Stats */}
          {gateResult && (
            <div>
              <Label>Statistics</Label>
              <div className="bg-gray-50 rounded px-2 py-1 space-y-0.5">
                <StatRow label="Events" value={gateResult.count.toLocaleString()} />
                <StatRow label="% of parent" value={`${gateResult.percentOfParent.toFixed(2)}%`} />
                <StatRow label="% of total" value={`${gateResult.percentOfTotal.toFixed(2)}%`} />
              </div>
            </div>
          )}

          {/* Delete */}
          {onGateDelete && (
            <button
              onClick={() => onGateDelete(selectedGate.id)}
              className="w-full text-xs text-red-500 border border-red-200 rounded px-2 py-1 hover:bg-red-50 transition-colors"
            >
              Delete gate
            </button>
          )}
        </div>
      ) : (
        <div className="px-3 py-2 text-xs text-gray-400 italic">No gate selected</div>
      )}

      <Divider />

      {/* ── 4. Display options ────────────────────────────────────────── */}
      <SectionHeader>Display</SectionHeader>
      <div className="px-3 py-2 space-y-2">
        {/* Point size */}
        <div>
          <div className="flex justify-between items-center mb-0.5">
            <Label>Point size</Label>
            <span className="text-[10px] text-gray-400 tabular-nums">{pointSize.toFixed(1)} px</span>
          </div>
          <input
            type="range"
            min={0.5}
            max={5}
            step={0.5}
            value={pointSize}
            onChange={e => onPointSizeChange?.(parseFloat(e.target.value))}
            className="w-full h-1.5 accent-blue-500"
          />
          <div className="flex justify-between text-[10px] text-gray-300 mt-0.5">
            <span>0.5</span>
            <span>5</span>
          </div>
        </div>

        {/* Opacity */}
        <div>
          <div className="flex justify-between items-center mb-0.5">
            <Label>Opacity</Label>
            <span className="text-[10px] text-gray-400 tabular-nums">{(alpha * 100).toFixed(0)}%</span>
          </div>
          <input
            type="range"
            min={0.1}
            max={1.0}
            step={0.05}
            value={alpha}
            onChange={e => onAlphaChange?.(parseFloat(e.target.value))}
            className="w-full h-1.5 accent-blue-500"
          />
          <div className="flex justify-between text-[10px] text-gray-300 mt-0.5">
            <span>10%</span>
            <span>100%</span>
          </div>
        </div>

        {/* Density colouring */}
        <div className="flex items-center justify-between">
          <Label>Density colouring</Label>
          <button
            role="switch"
            aria-checked={showDensity}
            onClick={() => onShowDensityChange?.(!showDensity)}
            className={`relative inline-flex h-4 w-7 items-center rounded-full transition-colors focus:outline-none ${
              showDensity ? 'bg-blue-500' : 'bg-gray-200'
            }`}
          >
            <span
              className={`inline-block h-3 w-3 transform rounded-full bg-white shadow transition-transform ${
                showDensity ? 'translate-x-3.5' : 'translate-x-0.5'
              }`}
            />
          </button>
        </div>

        {/* Histogram bins */}
        <div>
          <Label>Histogram bins</Label>
          <div className="flex gap-1">
            {([64, 128, 256, 512] as const).map(n => (
              <button
                key={n}
                onClick={() => onHistogramBinsChange?.(n)}
                className={`flex-1 text-[10px] rounded border py-0.5 transition-colors ${
                  histogramBins === n
                    ? 'bg-blue-500 text-white border-blue-500'
                    : 'text-gray-500 border-gray-200 hover:border-blue-300'
                }`}
              >
                {n}
              </button>
            ))}
          </div>
        </div>
      </div>

      <Divider />

      {/* ── 5. Export ─────────────────────────────────────────────────── */}
      <SectionHeader>Export</SectionHeader>
      <div className="px-3 py-2 space-y-1.5">
        <button
          onClick={onExportPNG}
          disabled={!onExportPNG}
          className="w-full text-xs border border-gray-200 rounded px-2 py-1.5 text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-1.5"
        >
          <svg className="w-3 h-3" viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 12l-4-4h2.5V4h3v4H12L8 12z"/>
            <path d="M2 13h12v1.5H2V13z"/>
          </svg>
          Export PNG (300 DPI)
        </button>
        <button
          onClick={onExportCSV}
          disabled={!onExportCSV}
          className="w-full text-xs border border-gray-200 rounded px-2 py-1.5 text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-1.5"
        >
          <svg className="w-3 h-3" viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 12l-4-4h2.5V4h3v4H12L8 12z"/>
            <path d="M2 13h12v1.5H2V13z"/>
          </svg>
          Export Stats CSV
        </button>
      </div>

      {/* Bottom padding */}
      <div className="flex-1" />
    </div>
  );
};

export default ControlPanel;
