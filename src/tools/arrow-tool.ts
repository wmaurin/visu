import type { AppContext } from "../context";
import { samePoint } from "../core/geometry";
import type { IconDef } from "../core/svg";
import { newId } from "../model/diagram";
import { connectionTarget, type Target } from "../model/queries";
import type { LineShape, Shape } from "../model/types";
import { anchorHints } from "../render/overlay";
import type { CanvasPointer } from "../ui/canvas";
import { GestureTool, type Gesture } from "./tool";

/** New lines follow the style guide: orthogonal flows with an arrow at the end. */
const NEW_LINE: Omit<LineShape, "id" | "from" | "to"> = {
  routing: "orthogonal",
  style: "solid",
  startCap: "none",
  endCap: "arrow",
};

/**
 * Draws lines by dragging. Near a shape, every grid point on its border is
 * an anchor. The line attaches to the closest one and follows the shape
 * later. Away from shapes, the end sits on a free grid point. The line is
 * real from the first move, so its route shows while dragging.
 */
export class ArrowTool extends GestureTool {
  readonly id = "arrow";
  readonly label = "Arrow";
  readonly shortcut = "a";
  readonly cursor = "crosshair";
  // Lucide "move-up-right"
  readonly icon: IconDef = [
    ["path", { d: "M13 5H19V11" }],
    ["path", { d: "M19 5L5 19" }],
  ];

  private readonly overlay: SVGGElement;

  constructor(ctx: AppContext) {
    super(ctx);
    this.overlay = ctx.canvas.overlay();
  }

  deactivate(): void {
    super.deactivate();
    this.overlay.replaceChildren();
  }

  protected hover({ point, raw }: CanvasPointer): void {
    this.showHints(connectionTarget(this.ctx.diagram.doc, point, raw));
  }

  protected begin({ point, raw }: CanvasPointer): Gesture {
    const { diagram } = this.ctx;
    const start = connectionTarget(diagram.doc, point, raw);
    const id = newId();

    return {
      move: ({ point, raw }) => {
        const target = connectionTarget(diagram.doc, point, raw);
        // Anchor dots of the start shape and of the hovered shape.
        this.showHints(target, start.shape);
        if (samePoint(target.point, start.point)) return;
        if (diagram.get("lines", id)) diagram.update("lines", id, { to: target.end });
        else diagram.add("lines", { ...NEW_LINE, id, from: start.end, to: target.end });
      },
    };
  }

  private showHints(target: Target, extra?: Shape): void {
    this.overlay.replaceChildren(...anchorHints(target, [extra]));
  }
}
