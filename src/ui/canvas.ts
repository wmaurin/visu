import { GRID, snapPoint, type Point } from "../core/geometry";
import { svgEl } from "../core/svg";
import { arrowMarker } from "../render/markers";
import { colours } from "../render/theme";

export interface CanvasPointer {
  /** Position in diagram units, snapped to the grid. */
  readonly point: Point;
  /** Position in diagram units, unsnapped. */
  readonly raw: Point;
  readonly event: MouseEvent;
}

/** Size of a grid dot. It is centred on the grid point. */
const GRID_DOT_SIZE = 2;
/** Large enough to cover any reasonable viewport until panning arrives. */
const GRID_EXTENT = 100_000;

/**
 * The drawing surface. Layers, bottom to top:
 * grid, export frames, document and overlay (transient editor feedback).
 * Everything sits inside `viewport`, which will later carry pan and zoom.
 */
export class Canvas {
  readonly svg: SVGSVGElement;
  readonly viewport: SVGGElement;
  /** Export frames. Separate, so exports never include them. */
  readonly frameLayer: SVGGElement;
  readonly documentLayer: SVGGElement;
  readonly overlayLayer: SVGGElement;
  /** The dot the grid pattern repeats. Black, its opacity sets the saturation. */
  private readonly gridDot = svgEl("circle", {
    cx: GRID_DOT_SIZE / 2,
    cy: GRID_DOT_SIZE / 2,
    r: GRID_DOT_SIZE / 2,
    fill: colours.diagram,
  });

  /** `host` is the positioned HTML container, also used for floating UI. */
  constructor(readonly host: HTMLElement) {
    const pattern = svgEl(
      "pattern",
      {
        id: "grid-dots",
        // Dots sit exactly on the snap points, so spacing must equal GRID.
        // The offset centres each dot on its grid coordinate.
        x: -GRID_DOT_SIZE / 2,
        y: -GRID_DOT_SIZE / 2,
        width: GRID,
        height: GRID,
        patternUnits: "userSpaceOnUse",
      },
      [this.gridDot],
    );

    const grid = svgEl("rect", {
      x: -GRID_EXTENT / 2,
      y: -GRID_EXTENT / 2,
      width: GRID_EXTENT,
      height: GRID_EXTENT,
      fill: "url(#grid-dots)",
    });

    this.frameLayer = svgEl("g", { "data-layer": "frames" });
    this.documentLayer = svgEl("g", { "data-layer": "document" });
    this.overlayLayer = svgEl("g", { "data-layer": "overlay", "pointer-events": "none" });
    this.viewport = svgEl("g", { "data-layer": "viewport" }, [
      grid,
      this.frameLayer,
      this.documentLayer,
      this.overlayLayer,
    ]);

    this.svg = svgEl("svg", { role: "img", "aria-label": "Diagram canvas" }, [
      svgEl("defs", {}, [pattern, arrowMarker()]),
      svgEl("rect", { width: "100%", height: "100%", fill: colours.paper }),
      this.viewport,
    ]);

    host.append(this.svg);
  }

  /** A new group in the overlay layer, for one tool or gesture to draw into. */
  overlay(): SVGGElement {
    const group = svgEl("g");
    this.overlayLayer.append(group);
    return group;
  }

  /** Converts a pointer or mouse event from screen to diagram coordinates. */
  pointer(event: MouseEvent): CanvasPointer {
    const ctm = this.viewport.getScreenCTM();
    const p = new DOMPoint(event.clientX, event.clientY).matrixTransform(ctm?.inverse());
    const raw = { x: p.x, y: p.y };
    return { point: snapPoint(raw), raw, event };
  }

  /** Converts a point from diagram to coordinates relative to `host`. */
  toHost(p: Point): Point {
    const ctm = this.viewport.getScreenCTM();
    const screen = new DOMPoint(p.x, p.y).matrixTransform(ctm ?? undefined);
    const hostBox = this.host.getBoundingClientRect();
    return { x: screen.x - hostBox.left, y: screen.y - hostBox.top };
  }

  /** 0 hides the grid, 100 draws black dots. */
  setGridSaturation(percent: number): void {
    this.gridDot.setAttribute("fill-opacity", String(percent / 100));
  }

  setCursor(cursor: string): void {
    this.svg.style.cursor = cursor;
  }
}
