/**
 * Plot export utilities — UI package.
 *
 * Canvas and SVG → PNG export at arbitrary DPI.
 * All functions are async and browser-only; they assume `document`,
 * `HTMLCanvasElement`, and `SVGSVGElement` exist.
 */

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Trigger a PNG file download from a Blob.
 */
function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename.endsWith('.png') ? filename : `${filename}.png`;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  setTimeout(() => URL.revokeObjectURL(url), 100);
}

/**
 * Convert a canvas to a PNG Blob.
 * Rejects if the browser cannot encode the canvas (e.g. tainted by
 * cross-origin images).
 */
function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(blob => {
      if (blob) {
        resolve(blob);
      } else {
        reject(new Error('canvas.toBlob returned null — canvas may be tainted or empty'));
      }
    }, 'image/png');
  });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Export an HTMLCanvasElement as a high-DPI PNG file.
 *
 * The original canvas is not modified. An offscreen canvas is created at
 * `(dpi / 96)` × the original pixel size, the source image is drawn scaled
 * into it, and the result is downloaded.
 *
 * @param canvas   Source canvas element.
 * @param filename Download filename (`.png` appended if absent).
 * @param dpi      Target print resolution in dots per inch. Defaults to 300.
 */
export async function exportCanvasAsPNG(
  canvas: HTMLCanvasElement,
  filename: string,
  dpi = 300,
): Promise<void> {
  const scale = dpi / 96;

  const offscreen = document.createElement('canvas');
  offscreen.width = Math.round(canvas.width * scale);
  offscreen.height = Math.round(canvas.height * scale);

  const ctx = offscreen.getContext('2d');
  if (!ctx) {
    throw new Error('Could not obtain 2D context for offscreen canvas');
  }

  // Disable image smoothing for data-accurate export (flow cytometry dot plots
  // must preserve exact pixel positions). Consumers that prefer interpolated
  // output can set this to true after calling exportCanvasAsPNG.
  ctx.imageSmoothingEnabled = false;
  ctx.scale(scale, scale);
  ctx.drawImage(canvas, 0, 0);

  const blob = await canvasToBlob(offscreen);
  downloadBlob(blob, filename);
}

/**
 * Export an SVGSVGElement as a high-DPI PNG file.
 *
 * The SVG is serialised to a data URL, drawn onto a Canvas via an Image
 * element, then exported via `exportCanvasAsPNG`.
 *
 * Note: cross-origin images embedded in the SVG will taint the canvas and
 * cause the export to fail. Strip or inline such images before calling this
 * function.
 *
 * @param svgElement Source SVG element.
 * @param filename   Download filename (`.png` appended if absent).
 * @param dpi        Target print resolution in dots per inch. Defaults to 300.
 */
export async function exportSVGAsPNG(
  svgElement: SVGSVGElement,
  filename: string,
  dpi = 300,
): Promise<void> {
  // Determine intrinsic SVG dimensions.
  // Prefer the SVG viewBox; fall back to width/height attributes; last resort
  // is the bounding rect of the rendered element.
  let svgWidth: number;
  let svgHeight: number;

  const viewBox = svgElement.viewBox?.baseVal;
  if (viewBox && viewBox.width > 0 && viewBox.height > 0) {
    svgWidth = viewBox.width;
    svgHeight = viewBox.height;
  } else {
    const widthAttr = svgElement.getAttribute('width');
    const heightAttr = svgElement.getAttribute('height');
    svgWidth = widthAttr ? parseFloat(widthAttr) : svgElement.getBoundingClientRect().width;
    svgHeight = heightAttr ? parseFloat(heightAttr) : svgElement.getBoundingClientRect().height;
  }

  if (svgWidth <= 0 || svgHeight <= 0) {
    throw new Error('SVG has zero or negative dimensions — cannot export');
  }

  // Serialise the SVG, ensuring the xmlns attribute is present.
  const serializer = new XMLSerializer();
  let svgString = serializer.serializeToString(svgElement);
  if (!svgString.includes('xmlns="http://www.w3.org/2000/svg"')) {
    svgString = svgString.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
  }

  const svgDataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgString)}`;

  // Draw SVG into a canvas via an Image element.
  const image = new Image();
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error('Failed to load serialised SVG as an Image'));
    image.src = svgDataUrl;
  });

  const scale = dpi / 96;
  const offscreen = document.createElement('canvas');
  offscreen.width = Math.round(svgWidth * scale);
  offscreen.height = Math.round(svgHeight * scale);

  const ctx = offscreen.getContext('2d');
  if (!ctx) {
    throw new Error('Could not obtain 2D context for offscreen canvas');
  }

  // White background so transparent SVGs export cleanly.
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, offscreen.width, offscreen.height);

  ctx.scale(scale, scale);
  ctx.drawImage(image, 0, 0, svgWidth, svgHeight);

  const blob = await canvasToBlob(offscreen);
  downloadBlob(blob, filename);
}
