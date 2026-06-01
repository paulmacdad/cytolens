/**
 * FCS 3.1 file parser.
 *
 * Implements the Flow Cytometry Standard version 3.1 as specified by ISAC 2010.
 * Reference: Spidlen et al., Cytometry A, 2010.
 *
 * Parsing pipeline:
 *   1. Read fixed-width 58-byte HEADER
 *   2. Parse TEXT segment keyword/value pairs (delimiter-separated)
 *   3. Extract channel metadata from $PnN/$PnS/$PnB/$PnR/$PnG keywords
 *   4. Read DATA segment (LIST mode only — most instruments)
 *   5. Return typed FCSData structure
 */

import type {
  FCSData,
  FCSHeader,
  FCSKeywords,
  FCSChannel,
  FCSMetadata,
  FCSParseOptions,
  FCSDataType,
  FCSByteOrder,
  FCSDataMode,
} from './types.js';

const HEADER_SIZE = 58;
const VERSION_OFFSET = 0;
const VERSION_LENGTH = 6;
const TEXT_START_OFFSET = 10;
const TEXT_END_OFFSET = 18;
const DATA_START_OFFSET = 26;
const DATA_END_OFFSET = 34;
const ANALYSIS_START_OFFSET = 42;
const ANALYSIS_END_OFFSET = 50;

const decoder = new TextDecoder('latin1');

/**
 * Parse a complete FCS file from an ArrayBuffer.
 *
 * For large files (>500 MB) use FCSStreamReader instead.
 */
export function parseFCS(buffer: ArrayBuffer, options: FCSParseOptions = {}): FCSData {
  if (buffer.byteLength < HEADER_SIZE) {
    throw new Error(`Buffer too small for FCS header: ${buffer.byteLength} bytes`);
  }

  const header = parseHeader(buffer);
  validateVersion(header.version);

  const textBytes = new Uint8Array(buffer, header.textStart, header.textEnd - header.textStart + 1);
  const keywords = parseTextSegment(textBytes);

  const channels = extractChannels(keywords);

  // Override DATA offsets from $BEGINDATA/$ENDDATA if header offsets are 0
  // (common in files >2GB where header uses supplemental TEXT)
  let dataStart = header.dataStart;
  let dataEnd = header.dataEnd;
  if (dataStart === 0) {
    const bd = keywords.raw.get('$BEGINDATA');
    const ed = keywords.raw.get('$ENDDATA');
    if (bd != null && ed != null) {
      dataStart = parseInt(bd, 10);
      dataEnd = parseInt(ed, 10);
    }
  }

  const metadata: FCSMetadata = {
    header: { ...header, dataStart, dataEnd },
    keywords,
    channels,
  };

  const maxEvents = options.maxEvents ?? 0;
  const events = readEventData(buffer, metadata, dataStart, dataEnd, maxEvents);

  return {
    metadata,
    events,
    eventCount: events.length / channels.length,
  };
}

// ---------------------------------------------------------------------------
// Header
// ---------------------------------------------------------------------------

function parseHeader(buffer: ArrayBuffer): FCSHeader {
  const bytes = new Uint8Array(buffer, 0, HEADER_SIZE);
  const text = decoder.decode(bytes);

  const version = text.substring(VERSION_OFFSET, VERSION_OFFSET + VERSION_LENGTH).trim();
  const textStart = parseInt(text.substring(TEXT_START_OFFSET, TEXT_START_OFFSET + 8).trim(), 10);
  const textEnd = parseInt(text.substring(TEXT_END_OFFSET, TEXT_END_OFFSET + 8).trim(), 10);
  const dataStart = parseInt(text.substring(DATA_START_OFFSET, DATA_START_OFFSET + 8).trim(), 10);
  const dataEnd = parseInt(text.substring(DATA_END_OFFSET, DATA_END_OFFSET + 8).trim(), 10);
  const analysisStart = parseInt(text.substring(ANALYSIS_START_OFFSET, ANALYSIS_START_OFFSET + 8).trim(), 10) || 0;
  const analysisEnd = parseInt(text.substring(ANALYSIS_END_OFFSET, ANALYSIS_END_OFFSET + 8).trim(), 10) || 0;

  return { version, textStart, textEnd, dataStart, dataEnd, analysisStart, analysisEnd };
}

