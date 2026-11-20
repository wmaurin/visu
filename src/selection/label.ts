import type { AppContext } from "../context";
import { fractionAlong, pointAlong } from "../layout/path";
import { labelBox, route } from "../model/queries";
import type { LineLabel } from "../model/types";
import { FloatingBar } from "../ui/floating-bar";
import type { FieldSpec } from "../ui/inline-editor";
import type { Handler } from "./handler";
import { fontSizeField, tagField, tagOverlay } from "./tag";

/** Line labels: slide along their line, font size in the bar, double-click to edit. */
export function labelHandler(ctx: AppContext): Handler<LineLabel> {
  const { diagram } = ctx;
  const points = (l: LineLabel) => {
    const line = diagram.get("lines", l.lineId);
    return line ? route(diagram.doc, line) : null;
  };

  return {
    cursor: "move",
    bar: new FloatingBar<LineLabel>(ctx.canvas, "Label format", [fontSizeField(ctx, "labels")]),
    bounds: (l) => labelBox(diagram.doc, l),
    overlay: (l) => tagOverlay(labelBox(diagram.doc, l)),

    // Projects the pointer onto the line, so the label never leaves it.
    drag: (l) => ({
      move: ({ raw }) => {
        const pts = points(l);
        if (pts) diagram.update("labels", l.id, { t: fractionAlong(pts, raw) });
      },
    }),

    doubleClick: (l) => ctx.editor.open({ kind: "labels", id: l.id }, labelField(ctx, l.id)),
  };
}

/** Edits a label in place, centred on its current spot on the line. */
export function labelField(ctx: AppContext, id: string): FieldSpec {
  return tagField(ctx, "labels", id, () => {
    const label = ctx.diagram.get("labels", id);
    const line = label && ctx.diagram.get("lines", label.lineId);
    const pts = line && route(ctx.diagram.doc, line);
    return label && pts ? { point: pointAlong(pts, label.t), align: "center", valign: "middle" } : null;
  });
}
