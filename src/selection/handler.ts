import type { Point, Rect } from "../core/geometry";
import type { Gesture } from "../tools/tool";
import type { CanvasPointer } from "../ui/canvas";
import type { FloatingBar } from "../ui/floating-bar";

/** A grabbable handle under the pointer, e.g. a resize corner. */
export interface HandleHit {
  readonly cursor: string;
  begin(start: CanvasPointer): Gesture;
}

/**
 * Everything the select tool needs to know about one item kind (Strategy).
 * The select tool stays generic. A new item kind is a new handler.
 */
export interface Handler<T> {
  /** Cursor over the item's body. */
  readonly cursor: string;
  /** Format bar shown above the selected item. */
  readonly bar?: FloatingBar<T>;
  /** Area the bar is placed against, or null to hide the bar. */
  bounds(item: T): Rect | null;
  /** Selection feedback: outline, handles. */
  overlay(item: T): SVGElement[];
  /** Handle of the selected item under the pointer. */
  handleAt?(item: T, p: Point): HandleHit | null;
  /** Dragging the item's body. */
  drag?(item: T, start: CanvasPointer): Gesture;
  doubleClick?(item: T, p: CanvasPointer): void;
}

/** True when `p` lies within the square grab area around `c`. */
export function within(p: Point, c: Point, reach: number): boolean {
  return Math.abs(p.x - c.x) <= reach && Math.abs(p.y - c.y) <= reach;
}
