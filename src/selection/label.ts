import type { AppContext } from "../context";
import { inflate } from "../core/geometry";
import { setAttrs } from "../core/svg";
import { fractionAlong, pointAlong } from "../layout/path";
import { tagHeight, tagWidth } from "../layout/text";
import { byId, labelBox, route } from "../model/queries";
import type { LineLabel } from "../model/types";
import { outline, SELECTION_PADDING } from "../render/overlay";
import { colours, font, textStyle, ui } from "../render/theme";
import { FloatingBar, numberField } from "../ui/floating-bar";
import type { FieldSpec } from "../ui/inline-editor";
import type { Handler } from "./handler";

/** Room for a few characters while a label is still short, in em. */
const MIN_EDIT_WIDTH_EM = 6;

/** Line labels: slide along the line, font size in the bar, double-click to edit. */
export function labelHandler(ctx: AppContext): Handler<LineLabel> {
  const { diagram } = ctx;
  return {
    cursor: "move",
    bar: new FloatingBar<LineLabel>(ctx.canvas, "Label format", [
      numberField({
        label: "Font size",
        unit: "px",
        min: textStyle.minFontSize,
        max: textStyle.maxFontSize,
        read: (l) => l.fontSize,
        write: (l, fontSize) => diagram.update("labels", l.id, { fontSize }),
      }),
    ]),

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
 * Single line text field centred on the label, sized like its tag. It grows
 * with its content. A label left empty is removed.
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
      Object.assign(input.style, { fontFamily: font.mono, color: colours.ink2, borderColor: ui.selection });
      return { root: input, field: input };
    },

    layout(frame, _root, field) {
      const doc = diagram.doc;
      const label = byId(doc.labels, id);
      const line = label && byId(doc.lines, label.lineId);
      const points = line && route(doc, line);
      if (!label || !points) return false;

      const { fontSize } = label;
      const centre = pointAlong(points, label.t);
      const value = (field as HTMLInputElement).value;
      const width = Math.max(tagWidth(value, fontSize), MIN_EDIT_WIDTH_EM * fontSize);
      const height = tagHeight(fontSize);
      field.style.fontSize = `${fontSize}px`;
      setAttrs(frame, { x: centre.x - width / 2, y: centre.y - height / 2, width, height });
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