function validateVersion(version: string): void {
  const supported = ['FCS1.0', 'FCS2.0', 'FCS3.0', 'FCS3.1'];
  if (!supported.some(v => version.startsWith(v.substring(0, 4)))) {
    throw new Error(`Unrecognised FCS version: "${version}"`);
  }
}

// ---------------------------------------------------------------------------
// TEXT segment
// ---------------------------------------------------------------------------

function parseTextSegment(textBytes: Uint8Array): FCSKeywords {
  const text = decoder.decode(textBytes);

  if (text.length === 0) {
    throw new Error('Empty TEXT segment');
  }

  // First character is the delimiter
  const delimiter = text[0] ?? '\f';
  const raw = new Map<string, string>();

  // Split on delimiter, skipping doubled delimiters (escape sequence per spec)
  let i = 1;
  while (i < text.length) {
    // Find key end
    const keyEnd = findDelimiter(text, delimiter, i);
    if (keyEnd === -1) break;
    const key = text.substring(i, keyEnd).trim();
    i = keyEnd + 1;

    // Find value end
    const valEnd = findDelimiter(text, delimiter, i);
    const value = valEnd === -1
      ? text.substring(i).trim()
      : text.substring(i, valEnd).trim();
    i = valEnd === -1 ? text.length : valEnd + 1;

    if (key.length > 0) {
      raw.set(key.toUpperCase(), value);
    }
  }

  const parameterCount = parseInt(raw.get('$PAR') ?? '0', 10);
  const eventCount = parseInt(raw.get('$TOT') ?? '0', 10);
  const dataTypeRaw = (raw.get('$DATATYPE') ?? 'F').toUpperCase() as FCSDataType;
  const byteOrderRaw = raw.get('$BYTEORD') ?? '1,2,3,4';
  const byteOrder: FCSByteOrder = byteOrderRaw.startsWith('4') ? 'big' : 'little';
  const dataMode = (raw.get('$MODE') ?? 'L').toUpperCase() as FCSDataMode;

  return {
    raw,
    parameterCount,
    eventCount,
    dataType: dataTypeRaw,
    byteOrder,
    dataMode,
    instrument: raw.get('$CYT'),
    cytometerSN: raw.get('$CYTSN'),
    date: raw.get('$DATE'),
    tube: raw.get('$TUBE NAME') ?? raw.get('$SMNO'),
    experimentName: raw.get('$EXP NAME') ?? raw.get('EXPERIMENT NAME'),
    operator: raw.get('$OP'),
    institution: raw.get('$INST'),
  };
}

/** Find the next unescaped delimiter position. Returns -1 if not found. */
function findDelimiter(text: string, delimiter: string, start: number): number {
  let i = start;
  while (i < text.length) {
    if (text[i] === delimiter) {
      // Doubled delimiter = escaped, skip
      if (text[i + 1] === delimiter) {
        i += 2;
        continue;
      }
      return i;
    }
    i++;
  }
  return -1;
}

// ---------------------------------------------------------------------------
// Channel metadata
// ---------------------------------------------------------------------------

function extractChannels(keywords: FCSKeywords): FCSChannel[] {
  const channels: FCSChannel[] = [];
  const n = keywords.parameterCount;

  for (let i = 1; i <= n; i++) {
    const name = keywords.raw.get(`$P${i}N`) ?? `Ch${i}`;
    const stain = keywords.raw.get(`$P${i}S`);
    const bits = parseInt(keywords.raw.get(`$P${i}B`) ?? '32', 10);
    const range = parseInt(keywords.raw.get(`$P${i}R`) ?? String(Math.pow(2, bits)), 10);
    const gain = parseFloat(keywords.raw.get(`$P${i}G`) ?? 'NaN');
    const display = keywords.raw.get(`$P${i}D`);
    const detector = keywords.raw.get(`$P${i}DET`);
    const filter = keywords.raw.get(`$P${i}F`);

    channels.push({
      index: i,
      name,
      stain,
      bits,
      range,
      gain: isNaN(gain) ? undefined : gain,
      display,
      detector,
      filter,
    });
  }

  return channels;
}

