/**
 * StatsTable — flow cytometry population statistics table.
 *
 * Mirrors the compact FlowJo statistics view: one row per gated population,
 * columns for event counts / percentages, then one MFI column per channel.
 */

import React, { useMemo } from 'react';
import type { ExperimentStats, PopulationStats } from '@cytolens/core';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface StatsTableProps {
  stats: ExperimentStats | null;
  selectedGateId?: string;
  onGateSelect?: (gateId: string) => void;
  className?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Deterministic hue from a gate id string */
function gateColor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) & 0xffffffff;
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 65%, 52%)`;
}

/** Format a float to at most 1 decimal place; suppress trailing zero */
function fmt(n: number): string {
  if (!isFinite(n)) return '—';
  const s = n.toFixed(1);
  return s.endsWith('.0') ? s.slice(0, -2) : s;
}

/** Format an integer with thousands separators */
function fmtInt(n: number): string {
  return n.toLocaleString('en-US');
}

// ---------------------------------------------------------------------------
// Subcomponents
// ---------------------------------------------------------------------------

interface ColorSwatchProps {
  color: string;
}

function ColorSwatch({ color }: ColorSwatchProps) {
  return (
    <span
      className="inline-block w-2.5 h-2.5 rounded-sm flex-shrink-0 mr-1.5"
      style={{ backgroundColor: color }}
    />
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function StatsTable({
  stats,
  selectedGateId,
  onGateSelect,
  className = '',
}: StatsTableProps) {
  // Derive channel list from first population (they're all the same)
  const channels = useMemo<string[]>(() => {
    if (!stats || stats.populations.length === 0) return [];
    return stats.populations[0]?.channels.map(c => c.channel) ?? [];
  }, [stats]);

  // --- No-data placeholder ---
  if (!stats) {
    return (
      <div
        className={`flex items-center justify-center text-xs text-zinc-400 bg-zinc-950 border border-zinc-800 rounded ${className}`}
        style={{ minHeight: '6rem' }}
      >
        No data
      </div>
    );
  }

  const { populations } = stats;

  return (
    <div
      className={`relative overflow-auto rounded border border-zinc-800 bg-zinc-950 ${className}`}
    >
      <table className="min-w-full border-collapse text-xs">
        {/* ---- THEAD ---- */}
        <thead className="sticky top-0 z-10 bg-zinc-900 shadow-[0_1px_0_0_rgba(255,255,255,0.06)]">
          <tr>
            {/* Population */}
            <th
              scope="col"
              className="sticky left-0 z-20 bg-zinc-900 px-2 py-1.5 text-left font-medium text-zinc-300 whitespace-nowrap min-w-[140px]"
            >
              Population
            </th>
            {/* Fixed statistics */}
            <th scope="col" className="px-2 py-1.5 text-right font-medium text-zinc-300 whitespace-nowrap font-mono">
              Events
            </th>
            <th scope="col" className="px-2 py-1.5 text-right font-medium text-zinc-300 whitespace-nowrap font-mono">
              % Parent
            </th>
            <th scope="col" className="px-2 py-1.5 text-right font-medium text-zinc-300 whitespace-nowrap font-mono">
              % Total
            </th>
            {/* Per-channel MFI */}
            {channels.map(ch => (
              <th
                key={ch}
                scope="col"
                className="px-2 py-1.5 text-right font-medium text-zinc-300 whitespace-nowrap font-mono"
              >
                {ch}
              </th>
            ))}
          </tr>
        </thead>

        {/* ---- TBODY ---- */}
        <tbody>
          {populations.length === 0 ? (
            <tr>
              <td
                colSpan={4 + channels.length}
                className="px-3 py-4 text-center text-zinc-500"
              >
                No populations
              </td>
            </tr>
          ) : (
            populations.map((pop: PopulationStats, idx: number) => {
              const isSelected = pop.gateId === selectedGateId;
              const isEven = idx % 2 === 0;

              const rowBg = isSelected
                ? 'bg-blue-900/40'
                : isEven
                ? 'bg-zinc-950'
                : 'bg-zinc-900/50';

              const hoverBg = isSelected ? '' : 'hover:bg-zinc-800/70';

              const color = gateColor(pop.gateId);

              return (
                <tr
                  key={pop.gateId}
                  onClick={() => onGateSelect?.(pop.gateId)}
                  className={`${rowBg} ${hoverBg} cursor-pointer transition-colors duration-75 border-b border-zinc-800/50 last:border-b-0`}
                >
                  {/* Population name — sticky left */}
                  <td
                    className={`sticky left-0 z-10 px-2 py-1 ${
                      isSelected ? 'bg-blue-900/40' : isEven ? 'bg-zinc-950' : 'bg-zinc-900/50'
                    } font-['Inter',sans-serif] text-zinc-200 whitespace-nowrap`}
                  >
                    <span className="flex items-center">
                      <ColorSwatch color={color} />
                      {pop.gateName}
                    </span>
                  </td>

                  {/* Counts */}
                  <td className="px-2 py-1 text-right font-['JetBrains_Mono',monospace] tabular-nums text-zinc-300 whitespace-nowrap">
                    {fmtInt(pop.eventCount)}
                  </td>

                  {/* % Parent */}
                  <td className="px-2 py-1 text-right font-['JetBrains_Mono',monospace] tabular-nums text-zinc-300 whitespace-nowrap">
                    {fmt(pop.percentOfParent)}
                  </td>

                  {/* % Total */}
                  <td className="px-2 py-1 text-right font-['JetBrains_Mono',monospace] tabular-nums text-zinc-300 whitespace-nowrap">
                    {fmt(pop.percentOfTotal)}
                  </td>

                  {/* Per-channel MFI */}
                  {pop.channels.map(ch => (
                    <td
                      key={ch.channel}
                      className="px-2 py-1 text-right font-['JetBrains_Mono',monospace] tabular-nums text-zinc-400 whitespace-nowrap"
                    >
                      {fmt(ch.mfi)}
                    </td>
                  ))}
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
