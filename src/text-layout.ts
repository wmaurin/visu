import { cssFont } from "./theme";

let measureCtx: CanvasRenderingContext2D | null | undefined;

function measurer(fontSize: number): (s: string) => number {
  if (measureCtx === undefined) {
    measureCtx = document.createElement("canvas").getContext("2d");
  }
  const ctx = measureCtx;
  if (!ctx) {
    // Rough fallback if no 2D context is available.
    return (s) => s.length * fontSize * 0.55;
  }
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
