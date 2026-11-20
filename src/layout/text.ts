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

let measureCtx: CanvasRenderingContext2D | null | undefined;

function measurer(fontSize: number): (s: string) => number {
  measureCtx ??= document.createElement("canvas").getContext("2d");
  const ctx = measureCtx;
  // Rough fallback if no 2D context is available.
  if (!ctx) return (s) => s.length * fontSize * 0.55;
  ctx.font = cssFont(fontSize);
  return (s) => ctx.measureText(s).width;
}

/** Width of a single line of sans text. */
export function textWidth(text: string, fontSize: number): number {
  return measurer(fontSize)(text);
}

/**
 * Greedy word wrap. Explicit newlines always break. A single word wider
 * than the line is broken between characters, matching the editor's
 * `overflow-wrap: anywhere`.
 */
export function wrapText(text: string, maxWidth: number, fontSize: number): string[] {
  const measure = measurer(fontSize);
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
