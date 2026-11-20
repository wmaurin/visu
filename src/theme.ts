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

/** Editor only colours. Never part of the diagram itself. */
export const ui = {
  selection: "#0369A1",
} as const;

export const font = {
  sans: '"Segoe UI", Arial, sans-serif',
  mono: 'Consolas, "Courier New", monospace',
} as const;

/** Text inside a box. Shared by the SVG renderer and the HTML editor. */
export const textStyle = {
  defaultFontSize: 13,
  minFontSize: 8,
  maxFontSize: 96,
  fontWeight: 400,
  padding: 8,
  fill: colours.ink,
} as const;

/** Line height grows with the font size. 13px gives the guide's 18px. */
export function lineHeightFor(fontSize: number): number {
  return Math.round(fontSize * 1.4);
}

export function cssFont(fontSize: number): string {
  return `${textStyle.fontWeight} ${fontSize}px ${font.sans}`;
}

export const nodeStyle = {
  fill: colours.paper,
  stroke: colours.borderStrong,
  "stroke-width": 1,
  rx: 4,
} as const;
