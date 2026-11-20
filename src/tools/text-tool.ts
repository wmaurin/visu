import type { AppContext } from "../context";
import type { IconDef } from "../core/svg";
import { newId } from "../model/diagram";
import { settle } from "../model/hierarchy";
import { textAt } from "../model/queries";
import { tagStyle } from "../render/theme";
import { textField } from "../selection/text";
import type { CanvasPointer } from "../ui/canvas";
import type { Tool } from "./tool";

/**
 * Places free text. A click on empty canvas creates a text on that grid
 * point and edits it, a click on an existing text edits that one. A click
 * while editing only finishes the edit.
 *
 * Works on pointer up: the browser moves focus on pointer down, which
 * would blur a field opened any earlier.
 */
export class TextTool implements Tool {
  readonly id = "text";
  readonly label = "Text";
  readonly shortcut = "t";
  readonly cursor = "text";
  // Lucide "type"
  readonly icon: IconDef = [["path", { d: "M4 7V4h16v3M9 20h6M12 4v16" }]];

  private finishingEdit = false;

  constructor(private readonly ctx: AppContext) {}

  pointerDown({ event }: CanvasPointer): void {
    this.finishingEdit = event.button === 0 && this.ctx.editor.editing !== null;
  }

  pointerUp({ point, raw, event }: CanvasPointer): void {
    if (event.button !== 0 || this.finishingEdit) return;
    const { diagram, selection, editor } = this.ctx;

    const existing = textAt(diagram.doc, raw);
    const id = existing?.id ?? newId();
    if (!existing) {
      // The click point becomes the top left corner, as in most editors.
      diagram.add("texts", {
        id,
        x: point.x,
        y: point.y,
        text: "",
        fontSize: tagStyle.defaultFontSize,
        bold: false,
        align: "left",
        valign: "top",
        parentId: null,
      });
      settle(diagram, { kind: "texts", id });
    }
    selection.set({ kind: "texts", id });
    editor.open({ kind: "texts", id }, textField(this.ctx, id));
  }

  deactivate(): void {
    this.ctx.editor.close();
  }
}
