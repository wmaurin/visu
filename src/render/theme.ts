import type { ColorName, TextColor } from "../model/types";

/**
 * Diagram style tokens, taken from the visualisation style guide.
 * Applied as SVG attributes (not CSS classes) so a later SVG export
 * carries the styling without depending on the app stylesheet.
 */
export const colours = {
  /** Every stroke and text of the diagram itself. */
  diagram: "#000000",
  ink: "#0F172A",
  ink2: "#334155",
  ink3: "#475569",
  muted: "#64748B",
  borderStrong: "#94A3B8",
  border: "#CBD5E1",
  surface: "#F8FAFC",
  paper: "#FFFFFF",
} as const;

/** Diagram palette, mostly Tailwind 600 tones: strong enough on white, readable white text on top. */
export const PALETTE: Readonly<Record<ColorName, string>> = {
  black: "#000000",
  slate: "#475569",
  red: "#DC2626",
  orange: "#EA580C",
  amber: "#D97706",
  green: "#16A34A",
  teal: "#0D9488",
  sky: "#0284C7",
  blue: "#2563EB",
  indigo: "#4F46E5",
  violet: "#7C3AED",
  rose: "#E11D48",
};

/** The palette colour at `saturation` percent, mixed with white. */
export function tint(color: ColorName, saturation: number): string {
  const t = Math.min(Math.max(saturation, 0), 100) / 100;
  const hex = PALETTE[color];
  const channel = (i: number) => {
    const full = Number.parseInt(hex.slice(1 + 2 * i, 3 + 2 * i), 16);
    return Math.round(255 + (full - 255) * t)
      .toString(16)
      .padStart(2, "0");
  };
  return `#${channel(0)}${channel(1)}${channel(2)}`.toUpperCase();
}

/** Fill of text set to black or white. */
export function textFill(color: TextColor): string {
  return color === "white" ? colours.paper : colours.diagram;
}

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
  fill: colours.diagram,
} as const;

/** Line height grows with the font size. 13px gives the guide's 18px. */
export function lineHeightFor(fontSize: number): number {
  return Math.round(fontSize * 1.4);
}

/** Weight of text marked bold. */
export const BOLD_WEIGHT = 700;

export function fontWeight(bold: boolean): number {
  return bold ? BOLD_WEIGHT : textStyle.fontWeight;
}

export function cssFont(fontSize: number, bold = false): string {
  return `${fontWeight(bold)} ${fontSize}px ${font.sans}`;
}

/** Connection line, the style guide's `link` class. */
export const linkStyle = {
  fill: "none",
  stroke: colours.diagram,
  "stroke-width": 1.25,
} as const;

/** Dash pattern of the style guide's `dashed` class. */
export const DASH = "4 3";

/** Link label, the style guide's `tag` and `tag-text` classes. */
export const tagStyle = {
  defaultFontSize: 11,
  box: {
    fill: colours.paper,
    stroke: colours.diagram,
    "stroke-width": 1,
    rx: 2,
  },
  text: {
    "font-family": font.mono,
    fill: colours.diagram,
    "text-anchor": "middle",
  },
} as const;

/** Export frame in the editor. Never exported itself. */
export const frameStyle = {
  fill: "none",
  stroke: colours.borderStrong,
  "stroke-width": 1,
  "stroke-dasharray": "6 4",
} as const;

export const nodeStyle = {
  fill: colours.paper,
  stroke: colours.diagram,
  "stroke-width": 1,
  rx: 4,
} as const;
