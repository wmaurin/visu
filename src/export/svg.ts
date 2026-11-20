import type { Rect } from "../core/geometry";
import { svgEl } from "../core/svg";
import type { Doc } from "../model/types";
import { renderDiagram } from "../render/renderer";
import { colours } from "../render/theme";

/**
 * Standalone SVG of the part of the diagram inside `area`. Uses the same
 * renderer as the canvas, so the export looks exactly like the editor.
 * Styles are attributes, so the file needs no external stylesheet.
 * Editor-only things (grid, frames, selection) are not part of it.
 */
export function exportSvg(doc: Doc, area: Rect): string {
  const { x, y, width, height } = area;

  const content = svgEl("g");
  renderDiagram(doc, content, null);
  // Editor bookkeeping, meaningless in the file.
  for (const el of content.querySelectorAll("[data-id]")) el.removeAttribute("data-id");

  const svg = svgEl("svg", { viewBox: `${x} ${y} ${width} ${height}`, width, height }, [
    svgEl("rect", { x, y, width, height, fill: colours.paper }),
    content,
  ]);
  return `<?xml version="1.0" encoding="UTF-8"?>\n${new XMLSerializer().serializeToString(svg)}\n`;
}
