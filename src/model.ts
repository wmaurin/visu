import { containsPoint, type Point, type Rect } from "./geometry";

export type HAlign = "left" | "center" | "right";
export type VAlign = "top" | "middle" | "bottom";

export interface RectShape extends Rect {
  readonly id: string;
  readonly kind: "rect";
  readonly text: string;
  readonly align: HAlign;
  readonly valign: VAlign;
  /** In px, like every other diagram unit. */
  readonly fontSize: number;
}

/** Union of all shape kinds. Extend as new tools arrive. */
export type Shape = RectShape;

/** Fields a caller may change. Identity and kind are fixed. */
export type ShapePatch = Partial<Omit<Shape, "id" | "kind">>;

type Listener = () => void;

/** In-memory diagram document. Notifies subscribers after every change. */
export class Diagram {
  private shapes: Shape[] = [];
  private readonly listeners = new Set<Listener>();

  all(): readonly Shape[] {
    return this.shapes;
  }

  get(id: string): Shape | undefined {
    return this.shapes.find((s) => s.id === id);
  }

  /** Topmost shape under the point, i.e. the last one drawn. */
  shapeAt(p: Point): Shape | undefined {
    return this.shapes.findLast((s) => containsPoint(s, p));
  }

  add(shape: Shape): void {
    this.shapes = [...this.shapes, shape];
    this.emit();
  }

  remove(id: string): void {
    if (!this.get(id)) return;
    this.shapes = this.shapes.filter((s) => s.id !== id);
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
