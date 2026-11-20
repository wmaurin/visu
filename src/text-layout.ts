import { font, textStyle } from "./theme";

let measureCtx: CanvasRenderingContext2D | null = null;

function measure(s: string): number {
  if (!measureCtx) {
    measureCtx = document.createElement("canvas").getContext("2d");
    if (measureCtx) {
      measureCtx.font = `${textStyle.fontWeight} ${textStyle.fontSize}px ${font.sans}`;
    }
  }
  // Rough fallback if no 2D context is available.
  return measureCtx ? measureCtx.measureText(s).width : s.length * textStyle.fontSize * 0.55;
}

/**
 * Greedy word wrap. Explicit newlines always break. A single word wider
 * than the line is broken between characters, matching the editor's
 * `overflow-wrap: anywhere`.
 */
export function wrapText(text: string, maxWidth: number): string[] {
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
