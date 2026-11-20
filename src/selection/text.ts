import type { AppContext } from "../context";
import { snapPoint } from "../core/geometry";
import { anchorOf, tagBox } from "../layout/text";
import type { Patch } from "../model/diagram";
import { settle } from "../model/hierarchy";
import { textBox } from "../model/queries";
import type { FreeText, HAlign, VAlign } from "../model/types";
import { dropdown, FloatingBar, whiteTextToggle } from "../ui/floating-bar";
import type { FieldSpec } from "../ui/inline-editor";
import { H_ALIGN, V_ALIGN } from "./align";
import type { Handler } from "./handler";
import { fontSizeField, tagBoldToggle, tagField, tagOverlay } from "./tag";

/**
 * Free texts: move on the grid, font size and alignment in the bar,
 * double-click to edit. The alignment picks which side of the text box is
 * anchored to the grid.
 */
export function textHandler(ctx: AppContext): Handler<FreeText> {
  const { diagram } = ctx;
  const set = (t: FreeText, patch: Patch<"texts">) => diagram.update("texts", t.id, patch);

  return {
    cursor: "move",
    bar: new FloatingBar<FreeText>(ctx.canvas, "Text format", [
      fontSizeField(ctx, "texts"),
      tagBoldToggle(ctx, "texts"),
      whiteTextToggle((t, textColor) => set(t, { textColor })),
      dropdown("Horizontal alignment", H_ALIGN, (t) => t.align, (t, align) => set(t, realign(t, align, t.valign))),
      dropdown("Vertical alignment", V_ALIGN, (t) => t.valign, (t, valign) => set(t, realign(t, t.align, valign))),
    ]),
    bounds: textBox,
    overlay: (t) => tagOverlay(textBox(t)),

    drag: (t, start) => ({
      move: ({ point }) => set(t, { x: t.x + point.x - start.point.x, y: t.y + point.y - start.point.y }),
      end: () => settle(diagram, { kind: "texts", id: t.id }),
    }),

    doubleClick: (t) => ctx.editor.open({ kind: "texts", id: t.id }, textField(ctx, t.id)),
  };
}

/**
 * New alignment with the anchor moved to the matching side of the current
 * box, then snapped to the grid. The text stays where it is, give or take
 * the snap.
 */
function realign(t: FreeText, align: HAlign, valign: VAlign): Patch<"texts"> {
  const box = tagBox(t, t.text, t.fontSize, t.align, t.valign);
  return { align, valign, ...snapPoint(anchorOf(box, align, valign)) };
}

/** Edits a free text in place, growing away from its anchor. */
export function textField(ctx: AppContext, id: string): FieldSpec {
  return tagField(ctx, "texts", id, () => {
    const t = ctx.diagram.get("texts", id);
    return t ? { point: t, align: t.align, valign: t.valign } : null;
  });
}
