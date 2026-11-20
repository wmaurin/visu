import type { Rect } from "./geometry";

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

  add(shape: Shape): void {
    this.shapes = [...this.shapes, shape];
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
