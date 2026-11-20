import { allAnchors, nearestAnchor } from "../anchors";
import type { CanvasPointer } from "../canvas";
import { GRID, type Point } from "../geometry";
import { newId, type Endpoint, type Shape } from "../model";
import { setAttrs, svgEl, type IconDef } from "../svg";
import { colours, linkStyle, ui } from "../theme";
import type { Tool, ToolContext } from "./tool";

/** How far outside a shape its anchors still catch the pointer. */
const CATCH_MARGIN = GRID / 2;

interface Target {
  readonly end: Endpoint;
  readonly point: Point;
  /** The shape the end attaches to, if any. */
  readonly shape: Shape | undefined;
}

/**
 * Draws straight lines by dragging. Near a shape, every grid point on its
 * border is an anchor. The closest one is highlighted and the line attaches
 * there, so it follows the shape later. Away from shapes, the end sits on
 * a free grid point. Escape aborts the current drag.
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
  private readonly preview = svgEl("line", { ...linkStyle, "stroke-dasharray": "4 3" });
  private readonly anchors = svgEl("g");
  private readonly marker = svgEl("circle", { r: 4, fill: ui.selection });

  constructor(private readonly ctx: ToolContext) {}

  deactivate(): void {
    this.start = null;
    this.clearOverlay();
  }

  pointerDown({ point, raw, event }: CanvasPointer): void {
    if (event.button !== 0) return;
    this.start = this.target(point, raw);
    this.update(this.start);
  }

  pointerMove({ point, raw }: CanvasPointer): void {
    this.update(this.target(point, raw));
  }

  pointerUp({ point, raw }: CanvasPointer): void {
    const start = this.start;
    if (!start) return;
    this.start = null;

    const end = this.target(point, raw);
    if (end.point.x !== start.point.x || end.point.y !== start.point.y) {
      this.ctx.diagram.addLine({ id: newId(), kind: "line", from: start.end, to: end.end });
    }
    this.update(end);
  }

  pointerCancel(): void {
    this.start = null;
    this.clearOverlay();
  }

  keyDown(event: KeyboardEvent): boolean {
    if (event.key === "Escape" && this.start) {
      this.start = null;
      this.preview.remove();
      return true;
    }
    return false;
  }

  /** Anchor on the shape under the pointer, otherwise a free grid point. */
  private target(snapped: Point, raw: Point): Target {
    const shape = this.ctx.diagram.shapeAt(raw, CATCH_MARGIN);
    if (!shape) {
      return { end: { kind: "free", x: snapped.x, y: snapped.y }, point: snapped, shape };
    }
    const { side, offset } = nearestAnchor(shape, raw);
    const end: Endpoint = { kind: "anchor", shapeId: shape.id, side, offset };
    return { end, point: this.ctx.diagram.resolve(end)!, shape };
  }

  private update(target: Target): void {
    const overlay = this.ctx.canvas.overlayLayer;

    // Anchor dots of the hovered shape and of the shape the drag started on.
    const shapes = new Set([this.start?.shape, target.shape].filter((s) => s !== undefined));
    this.anchors.replaceChildren(
      ...[...shapes].flatMap((s) =>
        allAnchors(s).map((p) =>
          svgEl("circle", {
            cx: p.x,
            cy: p.y,
            r: 2.5,
            fill: colours.paper,
            stroke: ui.selection,
            "stroke-width": 1,
          }),
        ),
      ),
    );
    if (!this.anchors.isConnected) overlay.append(this.anchors);

    setAttrs(this.marker, { cx: target.point.x, cy: target.point.y });
    if (!this.marker.isConnected) overlay.append(this.marker);

    if (this.start) {
      setAttrs(this.preview, {
        x1: this.start.point.x,
        y1: this.start.point.y,
        x2: target.point.x,
        y2: target.point.y,
      });
      // Below the anchors, so the dots stay visible.
      if (!this.preview.isConnected) overlay.prepend(this.preview);
    } else {
      this.preview.remove();
    }
  }

  private clearOverlay(): void {
    this.preview.remove();
    this.anchors.remove();
    this.marker.remove();
  }
}
