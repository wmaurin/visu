import { svgEl } from "../core/svg";
import { pathData } from "../layout/path";
import { wrapText } from "../layout/text";
import { labelBox, route } from "../model/queries";
import type { Doc, HAlign, LineLabel, LineShape, RectShape, Ref, Shape } from "../model/types";
import { markerAttrs } from "./markers";
import { font, lineHeightFor, linkStyle, nodeStyle, tagStyle, textStyle } from "./theme";

const TEXT_ANCHOR: Record<HAlign, string> = { left: "start", center: "middle", right: "end" };

function renderText(shape: RectShape): SVGTextElement {
  const { padding } = textStyle;
  const { fontSize } = shape;
  const lineHeight = lineHeightFor(fontSize);
  const lines = wrapText(shape.text, Math.max(1, shape.width - 2 * padding), fontSize);
  const blockHeight = lines.length * lineHeight;

  const top = {
    top: shape.y + padding,
    middle: shape.y + (shape.height - blockHeight) / 2,
    bottom: shape.y + shape.height - padding - blockHeight,
  }[shape.valign];
  const x = {
    left: shape.x + padding,
    center: shape.x + shape.width / 2,
    right: shape.x + shape.width - padding,
  }[shape.align];

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
      const { x, y, width, height } = shape;
      const group = svgEl("g", { "data-id": shape.id }, [
        svgEl("rect", { x, y, width, height, ...nodeStyle }),
      ]);
      if (!hideText && shape.text !== "") group.append(renderText(shape));
      return group;
    }
  }
}

function renderLine(doc: Doc, line: LineShape): SVGElement[] {
  const points = route(doc, line);
  if (!points) return [];
  return [
    svgEl("path", {
      "data-id": line.id,
      d: pathData(points),
      ...linkStyle,
      ...markerAttrs(line.startCap, line.endCap),
    }),
  ];
}

function renderLabel(doc: Doc, label: LineLabel): SVGElement[] {
  const box = labelBox(doc, label);
  if (!box) return [];
  const text = svgEl("text", {
    x: box.x + box.width / 2,
    y: box.y + box.height / 2 + 4,
    style: "white-space: pre",
    ...tagStyle.text,
  });
  text.textContent = label.text;
  return [svgEl("g", { "data-id": label.id }, [svgEl("rect", { ...box, ...tagStyle.box }), text])];
}

/**
 * Full redraw of the document layer. Cheap enough until diagrams get large.
 * Lines come first so shapes cover their ends, as the style guide asks.
 * Labels come last, so they stay readable where they touch a shape.
 * The item being edited hides its text, as the inline editor shows it.
 */
export function renderDiagram(doc: Doc, layer: SVGGElement, editing: Ref | null): void {
  const hidden = (kind: Ref["kind"], id: string) => editing?.kind === kind && editing.id === id;
  layer.replaceChildren(
    ...doc.lines.flatMap((l) => renderLine(doc, l)),
    ...doc.shapes.map((s) => renderShape(s, hidden("shapes", s.id))),
    ...doc.labels.flatMap((l) => (hidden("labels", l.id) ? [] : renderLabel(doc, l))),
  );
}
