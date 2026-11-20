import { anchorPoint, SIDE_OUT } from "./anchors";
import { containsPoint, type Point, type Rect } from "./geometry";
import { pointAlong, tagBox } from "./labels";
import { computeRoute, distanceToPolyline, type RouteEnd, type Routing } from "./routing";

export type HAlign = "left" | "center" | "right";
export type VAlign = "top" | "middle" | "bottom";
export type Side = "n" | "e" | "s" | "w";

export interface RectShape extends Rect {
  readonly id: string;
  readonly kind: "rect";
  readonly text: string;
  readonly align: HAlign;
  readonly valign: VAlign;
  /** In px, like every other diagram unit. */
  readonly fontSize: number;
}

/** Union of all box-like shape kinds. Extend as new tools arrive. */
export type Shape = RectShape;

/** Fields a caller may change. Identity and kind are fixed. */
export type ShapePatch = Partial<Omit<Shape, "id" | "kind">>;

/**
 * A line end. Attached ends follow their shape when it moves or resizes,
 * free ends stay at a fixed grid point.
 */
export type Endpoint =
  | { readonly kind: "anchor"; readonly shapeId: string; readonly side: Side; readonly offset: number }
  | { readonly kind: "free"; readonly x: number; readonly y: number };

export interface LineShape {
  readonly id: string;
  readonly kind: "line";
  readonly from: Endpoint;
  readonly to: Endpoint;
  readonly routing: Routing;
  readonly startCap: Cap;
  readonly endCap: Cap;
  readonly labels: readonly LineLabel[];
}

/** How a line end is drawn. */
export type Cap = "none" | "arrow";

/**
 * Text on a line. `t` is the fraction of the line's arc length, from 0 at
 * the start to 1 at the end, so the label keeps its relative place when
 * the route changes.
 */
export interface LineLabel {
  readonly id: string;
  readonly text: string;
  readonly t: number;
}

export type LabelPatch = Partial<Pick<LineLabel, "text" | "t">>;

export interface LabelRef {
  readonly line: LineShape;
  readonly label: LineLabel;
}

export type LinePatch = Partial<Pick<LineShape, "routing" | "from" | "to" | "startCap" | "endCap">>;

type Listener = () => void;

/** In-memory diagram document. Notifies subscribers after every change. */
export class Diagram {
  private shapes: Shape[] = [];
  private lines: LineShape[] = [];
  private readonly listeners = new Set<Listener>();
  /** Routes per line id. Valid until the next change, as any shape can be an obstacle. */
  private readonly routeCache = new Map<string, Point[] | null>();

  all(): readonly Shape[] {
    return this.shapes;
  }

  allLines(): readonly LineShape[] {
    return this.lines;
  }

  get(id: string): Shape | undefined {
    return this.shapes.find((s) => s.id === id);
  }

  getLine(id: string): LineShape | undefined {
    return this.lines.find((l) => l.id === id);
  }

  /** Topmost shape under the point, i.e. the last one drawn. */
  shapeAt(p: Point, margin = 0): Shape | undefined {
    return this.shapes.findLast((s) =>
      containsPoint(
        { x: s.x - margin, y: s.y - margin, width: s.width + 2 * margin, height: s.height + 2 * margin },
        p,
      ),
    );
  }

  findLabel(id: string): LabelRef | undefined {
    for (const line of this.lines) {
      const label = line.labels.find((l) => l.id === id);
      if (label) return { line, label };
    }
    return undefined;
  }

  /** Box of a label's tag, or null if it is empty or its line cannot be routed. */
  labelBox(line: LineShape, label: LineLabel): Rect | null {
    const points = this.route(line);
    if (!points || label.text === "") return null;
    return tagBox(pointAlong(points, label.t), label.text);
  }

  /** Topmost label whose tag contains the point. */
  labelAt(p: Point): LabelRef | undefined {
    for (const line of [...this.lines].reverse()) {
      for (const label of [...line.labels].reverse()) {
        const box = this.labelBox(line, label);
        if (box && containsPoint(box, p)) return { line, label };
      }
    }
    return undefined;
  }

  /** Topmost line within `tolerance` of the point. */
  lineAt(p: Point, tolerance: number): LineShape | undefined {
    return this.lines.findLast((line) => {
      const points = this.route(line);
      return points !== null && distanceToPolyline(p, points) <= tolerance;
    });
  }

  /** Current position of an endpoint, or null if its shape is gone. */
  resolve(end: Endpoint): Point | null {
    if (end.kind === "free") return { x: end.x, y: end.y };
    const shape = this.get(end.shapeId);
    return shape ? anchorPoint(shape, end.side, end.offset) : null;
  }