// ---------------------------------------------------------------------------
// DATA segment
// ---------------------------------------------------------------------------

function readEventData(
  buffer: ArrayBuffer,
  metadata: FCSMetadata,
  dataStart: number,
  dataEnd: number,
  maxEvents: number,
): Float32Array {
  const { keywords, channels } = metadata;
  const paramCount = channels.length;

  if (keywords.dataMode !== 'L') {
    // Correlated/uncorrelated modes are rarely used; stub
    // TODO: implement C and U mode readers
    console.warn(`FCS data mode "${keywords.dataMode}" is not fully supported — returning empty array`);
    return new Float32Array(0);
  }

  const totalEvents = keywords.eventCount;
  const eventLimit = maxEvents > 0 ? Math.min(maxEvents, totalEvents) : totalEvents;
  const result = new Float32Array(eventLimit * paramCount);

  if (eventLimit === 0 || dataStart === 0) {
    // TODO: stream event data from dataStart..dataEnd
    return result;
  }

  switch (keywords.dataType) {
    case 'F':
      readFloat32Events(buffer, dataStart, result, eventLimit, paramCount, keywords.byteOrder);
      break;
    case 'D':
      readFloat64Events(buffer, dataStart, result, eventLimit, paramCount, keywords.byteOrder);
      break;
    case 'I':
      readIntegerEvents(buffer, dataStart, result, eventLimit, paramCount, channels, keywords.byteOrder);
      break;
    case 'A':
      // ASCII mode: extremely rare, each value is space-delimited ASCII
      // TODO: implement ASCII reader
      console.warn('FCS ASCII data type is not yet supported');
      break;
  }

  return result;
}

function readFloat32Events(
  buffer: ArrayBuffer,
  offset: number,
  out: Float32Array,
  eventCount: number,
  paramCount: number,
  byteOrder: FCSByteOrder,
): void {
  const view = new DataView(buffer, offset);
  const littleEndian = byteOrder === 'little';
  const total = eventCount * paramCount;
  for (let i = 0; i < total; i++) {
    out[i] = view.getFloat32(i * 4, littleEndian);
  }
}

function readFloat64Events(
  buffer: ArrayBuffer,
  offset: number,
  out: Float32Array,
  eventCount: number,
  paramCount: number,
  byteOrder: FCSByteOrder,
): void {
  const view = new DataView(buffer, offset);
  const littleEndian = byteOrder === 'little';
  const total = eventCount * paramCount;
  for (let i = 0; i < total; i++) {
    out[i] = view.getFloat64(i * 8, littleEndian);
  }
}

function readIntegerEvents(
  buffer: ArrayBuffer,
  offset: number,
  out: Float32Array,
  eventCount: number,
  paramCount: number,
  channels: FCSChannel[],
  byteOrder: FCSByteOrder,
): void {
  // Integer mode: each parameter has a fixed bit width ($PnB)
  // All channels must be 8, 16, or 32 bits for this implementation
  const view = new DataView(buffer, offset);
  const littleEndian = byteOrder === 'little';
  let bytePos = 0;
  for (let e = 0; e < eventCount; e++) {
    for (let p = 0; p < paramCount; p++) {
      const ch = channels[p];
      if (ch == null) continue;
      const bits = ch.bits;
      let value: number;
      if (bits === 8) {
        value = view.getUint8(bytePos);
        bytePos += 1;
      } else if (bits === 16) {
        value = view.getUint16(bytePos, littleEndian);
        bytePos += 2;
      } else {
        value = view.getUint32(bytePos, littleEndian);
        bytePos += 4;
      }
      const idx = e * paramCount + p;
      out[idx] = value;
    }
  }
}
