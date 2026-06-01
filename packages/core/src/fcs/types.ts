/**
 * FCS file format types — based on FCS 3.1 specification (ISAC 2010).
 */

export type FCSDataType = 'I' | 'F' | 'D' | 'A';
export type FCSByteOrder = 'big' | 'little';
export type FCSDataMode = 'L' | 'C' | 'U';

export interface FCSHeader {
  /** FCS version string e.g. "FCS3.1" */
  version: string;
  /** Byte offset of TEXT segment start */
  textStart: number;
  /** Byte offset of TEXT segment end */
  textEnd: number;
  /** Byte offset of DATA segment start */
  dataStart: number;
  /** Byte offset of DATA segment end */
  dataEnd: number;
  /** Byte offset of ANALYSIS segment start (0 if absent) */
  analysisStart: number;
  /** Byte offset of ANALYSIS segment end (0 if absent) */
  analysisEnd: number;
}

export interface FCSKeywords {
  /** Raw keyword map from TEXT segment */
  raw: Map<string, string>;
  /** Number of parameters (channels) */
  parameterCount: number;
  /** Total number of events */
  eventCount: number;
  /** Data type: I=integer, F=float, D=double, A=ASCII */
  dataType: FCSDataType;
  /** Byte order */
  byteOrder: FCSByteOrder;
  /** Data mode: L=list, C=correlated, U=uncorrelated */
  dataMode: FCSDataMode;
  /** Instrument name */
  instrument?: string;
  /** Cytometer serial number */
  cytometerSN?: string;
  /** Date of acquisition */
  date?: string;
  /** Sample/tube name */
  tube?: string;
  /** Experiment name */
  experimentName?: string;
  /** Operator */
  operator?: string;
  /** Institution */
  institution?: string;
}

export interface FCSChannel {
  /** 1-based channel index */
  index: number;
  /** Short name e.g. "FSC-A" */
  name: string;
  /** Long name / stain e.g. "CD3 APC-Cy7" */
  stain?: string;
  /** Number of bits */
  bits: number;
  /** Range (2^bits typically) */
  range: number;
  /** Gain (voltage for PMT channels) */
  gain?: number;
  /** Display scale hint */
  display?: string;
  /** Detector name */
  detector?: string;
  /** Filter name */
  filter?: string;
  /** Amplification type */
  amplificationType?: string;
  /** Amplification gain */
  amplificationGain?: number;
}

export interface FCSMetadata {
  header: FCSHeader;
  keywords: FCSKeywords;
  channels: FCSChannel[];
}

export interface FCSData {
  metadata: FCSMetadata;
  /** Raw event data: [event0_ch0, event0_ch1, ..., event1_ch0, ...] */
  events: Float32Array;
  /** Number of events actually loaded */
  eventCount: number;
}

export interface FCSParseOptions {
  /** Maximum events to load. 0 = all. */
  maxEvents?: number;
  /** Whether to apply channel range clipping */
  clipToRange?: boolean;
  /** Byte offset to begin reading (for streaming) */
  startOffset?: number;
}