  /** The polyline a line is drawn along, or null if one of its shapes is gone. */
  route(line: LineShape): Point[] | null {
    let points = this.routeCache.get(line.id);
    if (points === undefined) {
      points = this.routeBetween(line.from, line.to, line.routing);
      this.routeCache.set(line.id, points);
    }
    return points;
  }

  /** Routes between two ends without a stored line, e.g. for a drag preview. */
  routeBetween(from: Endpoint, to: Endpoint, routing: Routing): Point[] | null {
    const a = this.routeEnd(from);
    const b = this.routeEnd(to);
    return a && b ? computeRoute(a, b, routing, this.shapes) : null;
  }

  private routeEnd(end: Endpoint): RouteEnd | null {
    const point = this.resolve(end);
    if (!point) return null;
    return { point, out: end.kind === "anchor" ? SIDE_OUT[end.side] : null };
  }

  add(shape: Shape): void {
    this.shapes = [...this.shapes, shape];
    this.emit();
  }

  addLine(line: LineShape): void {
    this.lines = [...this.lines, line];
    this.emit();
  }

  /**
   * Removes a shape, a line or a label. Lines attached to a removed shape
   * go too, and so do the labels of a removed line.
   */
  remove(id: string): void {
    const found = this.findLabel(id);
    if (found) {
      const labels = found.line.labels.filter((l) => l.id !== id);
      this.replaceLine({ ...found.line, labels });
      return;
    }

    const attached = (e: Endpoint) => e.kind === "anchor" && e.shapeId === id;
    const shapes = this.shapes.filter((s) => s.id !== id);
    const lines = this.lines.filter((l) => l.id !== id && !attached(l.from) && !attached(l.to));
    if (shapes.length === this.shapes.length && lines.length === this.lines.length) return;

    this.shapes = shapes;
    this.lines = lines;
    this.emit();
  }

  addLabel(lineId: string, label: LineLabel): void {
    const line = this.getLine(lineId);
    if (line) this.replaceLine({ ...line, labels: [...line.labels, label] });
  }

  /** Emits only on a real change. */
  updateLabel(id: string, patch: LabelPatch): void {
    const found = this.findLabel(id);
    if (!found) return;
    const { line, label } = found;
    const next: LineLabel = { ...label, text: patch.text ?? label.text, t: patch.t ?? label.t };
    if (next.text === label.text && next.t === label.t) return;
    this.replaceLine({ ...line, labels: line.labels.map((l) => (l.id === id ? next : l)) });
  }

  private replaceLine(next: LineShape): void {
    this.lines = this.lines.map((l) => (l.id === next.id ? next : l));
    this.emit();
  }

  /** Emits only on a real change, so pointer jitter does not trigger redraws. */
  update(id: string, patch: ShapePatch): void {
    const shape = this.get(id);
    if (!shape) return;

    const changes = Object.entries(patch).filter(
      ([key, value]) => value !== undefined && value !== shape[key as keyof Shape],
    );
    if (changes.length === 0) return;

    const next = { ...shape, ...Object.fromEntries(changes) } as Shape;
    this.shapes = this.shapes.map((s) => (s.id === id ? next : s));
    this.emit();
  }

  /** Emits only on a real change, so pointer jitter does not trigger redraws. */
  updateLine(id: string, patch: LinePatch): void {
    const line = this.getLine(id);
    if (!line) return;

    const next: LineShape = {
      ...line,
      routing: patch.routing ?? line.routing,
      from: patch.from ?? line.from,
      to: patch.to ?? line.to,
      startCap: patch.startCap ?? line.startCap,
      endCap: patch.endCap ?? line.endCap,
    };
    const unchanged =
      next.routing === line.routing &&
      next.startCap === line.startCap &&
      next.endCap === line.endCap &&
      sameEndpoint(next.from, line.from) &&
      sameEndpoint(next.to, line.to);
    if (unchanged) return;

    this.lines = this.lines.map((l) => (l.id === id ? next : l));
    this.emit();
  }

  moveTo(id: string, x: number, y: number): void {
    this.update(id, { x, y });
  }

  setBounds(id: string, { x, y, width, height }: Rect): void {
    this.update(id, { x, y, width, height });
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(): void {
    this.routeCache.clear();
    for (const listener of this.listeners) listener();
  }
}

export function sameEndpoint(a: Endpoint, b: Endpoint): boolean {
  if (a.kind === "free" && b.kind === "free") return a.x === b.x && a.y === b.y;
  if (a.kind === "anchor" && b.kind === "anchor") {
    return a.shapeId === b.shapeId && a.side === b.side && a.offset === b.offset;
  }
  return false;
}

export function newId(): string {
  return crypto.randomUUID();
}
