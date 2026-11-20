import { anchorPoint, distanceToSegment } from "./anchors";
import { containsPoint, type Point, type Rect } from "./geometry";

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
}

type Listener = () => void;

/** In-memory diagram document. Notifies subscribers after every change. */
export class Diagram {
  private shapes: Shape[] = [];
  private lines: LineShape[] = [];
  private readonly listeners = new Set<Listener>();

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

  /** Topmost line within `tolerance` of the point. */
  lineAt(p: Point, tolerance: number): LineShape | undefined {
    return this.lines.findLast((line) => {
      const ends = this.resolveLine(line);
      return ends !== null && distanceToSegment(p, ends[0], ends[1]) <= tolerance;
    });
  }

  /** Current position of an endpoint, or null if its shape is gone. */
  resolve(end: Endpoint): Point | null {
    if (end.kind === "free") return { x: end.x, y: end.y };
    const shape = this.get(end.shapeId);
    return shape ? anchorPoint(shape, end.side, end.offset) : null;
  }

  resolveLine(line: LineShape): [Point, Point] | null {
    const a = this.resolve(line.from);
    const b = this.resolve(line.to);
    return a && b ? [a, b] : null;
  }

  add(shape: Shape): void {
    this.shapes = [...this.shapes, shape];
    this.emit();
  }

  addLine(line: LineShape): void {
    this.lines = [...this.lines, line];
    this.emit();
  }

  /** Removes a shape or a line. Lines attached to a removed shape go too. */
  remove(id: string): void {
    const attached = (e: Endpoint) => e.kind === "anchor" && e.shapeId === id;
    const shapes = this.shapes.filter((s) => s.id !== id);
    const lines = this.lines.filter((l) => l.id !== id && !attached(l.from) && !attached(l.to));
    if (shapes.length === this.shapes.length && lines.length === this.lines.length) return;

    this.shapes = shapes;
    this.lines = lines;
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
    for (const listener of this.listeners) listener();
  }
}

export function newId(): string {
  return crypto.randomUUID();
}
