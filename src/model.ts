import { containsPoint, type Point, type Rect } from "./geometry";

export interface RectShape extends Rect {
  readonly id: string;
  readonly kind: "rect";
}

/** Union of all shape kinds. Extend as new tools arrive. */
export type Shape = RectShape;

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

  moveTo(id: string, x: number, y: number): void {
    const shape = this.get(id);
    if (shape) this.setBounds(id, { x, y, width: shape.width, height: shape.height });
  }

  /** Emits only on a real change, so pointer jitter does not trigger redraws. */
  setBounds(id: string, { x, y, width, height }: Rect): void {
    const shape = this.get(id);
    if (
      !shape ||
      (shape.x === x && shape.y === y && shape.width === width && shape.height === height)
    ) {
      return;
    }
    this.shapes = this.shapes.map((s) => (s.id === id ? { ...s, x, y, width, height } : s));
    this.emit();
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
