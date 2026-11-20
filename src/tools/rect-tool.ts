import { MIN_SHAPE_SIZE, rectFromPoints } from "../core/geometry";
import type { IconDef } from "../core/svg";
import { newId } from "../model/diagram";
import type { RectShape } from "../model/types";
import { sizeReadout } from "../render/overlay";
import { textStyle } from "../render/theme";
import type { CanvasPointer } from "../ui/canvas";
import { GestureTool, type Gesture } from "./tool";

const NEW_RECT: Omit<RectShape, "id" | "x" | "y" | "width" | "height"> = {
  kind: "rect",
  text: "",
  align: "center",
  valign: "middle",
  fontSize: textStyle.defaultFontSize,
};

/**
 * Draws rectangles by dragging. Corners snap to the grid. Shift constrains
 * to a square. The shape is real from the first move, so what you see while
 * dragging is the result. Drags below the minimum size are discarded.
 */
export class RectTool extends GestureTool {
  readonly id = "rect";
  readonly label = "Rectangle";
  readonly shortcut = "r";
  readonly cursor = "crosshair";
  // Lucide "square"
  readonly icon: IconDef = [["rect", { x: 3, y: 3, width: 18, height: 18, rx: 2 }]];

  protected begin({ point: start }: CanvasPointer): Gesture {
    const { diagram, canvas } = this.ctx;
    const overlay = canvas.overlay();
    const id = newId();

    return {
      move: ({ point, event }) => {
        const bounds = rectFromPoints(start, point, event.shiftKey);
        if (diagram.get("shapes", id)) diagram.update("shapes", id, bounds);
        else diagram.add("shapes", { ...NEW_RECT, id, ...bounds });
        overlay.replaceChildren(sizeReadout(bounds));
      },
      end: () => {
        const shape = diagram.get("shapes", id);
        return !!shape && shape.width >= MIN_SHAPE_SIZE && shape.height >= MIN_SHAPE_SIZE;
      },
      dispose: () => overlay.remove(),
    };
  }
}
