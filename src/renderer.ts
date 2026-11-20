import type { Diagram, HAlign, LineShape, RectShape, Shape } from "./model";
import { pathData } from "./routing";
import { svgEl } from "./svg";
import { wrapText } from "./text-layout";
import { font, lineHeightFor, linkStyle, nodeStyle, textStyle } from "./theme";

const TEXT_ANCHOR: Record<HAlign, string> = {
  left: "start",
  center: "middle",
  right: "end",
};

function renderText(shape: RectShape): SVGTextElement {
  const { padding } = textStyle;
  const { fontSize } = shape;
  const lineHeight = lineHeightFor(fontSize);
  const lines = wrapText(shape.text, Math.max(1, shape.width - 2 * padding), fontSize);
  const blockHeight = lines.length * lineHeight;

  const top =
    shape.valign === "top"
      ? shape.y + padding
      : shape.valign === "bottom"
        ? shape.y + shape.height - padding - blockHeight
        : shape.y + (shape.height - blockHeight) / 2;

  const x =
    shape.align === "left"
      ? shape.x + padding
      : shape.align === "right"
        ? shape.x + shape.width - padding
        : shape.x + shape.width / 2;

  // Baseline of a glyph vertically centred in its line box.
  const baseline = lineHeight / 2 + fontSize * 0.35;

  return svgEl(
    "text",
    {
      "text-anchor": TEXT_ANCHOR[shape.align],
      "font-family": font.sans,
      "font-size": fontSize,
      "font-weight": textStyle.fontWeight,
      fill: textStyle.fill,
      style: "white-space: pre",
    },
    lines.map((line, i) => {
      const tspan = svgEl("tspan", { x, y: top + i * lineHeight + baseline });
      tspan.textContent = line;
      return tspan;
    }),
  );
}

function renderShape(shape: Shape, hideText: boolean): SVGElement {
  switch (shape.kind) {
    case "rect": {
      const group = svgEl("g", { "data-id": shape.id }, [
        svgEl("rect", {
          x: shape.x,
          y: shape.y,
          width: shape.width,
          height: shape.height,
          ...nodeStyle,
        }),
      ]);
      if (!hideText && shape.text !== "") group.append(renderText(shape));
      return group;
    }
  }
}

function renderLine(diagram: Diagram, line: LineShape): SVGElement | null {
  const points = diagram.route(line);
  if (!points) return null;
  return svgEl("path", { "data-id": line.id, d: pathData(points), ...linkStyle });
}

/**
 * Full redraw of the shape layer. Cheap enough until diagrams get large.
 * Lines come first so shapes cover their ends, as the style guide asks.
 * The text of the shape being edited is hidden, as the editor shows it.
 */
export function renderDiagram(
  diagram: Diagram,
  layer: SVGGElement,
  editingId: string | null = null,
): void {
  const lines = diagram.allLines().flatMap((l) => renderLine(diagram, l) ?? []);
  const shapes = diagram.all().map((s) => renderShape(s, s.id === editingId));
  layer.replaceChildren(...lines, ...shapes);
}
