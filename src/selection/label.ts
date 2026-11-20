import type { AppContext } from "../context";
import { inflate } from "../core/geometry";
import { setAttrs } from "../core/svg";
import { byId, labelBox, route } from "../model/queries";
import type { LineLabel } from "../model/types";
import { fractionAlong, pointAlong } from "../layout/path";
import { TAG_HEIGHT, tagWidth } from "../layout/text";
import { outline, SELECTION_PADDING } from "../render/overlay";
import { colours, font, ui } from "../render/theme";
import type { FieldSpec } from "../ui/inline-editor";
import type { Handler } from "./handler";

/** Room for a few characters while a label is still short. */
const MIN_EDIT_WIDTH = 64;

/** Line labels: slide along the line, double-click to edit. */
export function labelHandler(ctx: AppContext): Handler<LineLabel> {
  const { diagram } = ctx;
  return {
    cursor: "move",

    bounds: (l) => labelBox(diagram.doc, l),

    overlay: (l) => {
      const box = labelBox(diagram.doc, l);
      return box ? [outline(inflate(box, SELECTION_PADDING), 4)] : [];
    },

    // Projects the pointer onto the line, so the label never leaves it.
    drag: (l) => ({
      move: ({ raw }) => {
        const line = diagram.get("lines", l.lineId);
        const points = line && route(diagram.doc, line);
        if (points) diagram.update("labels", l.id, { t: fractionAlong(points, raw) });
      },
    }),

    doubleClick: (l) => ctx.editor.open({ kind: "labels", id: l.id }, labelField(ctx, l.id)),
  };
}

/**
 * Single line text field centred on the label. It grows with its content.
 * A label left empty is removed.
 */
export function labelField(ctx: AppContext, id: string): FieldSpec {
  const { diagram } = ctx;
  return {
    multiline: false,
    text: () => diagram.get("labels", id)?.text,

    create(text) {
      const input = document.createElement("input");
      input.type = "text";
      input.className = "label-editor";
      input.value = text;
      input.spellcheck = false;
      input.setAttribute("aria-label", "Line label");
      Object.assign(input.style, {
        fontFamily: font.mono,
        fontSize: "11px",
        color: colours.ink2,
        borderColor: ui.selection,
      });
      return { root: input, field: input };
    },

    layout(frame, _root, field) {
      const doc = diagram.doc;
      const label = byId(doc.labels, id);
      const line = label && byId(doc.lines, label.lineId);
      const points = line && route(doc, line);
      if (!label || !points) return false;

      const centre = pointAlong(points, label.t);
      const width = Math.max(tagWidth((field as HTMLInputElement).value), MIN_EDIT_WIDTH);
      setAttrs(frame, { x: centre.x - width / 2, y: centre.y - TAG_HEIGHT / 2, width, height: TAG_HEIGHT });
      return true;
    },

    commit: (text) => {
      if (text !== "") {
        diagram.update("labels", id, { text });
        return;
      }
      diagram.remove({ kind: "labels", id });
      ctx.selection.set(null);
    },
  };
}
