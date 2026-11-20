/**
 * Diagram style tokens, taken from the visualisation style guide.
 * Applied as SVG attributes (not CSS classes) so a later SVG export
 * carries the styling without depending on the app stylesheet.
 */
export const colours = {
  ink: "#0F172A",
  ink2: "#334155",
  ink3: "#475569",
  muted: "#64748B",
  borderStrong: "#94A3B8",
  border: "#CBD5E1",
  surface: "#F8FAFC",
  paper: "#FFFFFF",
} as const;

export const font = {
  sans: '"Segoe UI", Arial, sans-serif',
  mono: 'Consolas, "Courier New", monospace',
} as const;

export const nodeStyle = {
  fill: colours.paper,
  stroke: colours.borderStrong,
  "stroke-width": 1,
  rx: 4,
} as const;
