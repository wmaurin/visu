import { allAnchors, nearestAnchor } from "./anchors";
import type { Canvas } from "./canvas";
import { GRID, type Point } from "./geometry";
import type { Diagram, Endpoint, Shape } from "./model";
import { setAttrs, svgEl } from "./svg";
import { colours, ui } from "./theme";

/** How far outside a shape its anchors still catch the pointer. */
const CATCH_MARGIN = GRID / 2;

/** Where a line end would go for the current pointer position. */
export interface Target {
  readonly end: Endpoint;
  readonly point: Point;
  /** The shape the end attaches to, if any. */
  readonly shape: Shape | undefined;
}

/** Anchor on the shape under the pointer, otherwise a free grid point. */
export function findTarget(diagram: Diagram, snapped: Point, raw: Point): Target {
  const shape = diagram.shapeAt(raw, CATCH_MARGIN);
  if (!shape) {
    return { end: { kind: "free", x: snapped.x, y: snapped.y }, point: snapped, shape };
  }
  const { side, offset } = nearestAnchor(shape, raw);
  const end: Endpoint = { kind: "anchor", shapeId: shape.id, side, offset };
  return { end, point: diagram.resolve(end)!, shape };
}

/**
 * Overlay feedback while connecting: the anchor dots of the relevant shapes
 * and a marker on the point the line end would snap to.
 */
export class AnchorHints {
  private readonly dots = svgEl("g");
  private readonly marker = svgEl("circle", { r: 4, fill: ui.selection });

  constructor(private readonly canvas: Canvas) {}

  show(target: Target, extraShapes: ReadonlyArray<Shape | undefined> = []): void {
    const overlay = this.canvas.overlayLayer;
    const shapes = new Set([...extraShapes, target.shape].filter((s) => s !== undefined));

    this.dots.replaceChildren(
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
    if (!this.dots.isConnected) overlay.append(this.dots);

    setAttrs(this.marker, { cx: target.point.x, cy: target.point.y });
    if (!this.marker.isConnected) overlay.append(this.marker);
  }

  clear(): void {
    this.dots.remove();
    this.marker.remove();
  }
}
