import type { Point, Rect } from "../core/geometry";
import type { HAlign, VAlign } from "../model/types";
import { cssFont } from "../render/theme";

/** Gap between the text and the left and right edge of its tag. */
export const TAG_PADDING_X = 8;

/**
 * Tag size from the style guide, scaled with the font size. At the guide's
 * 11px it gives width = characters × 6.6 + 16 and height = 20. The margin
 * around the text stays fixed: 8px left and right, 4.5px top and bottom.
 * Monospace glyphs are 0.6 em wide.
 */
export function tagHeight(fontSize: number): number {
  return fontSize + 9;
}

export function tagWidth(text: string, fontSize: number): number {
  return Math.ceil((text.length * fontSize * 0.6 + 2 * TAG_PADDING_X) / 2) * 2;
}

/** Box of the given size whose `align`/`valign` point lies on `anchor`. */
export function anchoredBox(anchor: Point, width: number, height: number, align: HAlign, valign: VAlign): Rect {
  return {
    x: { left: anchor.x, center: anchor.x - width / 2, right: anchor.x - width }[align],
    y: { top: anchor.y, middle: anchor.y - height / 2, bottom: anchor.y - height }[valign],
    width,
    height,
  };
}

/** The point of `box` that `align`/`valign` name. The inverse of `anchoredBox`. */
export function anchorOf(box: Rect, align: HAlign, valign: VAlign): Point {
  return {
    x: { left: box.x, center: box.x + box.width / 2, right: box.x + box.width }[align],
    y: { top: box.y, middle: box.y + box.height / 2, bottom: box.y + box.height }[valign],
  };
}

/** Box of a tag anchored at `anchor`, centred unless told otherwise. */
export function tagBox(
  anchor: Point,
  text: string,
  fontSize: number,
  align: HAlign = "center",
  valign: VAlign = "middle",
): Rect {
  return anchoredBox(anchor, tagWidth(text, fontSize), tagHeight(fontSize), align, valign);
}

/**
 * Advance widths in em of Arial, the font the stack falls back to on most
 * systems, grouped by character. Used when no canvas can measure, e.g.
 * outside the browser. Close enough to judge whether text fits.
 */
const GLYPH_EM: ReadonlyArray<readonly [RegExp, number]> = [
  [/[ijl.,:;'|!]/, 0.222],
  [/[ ft\/[\]()I-]/, 0.278],
  [/[r"*]/, 0.333],
  [/[cksvxyzJ_]/, 0.5],
  [/[mM]/, 0.833],
  [/[wW]/, 0.75],
  [/[A-Z]/, 0.667],
];
/** Lowercase, digits and everything else. */
const DEFAULT_EM = 0.556;
/** Bold glyphs run this much wider on average. */
const BOLD_FACTOR = 1.07;

function estimateWidth(text: string, fontSize: number, bold: boolean): number {
  let em = 0;
  for (const char of text) em += GLYPH_EM.find(([re]) => re.test(char))?.[1] ?? DEFAULT_EM;
  return em * fontSize * (bold ? BOLD_FACTOR : 1);
}

let measureCtx: CanvasRenderingContext2D | null | undefined;

function measurer(fontSize: number, bold: boolean): (s: string) => number {
  // No document outside the browser, e.g. in the check script.
  measureCtx ??= typeof document === "undefined" ? null : document.createElement("canvas").getContext("2d");
  const ctx = measureCtx;
  if (!ctx) return (s) => estimateWidth(s, fontSize, bold);
  ctx.font = cssFont(fontSize, bold);
  return (s) => ctx.measureText(s).width;
}

/** Width of a single line of sans text. */
export function textWidth(text: string, fontSize: number, bold = false): number {
  return measurer(fontSize, bold)(text);
}

/**
 * Greedy word wrap. Explicit newlines always break. A single word wider
 * than the line is broken between characters, matching the editor's
 * `overflow-wrap: anywhere`. Bold text is measured bold, as it runs wider.
 */
export function wrapText(text: string, maxWidth: number, fontSize: number, bold = false): string[] {
  const measure = measurer(fontSize, bold);
  const lines: string[] = [];

  for (const paragraph of text.split("\n")) {
    let line = "";

    for (const word of paragraph.split(" ")) {
      const candidate = line === "" ? word : `${line} ${word}`;
      if (measure(candidate) <= maxWidth) {
        line = candidate;
        continue;
      }

      if (line !== "") lines.push(line);
      line = "";
      for (const char of word) {
        if (line !== "" && measure(line + char) > maxWidth) {
          lines.push(line);
          line = "";
        }
        line += char;
      }
    }

    lines.push(line);
  }

  return lines;
}
