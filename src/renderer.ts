import type { Diagram, HAlign, LineShape, RectShape, Shape } from "./model";
import { markerAttrs } from "./markers";
import { pathData } from "./routing";
import { svgEl } from "./svg";
import { wrapText } from "./text-layout";
import { font, lineHeightFor, linkStyle, nodeStyle, tagStyle, textStyle } from "./theme";

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
  return svgEl("path", {
    "data-id": line.id,
    d: pathData(points),
    ...linkStyle,
    ...markerAttrs(line.startCap, line.endCap),
  });
}

function renderLabels(diagram: Diagram, line: LineShape, hiddenId: string | null): SVGElement[] {
  return line.labels.flatMap((label) => {
    if (label.id === hiddenId) return [];
    const box = diagram.labelBox(line, label);
    if (!box) return [];

    const text = svgEl("text", {
      x: box.x + box.width / 2,
      y: box.y + box.height / 2 + 4,
      style: "white-space: pre",
      ...tagStyle.text,
    });
    text.textContent = label.text;
    return [svgEl("g", { "data-id": label.id }, [svgEl("rect", { ...box, ...tagStyle.box }), text])];
  });
}

export interface RenderOptions {
  /** Shape whose text is hidden, as the text editor shows it. */
  readonly editingShapeId: string | null;
  /** Label that is hidden, as the label editor shows it. */
  readonly editingLabelId: string | null;
}

/**
 * Full redraw of the shape layer. Cheap enough until diagrams get large.
 * Lines come first so shapes cover their ends, as the style guide asks.
 * Labels come last, so they stay readable where they touch a shape.
 */
export function renderDiagram(diagram: Diagram, layer: SVGGElement, options: RenderOptions): void {
  const lines = diagram.allLines();
  const paths = lines.flatMap((l) => renderLine(diagram, l) ?? []);
  const shapes = diagram.all().map((s) => renderShape(s, s.id === options.editingShapeId));
  const labels = lines.flatMap((l) => renderLabels(diagram, l, options.editingLabelId));
  layer.replaceChildren(...paths, ...shapes, ...labels);
}
