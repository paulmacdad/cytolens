/**
 * Export utilities — core package.
 *
 * Provides CSV serialisation of experiment statistics and a browser-side CSV
 * download helper. No runtime dependencies outside the browser standard
 * library; safe to tree-shake on server bundles.
 */

import type { ExperimentStats }  from '../stats/experiment.js';
import type { PopulationStats }  from '../stats/population.js';

// ---------------------------------------------------------------------------
// Multi-sample stats wrapper
// ---------------------------------------------------------------------------

/**
 * Container returned by callers that aggregate per-sample ExperimentStats.
 * This is the shape expected by statsToCSV.
 */
export interface MultiSampleExperimentStats {
  experimentId: string;
  experimentName: string;
  /** ISO-8601 timestamp */
  computedAt: string;
  /** All channel names present across the experiment */
  channels: string[];
  /** One ExperimentStats entry per sample */
  samples: Array<ExperimentStats & { sampleLabel: string }>;
}

// ---------------------------------------------------------------------------
// CSV serialisation
// ---------------------------------------------------------------------------

/**
 * Escape a cell value for RFC-4180 CSV.
 */
function csvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  const s = String(value);
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function csvRow(cells: Array<string | number | null | undefined>): string {
  return cells.map(csvCell).join(',');
}

/**
 * Generate a flat CSV from experiment statistics.
 *
 * Column layout (one header + one row per population per sample):
 *   Sample | Gate | Events | %Parent | %Total | <channel> MFI...
 *
 * @param stats  Multi-sample experiment statistics object.
 * @returns      RFC-4180 CSV string with CRLF line endings.
 */
export function statsToCSV(stats: MultiSampleExperimentStats): string {
  const { channels, samples } = stats;

  const fixedHeaders = ['Sample', 'Gate', 'Events', '%Parent', '%Total'];
  const mfiHeaders = channels.map(ch => `${ch} MFI`);
  const rows: string[] = [csvRow([...fixedHeaders, ...mfiHeaders])];

  for (const sample of samples) {
    for (const pop of sample.populations) {
      const mfiValues = channels.map(ch => {
        const found = pop.channels.find(cs => cs.channel === ch);
        return found !== undefined ? found.mfi : '';
      });

      rows.push(
        csvRow([
          sample.sampleLabel,
          pop.gateName,
          pop.eventCount,
          pop.percentOfParent.toFixed(2),
          pop.percentOfTotal.toFixed(2),
          ...mfiValues,
        ]),
      );
    }
  }

  return rows.join('\r\n');
}

// ---------------------------------------------------------------------------
// Browser download helper
// ---------------------------------------------------------------------------

/**
 * Trigger a CSV file download in the browser.
 *
 * Creates a temporary Blob URL, clicks a hidden anchor element, then revokes
 * the object URL on the next tick. No-op in Node / SSR environments where
 * `document` is undefined.
 *
 * @param filename  Download filename. `.csv` is appended if absent.
 * @param content   RFC-4180 CSV string.
 */
export function downloadCSV(filename: string, content: string): void {
  if (typeof document === 'undefined') {
    // Server-side / test environment — do nothing.
    return;
  }

  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);

  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  anchor.style.display = 'none';

  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);

  // Revoke on the next tick — browser needs time to start the download.
  setTimeout(() => URL.revokeObjectURL(url), 100);
}
