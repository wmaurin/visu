import type { CanvasPointer } from "../canvas";
import { AnchorHints, findTarget, type Target } from "../connect";
import { newId } from "../model";
import { pathData, type Routing } from "../routing";
import { setAttrs, svgEl, type IconDef } from "../svg";
import { linkStyle } from "../theme";
import type { Tool, ToolContext } from "./tool";

/** New lines follow the style guide: orthogonal paths only. */
const DEFAULT_ROUTING: Routing = "orthogonal";

/**
 * Draws lines by dragging. Near a shape, every grid point on its border is
 * an anchor. The closest one is highlighted and the line attaches there, so
 * it follows the shape later. Away from shapes, the end sits on a free grid
 * point. Escape aborts the current drag.
 */
export class ArrowTool implements Tool {
  readonly id = "arrow";
  readonly label = "Arrow";
  readonly shortcut = "a";
  readonly cursor = "crosshair";
  // Lucide "move-up-right"
  readonly icon: IconDef = [
    ["path", { d: "M13 5H19V11" }],
    ["path", { d: "M19 5L5 19" }],
  ];

  private start: Target | null = null;
  private readonly preview = svgEl("path", { ...linkStyle, "stroke-dasharray": "4 3" });
  private readonly hints: AnchorHints;

  constructor(private readonly ctx: ToolContext) {
    this.hints = new AnchorHints(ctx.canvas);
  }

  deactivate(): void {
    this.start = null;
    this.preview.remove();
    this.hints.clear();
  }

  pointerDown({ point, raw, event }: CanvasPointer): void {
    if (event.button !== 0) return;
    this.start = findTarget(this.ctx.diagram, point, raw);
    this.update(this.start);
  }

  pointerMove({ point, raw }: CanvasPointer): void {
    this.update(findTarget(this.ctx.diagram, point, raw));
  }

  pointerUp({ point, raw }: CanvasPointer): void {
    const start = this.start;
    if (!start) return;
    this.start = null;

    const end = findTarget(this.ctx.diagram, point, raw);
    if (end.point.x !== start.point.x || end.point.y !== start.point.y) {
      this.ctx.diagram.addLine({
        id: newId(),
        kind: "line",
        from: start.end,
        to: end.end,
        routing: DEFAULT_ROUTING,
      });
    }
    this.update(end);
  }

  pointerCancel(): void {
    this.deactivate();
  }

  keyDown(event: KeyboardEvent): boolean {
    if (event.key === "Escape" && this.start) {
      this.start = null;
      this.preview.remove();
      return true;
    }
    return false;
  }

  private update(target: Target): void {
    // Anchor dots of the hovered shape and of the shape the drag started on.
    this.hints.show(target, [this.start?.shape]);

    const route = this.start
      ? this.ctx.diagram.routeBetween(this.start.end, target.end, DEFAULT_ROUTING)
      : null;
    if (route) {
      setAttrs(this.preview, { d: pathData(route) });
      // Below the anchors, so the dots stay visible.
      if (!this.preview.isConnected) this.ctx.canvas.overlayLayer.prepend(this.preview);
    } else {
      this.preview.remove();
    }
  }
}
