import type { AppContext } from "../context";
import { setAttrs } from "../core/svg";
import type { Patch } from "../model/diagram";
import type { RectShape, VAlign } from "../model/types";
import { shapeFill } from "../render/renderer";
import { cssFont, lineHeightFor, readableOn, textStyle } from "../render/theme";
import { boldToggle, colorField, dropdown, FloatingBar, numberField } from "../ui/floating-bar";
import { focusAtEnd, makePlainTextEditable, type FieldSpec } from "../ui/inline-editor";
import { H_ALIGN, V_ALIGN } from "./align";
import { boxBehaviour } from "./box";
import type { Handler } from "./handler";

const JUSTIFY: Record<VAlign, string> = { top: "flex-start", middle: "center", bottom: "flex-end" };

/** Rectangles: move, resize with eight handles, text with format bar. */
export function shapeHandler(ctx: AppContext): Handler<RectShape> {
  const { diagram, canvas, editor } = ctx;
  const set = (s: RectShape, patch: Patch<"shapes">) => diagram.update("shapes", s.id, patch);

  return {
    ...boxBehaviour<RectShape>(ctx, "shapes"),
    cursor: "move",
    bar: new FloatingBar<RectShape>(canvas, "Rectangle format", [
      colorField("Colour", (s) => s, (s, value) => set(s, value)),
      numberField({
        label: "Font size",
        unit: "px",
        min: textStyle.minFontSize,
        max: textStyle.maxFontSize,
        read: (s) => s.fontSize,
        write: (s, fontSize) => set(s, { fontSize }),
      }),
      boldToggle((s, bold) => set(s, { bold })),
      dropdown("Horizontal alignment", H_ALIGN, (s) => s.align, (s, align) => set(s, { align })),
      dropdown("Vertical alignment", V_ALIGN, (s) => s.valign, (s, valign) => set(s, { valign })),
    ]),
    doubleClick: (s) => editor.open({ kind: "shapes", id: s.id }, textField(ctx, s.id)),
  };
}

/** Multi-line text editing inside the shape, laid out like the rendered text. */
function textField(ctx: AppContext, id: string): FieldSpec {
  const shape = () => ctx.diagram.get("shapes", id);
  return {
    multiline: true,
    text: () => shape()?.text,

    create(text) {
      const field = document.createElement("div");
      field.className = "text-editor-content";
      makePlainTextEditable(field);
      field.spellcheck = false;
      field.textContent = text;
      field.style.color = textStyle.fill;
      // An empty editable has no line box, so the caret ignores text-align
      // until the first character arrives. A placeholder <br> creates the line.
      if (text === "") field.append(document.createElement("br"));

      const root = document.createElement("div");
      root.className = "text-editor";
      root.style.padding = `${textStyle.padding}px`;
      root.append(field);
      // A click in the padding should still focus the text.
      root.addEventListener("mousedown", (event) => {
        if (event.target !== root) return;
        event.preventDefault();
        focusAtEnd(field);
      });
      return { root, field };
    },

    layout(frame, root, field) {
      const s = shape();
      if (!s) return false;
      setAttrs(frame, { x: s.x, y: s.y, width: s.width, height: s.height });
      root.style.justifyContent = JUSTIFY[s.valign];
      field.style.textAlign = s.align;
      field.style.color = readableOn(shapeFill(s));
      field.style.font = cssFont(s.fontSize, s.bold);
      field.style.lineHeight = `${lineHeightFor(s.fontSize)}px`;
      return true;
    },

    commit: (text) => ctx.diagram.update("shapes", id, { text }),
  };
}
