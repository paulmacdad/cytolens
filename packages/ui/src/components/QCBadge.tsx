/**
 * QCBadge — compact quality-control status indicator.
 *
 * Shows green / yellow / red depending on QC outcome. On hover (or click
 * on mobile), displays a tooltip listing all warnings and errors.
 */

import React, { useState, useRef, useEffect } from 'react';
import type { QCResult, QCWarning, QCError } from '@cytolens/core';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface QCBadgeProps {
  qcResult: QCResult | null;
  className?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type Variant = 'passed' | 'warnings' | 'errors' | 'none';

function getVariant(qc: QCResult | null): Variant {
  if (!qc) return 'none';
  if (qc.errors.length > 0) return 'errors';
  if (qc.warnings.length > 0) return 'warnings';
  return 'passed';
}

const VARIANT_STYLES: Record<Variant, { badge: string; dot: string; label: string }> = {
  passed: {
    badge: 'bg-emerald-950 border-emerald-700 text-emerald-300',
    dot: 'bg-emerald-400',
    label: 'QC Pass',
  },
  warnings: {
    badge: 'bg-amber-950 border-amber-700 text-amber-300',
    dot: 'bg-amber-400',
    label: 'QC Warn',
  },
  errors: {
    badge: 'bg-red-950 border-red-700 text-red-300',
    dot: 'bg-red-400',
    label: 'QC Fail',
  },
  none: {
    badge: 'bg-zinc-800 border-zinc-700 text-zinc-400',
    dot: 'bg-zinc-500',
    label: 'No QC',
  },
};

const SEVERITY_COLOR: Record<QCWarning['severity'], string> = {
  low: 'text-zinc-400',
  medium: 'text-amber-400',
  high: 'text-red-400',
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function QCBadge({ qcResult, className = '' }: QCBadgeProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const variant = getVariant(qcResult);
  const styles = VARIANT_STYLES[variant];

  // Close tooltip when clicking outside
  useEffect(() => {
    if (!open) return;
    function handleOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [open]);

  const hasDetails =
    qcResult !== null &&
    (qcResult.warnings.length > 0 || qcResult.errors.length > 0);

  return (
    <div
      ref={containerRef}
      className={`relative inline-flex ${className}`}
    >
      {/* Badge */}
      <button
        type="button"
        aria-expanded={open}
        aria-label={`QC status: ${styles.label}`}
        onClick={() => hasDetails && setOpen(v => !v)}
        className={`inline-flex items-center gap-1.5 rounded border px-1.5 py-0.5 text-[10px] font-medium leading-none transition-opacity ${styles.badge} ${hasDetails ? 'cursor-pointer hover:opacity-80' : 'cursor-default'}`}
      >
        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${styles.dot}`} />
        {styles.label}
        {hasDetails && (
          <span className="ml-0.5 opacity-60 text-[9px]">▾</span>
        )}
      </button>

      {/* Tooltip / panel */}
      {open && hasDetails && qcResult && (
        <div
          role="tooltip"
          className="absolute top-full left-0 mt-1.5 z-50 w-72 rounded border border-zinc-700 bg-zinc-900 shadow-xl text-xs text-zinc-300 overflow-hidden"
        >
          {/* Metrics summary */}
          <div className="px-3 py-2 border-b border-zinc-800 bg-zinc-950">
            <span className="text-zinc-500 text-[10px] uppercase tracking-wide">Sample QC</span>
            <div className="mt-1 flex gap-3 text-[11px] tabular-nums font-mono">
              <span>Events: {qcResult.metrics.eventCount.toLocaleString()}</span>
              <span>Channels: {qcResult.metrics.channelCount}</span>
            </div>
          </div>

          {/* Errors */}
          {qcResult.errors.length > 0 && (
            <div className="px-3 py-2 border-b border-zinc-800">
              <p className="text-[10px] uppercase tracking-wide text-red-500 mb-1.5">
                Errors ({qcResult.errors.length})
              </p>
              <ul className="space-y-1">
                {qcResult.errors.map((err: QCError, i: number) => (
                  <li key={i} className="flex gap-2 text-red-400">
                    <span className="flex-shrink-0 mt-px">✕</span>
                    <span>{err.message}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Warnings */}
          {qcResult.warnings.length > 0 && (
            <div className="px-3 py-2">
              <p className="text-[10px] uppercase tracking-wide text-amber-500 mb-1.5">
                Warnings ({qcResult.warnings.length})
              </p>
              <ul className="space-y-1.5">
                {qcResult.warnings.map((warn: QCWarning, i: number) => (
                  <li key={i} className="flex gap-2">
                    <span className={`flex-shrink-0 mt-px ${SEVERITY_COLOR[warn.severity]}`}>
                      {warn.severity === 'high' ? '▲' : warn.severity === 'medium' ? '△' : '▽'}
                    </span>
                    <span className={SEVERITY_COLOR[warn.severity]}>{warn.message}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Close button */}
          <div className="px-3 py-1.5 border-t border-zinc-800 bg-zinc-950 text-right">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
