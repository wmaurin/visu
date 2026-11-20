import { grid as gridSize, snapPoint, type Point } from "../core/geometry";
import { Emitter } from "../core/observable";
import { setAttrs, svgEl } from "../core/svg";
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
/** Covers the reachable area at the smallest zoom. */
const GRID_EXTENT = 200_000;

export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 8;
/** Share of the remaining way to the target zoom covered per frame. */
const ZOOM_EASING = 0.3;

/** Pan and zoom: screen = diagram × scale + (x, y), relative to the canvas. */
interface View {
  readonly x: number;
  readonly y: number;
  readonly scale: number;
}

/** Where an animated zoom is heading, and the point that must stay put. */
interface ZoomTarget {
  readonly scale: number;
  readonly anchorScreen: Point;
  readonly anchorDiagram: Point;
}

/**
 * The drawing surface. Layers, bottom to top:
 * grid, export frames, document and overlay (transient editor feedback).
 * Everything sits inside `viewport`, which carries pan and zoom. All
 * conversions go through the viewport's screen matrix, so they stay
 * right at any zoom. Notifies subscribers when the view changes.
 */
export class Canvas extends Emitter {
  private view: View = { x: 0, y: 0, scale: 1 };
  private target: ZoomTarget | null = null;
  private frame = 0;

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
  /** Repeats the dot once per grid step, so dots sit exactly on the snap points. */
  private readonly gridPattern = svgEl(
    "pattern",
    {
      id: "grid-dots",
      // The offset centres each dot on its grid coordinate.
      x: -GRID_DOT_SIZE / 2,
      y: -GRID_DOT_SIZE / 2,
      patternUnits: "userSpaceOnUse",
    },
    [this.gridDot],
  );

  /** `host` is the positioned HTML container, also used for floating UI. */
  constructor(readonly host: HTMLElement) {
    super();
    this.updateGrid();
    const pattern = this.gridPattern;

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
      svgEl("defs", {}, [pattern]),
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

  /** Matches the dot spacing to the current grid size. */
  updateGrid(): void {
    setAttrs(this.gridPattern, { width: gridSize(), height: gridSize() });
  }

  /** 0 hides the grid, 100 draws black dots. */
  setGridSaturation(percent: number): void {
    this.gridDot.setAttribute("fill-opacity", String(percent / 100));
  }

  setCursor(cursor: string): void {
    this.svg.style.cursor = cursor;
  }

  /** Current zoom, 1 is 100 %. The target while a zoom is animating. */
  get zoom(): number {
    return this.target?.scale ?? this.view.scale;
  }

  /** Canvas coordinates of a mouse event, the frame zoom anchors are given in. */
  screenPoint(event: MouseEvent): Point {
    const box = this.svg.getBoundingClientRect();
    return { x: event.clientX - box.left, y: event.clientY - box.top };
  }

  /** Middle of the visible canvas, the anchor for zoom without a pointer. */
  centre(): Point {
    const box = this.svg.getBoundingClientRect();
    return { x: box.width / 2, y: box.height / 2 };
  }

  /**
   * Zooms by `factor`, keeping the diagram point under `anchor` in place.
   * Eases towards the result over a few frames. Repeated calls while
   * animating build on the target, so fast wheel turns add up smoothly.
   */
  zoomAt(anchor: Point, factor: number): void {
    const scale = Math.min(Math.max(this.zoom * factor, MIN_ZOOM), MAX_ZOOM);
    this.target = { scale, anchorScreen: anchor, anchorDiagram: this.toDiagram(anchor) };
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
      this.step(true);
    } else if (this.frame === 0) {
      this.frame = requestAnimationFrame(() => this.step());
    }
  }

  /** Sets the zoom to `scale`, keeping the centre in place. */
  zoomTo(scale: number): void {
    this.zoomAt(this.centre(), scale / this.zoom);
  }

  /** Moves the view by a distance in screen pixels. */
  panBy(dx: number, dy: number): void {
    this.view = { ...this.view, x: this.view.x + dx, y: this.view.y + dy };
    // A running zoom keeps its anchor under the moving content.
    if (this.target) {
      const { anchorScreen: a } = this.target;
      this.target = { ...this.target, anchorScreen: { x: a.x + dx, y: a.y + dy } };
    }
    this.apply();
  }

  private toDiagram(p: Point): Point {
    return { x: (p.x - this.view.x) / this.view.scale, y: (p.y - this.view.y) / this.view.scale };
  }

  private step(jump = false): void {
    const target = this.target;
    this.frame = 0;
    if (!target) return;

    const eased = this.view.scale + (target.scale - this.view.scale) * ZOOM_EASING;
    const done = jump || Math.abs(target.scale - eased) < target.scale * 0.001;
    const scale = done ? target.scale : eased;
    this.view = {
      scale,
      x: target.anchorScreen.x - target.anchorDiagram.x * scale,
      y: target.anchorScreen.y - target.anchorDiagram.y * scale,
    };
    this.apply();

    if (done) this.target = null;
    else this.frame = requestAnimationFrame(() => this.step());
  }

  private apply(): void {
    const { x, y, scale } = this.view;
    this.viewport.setAttribute("transform", `translate(${x} ${y}) scale(${scale})`);
    this.emit();
  }
}
