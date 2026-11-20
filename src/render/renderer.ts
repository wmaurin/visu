import { svgEl } from "../core/svg";
import { pathData } from "../layout/path";
import { TAG_PADDING_X, wrapText } from "../layout/text";
import type { Rect } from "../core/geometry";
import { FRAME_TITLE_SIZE, labelBox, layering, route, textBox } from "../model/queries";
import type { Doc, FreeText, HAlign, LineLabel, LineShape, RectShape, Ref, Shape } from "../model/types";
import { markerAttrs } from "./markers";
import { colours, DASH, font, frameStyle, lineHeightFor, linkStyle, nodeStyle, tagStyle, textStyle } from "./theme";

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
      ...(line.style === "dashed" ? { "stroke-dasharray": DASH } : {}),
      ...markerAttrs(line.startCap, line.endCap),
    }),
  ];
}

/**
 * Text centred in a tag box, shared by line labels and free texts. Labels
 * draw the box as a frame that covers the line, free texts stay bare.
 */
function renderTag(
  item: LineLabel | FreeText,
  box: Rect | null,
  framed: boolean,
  align: HAlign = "center",
): SVGElement[] {
  if (!box) return [];
  const text = svgEl("text", {
    ...tagStyle.text,
    // Glyphs sit on the anchored side, inset by the tag padding.
    x: {
      left: box.x + TAG_PADDING_X,
      center: box.x + box.width / 2,
      right: box.x + box.width - TAG_PADDING_X,
    }[align],
    "text-anchor": TEXT_ANCHOR[align],
    // Baseline of a glyph vertically centred in the tag.
    y: box.y + box.height / 2 + item.fontSize * 0.36,
    "font-size": item.fontSize,
    style: "white-space: pre",
  });
  text.textContent = item.text;
  const frame = framed ? [svgEl("rect", { ...box, ...tagStyle.box })] : [];
  return [svgEl("g", { "data-id": item.id }, [...frame, text])];
}

/**
 * Export frames, drawn on their own layer below the diagram so they never
 * end up in an export: a dashed border and the name above the top left
 * corner. The name of the frame being edited is hidden.
 */
export function renderFrames(doc: Doc, layer: SVGGElement, editing: Ref | null): void {
  layer.replaceChildren(
    ...doc.frames.map((f) => {
      const border = svgEl("rect", { ...rectOf(f), ...frameStyle });
      if (editing?.kind === "frames" && editing.id === f.id) return svgEl("g", { "data-id": f.id }, [border]);

      const title = svgEl("text", {
        x: f.x,
        y: f.y - 6,
        "font-family": font.sans,
        "font-size": FRAME_TITLE_SIZE,
        fill: colours.muted,
        style: "white-space: pre",
      });
      title.textContent = f.name;
      return svgEl("g", { "data-id": f.id }, [border, title]);
    }),
  );
}

function rectOf({ x, y, width, height }: Rect): Rect {
  return { x, y, width, height };
}

/**
 * Full redraw of the document layer. Cheap enough until diagrams get large.
 * Order from the bottom, as the style guide asks: containers (outermost
 * first), lines, leaf rectangles covering the line ends, then labels and
 * texts so they stay readable where they touch a rectangle.
 * The item being edited hides its text, as the inline editor shows it.
 */
export function renderDiagram(doc: Doc, layer: SVGGElement, editing: Ref | null): void {
  const hidden = (kind: Ref["kind"], id: string) => editing?.kind === kind && editing.id === id;
  const { containers, leaves } = layering(doc);
  layer.replaceChildren(
    ...containers.map((s) => renderShape(s, hidden("shapes", s.id))),
    ...doc.lines.flatMap((l) => renderLine(doc, l)),
    ...leaves.map((s) => renderShape(s, hidden("shapes", s.id))),
    ...doc.labels.flatMap((l) => (hidden("labels", l.id) ? [] : renderTag(l, labelBox(doc, l), true))),
    ...doc.texts.flatMap((t) => (hidden("texts", t.id) ? [] : renderTag(t, textBox(t), false, t.align))),
  );
}
