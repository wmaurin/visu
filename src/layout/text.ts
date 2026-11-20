import type { Point, Rect } from "../core/geometry";
import { cssFont } from "../render/theme";

/** Tag height from the style guide. */
export const TAG_HEIGHT = 20;

/**
 * Tag width from the style guide: characters × 6.6 + 16, rounded to an
 * even number. Fits the 11px monospace label text.
 */
export function tagWidth(text: string): number {
  return Math.ceil((text.length * 6.6 + 16) / 2) * 2;
}

/** Box of a tag centred on `centre`. */
export function tagBox(centre: Point, text: string): Rect {
  const width = tagWidth(text);
  return { x: centre.x - width / 2, y: centre.y - TAG_HEIGHT / 2, width, height: TAG_HEIGHT };
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
