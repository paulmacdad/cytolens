/**
 * FlowJo .wsp workspace importer.
 *
 * Parses FlowJo XML workspace files and extracts sample filenames
 * and gate hierarchies (polygon, rectangle, ellipse).
 * Statistics are intentionally ignored — CytoLens recomputes them.
 */

import type {
  Gate,
  GateNode,
  PolygonGate,
  RectangleGate,
  EllipseGate,
  Point2D,
} from '../gating/gate.js';

export interface WSPSample {
  filename: string;
  gateNodes: GateNode[];
}

export interface WSPImportResult {
  samples: WSPSample[];
  success: boolean;
  warnings: string[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Read an attribute by name, trying both prefixed and local forms. */
function getAttr(el: Element, name: string): string | null {
  const direct = el.getAttribute(name);
  if (direct !== null) return direct;
  // Fall back to local-name match (ignores namespace prefix)
  const local = name.split(':').pop() ?? name;
  for (let i = 0; i < el.attributes.length; i++) {
    const a = el.attributes[i];
    const aLocal = a.localName ?? a.name.split(':').pop();
    if (aLocal === local) return a.value;
  }
  return null;
}

function numAttr(el: Element, name: string): number {
  const v = getAttr(el, name);
  return v === null ? NaN : parseFloat(v);
}

/** Get all direct children with a given local name (namespace-agnostic). */
function childrenByLocal(parent: Element, localName: string): Element[] {
  const out: Element[] = [];
  for (let i = 0; i < parent.children.length; i++) {
    const c = parent.children[i];
    const ln = c.localName ?? c.tagName.split(':').pop();
    if (ln === localName) out.push(c);
  }
  return out;
}

/** Get ALL descendants with a given local name. */
function descByLocal(parent: Element, localName: string): Element[] {
  const out: Element[] = [];
  const all = parent.getElementsByTagName('*');
  for (let i = 0; i < all.length; i++) {
    const ln = all[i].localName ?? all[i].tagName.split(':').pop();
    if (ln === localName) out.push(all[i]);
  }
  return out;
}

let _idCounter = 0;
function nextId(): string {
  _idCounter += 1;
  return `wsp-gate-${_idCounter}`;
}

// ---------------------------------------------------------------------------
// Gate parsers
// ---------------------------------------------------------------------------

function tryPolygon(
  gateEl: Element,
  name: string,
  color: string | undefined,
  parentId: string | undefined,
): PolygonGate | null {
  const polyEl = descByLocal(gateEl, 'PolygonGate')[0];
  if (!polyEl) return null;

  const dims = descByLocal(polyEl, 'dimension');
  const xChannel =
    dims[0]
      ? (getAttr(dims[0], 'name') ??
         getAttr(dims[0], 'data-type:name') ??
         'Unknown')
      : 'Unknown';
  const yChannel =
    dims[1]
      ? (getAttr(dims[1], 'name') ??
         getAttr(dims[1], 'data-type:name') ??
         'Unknown')
      : 'Unknown';

  const vertices: Point2D[] = [];
  for (const vEl of descByLocal(polyEl, 'vertex')) {
    const coords = descByLocal(vEl, 'coordinate');
    const x = coords[0] ? numAttr(coords[0], 'value') : NaN;
    const y = coords[1] ? numAttr(coords[1], 'value') : NaN;
    if (!isNaN(x) && !isNaN(y)) vertices.push({ x, y });
  }

  if (vertices.length < 3) return null;

  return {
    id: nextId(),
    name,
    type: 'polygon',
    xChannel,
    yChannel,
    vertices,
    ...(color !== undefined ? { color } : {}),
    ...(parentId !== undefined ? { parentId } : {}),
  };
}

function tryRectangle(
  gateEl: Element,
  name: string,
  color: string | undefined,
  parentId: string | undefined,
): RectangleGate | null {
  const rectEl = descByLocal(gateEl, 'RectangleGate')[0];
  if (!rectEl) return null;

  const dims = descByLocal(rectEl, 'dimension');
  if (dims.length < 2) return null;

  const xChannel =
    getAttr(dims[0], 'name') ?? getAttr(dims[0], 'data-type:name') ?? 'Unknown';
  const yChannel =
    getAttr(dims[1], 'name') ?? getAttr(dims[1], 'data-type:name') ?? 'Unknown';

  const range = (dim: Element) => {
    const minEl = descByLocal(dim, 'min')[0];
    const maxEl = descByLocal(dim, 'max')[0];
    return {
      min: minEl ? numAttr(minEl, 'value') : -Infinity,
      max: maxEl ? numAttr(maxEl, 'value') : Infinity,
    };
  };

  const xr = range(dims[0]);
  const yr = range(dims[1]);

  return {
    id: nextId(),
    name,
    type: 'rectangle',
    xChannel,
    yChannel,
    minX: xr.min,
    maxX: xr.max,
    minY: yr.min,
    maxY: yr.max,
    ...(color !== undefined ? { color } : {}),
    ...(parentId !== undefined ? { parentId } : {}),
  };
}

function tryEllipse(
  gateEl: Element,
  name: string,
  color: string | undefined,
  parentId: string | undefined,
): EllipseGate | null {
  const ellEl = descByLocal(gateEl, 'EllipseGate')[0];
  if (!ellEl) return null;

  const dims = descByLocal(ellEl, 'dimension');
  const xChannel =
    dims[0]
      ? (getAttr(dims[0], 'name') ?? getAttr(dims[0], 'data-type:name') ?? 'Unknown')
      : 'Unknown';
  const yChannel =
    dims[1]
      ? (getAttr(dims[1], 'name') ?? getAttr(dims[1], 'data-type:name') ?? 'Unknown')
      : 'Unknown';

  // Style 1: explicit cx/cy/rx/ry attributes (some FlowJo versions)
  const cx = numAttr(ellEl, 'cx');
  const cy = numAttr(ellEl, 'cy');
  const rx = numAttr(ellEl, 'rx');
  const ry = numAttr(ellEl, 'ry');
  const angle = numAttr(ellEl, 'angle') || 0;

  if (!isNaN(cx) && !isNaN(cy) && !isNaN(rx) && !isNaN(ry)) {
    return {
      id: nextId(),
      name,
      type: 'ellipse',
      xChannel,
      yChannel,
      cx,
      cy,
      rx,
      ry,
      angle,
      ...(color !== undefined ? { color } : {}),
      ...(parentId !== undefined ? { parentId } : {}),
    };
  }

  // Style 2: GatingML 2.0 mean + covariance matrix
  const meanEl = descByLocal(ellEl, 'mean')[0];
  const covEl = descByLocal(ellEl, 'covarianceMatrix')[0];

  if (meanEl && covEl) {
    const meanCoords = descByLocal(meanEl, 'coordinate');
    const mcx = meanCoords[0] ? numAttr(meanCoords[0], 'value') : NaN;
    const mcy = meanCoords[1] ? numAttr(meanCoords[1], 'value') : NaN;

    const rows = descByLocal(covEl, 'row');
    if (rows.length >= 2 && !isNaN(mcx) && !isNaN(mcy)) {
      const e0 = descByLocal(rows[0], 'entry');
      const e1 = descByLocal(rows[1], 'entry');
      const a = e0[0] ? numAttr(e0[0], 'value') : 1;
      const b = e0[1] ? numAttr(e0[1], 'value') : 0;
      const c = e1[1] ? numAttr(e1[1], 'value') : 1;

      // Eigenvalues of symmetric 2×2 [[a,b],[b,c]]
      const trace = a + c;
      const det = a * c - b * b;
      const disc = Math.sqrt(Math.max(0, trace * trace / 4 - det));
      const lam1 = trace / 2 + disc;
      const lam2 = trace / 2 - disc;

      return {
        id: nextId(),
        name,
        type: 'ellipse',
        xChannel,
        yChannel,
        cx: mcx,
        cy: mcy,
        rx: Math.sqrt(Math.abs(lam1)),
        ry: Math.sqrt(Math.abs(lam2)),
        angle: b === 0 ? 0 : Math.atan2(lam1 - a, b),
        ...(color !== undefined ? { color } : {}),
        ...(parentId !== undefined ? { parentId } : {}),
      };
    }
  }

  return null;
}

function tryParseGate(
  gateEl: Element,
  name: string,
  color: string | undefined,
  parentId: string | undefined,
): Gate | null {
  return (
    tryPolygon(gateEl, name, color, parentId) ??
    tryRectangle(gateEl, name, color, parentId) ??
    tryEllipse(gateEl, name, color, parentId)
  );
}

// ---------------------------------------------------------------------------
// Recursive population tree
// ---------------------------------------------------------------------------

function parsePopulations(
  subpopsEl: Element,
  parentGateId: string | undefined,
  warnings: string[],
): GateNode[] {
  const nodes: GateNode[] = [];

  for (const child of childrenByLocal(subpopsEl, 'PopulationNode')) {
    const name = getAttr(child, 'name') ?? 'Unnamed Gate';
    const color = getAttr(child, 'color') ?? undefined;

    const gateWrapEl = childrenByLocal(child, 'Gate')[0];
    if (!gateWrapEl) {
      warnings.push(`PopulationNode "${name}" has no Gate element — skipped`);
      continue;
    }

    const gate = tryParseGate(gateWrapEl, name, color, parentGateId);
    if (!gate) {
      warnings.push(
        `PopulationNode "${name}" uses an unsupported gate type (not polygon/rectangle/ellipse) — skipped`,
      );
      continue;
    }

    const nestedSubpops = childrenByLocal(child, 'Subpopulations')[0];
    const children = nestedSubpops
      ? parsePopulations(nestedSubpops, gate.id, warnings)
      : [];

    nodes.push({ gate, children });
  }

  return nodes;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function parseWSP(xmlString: string): WSPImportResult {
  _idCounter = 0;
  const warnings: string[] = [];

  let doc: Document;
  try {
    const parser = new DOMParser();
    doc = parser.parseFromString(xmlString, 'application/xml');
    const errEl = doc.querySelector('parsererror');
    if (errEl) {
      return {
        samples: [],
        success: false,
        warnings: [`XML parse error: ${(errEl.textContent ?? '').slice(0, 300)}`],
      };
    }
  } catch (err) {
    return {
      samples: [],
      success: false,
      warnings: [`Failed to parse XML: ${String(err)}`],
    };
  }

  const samples: WSPSample[] = [];

  // Collect all <Sample> elements regardless of namespace
  const allEls = Array.from(doc.getElementsByTagName('*'));
  const sampleEls = allEls.filter(
    el => (el.localName ?? el.tagName.split(':').pop()) === 'Sample',
  );

  if (sampleEls.length === 0) {
    warnings.push('No Sample elements found in workspace');
    return { samples: [], success: false, warnings };
  }

  for (const sampleEl of sampleEls) {
    const datasetEl = childrenByLocal(sampleEl, 'DataSet')[0];
    const filename = datasetEl
      ? (getAttr(datasetEl, 'uri') ?? getAttr(datasetEl, 'path') ?? 'unknown.fcs')
      : 'unknown.fcs';

    const sampleNodeEl = childrenByLocal(sampleEl, 'SampleNode')[0];
    if (!sampleNodeEl) {
      warnings.push(`Sample "${filename}" has no SampleNode — skipped`);
      continue;
    }

    const subpopsEl = childrenByLocal(sampleNodeEl, 'Subpopulations')[0];
    const gateNodes = subpopsEl
      ? parsePopulations(subpopsEl, undefined, warnings)
      : [];

    samples.push({ filename, gateNodes });
  }

  return {
    samples,
    success: samples.length > 0,
    warnings,
  };
}
