import type { AppContext } from "../context";
import { textBox } from "../model/queries";
import type { FreeText } from "../model/types";
import type { FieldSpec } from "../ui/inline-editor";
import type { Handler } from "./handler";
import { tagBar, tagField, tagOverlay } from "./tag";

/** Free texts: move on the grid, font size in the bar, double-click to edit. */
export function textHandler(ctx: AppContext): Handler<FreeText> {
  const { diagram } = ctx;
  return {
    cursor: "move",
    bar: tagBar(ctx, "texts"),
    bounds: textBox,
    overlay: (t) => tagOverlay(textBox(t)),

    drag: (t, start) => ({
      move: ({ point }) =>
        diagram.update("texts", t.id, { x: t.x + point.x - start.point.x, y: t.y + point.y - start.point.y }),
    }),

    doubleClick: (t) => ctx.editor.open({ kind: "texts", id: t.id }, textField(ctx, t.id)),
  };
}

/** Edits a free text in place, centred on its position. */
export function textField(ctx: AppContext, id: string): FieldSpec {
  return tagField(ctx, "texts", id, () => ctx.diagram.get("texts", id) ?? null);
}
