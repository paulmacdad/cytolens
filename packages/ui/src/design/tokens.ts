/**
 * CytoLens design tokens.
 *
 * Palette inspired by SnapGene and BD FACSDiva — clean, scientific,
 * medium-density information display. Not full dark; not blinding white.
 */

export const colors = {
  // Backgrounds
  bg: {
    app: '#f0f2f5',      // outer shell
    panel: '#ffffff',    // sidebar / panel cards
    surface: '#f8f9fb',  // main content area
    overlay: 'rgba(0,0,0,0.35)',
  },

  // Borders
  border: {
    subtle: '#e2e5ea',
    default: '#c8cdd6',
    strong: '#9aa2b1',
  },

  // Text
  text: {
    primary: '#1a1d23',
    secondary: '#555e6e',
    muted: '#8a93a3',
    onAccent: '#ffffff',
  },

  // Accent — teal (scientific instrument feel)
  accent: {
    50: '#e6f7f9',
    100: '#b3e8ee',
    200: '#80d9e3',
    300: '#4dc9d7',
    400: '#26b8cb',
    500: '#0ea5b8',  // primary accent
    600: '#0b8fa0',
    700: '#077888',
    800: '#046070',
    900: '#024958',
  },

  // Status
  status: {
    success: '#22c55e',
    warning: '#f59e0b',
    error: '#ef4444',
    info: '#3b82f6',
  },

  // Gate palette — 12 distinct colours for gate overlays
  gates: [
    '#2563eb', // blue
    '#16a34a', // green
    '#dc2626', // red
    '#d97706', // amber
    '#7c3aed', // violet
    '#0891b2', // cyan
    '#be185d', // pink
    '#65a30d', // lime
    '#ea580c', // orange
    '#0d9488', // teal
    '#9333ea', // purple
    '#b45309', // brown
  ],

  // Plot background
  plot: {
    bg: '#ffffff',
    gridLine: '#e8eaed',
    axis: '#9aa2b1',
    axisLabel: '#555e6e',
    zeroline: '#c8cdd6',
  },
} as const;

export const spacing = {
  px: '1px',
  0: '0',
  0.5: '2px',
  1: '4px',
  1.5: '6px',
  2: '8px',
  2.5: '10px',
  3: '12px',
  4: '16px',
  5: '20px',
  6: '24px',
  8: '32px',
  10: '40px',
  12: '48px',
  16: '64px',
} as const;

export const typography = {
  fontFamily: {
    sans: '"Inter", "Segoe UI", system-ui, -apple-system, sans-serif',
    mono: '"JetBrains Mono", "Fira Code", "Cascadia Code", monospace',
  },
  fontSize: {
    xs: '11px',
    sm: '12px',
    base: '13px',
    md: '14px',
    lg: '15px',
    xl: '17px',
    '2xl': '20px',
    '3xl': '24px',
  },
  fontWeight: {
    normal: '400',
    medium: '500',
    semibold: '600',
    bold: '700',
  },
  lineHeight: {
    tight: '1.25',
    normal: '1.5',
    relaxed: '1.7',
  },
} as const;

export const radius = {
  sm: '3px',
  md: '5px',
  lg: '8px',
  xl: '12px',
  full: '9999px',
} as const;

export const shadow = {
  sm: '0 1px 2px rgba(0,0,0,0.06)',
  md: '0 2px 8px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.04)',
  lg: '0 4px 16px rgba(0,0,0,0.10), 0 2px 4px rgba(0,0,0,0.06)',
  panel: '0 0 0 1px rgba(0,0,0,0.05), 0 2px 8px rgba(0,0,0,0.07)',
} as const;
